package domain

import "time"

// SpaceType represents the type of a Fénix space.
type SpaceType string

const (
	TypeCampus   SpaceType = "CAMPUS"
	TypeBuilding SpaceType = "BUILDING"
	TypeFloor    SpaceType = "FLOOR"
	TypeRoom     SpaceType = "ROOM"
)

// RoomStatus represents the occupancy status of a room at a given time.
type RoomStatus string

const (
	StatusFree         RoomStatus = "FREE"
	StatusOccupied     RoomStatus = "OCCUPIED"
	StatusClosingSoon  RoomStatus = "CLOSING_SOON"
)

// SpaceNode is a node in the space hierarchy (campus > building > floor > room).
type SpaceNode struct {
	ID             string    `json:"id"`
	Name           string    `json:"name"`
	Type           SpaceType `json:"type"`
	ParentID       string    `json:"parentId,omitempty"`
	BlueprintURL   string    `json:"blueprintUrl,omitempty"`
	CapacityNormal int       `json:"capacityNormal"`
	CapacityExam   int       `json:"capacityExam"`
	ChildrenIDs    []string  `json:"childrenIds,omitempty"`
}

// RoomEvent represents a scheduled event in a room.
type RoomEvent struct {
	RoomID    string    `json:"roomId"`
	Type      string    `json:"type"` // "LESSON" or "GENERIC"
	Title     string    `json:"title"`
	CourseAcr string    `json:"courseAcr,omitempty"`
	Start     time.Time `json:"start"`
	End       time.Time `json:"end"`
	Weekday   string    `json:"weekday"`
}

// FreeInterval is a time window when a room is free.
type FreeInterval struct {
	Start           time.Time `json:"start"`
	End             time.Time `json:"end"`
	DurationMinutes int       `json:"durationMinutes"`
}

// RoomStatusResponse is the per-room status payload returned by the API.
type RoomStatusResponse struct {
	RoomID          string        `json:"roomId"`
	RoomName        string        `json:"roomName"`
	BuildingID      string        `json:"buildingId"`
	BuildingName    string        `json:"buildingName"`
	FloorID         string        `json:"floorId"`
	FloorName       string        `json:"floorName"`
	BlueprintURL    string        `json:"blueprintUrl,omitempty"`
	Status          RoomStatus    `json:"status"`
	CurrentEvent    *RoomEvent    `json:"currentEvent,omitempty"`
	NextEvent       *RoomEvent    `json:"nextEvent,omitempty"`
	FreeUntil       *time.Time    `json:"freeUntil,omitempty"`
	FreeDurationMin int           `json:"freeDurationMin"`
	FreeIntervals   []FreeInterval `json:"freeIntervals,omitempty"`
	CapacityNormal  int           `json:"capacityNormal"`
	CapacityExam    int           `json:"capacityExam"`
}

// CampusTree is returned by GET /api/v1/campuses
type CampusTree struct {
	ID        string        `json:"id"`
	Name      string        `json:"name"`
	Type      SpaceType     `json:"type"`
	Buildings []BuildingNode `json:"buildings"`
}

type BuildingNode struct {
	ID     string      `json:"id"`
	Name   string      `json:"name"`
	Floors []FloorNode `json:"floors"`
}

type FloorNode struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	BlueprintURL string `json:"blueprintUrl,omitempty"`
}

// FloorStateResponse returned by GET /api/v1/floors/{floorId}/state
type FloorStateResponse struct {
	FloorID      string                        `json:"floorId"`
	FloorName    string                        `json:"floorName"`
	BlueprintURL string                        `json:"blueprintUrl,omitempty"`
	Rooms        map[string]RoomStatusResponse `json:"rooms"`
}

// IntersectRequest for POST /api/v1/schedules/intersect
type IntersectRequest struct {
	BusyIntervals []TimeInterval `json:"busyIntervals"`
	Campus        string         `json:"campus,omitempty"`
}

type TimeInterval struct {
	Start time.Time `json:"start"`
	End   time.Time `json:"end"`
}

// IntersectResponse for POST /api/v1/schedules/intersect
type IntersectResponse struct {
	CommonFreeWindows []FreeInterval       `json:"commonFreeWindows"`
	FreeRooms         []RoomStatusResponse `json:"freeRooms"`
}
