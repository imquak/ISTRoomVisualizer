package config

import (
	"os"
	"strconv"
)

type Config struct {
	Port         string
	FenixBaseURL string
	RateLimit    float64
	RateBurst    int
	DBPath       string
	WorkerCount  int
	CORSOrigins  []string
}

func Load() *Config {
	rateLimit := 8.0
	if v := os.Getenv("FENIX_RATE_LIMIT"); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			rateLimit = f
		}
	}
	rateBurst := 16
	if v := os.Getenv("FENIX_RATE_BURST"); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			rateBurst = i
		}
	}
	workers := 12
	if v := os.Getenv("WORKER_COUNT"); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			workers = i
		}
	}
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "campus.db"
	}
	fenixBase := os.Getenv("FENIX_BASE_URL")
	if fenixBase == "" {
		fenixBase = "https://fenix.tecnico.ulisboa.pt/api/fenix/v1"
	}
	corsOrigins := []string{"http://localhost:3000"}
	if v := os.Getenv("CORS_ORIGINS"); v != "" {
		corsOrigins = append(corsOrigins, v)
	}
	return &Config{
		Port:         port,
		FenixBaseURL: fenixBase,
		RateLimit:    rateLimit,
		RateBurst:    rateBurst,
		DBPath:       dbPath,
		WorkerCount:  workers,
		CORSOrigins:  corsOrigins,
	}
}
