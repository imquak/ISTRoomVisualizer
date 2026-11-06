package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	_ "github.com/mattn/go-sqlite3"

	"github.com/ist-room-visualizer/backend/internal/domain"
)

// SQLiteStore persists space topology and room events to a SQLite database.
type SQLiteStore struct {
	db *sql.DB
}

// NewSQLiteStore opens (or creates) the SQLite database, enables WAL mode, and runs migrations.
func NewSQLiteStore(dbPath string) (*SQLiteStore, error) {
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open sqlite db: %w", err)
	}
	// Enable WAL mode for better concurrent read performance.
	if _, err := db.Exec("PRAGMA journal_mode=WAL;"); err != nil {
		db.Close()
		return nil, fmt.Errorf("enable WAL mode: %w", err)
	}
	s := &SQLiteStore{db: db}
	if err := s.migrate(); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return s, nil
}

// migrate creates the required tables if they do not already exist.
func (s *SQLiteStore) migrate() error {
	const schema = `
CREATE TABLE IF NOT EXISTS spaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    parent_id TEXT,
    blueprint_url TEXT,
    capacity_normal INTEGER DEFAULT 0,
    capacity_exam INTEGER DEFAULT 0,
    children_ids TEXT
);

CREATE TABLE IF NOT EXISTS room_events (
    room_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    title TEXT NOT NULL,
    course_acron TEXT,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    weekday TEXT NOT NULL,
    PRIMARY KEY (room_id, start_time, title)
);
`
	_, err := s.db.Exec(schema)
	return err
}

// UpsertSpace inserts or replaces a space record.
func (s *SQLiteStore) UpsertSpace(space domain.SpaceNode) error {
	childrenJSON, err := json.Marshal(space.ChildrenIDs)
	if err != nil {
		return fmt.Errorf("marshal children ids: %w", err)
	}
	_, err = s.db.Exec(`
		INSERT INTO spaces (id, name, type, parent_id, blueprint_url, capacity_normal, capacity_exam, children_ids)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			name = excluded.name,
			type = excluded.type,
			parent_id = excluded.parent_id,
			blueprint_url = excluded.blueprint_url,
			capacity_normal = excluded.capacity_normal,
			capacity_exam = excluded.capacity_exam,
			children_ids = excluded.children_ids`,
		space.ID, space.Name, string(space.Type), space.ParentID,
		space.BlueprintURL, space.CapacityNormal, space.CapacityExam, string(childrenJSON),
	)
	return err
}

// UpsertEvents replaces all events for a room: deletes existing, then inserts new ones.
func (s *SQLiteStore) UpsertEvents(roomID string, events []domain.RoomEvent) error {
	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	if _, err := tx.Exec(`DELETE FROM room_events WHERE room_id = ?`, roomID); err != nil {
		return fmt.Errorf("delete events for room %s: %w", roomID, err)
	}

	stmt, err := tx.Prepare(`
		INSERT OR REPLACE INTO room_events (room_id, event_type, title, course_acron, start_time, end_time, weekday)
		VALUES (?, ?, ?, ?, ?, ?, ?)`)
	if err != nil {
		return fmt.Errorf("prepare insert event: %w", err)
	}
	defer stmt.Close()

	for _, ev := range events {
		_, err := stmt.Exec(
			ev.RoomID,
			ev.Type,
			ev.Title,
			ev.CourseAcr,
			ev.Start.UTC().Format(time.RFC3339),
			ev.End.UTC().Format(time.RFC3339),
			ev.Weekday,
		)
		if err != nil {
			return fmt.Errorf("insert event: %w", err)
		}
	}
	return tx.Commit()
}

// LoadAllSpaces returns every space stored in the database.
func (s *SQLiteStore) LoadAllSpaces() ([]domain.SpaceNode, error) {
	rows, err := s.db.Query(`
		SELECT id, name, type, parent_id, blueprint_url, capacity_normal, capacity_exam, children_ids
		FROM spaces`)
	if err != nil {
		return nil, fmt.Errorf("query spaces: %w", err)
	}
	defer rows.Close()

	var spaces []domain.SpaceNode
	for rows.Next() {
		var (
			node         domain.SpaceNode
			parentID     sql.NullString
			blueprintURL sql.NullString
			childrenJSON sql.NullString
			spaceType    string
		)
		if err := rows.Scan(
			&node.ID, &node.Name, &spaceType,
			&parentID, &blueprintURL,
			&node.CapacityNormal, &node.CapacityExam,
			&childrenJSON,
		); err != nil {
			return nil, fmt.Errorf("scan space: %w", err)
		}
		node.Type = domain.SpaceType(spaceType)
		if parentID.Valid {
			node.ParentID = parentID.String
		}
		if blueprintURL.Valid {
			node.BlueprintURL = blueprintURL.String
		}
		if childrenJSON.Valid && childrenJSON.String != "" {
			if err := json.Unmarshal([]byte(childrenJSON.String), &node.ChildrenIDs); err != nil {
				node.ChildrenIDs = nil
			}
		}
		spaces = append(spaces, node)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate spaces: %w", err)
	}
	return spaces, nil
}

// LoadAllEvents returns all room events grouped by room ID.
func (s *SQLiteStore) LoadAllEvents() (map[string][]domain.RoomEvent, error) {
	rows, err := s.db.Query(`
		SELECT room_id, event_type, title, course_acron, start_time, end_time, weekday
		FROM room_events`)
	if err != nil {
		return nil, fmt.Errorf("query events: %w", err)
	}
	defer rows.Close()

	result := make(map[string][]domain.RoomEvent)
	for rows.Next() {
		var (
			ev          domain.RoomEvent
			courseAcron sql.NullString
			startStr    string
			endStr      string
		)
		if err := rows.Scan(
			&ev.RoomID, &ev.Type, &ev.Title,
			&courseAcron, &startStr, &endStr, &ev.Weekday,
		); err != nil {
			return nil, fmt.Errorf("scan event: %w", err)
		}
		if courseAcron.Valid {
			ev.CourseAcr = courseAcron.String
		}
		start, err := time.Parse(time.RFC3339, startStr)
		if err != nil {
			return nil, fmt.Errorf("parse start_time %q: %w", startStr, err)
		}
		end, err := time.Parse(time.RFC3339, endStr)
		if err != nil {
			return nil, fmt.Errorf("parse end_time %q: %w", endStr, err)
		}
		ev.Start = start
		ev.End = end
		result[ev.RoomID] = append(result[ev.RoomID], ev)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate events: %w", err)
	}
	return result, nil
}

// Close closes the underlying database connection.
func (s *SQLiteStore) Close() error {
	return s.db.Close()
}
