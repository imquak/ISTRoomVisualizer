package fenix

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/ist-room-visualizer/backend/internal/domain"
)

// StoreInterface is implemented by the SQLite store to allow the crawler to persist data.
type StoreInterface interface {
	UpsertSpace(space domain.SpaceNode) error
	UpsertEvents(roomID string, events []domain.RoomEvent) error
	LoadAllSpaces() ([]domain.SpaceNode, error)
	LoadAllEvents() (map[string][]domain.RoomEvent, error)
}

// MemStoreInterface is implemented by the in-memory store for fast writes during crawl.
type MemStoreInterface interface {
	SetSpace(space domain.SpaceNode)
	SetRoomEvents(roomID string, events []domain.RoomEvent)
	SetCampusTree(campuses []domain.CampusTree)
	GetAllRoomIDs() []string
}

// Crawler performs BFS traversal of the Fénix space hierarchy and schedule syncs.
type Crawler struct {
	client   *Client
	store    StoreInterface
	memStore MemStoreInterface
}

// NewCrawler creates a new Crawler.
func NewCrawler(client *Client, store StoreInterface, memStore MemStoreInterface) *Crawler {
	return &Crawler{
		client:   client,
		store:    store,
		memStore: memStore,
	}
}

// fetchRootSpaces fetches the top-level spaces (campuses) from the Fénix API.
// GET {baseURL}/spaces returns a JSON array of FenixSpaceRef directly.
func (c *Crawler) fetchRootSpaces(ctx context.Context) ([]FenixSpaceRef, error) {
	url := fmt.Sprintf("%s/spaces", c.client.baseURL)
	if err := c.client.limiter.Wait(ctx); err != nil {
		return nil, fmt.Errorf("rate limiter: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, fmt.Errorf("build root spaces request: %w", err)
	}
	req.Header.Set("Accept", "application/json")
	resp, err := c.client.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch root spaces: %w", err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read root spaces body: %w", err)
	}
	var refs []FenixSpaceRef
	if err := json.Unmarshal(body, &refs); err != nil {
		return nil, fmt.Errorf("decode root spaces: %w (body: %s)", err, string(body[:minInt(len(body), 200)]))
	}
	return refs, nil
}

// SyncTopology performs a BFS traversal of the Fénix space hierarchy, persisting
// every space to the SQLite store and updating the in-memory store.
// After full traversal, it builds and sets the CampusTree in memory.
func (c *Crawler) SyncTopology(ctx context.Context) error {
	log.Println("[crawler] Starting topology sync...")

	roots, err := c.fetchRootSpaces(ctx)
	if err != nil {
		return fmt.Errorf("fetch root spaces: %w", err)
	}

	type queueItem struct {
		id       string
		parentID string
		depth    int
	}

	// Map campusID -> BuildingNode map
	type buildingMap map[string]domain.BuildingNode
	campusNodes := map[string]domain.CampusTree{}
	// campusBuildingsMap: campusID -> buildingID -> BuildingNode
	campusBuildingsMap := map[string]buildingMap{}

	queue := make([]queueItem, 0, len(roots))
	for _, ref := range roots {
		queue = append(queue, queueItem{id: ref.ID, parentID: "", depth: 0})
	}

	for len(queue) > 0 {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		item := queue[0]
		queue = queue[1:]

		spaceResp, err := c.client.FetchSpace(ctx, item.id, "")
		if err != nil {
			log.Printf("[crawler] WARN: skip space %s: %v", item.id, err)
			continue
		}

		spaceType := mapSpaceType(spaceResp.Type)
		childIDs := make([]string, 0, len(spaceResp.ContainedSpaces))
		for _, ch := range spaceResp.ContainedSpaces {
			childIDs = append(childIDs, ch.ID)
		}

		node := domain.SpaceNode{
			ID:             spaceResp.ID,
			Name:           spaceResp.Name,
			Type:           spaceType,
			ParentID:       item.parentID,
			BlueprintURL:   spaceResp.BlueprintURL,
			CapacityNormal: spaceResp.Information.NormalCapacity,
			CapacityExam:   spaceResp.Information.ExamCapacity,
			ChildrenIDs:    childIDs,
		}

		if err := c.store.UpsertSpace(node); err != nil {
			log.Printf("[crawler] WARN: upsert space %s: %v", node.ID, err)
		}
		c.memStore.SetSpace(node)

		// Build campus tree structure.
		switch spaceType {
		case domain.TypeCampus:
			campusNodes[node.ID] = domain.CampusTree{
				ID:        node.ID,
				Name:      node.Name,
				Type:      domain.TypeCampus,
				Buildings: []domain.BuildingNode{},
			}
			campusBuildingsMap[node.ID] = buildingMap{}

		case domain.TypeBuilding:
			// Find which campus this belongs to.
			campusID := item.parentID
			if _, ok := campusNodes[campusID]; ok {
				bm := campusBuildingsMap[campusID]
				bm[node.ID] = domain.BuildingNode{
					ID:     node.ID,
					Name:   node.Name,
					Floors: []domain.FloorNode{},
				}
				campusBuildingsMap[campusID] = bm
			}

		case domain.TypeFloor:
			// Find which campus and building this belongs to.
			buildingID := item.parentID
			for campusID, bm := range campusBuildingsMap {
				if _, ok := bm[buildingID]; ok {
					bn := bm[buildingID]
					bn.Floors = append(bn.Floors, domain.FloorNode{
						ID:           node.ID,
						Name:         node.Name,
						BlueprintURL: node.BlueprintURL,
					})
					bm[buildingID] = bn
					campusBuildingsMap[campusID] = bm
					break
				}
			}
		}

		// Enqueue children for non-room spaces.
		if spaceType != domain.TypeRoom {
			for _, ch := range spaceResp.ContainedSpaces {
				queue = append(queue, queueItem{id: ch.ID, parentID: spaceResp.ID, depth: item.depth + 1})
			}
		}
	}

	// Assemble final CampusTree slice.
	trees := make([]domain.CampusTree, 0, len(campusNodes))
	for campusID, campus := range campusNodes {
		bm := campusBuildingsMap[campusID]
		buildings := make([]domain.BuildingNode, 0, len(bm))
		for _, b := range bm {
			buildings = append(buildings, b)
		}
		campus.Buildings = buildings
		trees = append(trees, campus)
	}

	c.memStore.SetCampusTree(trees)
	log.Printf("[crawler] Topology sync complete: %d campuses", len(trees))
	return nil
}

// SyncSchedules fetches today's schedules for all rooms in memory, using workerCount goroutines.
func (c *Crawler) SyncSchedules(ctx context.Context, workerCount int) error {
	loc, err := time.LoadLocation("Europe/Lisbon")
	if err != nil {
		return fmt.Errorf("load timezone: %w", err)
	}
	now := time.Now().In(loc)
	today := now.Format("02/01/2006") // dd/MM/yyyy

	roomIDs := c.memStore.GetAllRoomIDs()
	log.Printf("[crawler] Syncing schedules for %d rooms on %s", len(roomIDs), today)

	type job struct {
		roomID string
	}

	jobs := make(chan job, len(roomIDs))
	for _, id := range roomIDs {
		jobs <- job{roomID: id}
	}
	close(jobs)

	var wg sync.WaitGroup
	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := range jobs {
				select {
				case <-ctx.Done():
					return
				default:
				}
				spaceResp, err := c.client.FetchSchedule(ctx, j.roomID, today)
				if err != nil {
					log.Printf("[crawler] WARN: fetch schedule room %s: %v", j.roomID, err)
					continue
				}
				events := parseFenixEvents(j.roomID, spaceResp.Events, loc)
				if err := c.store.UpsertEvents(j.roomID, events); err != nil {
					log.Printf("[crawler] WARN: upsert events room %s: %v", j.roomID, err)
				}
				c.memStore.SetRoomEvents(j.roomID, events)
			}
		}()
	}
	wg.Wait()
	log.Println("[crawler] Schedule sync complete")
	return nil
}

// parseFenixEvents converts raw Fénix events into domain.RoomEvent values.
func parseFenixEvents(roomID string, raw []FenixEvent, loc *time.Location) []domain.RoomEvent {
	events := make([]domain.RoomEvent, 0, len(raw))
	for _, fe := range raw {
		start, end, err := parseEventTimes(fe.Day, fe.BeginTime, fe.EndTime, loc)
		if err != nil {
			log.Printf("[crawler] WARN: parse event time for room %s: %v", roomID, err)
			continue
		}
		evType := "GENERIC"
		courseAcr := ""
		if fe.Course != nil {
			evType = "LESSON"
			courseAcr = fe.Course.Acronym
		}
		events = append(events, domain.RoomEvent{
			RoomID:    roomID,
			Type:      evType,
			Title:     fe.Title,
			CourseAcr: courseAcr,
			Start:     start,
			End:       end,
			Weekday:   start.Weekday().String(),
		})
	}
	return events
}

// parseEventTimes parses a Fénix event's day and time strings into time.Time values.
func parseEventTimes(day, begin, end string, loc *time.Location) (time.Time, time.Time, error) {
	const layout = "02/01/2006 15:04"
	startStr := day + " " + begin
	endStr := day + " " + end
	start, err := time.ParseInLocation(layout, startStr, loc)
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("parse start %q: %w", startStr, err)
	}
	endT, err := time.ParseInLocation(layout, endStr, loc)
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("parse end %q: %w", endStr, err)
	}
	return start, endT, nil
}

// mapSpaceType maps Fénix API type strings to domain.SpaceType constants.
func mapSpaceType(t string) domain.SpaceType {
	switch t {
	case "CAMPUS":
		return domain.TypeCampus
	case "BUILDING":
		return domain.TypeBuilding
	case "FLOOR":
		return domain.TypeFloor
	case "ROOM":
		return domain.TypeRoom
	default:
		return domain.TypeRoom
	}
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
