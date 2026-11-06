package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/ist-room-visualizer/backend/internal/domain"
	"github.com/ist-room-visualizer/backend/internal/fenix"
	"github.com/ist-room-visualizer/backend/internal/service"
	"github.com/ist-room-visualizer/backend/internal/store"
)

// Handlers holds the application-level dependencies for HTTP handlers.
type Handlers struct {
	svc         *service.AvailabilityService
	mem         *store.InMemoryStore
	fenixClient *fenix.Client
}

// NewHandlers creates a new Handlers instance.
func NewHandlers(svc *service.AvailabilityService, mem *store.InMemoryStore, fc *fenix.Client) *Handlers {
	return &Handlers{svc: svc, mem: mem, fenixClient: fc}
}

// parseAt parses the `at` query parameter as RFC3339. Defaults to time.Now().
func parseAt(r *http.Request) time.Time {
	atStr := r.URL.Query().Get("at")
	if atStr == "" {
		return time.Now()
	}
	t, err := time.Parse(time.RFC3339, atStr)
	if err != nil {
		return time.Now()
	}
	return t
}

// GetCampuses returns the full campus → building → floor tree.
func (h *Handlers) GetCampuses(w http.ResponseWriter, r *http.Request) {
	campuses := h.mem.GetCampusTree()
	writeJSON(w, http.StatusOK, campuses)
}

// GetFloorState returns the occupancy state of all rooms on a floor.
func (h *Handlers) GetFloorState(w http.ResponseWriter, r *http.Request) {
	floorID := chi.URLParam(r, "floorId")
	if floorID == "" {
		writeError(w, http.StatusBadRequest, "floorId is required")
		return
	}
	at := parseAt(r)
	resp := h.svc.GetFloorState(floorID, at)
	writeJSON(w, http.StatusOK, resp)
}

// GetFreeRooms returns rooms that are currently free for at least minDuration minutes.
func (h *Handlers) GetFreeRooms(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	campus := q.Get("campus")
	buildingID := q.Get("buildingId")
	minDuration := 60
	if v := q.Get("minDuration"); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			minDuration = i
		}
	}
	at := parseAt(r)
	rooms := h.svc.GetFreeRooms(campus, buildingID, minDuration, at)
	if rooms == nil {
		rooms = []domain.RoomStatusResponse{}
	}
	writeJSON(w, http.StatusOK, rooms)
}

// IntersectSchedules finds common free windows from provided busy intervals and free rooms.
func (h *Handlers) IntersectSchedules(w http.ResponseWriter, r *http.Request) {
	var req domain.IntersectRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body: "+err.Error())
		return
	}
	resp := h.svc.IntersectSchedules(req, time.Now())
	writeJSON(w, http.StatusOK, resp)
}

// GetBlueprint proxies a blueprint image for a space from the Fénix API.
func (h *Handlers) GetBlueprint(w http.ResponseWriter, r *http.Request) {
	spaceID := chi.URLParam(r, "spaceId")
	if spaceID == "" {
		writeError(w, http.StatusBadRequest, "spaceId is required")
		return
	}
	data, contentType, err := h.fenixClient.FetchBlueprint(r.Context(), spaceID)
	if err != nil {
		writeError(w, http.StatusBadGateway, "could not fetch blueprint: "+err.Error())
		return
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "public, max-age=86400")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(data)
}

// Health returns a simple health-check response.
func (h *Handlers) Health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"status":    "ok",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

// writeJSON serialises v as JSON and writes it to the response with the given status code.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		http.Error(w, "failed to encode response", http.StatusInternalServerError)
	}
}

// writeError writes a JSON error payload with the given status code.
func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
