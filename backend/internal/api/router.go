package api

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

// NewRouter builds and returns the chi router with all middleware and routes configured.
func NewRouter(h *Handlers, corsOrigins []string) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))

	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   corsOrigins,
		AllowedMethods:   []string{"GET", "POST", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Content-Type"},
		AllowCredentials: false,
		MaxAge:           300,
	}))

	r.Route("/api/v1", func(r chi.Router) {
		r.Get("/campuses", h.GetCampuses)
		r.Get("/floors/{floorId}/state", h.GetFloorState)
		r.Get("/rooms/free", h.GetFreeRooms)
		r.Post("/schedules/intersect", h.IntersectSchedules)
		r.Get("/health", h.Health)
		// Blueprint proxy - serves cached local blueprints or proxies from Fénix.
		r.Get("/blueprints/{spaceId}", h.GetBlueprint)
	})

	return r
}
