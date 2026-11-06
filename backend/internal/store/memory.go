package store

import (
	"sort"
	"sync"

	"github.com/ist-room-visualizer/backend/internal/domain"
)

// InMemoryStore is a thread-safe in-memory store for space topology, room events,
// campus trees, and pre-computed free intervals.
type InMemoryStore struct {
	mu            sync.RWMutex
	spaces        map[string]domain.SpaceNode    // id -> SpaceNode
	roomEvents    map[string][]domain.RoomEvent  // roomID -> sorted events
	campusTrees   []domain.CampusTree
	freeIntervals map[string][]domain.FreeInterval // roomID -> free intervals
}

// NewInMemoryStore creates a new, empty InMemoryStore.
func NewInMemoryStore() *InMemoryStore {
	return &InMemoryStore{
		spaces:        make(map[string]domain.SpaceNode),
		roomEvents:    make(map[string][]domain.RoomEvent),
		campusTrees:   []domain.CampusTree{},
		freeIntervals: make(map[string][]domain.FreeInterval),
	}
}

// SetSpace inserts or updates a space in the store.
func (s *InMemoryStore) SetSpace(space domain.SpaceNode) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.spaces[space.ID] = space
}

// GetSpace retrieves a space by ID, returning false if not found.
func (s *InMemoryStore) GetSpace(id string) (domain.SpaceNode, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	node, ok := s.spaces[id]
	return node, ok
}

// GetAllRoomIDs returns the IDs of all spaces whose type is TypeRoom.
func (s *InMemoryStore) GetAllRoomIDs() []string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	ids := make([]string, 0)
	for id, sp := range s.spaces {
		if sp.Type == domain.TypeRoom {
			ids = append(ids, id)
		}
	}
	return ids
}

// GetAllSpaces returns all stored SpaceNodes.
func (s *InMemoryStore) GetAllSpaces() []domain.SpaceNode {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]domain.SpaceNode, 0, len(s.spaces))
	for _, sp := range s.spaces {
		out = append(out, sp)
	}
	return out
}

// SetRoomEvents replaces the events for the given room, sorted by start time.
func (s *InMemoryStore) SetRoomEvents(roomID string, events []domain.RoomEvent) {
	sorted := make([]domain.RoomEvent, len(events))
	copy(sorted, events)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].Start.Before(sorted[j].Start)
	})
	s.mu.Lock()
	defer s.mu.Unlock()
	s.roomEvents[roomID] = sorted
}

// GetRoomEvents returns the events for the given room (sorted by start time).
func (s *InMemoryStore) GetRoomEvents(roomID string) []domain.RoomEvent {
	s.mu.RLock()
	defer s.mu.RUnlock()
	evs := s.roomEvents[roomID]
	out := make([]domain.RoomEvent, len(evs))
	copy(out, evs)
	return out
}

// SetCampusTree replaces the campus tree.
func (s *InMemoryStore) SetCampusTree(campuses []domain.CampusTree) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.campusTrees = campuses
}

// GetCampusTree returns the campus tree.
func (s *InMemoryStore) GetCampusTree() []domain.CampusTree {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]domain.CampusTree, len(s.campusTrees))
	copy(out, s.campusTrees)
	return out
}

// SetFreeIntervals sets the pre-computed free intervals for a room.
func (s *InMemoryStore) SetFreeIntervals(roomID string, intervals []domain.FreeInterval) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.freeIntervals[roomID] = intervals
}

// GetFreeIntervals returns the pre-computed free intervals for a room.
func (s *InMemoryStore) GetFreeIntervals(roomID string) []domain.FreeInterval {
	s.mu.RLock()
	defer s.mu.RUnlock()
	ivs := s.freeIntervals[roomID]
	out := make([]domain.FreeInterval, len(ivs))
	copy(out, ivs)
	return out
}

// GetFloorRooms returns all spaces that are direct children of floorID and have TypeRoom.
func (s *InMemoryStore) GetFloorRooms(floorID string) []domain.SpaceNode {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var rooms []domain.SpaceNode
	for _, sp := range s.spaces {
		if sp.ParentID == floorID && sp.Type == domain.TypeRoom {
			rooms = append(rooms, sp)
		}
	}
	return rooms
}

// BulkLoad atomically loads all spaces and events into memory in a single write lock.
func (s *InMemoryStore) BulkLoad(spaces []domain.SpaceNode, events map[string][]domain.RoomEvent) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, sp := range spaces {
		s.spaces[sp.ID] = sp
	}
	for roomID, evs := range events {
		sorted := make([]domain.RoomEvent, len(evs))
		copy(sorted, evs)
		sort.Slice(sorted, func(i, j int) bool {
			return sorted[i].Start.Before(sorted[j].Start)
		})
		s.roomEvents[roomID] = sorted
	}
}
