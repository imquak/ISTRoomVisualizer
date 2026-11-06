package fenix

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"golang.org/x/time/rate"
)

// Client is a rate-limited HTTP client for the Fénix API.
type Client struct {
	httpClient *http.Client
	limiter    *rate.Limiter
	baseURL    string
}

// NewClient creates a new Fénix API client with the given base URL and rate limiter settings.
func NewClient(baseURL string, rateLimit float64, burst int) *Client {
	return &Client{
		httpClient: &http.Client{Timeout: 30 * time.Second},
		limiter:    rate.NewLimiter(rate.Limit(rateLimit), burst),
		baseURL:    baseURL,
	}
}

// FenixSpaceResponse is the top-level response from the Fénix spaces endpoint.
type FenixSpaceResponse struct {
	ID              string           `json:"id"`
	Name            string           `json:"name"`
	Type            string           `json:"type"`
	BlueprintURL    string           `json:"blueprintUrl"`
	Information     FenixInformation `json:"information"`
	ContainedSpaces []FenixSpaceRef  `json:"containedSpaces"`
	Events          []FenixEvent     `json:"events"`
}

// FenixInformation holds capacity info for a space.
type FenixInformation struct {
	NormalCapacity int `json:"normalCapacity"`
	ExamCapacity   int `json:"examCapacity"`
}

// FenixSpaceRef is a lightweight reference to a space used in lists.
type FenixSpaceRef struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Type string `json:"type"`
}

// FenixEvent represents a scheduled event returned by the Fénix API.
type FenixEvent struct {
	Title       string       `json:"title"`
	BeginTime   string       `json:"begin"`       // "HH:mm"
	EndTime     string       `json:"end"`         // "HH:mm"
	Day         string       `json:"day"`         // "dd/MM/yyyy"
	Description string       `json:"description"`
	Course      *FenixCourse `json:"course"`
}

// FenixCourse holds course info attached to an event.
type FenixCourse struct {
	Acronym string `json:"acronym"`
	Name    string `json:"name"`
}

// doWithRetry performs a GET request with rate limiting and retries on 5xx or timeout errors.
// It retries up to 3 times with 1s, 2s, 4s delays.
func (c *Client) doWithRetry(ctx context.Context, url string) (*http.Response, error) {
	delays := []time.Duration{1 * time.Second, 2 * time.Second, 4 * time.Second}
	var lastErr error
	for attempt := 0; attempt <= len(delays); attempt++ {
		if err := c.limiter.Wait(ctx); err != nil {
			return nil, fmt.Errorf("rate limiter: %w", err)
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
		if err != nil {
			return nil, fmt.Errorf("build request: %w", err)
		}
		req.Header.Set("Accept", "application/json")

		resp, err := c.httpClient.Do(req)
		if err != nil {
			lastErr = err
			// Check for context cancellation before retrying.
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			default:
			}
			if attempt < len(delays) {
				time.Sleep(delays[attempt])
			}
			continue
		}
		if resp.StatusCode >= 500 {
			resp.Body.Close()
			lastErr = fmt.Errorf("server error: HTTP %d for %s", resp.StatusCode, url)
			if attempt < len(delays) {
				time.Sleep(delays[attempt])
			}
			continue
		}
		return resp, nil
	}
	return nil, fmt.Errorf("all retries exhausted for %s: %w", url, lastErr)
}

// FetchSpace fetches a space by ID, optionally filtered to a specific day (dd/MM/yyyy).
// If day is empty, the query param is omitted.
func (c *Client) FetchSpace(ctx context.Context, id string, day string) (*FenixSpaceResponse, error) {
	url := fmt.Sprintf("%s/spaces/%s", c.baseURL, id)
	if day != "" {
		url = fmt.Sprintf("%s?day=%s", url, day)
	}
	resp, err := c.doWithRetry(ctx, url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("space %s not found", id)
	}
	var result FenixSpaceResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode space %s: %w", id, err)
	}
	return &result, nil
}

// FetchSchedule fetches a room's schedule for a given day (dd/MM/yyyy).
// It is functionally identical to FetchSpace but named separately for clarity.
func (c *Client) FetchSchedule(ctx context.Context, roomID string, day string) (*FenixSpaceResponse, error) {
	return c.FetchSpace(ctx, roomID, day)
}

// FetchBlueprint fetches the blueprint image for a space in JPEG format.
// Returns the raw bytes and the Content-Type header value.
func (c *Client) FetchBlueprint(ctx context.Context, id string) ([]byte, string, error) {
	url := fmt.Sprintf("%s/spaces/%s/blueprint?format=jpeg", c.baseURL, id)
	resp, err := c.doWithRetry(ctx, url)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return nil, "", fmt.Errorf("blueprint for %s not found", id)
	}
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, "", fmt.Errorf("read blueprint %s: %w", id, err)
	}
	ct := resp.Header.Get("Content-Type")
	if ct == "" {
		ct = "image/jpeg"
	}
	return data, ct, nil
}
