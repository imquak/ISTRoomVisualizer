package service

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/ist-room-visualizer/backend/internal/domain"
	"github.com/ist-room-visualizer/backend/internal/store"
)

const (
	campusOpenHour    = 8
	campusCloseHour   = 21
	closingSoonMinutes = 15
)

// AvailabilityService implements business logic for room availability queries.
type AvailabilityService struct {
	mem *store.InMemoryStore
	loc *time.Location // Europe/Lisbon
}

// NewAvailabilityService creates an AvailabilityService, loading the Europe/Lisbon timezone.
func NewAvailabilityService(mem *store.InMemoryStore) (*AvailabilityService, error) {
	loc, err := time.LoadLocation("Europe/Lisbon")
	if err != nil {
		return nil, fmt.Errorf("load Europe/Lisbon timezone: %w", err)
	}
	return &AvailabilityService{mem: mem, loc: loc}, nil
}

// dayBounds returns the 08:00 and 21:00 boundaries for a given day in the campus timezone.
func (svc *AvailabilityService) dayBounds(day time.Time) (open, close time.Time) {
	d := day.In(svc.loc)
	open = time.Date(d.Year(), d.Month(), d.Day(), campusOpenHour, 0, 0, 0, svc.loc)
	close = time.Date(d.Year(), d.Month(), d.Day(), campusCloseHour, 0, 0, 0, svc.loc)
	return
}

// isSameDay reports whether two times fall on the same calendar day in the campus timezone.
func (svc *AvailabilityService) isSameDay(a, b time.Time) bool {
	ay, am, ad := a.In(svc.loc).Date()
	by, bm, bd := b.In(svc.loc).Date()
	return ay == by && am == bm && ad == bd
}

// ComputeFreeIntervals computes free intervals for a room on a given day
// within 08:00-21:00 campus hours.
func (svc *AvailabilityService) ComputeFreeIntervals(events []domain.RoomEvent, day time.Time) []domain.FreeInterval {
	open, close := svc.dayBounds(day)

	// Filter events to those on the given day.
	var dayEvents []domain.RoomEvent
	for _, ev := range events {
		if svc.isSameDay(ev.Start, day) {
			dayEvents = append(dayEvents, ev)
		}
	}

	// Sort by start time.
	sort.Slice(dayEvents, func(i, j int) bool {
		return dayEvents[i].Start.Before(dayEvents[j].Start)
	})

	// Merge overlapping/adjacent intervals.
	type interval struct{ s, e time.Time }
	merged := make([]interval, 0, len(dayEvents))
	for _, ev := range dayEvents {
		s := ev.Start
		e := ev.End
		// Clamp to campus hours.
		if s.Before(open) {
			s = open
		}
		if e.After(close) {
			e = close
		}
		if !s.Before(e) {
			continue
		}
		if len(merged) == 0 || s.After(merged[len(merged)-1].e) {
			merged = append(merged, interval{s, e})
		} else if e.After(merged[len(merged)-1].e) {
			merged[len(merged)-1].e = e
		}
	}

	// Invert merged busy intervals within [open, close].
	var free []domain.FreeInterval
	cursor := open
	for _, iv := range merged {
		if cursor.Before(iv.s) {
			dur := int(iv.s.Sub(cursor).Minutes())
			if dur > 0 {
				free = append(free, domain.FreeInterval{
					Start:           cursor,
					End:             iv.s,
					DurationMinutes: dur,
				})
			}
		}
		if iv.e.After(cursor) {
			cursor = iv.e
		}
	}
	if cursor.Before(close) {
		dur := int(close.Sub(cursor).Minutes())
		if dur > 0 {
			free = append(free, domain.FreeInterval{
				Start:           cursor,
				End:             close,
				DurationMinutes: dur,
			})
		}
	}
	return free
}

// GetRoomStatus computes the occupancy status of a room at a given time.
func (svc *AvailabilityService) GetRoomStatus(roomID string, at time.Time) domain.RoomStatusResponse {
	room, ok := svc.mem.GetSpace(roomID)
	if !ok {
		return domain.RoomStatusResponse{RoomID: roomID, Status: domain.StatusFree}
	}

	// Walk the ancestor chain to find floor and building.
	var floorID, floorName, buildingID, buildingName string
	if floor, ok := svc.mem.GetSpace(room.ParentID); ok {
		floorID = floor.ID
		floorName = floor.Name
		if building, ok := svc.mem.GetSpace(floor.ParentID); ok {
			buildingID = building.ID
			buildingName = building.Name
		}
	}

	events := svc.mem.GetRoomEvents(roomID)
	freeIntervals := svc.ComputeFreeIntervals(events, at)

	atLocal := at.In(svc.loc)

	var currentEvent *domain.RoomEvent
	var nextEvent *domain.RoomEvent

	for i := range events {
		ev := &events[i]
		if !svc.isSameDay(ev.Start, atLocal) {
			continue
		}
		if !atLocal.Before(ev.Start) && atLocal.Before(ev.End) {
			currentEvent = ev
		} else if atLocal.Before(ev.Start) {
			if nextEvent == nil || ev.Start.Before(nextEvent.Start) {
				nextEvent = ev
			}
		}
	}

	status := domain.StatusFree
	var freeUntil *time.Time
	freeDurMin := 0

	if currentEvent != nil {
		status = domain.StatusOccupied
	} else {
		// Find the current free interval containing `at`.
		for _, fi := range freeIntervals {
			if !atLocal.Before(fi.Start) && atLocal.Before(fi.End) {
				end := fi.End
				freeUntil = &end
				freeDurMin = int(fi.End.Sub(atLocal).Minutes())
				break
			}
		}
		if nextEvent != nil {
			timeToNext := int(nextEvent.Start.Sub(atLocal).Minutes())
			if timeToNext <= closingSoonMinutes {
				status = domain.StatusClosingSoon
			}
		}
	}

	return domain.RoomStatusResponse{
		RoomID:          room.ID,
		RoomName:        room.Name,
		BuildingID:      buildingID,
		BuildingName:    buildingName,
		FloorID:         floorID,
		FloorName:       floorName,
		BlueprintURL:    room.BlueprintURL,
		Status:          status,
		CurrentEvent:    currentEvent,
		NextEvent:       nextEvent,
		FreeUntil:       freeUntil,
		FreeDurationMin: freeDurMin,
		FreeIntervals:   freeIntervals,
		CapacityNormal:  room.CapacityNormal,
		CapacityExam:    room.CapacityExam,
	}
}

// GetFloorState returns the occupancy state of all rooms on a floor at a given time.
func (svc *AvailabilityService) GetFloorState(floorID string, at time.Time) domain.FloorStateResponse {
	floor, ok := svc.mem.GetSpace(floorID)
	resp := domain.FloorStateResponse{
		FloorID: floorID,
		Rooms:   make(map[string]domain.RoomStatusResponse),
	}
	if ok {
		resp.FloorName = floor.Name
		resp.BlueprintURL = floor.BlueprintURL
	}

	rooms := svc.mem.GetFloorRooms(floorID)
	for _, room := range rooms {
		rs := svc.GetRoomStatus(room.ID, at)
		resp.Rooms[room.ID] = rs
	}
	return resp
}

// GetFreeRooms returns rooms that are currently free for at least minDuration minutes,
// optionally filtered by campus or building name/ID.
func (svc *AvailabilityService) GetFreeRooms(campusFilter, buildingFilter string, minDuration int, at time.Time) []domain.RoomStatusResponse {
	roomIDs := svc.mem.GetAllRoomIDs()
	var result []domain.RoomStatusResponse

	for _, id := range roomIDs {
		rs := svc.GetRoomStatus(id, at)
		if strings.TrimSpace(rs.RoomName) == "" || strings.TrimSpace(rs.BuildingName) == "" || strings.EqualFold(strings.TrimSpace(rs.BuildingName), "unknown") {
			continue
		}
		if rs.Status == domain.StatusOccupied {
			continue
		}
		if rs.FreeDurationMin < minDuration {
			continue
		}
		if campusFilter != "" {
			// campusFilter matches building's parent (campus). We walk building -> campus.
			room, ok := svc.mem.GetSpace(id)
			if !ok {
				continue
			}
			floor, ok := svc.mem.GetSpace(room.ParentID)
			if !ok {
				continue
			}
			building, ok := svc.mem.GetSpace(floor.ParentID)
			if !ok {
				continue
			}
			campus, ok := svc.mem.GetSpace(building.ParentID)
			if !ok {
				continue
			}
			if campus.ID != campusFilter && campus.Name != campusFilter {
				continue
			}
		}
		if buildingFilter != "" {
			room, ok := svc.mem.GetSpace(id)
			if !ok {
				continue
			}
			floor, ok := svc.mem.GetSpace(room.ParentID)
			if !ok {
				continue
			}
			building, ok := svc.mem.GetSpace(floor.ParentID)
			if !ok {
				continue
			}
			if building.ID != buildingFilter && building.Name != buildingFilter {
				continue
			}
		}
		result = append(result, rs)
	}

	// Sort descending by FreeDurationMin.
	sort.Slice(result, func(i, j int) bool {
		return result[i].FreeDurationMin > result[j].FreeDurationMin
	})
	return result
}

// IntersectSchedules finds common free windows from the provided busy intervals
// and rooms that are free during all of those windows.
func (svc *AvailabilityService) IntersectSchedules(req domain.IntersectRequest, at time.Time) domain.IntersectResponse {
	open, close := svc.dayBounds(at)

	type interval struct{ s, e time.Time }

	// Merge and sort the busy intervals.
	busy := make([]interval, 0, len(req.BusyIntervals))
	for _, iv := range req.BusyIntervals {
		s := iv.Start
		e := iv.End
		if s.Before(open) {
			s = open
		}
		if e.After(close) {
			e = close
		}
		if s.Before(e) {
			busy = append(busy, interval{s, e})
		}
	}
	sort.Slice(busy, func(i, j int) bool { return busy[i].s.Before(busy[j].s) })

	// Merge overlapping.
	merged := make([]interval, 0, len(busy))
	for _, iv := range busy {
		if len(merged) == 0 || iv.s.After(merged[len(merged)-1].e) {
			merged = append(merged, iv)
		} else if iv.e.After(merged[len(merged)-1].e) {
			merged[len(merged)-1].e = iv.e
		}
	}

	// Invert to get common free windows.
	var windows []domain.FreeInterval
	cursor := open
	for _, iv := range merged {
		if cursor.Before(iv.s) {
			dur := int(iv.s.Sub(cursor).Minutes())
			if dur > 0 {
				windows = append(windows, domain.FreeInterval{
					Start:           cursor,
					End:             iv.s,
					DurationMinutes: dur,
				})
			}
		}
		if iv.e.After(cursor) {
			cursor = iv.e
		}
	}
	if cursor.Before(close) {
		dur := int(close.Sub(cursor).Minutes())
		if dur > 0 {
			windows = append(windows, domain.FreeInterval{
				Start:           cursor,
				End:             close,
				DurationMinutes: dur,
			})
		}
	}

	// Find rooms free during ALL common free windows.
	roomIDs := svc.mem.GetAllRoomIDs()
	var freeRooms []domain.RoomStatusResponse

	for _, id := range roomIDs {
		if req.Campus != "" {
			room, ok := svc.mem.GetSpace(id)
			if !ok {
				continue
			}
			floor, ok := svc.mem.GetSpace(room.ParentID)
			if !ok {
				continue
			}
			building, ok := svc.mem.GetSpace(floor.ParentID)
			if !ok {
				continue
			}
			campus, ok := svc.mem.GetSpace(building.ParentID)
			if !ok {
				continue
			}
			if campus.ID != req.Campus && campus.Name != req.Campus {
				continue
			}
		}

		events := svc.mem.GetRoomEvents(id)
		freeForAll := true
		for _, w := range windows {
			// Check if the room has any event that overlaps this window.
			for _, ev := range events {
				if !svc.isSameDay(ev.Start, at) {
					continue
				}
				// Overlap condition: ev.Start < w.End && ev.End > w.Start
				if ev.Start.Before(w.End) && ev.End.After(w.Start) {
					freeForAll = false
					break
				}
			}
			if !freeForAll {
				break
			}
		}
		if freeForAll {
			rs := svc.GetRoomStatus(id, at)
			if strings.TrimSpace(rs.RoomName) == "" || strings.TrimSpace(rs.BuildingName) == "" || strings.EqualFold(strings.TrimSpace(rs.BuildingName), "unknown") {
				continue
			}
			freeRooms = append(freeRooms, rs)
		}
	}

	return domain.IntersectResponse{
		CommonFreeWindows: windows,
		FreeRooms:         freeRooms,
	}
}

// PrecomputeAllFreeIntervals pre-computes free intervals for every room and stores them.
// Should be called after each schedule sync.
func (svc *AvailabilityService) PrecomputeAllFreeIntervals(day time.Time) {
	roomIDs := svc.mem.GetAllRoomIDs()
	for _, id := range roomIDs {
		events := svc.mem.GetRoomEvents(id)
		intervals := svc.ComputeFreeIntervals(events, day)
		svc.mem.SetFreeIntervals(id, intervals)
	}
}
