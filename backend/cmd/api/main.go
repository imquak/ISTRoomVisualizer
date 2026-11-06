package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/ist-room-visualizer/backend/internal/api"
	"github.com/ist-room-visualizer/backend/internal/config"
	"github.com/ist-room-visualizer/backend/internal/fenix"
	"github.com/ist-room-visualizer/backend/internal/service"
	"github.com/ist-room-visualizer/backend/internal/store"
)

func main() {
	cfg := config.Load()

	// ── Stores ──────────────────────────────────────────────────────────────────
	sqliteStore, err := store.NewSQLiteStore(cfg.DBPath)
	if err != nil {
		log.Fatalf("open SQLite store: %v", err)
	}
	defer sqliteStore.Close()

	memStore := store.NewInMemoryStore()

	// ── Restore persisted state into memory ─────────────────────────────────────
	spaces, err := sqliteStore.LoadAllSpaces()
	if err != nil {
		log.Printf("WARN: load spaces from SQLite: %v", err)
	}
	events, err := sqliteStore.LoadAllEvents()
	if err != nil {
		log.Printf("WARN: load events from SQLite: %v", err)
	}
	memStore.BulkLoad(spaces, events)
	log.Printf("Restored %d spaces and events for %d rooms from SQLite", len(spaces), len(events))

	// ── Fénix client & crawler ───────────────────────────────────────────────────
	fenixClient := fenix.NewClient(cfg.FenixBaseURL, cfg.RateLimit, cfg.RateBurst)
	crawler := fenix.NewCrawler(fenixClient, sqliteStore, memStore)

	// ── Availability service ────────────────────────────────────────────────────
	svc, err := service.NewAvailabilityService(memStore)
	if err != nil {
		log.Fatalf("create availability service: %v", err)
	}

	// ── HTTP router ──────────────────────────────────────────────────────────────
	handlers := api.NewHandlers(svc, memStore, fenixClient)
	router := api.NewRouter(handlers, cfg.CORSOrigins)

	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      router,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// ── Background sync goroutine ────────────────────────────────────────────────
	go func() {
		ctx := context.Background()

		// Run topology sync immediately on startup.
		log.Println("Starting initial topology sync...")
		if err := crawler.SyncTopology(ctx); err != nil {
			log.Printf("ERROR: topology sync failed: %v", err)
		} else {
			log.Println("Topology sync complete.")
		}

		// Run schedule sync immediately after topology.
		log.Println("Starting initial schedule sync...")
		if err := crawler.SyncSchedules(ctx, cfg.WorkerCount); err != nil {
			log.Printf("ERROR: schedule sync failed: %v", err)
		} else {
			svc.PrecomputeAllFreeIntervals(time.Now())
			log.Println("Schedule sync complete.")
		}

		// Then repeat schedule sync every 4 hours.
		ticker := time.NewTicker(4 * time.Hour)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				log.Println("Running scheduled schedule sync...")
				if err := crawler.SyncSchedules(ctx, cfg.WorkerCount); err != nil {
					log.Printf("ERROR: scheduled sync failed: %v", err)
				} else {
					svc.PrecomputeAllFreeIntervals(time.Now())
					log.Println("Scheduled sync complete.")
				}
			}
		}
	}()

	// ── Graceful shutdown ────────────────────────────────────────────────────────
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		log.Printf("Server listening on :%s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	<-quit
	log.Println("Shutting down server...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}
	log.Println("Server exited cleanly.")
}
