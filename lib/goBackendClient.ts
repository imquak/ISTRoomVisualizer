/**
 * Go Backend API Client
 *
 * Routes all spatial/blueprint/availability requests to the Go backend.
 * Authentication (Fénix OAuth) stays in Next.js — this client is for
 * the Campus State, Blueprint & Availability Engine only.
 */

const BACKEND_URL =
  process.env.NEXT_PUBLIC_GO_BACKEND_URL || "http://localhost:8080";

// ─── Types matching the Go backend's JSON responses ───────────────────────────

export interface FloorNode {
  id: string;
  name: string;
  blueprintUrl?: string;
}

export interface BuildingNode {
  id: string;
  name: string;
  floors: FloorNode[];
}

export interface CampusTree {
  id: string;
  name: string;
  type: "CAMPUS";
  buildings: BuildingNode[];
}

export interface RoomEvent {
  type: string;        // "LESSON" | "TEST" | "GENERIC"
  title: string;
  courseAcron?: string;
  start: string;       // ISO-8601
  end: string;         // ISO-8601
  weekday: string;
}

export interface FreeInterval {
  start: string;       // ISO-8601
  end: string;         // ISO-8601
  durationMinutes: number;
}

export interface RoomStatus {
  roomId: string;
  roomName: string;
  buildingId?: string;
  buildingName: string;
  floorId?: string;
  floorName: string;
  blueprintUrl?: string;
  capacityNormal: number;
  status: "FREE" | "OCCUPIED" | "CLOSING_SOON";
  currentEvent?: RoomEvent;
  nextEvent?: RoomEvent;
  freeUntil?: string;  // ISO-8601
  freeDurationMin: number;
}

export interface FloorState {
  floorId: string;
  floorName: string;
  blueprintUrl?: string;
  rooms: Record<string, RoomStatus>;
}

export interface TimeInterval {
  start: string; // ISO-8601
  end: string;   // ISO-8601
}

export interface IntersectRequest {
  busyIntervals: TimeInterval[];
  campus?: string;
}

export interface IntersectResponse {
  commonFreeWindows: FreeInterval[];
  freeRooms: RoomStatus[];
}

// ─── Helper ───────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BACKEND_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Go backend error ${res.status} at ${path}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the full campus → building → floor tree.
 * Used to populate the navigation selector in <2 ms.
 */
export async function getCampuses(): Promise<CampusTree[]> {
  return apiFetch<CampusTree[]>("/api/v1/campuses");
}

/**
 * Returns blueprint metadata and per-room status for a floor at a given time.
 * @param floorId   Fénix floor space ID
 * @param at        ISO-8601 timestamp (defaults to now on the server)
 */
export async function getFloorState(
  floorId: string,
  at?: Date
): Promise<FloorState> {
  const params = at ? `?at=${at.toISOString()}` : "";
  return apiFetch<FloorState>(`/api/v1/floors/${floorId}/state${params}`);
}

/**
 * Returns free rooms matching the given filters.
 * @param opts.campus      "alameda" | "taguspark" | campus ID
 * @param opts.buildingId  Optional building filter
 * @param opts.minDuration Minimum free duration in minutes (default 60)
 * @param opts.at          ISO timestamp (defaults to now)
 */
export async function getFreeRooms(opts: {
  campus?: string;
  buildingId?: string;
  minDuration?: number;
  at?: Date;
}): Promise<RoomStatus[]> {
  const params = new URLSearchParams();
  if (opts.campus) params.set("campus", opts.campus);
  if (opts.buildingId) params.set("buildingId", opts.buildingId);
  if (opts.minDuration != null)
    params.set("minDuration", String(opts.minDuration));
  if (opts.at) params.set("at", opts.at.toISOString());
  const qs = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<RoomStatus[]>(`/api/v1/rooms/free${qs}`);
}

/**
 * Finds common free windows and available classrooms given a list of busy
 * intervals (e.g. derived from logged-in student's personal Fénix schedule).
 */
export async function intersectSchedules(
  req: IntersectRequest
): Promise<IntersectResponse> {
  return apiFetch<IntersectResponse>("/api/v1/schedules/intersect", {
    method: "POST",
    body: JSON.stringify(req),
  });
}

/**
 * Proxied blueprint URL through the Go backend (cached, rate-limited).
 * Use as an <img src> value.
 */
export function getBlueprintUrl(spaceId: string): string {
  return `${BACKEND_URL}/api/v1/blueprints/${spaceId}`;
}

/**
 * Health check — resolves to true if the Go backend is reachable.
 */
export async function checkHealth(): Promise<boolean> {
  try {
    await apiFetch<unknown>("/api/v1/health");
    return true;
  } catch {
    return false;
  }
}
