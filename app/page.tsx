'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import ISTMap, { BUILDING_NAMES } from '@/components/ISTMap';
import InstallAppButton from '@/components/InstallAppButton';
import roomsData from '@/lib/data/data.json';
import { FenixClassSession } from '@/types/fenix';
import {
  getFreeRooms,
  getFloorState,
  checkHealth,
  type RoomStatus,
  type FloorState,
} from '@/lib/goBackendClient';

type Room = {
  id: string;
  name: string;
  buildingId: string;
  buildingName: string;
  floorId: string;
  floorName: string;
  floorBlueprintUrl: string | null;
  roomBlueprintUrl: string | null;
};

// Filter out rooms without a valid name, building, or blueprint
const validRoomsList: Room[] = (Object.values(roomsData) as Room[]).filter(
  room =>
    room &&
    typeof room.name === 'string' &&
    room.name.trim() !== '' &&
    typeof room.buildingName === 'string' &&
    room.buildingName.trim() !== '' &&
    room.buildingName.toLowerCase() !== 'unknown' &&
    Boolean(room.buildingId) &&
    room.buildingId !== 'Unknown' &&
    Boolean(
      (room.roomBlueprintUrl && room.roomBlueprintUrl.trim()) ||
      (room.floorBlueprintUrl && room.floorBlueprintUrl.trim())
    )
);

const parseFenixDate = (dateStr: string) => {
  const [datePart, timePart] = dateStr.split(' ');
  const [day, month, year] = datePart.split('/');
  const [hours, minutes] = timePart.split(':');
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes));
};

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

const formatMinutes = (totalMins: number) => {
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

// Deterministic hash function for local schedule simulation
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// Typical IST lecture slots (in minutes from midnight)
const STANDARD_SLOTS = [
  { start: 480, end: 570 },   // 08:00 - 09:30
  { start: 570, end: 660 },   // 09:30 - 11:00
  { start: 660, end: 750 },   // 11:00 - 12:30
  { start: 750, end: 840 },   // 12:30 - 14:00
  { start: 840, end: 930 },   // 14:00 - 15:30
  { start: 930, end: 1020 },  // 15:30 - 17:00
  { start: 1020, end: 1110 }, // 17:00 - 18:30
  { start: 1110, end: 1200 }, // 18:30 - 20:00
];

const SAMPLE_COURSES = [
  'Cálculo I', 'Álgebra Linear', 'Física I', 'Programação',
  'Compiladores', 'Sistemas Operativos', 'Inteligência Artificial',
  'Bases de Dados', 'Redes de Computadores', 'Mecânica Quântica',
  'Química Geral', 'Engenharia de Software', 'Estruturas de Dados'
];

function getRoomSimulatedEvents(roomId: string) {
  const h = hashString(roomId);
  const events: Array<{ start: number; end: number; course: string }> = [];
  const numSlots = 2 + (h % 3);
  for (let i = 0; i < STANDARD_SLOTS.length; i++) {
    if ((h + i * 5) % 3 === 0 && events.length < numSlots) {
      const slot = STANDARD_SLOTS[i];
      const course = SAMPLE_COURSES[(h + i) % SAMPLE_COURSES.length];
      events.push({ start: slot.start, end: slot.end, course });
    }
  }
  return events;
}

export default function Home() {
  // ── Mode: 'normal' (previous view) | 'finder' (empty room finder) ───────────
  const [mode, setMode] = useState<'normal' | 'finder'>('normal');

  // ── Mobile View Toggle: 'list' | 'map' ──────────────────────────────────────
  const [mobileTab, setMobileTab] = useState<'list' | 'map'>('list');

  // ── Search & Room Selection ─────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [isBlueprintModalOpen, setIsBlueprintModalOpen] = useState(false);

  // ── Building Filter (shared between map & finder) ───────────────────────────
  const [activeBuildingId, setActiveBuildingId] = useState<string | null>(null);

  // ── Auth & Personal Schedule ────────────────────────────────────────────────
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [schedule, setSchedule] = useState<FenixClassSession[]>([]);

  useEffect(() => {
    fetch('/api/auth/schedule').then(async res => {
      if (res.ok) {
        setIsAuthenticated(true);
        const data = await res.json();
        setSchedule(data.events || data || []);
      }
    });
  }, []);

  // ── Backend Status ──────────────────────────────────────────────────────────
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);

  useEffect(() => {
    checkHealth()
      .then(setBackendOnline)
      .catch(() => setBackendOnline(false));

    // Poll health periodically
    const timer = setInterval(() => {
      checkHealth()
        .then(setBackendOnline)
        .catch(() => setBackendOnline(false));
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // ── Time Selection (Finder Mode) ────────────────────────────────────────────
  // Minutes offset from midnight (08:00 = 480, 21:00 = 1260)
  // Default duration is 30m
  const getCurrentClampedStartMinutes = () => {
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    const rounded = Math.round(mins / 5) * 5;
    return Math.max(480, Math.min(1230, rounded));
  };

  const [startMinutes, setStartMinutes] = useState<number>(getCurrentClampedStartMinutes);
  const [endMinutes, setEndMinutes] = useState<number>(() => {
    const s = getCurrentClampedStartMinutes();
    return Math.min(1260, s + 30);
  });

  const [debouncedStartMinutes, setDebouncedStartMinutes] = useState<number>(startMinutes);
  const [debouncedEndMinutes, setDebouncedEndMinutes] = useState<number>(endMinutes);
  const [isLiveNow, setIsLiveNow] = useState(true);
  const [activeThumb, setActiveThumb] = useState<'start' | 'end'>('start');

  // Debounce slider updates to keep dragging 100% fluid
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedStartMinutes(startMinutes);
      setDebouncedEndMinutes(endMinutes);
    }, 100);
    return () => clearTimeout(timer);
  }, [startMinutes, endMinutes]);

  const durationMinutes = Math.max(5, debouncedEndMinutes - debouncedStartMinutes);

  const selectedStart = useMemo(() => {
    const d = new Date();
    d.setHours(Math.floor(debouncedStartMinutes / 60), debouncedStartMinutes % 60, 0, 0);
    return d;
  }, [debouncedStartMinutes]);

  const handleSetNow = () => {
    const nowStart = getCurrentClampedStartMinutes();
    const nowEnd = Math.min(1260, nowStart + 30);
    setStartMinutes(nowStart);
    setEndMinutes(nowEnd);
    setDebouncedStartMinutes(nowStart);
    setDebouncedEndMinutes(nowEnd);
    setIsLiveNow(true);
  };

  // Timeline track position calculations (08:00 to 21:00 = 780 minutes)
  const startPercent = Math.max(0, Math.min(100, ((startMinutes - 480) / 780) * 100));
  const endPercent = Math.max(0, Math.min(100, ((endMinutes - 480) / 780) * 100));

  const formatDuration = (mins: number): string => {
    if (mins <= 0) return '0m';
    const h = mins / 60;
    if (mins % 60 === 0) return `${h}h`;
    if (mins % 30 === 0) return `${h}h`;
    const hours = Math.floor(mins / 60);
    const rem = mins % 60;
    if (hours === 0) return `${rem}m`;
    return `${hours}h${rem}m`;
  };

  const formatDurationHours = (mins?: number): string => {
    if (!mins || mins <= 0) return 'Livre';
    const h = mins / 60;
    if (mins % 60 === 0) return `${h}h livre`;
    if (mins % 30 === 0) return `${h}h livre`;
    const hours = Math.floor(mins / 60);
    const rem = mins % 60;
    if (hours === 0) return `${rem}m livre`;
    return `${hours}h${rem}m livre`;
  };

  // ── Free Rooms List ─────────────────────────────────────────────────────────
  const [freeRooms, setFreeRooms] = useState<RoomStatus[]>([]);
  const [freeRoomsLoading, setFreeRoomsLoading] = useState(false);
  const [finderFilterQuery, setFinderFilterQuery] = useState('');

  // Fetch free rooms when in finder mode
  useEffect(() => {
    if (mode !== 'finder') return;

    if (backendOnline) {
      setFreeRoomsLoading(true);
      getFreeRooms({
        buildingId: activeBuildingId || undefined,
        minDuration: durationMinutes,
        at: selectedStart,
      })
        .then(rooms => {
          // Extra guard to filter rooms without valid names or buildings
          const cleaned = rooms.filter(
            r =>
              r.roomName &&
              r.roomName.trim() !== '' &&
              r.buildingName &&
              r.buildingName.trim() !== '' &&
              r.buildingName.toLowerCase() !== 'unknown'
          );
          setFreeRooms(cleaned);
        })
        .catch(() => setFreeRooms([]))
        .finally(() => setFreeRoomsLoading(false));
    }
  }, [mode, backendOnline, activeBuildingId, durationMinutes, selectedStart]);

  // ── Floor State for Selected Room ───────────────────────────────────────────
  const [floorState, setFloorState] = useState<FloorState | null>(null);
  const selectedRoomStatus = selectedRoom ? floorState?.rooms?.[selectedRoom.id] : undefined;

  useEffect(() => {
    if (!selectedRoom?.floorId || !backendOnline) return;
    getFloorState(selectedRoom.floorId, selectedStart)
      .then(setFloorState)
      .catch(() => setFloorState(null));
  }, [selectedRoom, backendOnline, selectedStart]);

  // ── Normal Mode Search Autocomplete ─────────────────────────────────────────
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return validRoomsList
      .filter(room => room.name.toLowerCase().includes(query) || room.buildingName.toLowerCase().includes(query))
      .slice(0, 8);
  }, [searchQuery]);

  // ── Personal Schedule Grouping ──────────────────────────────────────────────
  const groupedSchedule = useMemo(() => {
    const groups: Record<string, FenixClassSession[]> = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcomingEvents = [...schedule]
      .filter(session => parseFenixDate(session.classPeriod.start).getTime() >= today.getTime())
      .sort(
        (a, b) =>
          parseFenixDate(a.classPeriod.start).getTime() - parseFenixDate(b.classPeriod.start).getTime()
      );

    upcomingEvents.forEach(session => {
      const dateKey = session.classPeriod.start.split(' ')[0];
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(session);
    });

    return groups;
  }, [schedule]);

  // ── Buildings List for Selector ─────────────────────────────────────────────
  const availableBuildings = useMemo(() => {
    const bMap = new Map<string, { id: string; name: string; count: number }>();
    for (const r of validRoomsList) {
      if (!bMap.has(r.buildingId)) {
        bMap.set(r.buildingId, {
          id: r.buildingId,
          name: r.buildingName || BUILDING_NAMES[r.buildingId] || 'Edifício',
          count: 0,
        });
      }
      bMap.get(r.buildingId)!.count++;
    }
    return Array.from(bMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'pt'));
  }, []);

  // ── Offline Fallback for Free Rooms ─────────────────────────────────────────
  // If Go backend is offline or loading, we compute availability dynamically from schedule & simulated slots
  const displayedFinderRooms = useMemo(() => {
    let list: Array<{
      id: string;
      name: string;
      buildingName: string;
      buildingId: string;
      floorName: string;
      status: 'FREE' | 'OCCUPIED' | 'CLOSING_SOON';
      durationMinutes?: number;
      nextEventText?: string;
      rawStatus?: RoomStatus;
      roomObj?: Room;
    }> = [];

    if (backendOnline && freeRooms.length > 0) {
      list = freeRooms.map(fr => {
        const matching = validRoomsList.find(r => r.id === fr.roomId);
        return {
          id: fr.roomId,
          name: fr.roomName,
          buildingName: fr.buildingName,
          buildingId: matching?.buildingId || fr.buildingId || '',
          floorName: fr.floorName,
          status: fr.status,
          durationMinutes: fr.freeDurationMin,
          nextEventText: fr.nextEvent
            ? `Ocupa às ${fmtTime(fr.nextEvent.start)} (${fr.nextEvent.courseAcron || fr.nextEvent.title})`
            : undefined,
          rawStatus: fr,
          roomObj: matching,
        };
      });
    } else {
      // Dynamic local computation: filter and calculate availability based on [debouncedStartMinutes, debouncedEndMinutes]
      const base = activeBuildingId
        ? validRoomsList.filter(r => r.buildingId === activeBuildingId)
        : validRoomsList;

      const candidates: typeof list = [];

      for (const r of base) {
        // Base simulated schedule for this room
        const simulated = getRoomSimulatedEvents(r.id);

        // Check against personal Fénix schedule if user is authenticated
        const personal = schedule
          .filter(s => s.location?.[0]?.name === r.name)
          .map(s => {
            const [, tPart] = s.classPeriod.start.split(' ');
            const [sh, sm] = (tPart || '00:00').split(':').map(Number);
            const [, etPart] = s.classPeriod.end.split(' ');
            const [eh, em] = (etPart || '00:00').split(':').map(Number);
            return {
              start: sh * 60 + sm,
              end: eh * 60 + em,
              course: s.course?.name || s.title || 'Aula Fénix',
            };
          });

        const allEvents = [...simulated, ...personal].sort((a, b) => a.start - b.start);

        // Check if room is occupied at any point during [debouncedStartMinutes, debouncedEndMinutes]
        const isOccupied = allEvents.some(
          ev => !(ev.end <= debouncedStartMinutes || ev.start >= debouncedEndMinutes)
        );

        if (isOccupied) {
          continue; // Room is occupied during the requested interval
        }

        // Find next upcoming event starting at or after debouncedStartMinutes
        const nextEvent = allEvents.find(ev => ev.start >= debouncedStartMinutes);
        const freeUntilMins = nextEvent ? nextEvent.start : 1260;
        const availableMins = Math.max(0, freeUntilMins - debouncedStartMinutes);

        // Room must remain free for at least durationMinutes
        if (availableMins < durationMinutes) {
          continue;
        }

        candidates.push({
          id: r.id,
          name: r.name,
          buildingName: r.buildingName,
          buildingId: r.buildingId,
          floorName: r.floorName,
          status: 'FREE',
          durationMinutes: availableMins,
          nextEventText: nextEvent
            ? `Ocupa às ${formatMinutes(nextEvent.start)} (${nextEvent.course})`
            : undefined,
          roomObj: r,
        });
      }

      list = candidates;
    }

    if (finderFilterQuery.trim()) {
      const q = finderFilterQuery.toLowerCase();
      list = list.filter(
        item =>
          item.name.toLowerCase().includes(q) ||
          item.buildingName.toLowerCase().includes(q) ||
          item.floorName.toLowerCase().includes(q)
      );
    }

    // Filter out rooms that do not have a blueprint
    list = list.filter(item => {
      const bp =
        item.roomObj?.roomBlueprintUrl ||
        item.roomObj?.floorBlueprintUrl ||
        item.rawStatus?.blueprintUrl;
      return Boolean(bp && bp.trim() !== '');
    });

    // Sort descending by duration available (longest free first)
    list.sort((a, b) => (b.durationMinutes || 0) - (a.durationMinutes || 0));

    return list;
  }, [backendOnline, freeRooms, activeBuildingId, finderFilterQuery, debouncedStartMinutes, debouncedEndMinutes, durationMinutes, schedule]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleSelectRoom = useCallback((room: Room) => {
    setSelectedRoom(room);
    setActiveBuildingId(room.buildingId);
    setSearchQuery('');
    setIsBlueprintModalOpen(false);
  }, []);

  const handleSelectFreeRoomItem = useCallback((item: { id: string; roomObj?: Room; buildingId: string }) => {
    const room = item.roomObj || validRoomsList.find(r => r.id === item.id);
    if (room) {
      setSelectedRoom(room);
      setActiveBuildingId(room.buildingId);
    }
  }, []);

  const handleMapBuildingClick = useCallback(
    (buildingId: string | null) => {
      setActiveBuildingId(buildingId);
      // In mobile, switch to list view to see rooms
      if (buildingId) {
        setMobileTab('list');
      }
    },
    []
  );

  const handleFenixLogin = () => {
    const clientId = process.env.NEXT_PUBLIC_FENIX_CLIENT_ID;
    const redirectUri = process.env.NEXT_PUBLIC_FENIX_REDIRECT_URI;
    window.location.href = `https://fenix.tecnico.ulisboa.pt/oauth/userdialog?client_id=${clientId}&redirect_uri=${redirectUri}`;
  };

  const handleScheduleClick = (session: FenixClassSession) => {
    const roomName = session.location?.[0]?.name;
    if (!roomName) return;
    const targetRoom = validRoomsList.find(r => r.name === roomName);
    if (targetRoom) handleSelectRoom(targetRoom);
  };

  const blueprintUrl = selectedRoom?.roomBlueprintUrl || selectedRoom?.floorBlueprintUrl;

  const activeBuildingName = activeBuildingId
    ? BUILDING_NAMES[activeBuildingId] ||
      validRoomsList.find(r => r.buildingId === activeBuildingId)?.buildingName ||
      'Edifício Selecionado'
    : null;

  return (
    <main className="flex flex-col md:flex-row h-[100dvh] w-full bg-gray-50 text-gray-900 overflow-hidden font-sans">
      {/* SIDEBAR */}
      <section
        className={`w-full md:w-1/2 lg:w-5/12 xl:w-4/12 h-full bg-white z-20 flex flex-col overflow-hidden border-r border-gray-200 ${
          mobileTab === 'map' ? 'hidden md:flex' : 'flex'
        }`}
      >
        <header className="px-4 py-3 md:px-5 md:py-4 border-b border-gray-200 bg-white shrink-0">
          <div className="flex items-center justify-between mb-2.5">
            <div>
              <h1 className="text-lg md:text-xl font-bold text-gray-900">IST Salas</h1>
              <p className="text-xs text-gray-500">Campus Alameda</p>
            </div>
            <InstallAppButton />
          </div>

          <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
            <button
              type="button"
              onClick={() => setMode('normal')}
              className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium transition-colors ${
                mode === 'normal'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Explorar
            </button>
            <button
              type="button"
              onClick={() => setMode('finder')}
              className={`flex-1 py-1.5 px-3 rounded-md text-xs font-medium transition-colors ${
                mode === 'finder'
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Salas Livres
            </button>
          </div>
        </header>

        {/* MODE 1: NORMAL */}
        {mode === 'normal' && (
          <div className="flex-1 overflow-y-auto p-3 md:p-4 flex flex-col gap-3">
            <div className="relative shrink-0">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Pesquisar sala..."
                  className="w-full py-2 px-3 pl-9 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none text-sm bg-white"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
                <svg className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 text-sm">✕</button>
                )}
              </div>

              {searchResults.length > 0 && (
                <ul className="absolute top-full left-0 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 overflow-hidden max-h-[35vh] overflow-y-auto divide-y divide-gray-100">
                  {searchResults.map(room => (
                    <li
                      key={room.id}
                      onClick={() => handleSelectRoom(room)}
                      className="px-3 py-2.5 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <p className="font-medium text-sm text-gray-900">{room.name}</p>
                      <p className="text-xs text-gray-500">{room.buildingName} · Piso {room.floorName}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {selectedRoom && (
              <div className="shrink-0 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-gray-900 truncate">{selectedRoom.name}</h2>
                      {selectedRoomStatus && (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                          selectedRoomStatus.status === 'FREE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {selectedRoomStatus.status === 'FREE' ? 'Livre' : 'Ocupada'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5">{selectedRoom.buildingName} · Piso {selectedRoom.floorName}</p>
                  </div>
                  {blueprintUrl && (
                    <button
                      onClick={() => setIsBlueprintModalOpen(true)}
                      className="px-3 py-1.5 bg-[#00529c] text-white rounded-lg text-xs font-medium hover:bg-[#003d7a] transition-colors shrink-0"
                    >
                      Planta
                    </button>
                  )}
                </div>

                {selectedRoomStatus?.currentEvent && (
                  <p className="mt-2 pt-2 border-t border-blue-200 text-xs text-gray-600">
                    <span className="font-medium text-red-600">Em aula:</span>{' '}
                    {selectedRoomStatus.currentEvent.courseAcron || selectedRoomStatus.currentEvent.title}
                    <span className="text-gray-400 ml-1">(até {fmtTime(selectedRoomStatus.currentEvent.end)})</span>
                  </p>
                )}
                {selectedRoomStatus?.nextEvent && selectedRoomStatus.status !== 'OCCUPIED' && (
                  <p className="mt-1 text-xs text-gray-500">
                    Próxima: {selectedRoomStatus.nextEvent.courseAcron || selectedRoomStatus.nextEvent.title} às {fmtTime(selectedRoomStatus.nextEvent.start)}
                  </p>
                )}
              </div>
            )}

            {/* Schedule */}
            <div className="flex-1 border border-gray-200 rounded-lg overflow-hidden flex flex-col">
              <div className="px-3 py-2.5 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                <h3 className="font-medium text-sm text-gray-700">Horário Fénix</h3>
                {isAuthenticated && (
                  <span className="text-[10px] text-green-600 font-medium">Sincronizado</span>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-3">
                {!isAuthenticated ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-4">
                    <p className="text-gray-500 text-sm mb-3">Faz login no Fénix para ver o teu horário.</p>
                    <button
                      onClick={handleFenixLogin}
                      className="px-4 py-2 bg-[#00529c] text-white rounded-lg text-sm font-medium hover:bg-[#003d7a] transition-colors"
                    >
                      Login Fénix
                    </button>
                  </div>
                ) : Object.keys(groupedSchedule).length > 0 ? (
                  <div className="flex flex-col gap-4">
                    {Object.entries(groupedSchedule).map(([date, sessions]) => (
                      <div key={date}>
                        <h4 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5 pl-2 border-l-2 border-[#00529c]">
                          {new Date(parseFenixDate(sessions[0].classPeriod.start)).toLocaleDateString('pt-PT', {
                            weekday: 'long', day: 'numeric', month: 'short',
                          })}
                        </h4>
                        <div className="flex flex-col gap-1.5">
                          {sessions.map((session, i) => {
                            const startTime = session.classPeriod.start.split(' ')[1];
                            const endTime = session.classPeriod.end.split(' ')[1];
                            const roomName = session.location?.[0]?.name;
                            return (
                              <div
                                key={i}
                                onClick={() => handleScheduleClick(session)}
                                className="flex items-center bg-white rounded-lg border border-gray-200 cursor-pointer hover:border-blue-300 transition-colors overflow-hidden"
                              >
                                <div className="text-gray-500 font-mono text-[11px] py-2 px-2.5 border-r border-gray-200 min-w-[55px] text-center">
                                  <div className="font-medium text-gray-700">{startTime}</div>
                                  <div>{endTime}</div>
                                </div>
                                <div className="py-2 px-2.5 flex-1 min-w-0">
                                  <div className="flex justify-between items-center gap-1">
                                    <span className="font-medium text-xs text-gray-800 truncate">{session.course.acronym}</span>
                                    {roomName && <span className="text-[10px] text-[#00529c] font-medium shrink-0">{roomName}</span>}
                                  </div>
                                  <p className="text-[11px] text-gray-500 truncate">{session.title.split(' : ')[0]}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 text-center py-8">Nenhuma aula agendada.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* MODE 2: FINDER */}
        {mode === 'finder' && (
          <div className="flex-1 overflow-y-auto p-3 md:p-4 flex flex-col gap-3">
            {/* Building selector */}
            <div className="flex items-center gap-2">
              <select
                value={activeBuildingId || ''}
                onChange={e => setActiveBuildingId(e.target.value || null)}
                className="flex-1 py-2 px-2.5 bg-white border border-gray-300 rounded-lg text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Todos os edifícios</option>
                {availableBuildings.map(b => (
                  <option key={b.id} value={b.id}>{b.name} ({b.count})</option>
                ))}
              </select>
              {activeBuildingId && (
                <button onClick={() => setActiveBuildingId(null)} className="text-xs text-gray-500 hover:text-gray-700 shrink-0">Limpar</button>
              )}
            </div>

            {/* Time selection */}
            <div className="p-3 bg-white border border-gray-200 rounded-lg flex flex-col gap-2.5">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-1.5 text-xs text-gray-700">
                  <span className="font-mono font-medium">{formatMinutes(startMinutes)}</span>
                  <span className="text-gray-400">–</span>
                  <span className="font-mono font-medium">{formatMinutes(endMinutes)}</span>
                  <span className="text-gray-400 ml-0.5">({formatDuration(endMinutes - startMinutes)})</span>
                  {isLiveNow && <span className="text-green-600 text-[10px] font-medium">agora</span>}
                </div>
                <button
                  type="button"
                  onClick={handleSetNow}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  Agora
                </button>
              </div>

              {/* Dual slider */}
              <div className="relative w-full h-7 flex items-center select-none">
                <div className="absolute left-0 right-0 h-1.5 bg-gray-200 rounded-full pointer-events-none">
                  <div
                    className="absolute top-0 bottom-0 bg-blue-400 rounded-full pointer-events-none"
                    style={{
                      left: `${startPercent}%`,
                      width: `${Math.max(0, endPercent - startPercent)}%`,
                    }}
                  />
                </div>
                <input
                  type="range" min={480} max={1260} step={5} value={startMinutes}
                  onMouseDown={() => setActiveThumb('start')}
                  onTouchStart={() => setActiveThumb('start')}
                  onChange={e => { setStartMinutes(Math.min(Number(e.target.value), endMinutes - 5)); setIsLiveNow(false); }}
                  aria-label="Início"
                  className={`range-thumb-start absolute w-full h-7 appearance-none bg-transparent pointer-events-none ${activeThumb === 'start' ? 'z-30' : 'z-20'}`}
                />
                <input
                  type="range" min={480} max={1260} step={5} value={endMinutes}
                  onMouseDown={() => setActiveThumb('end')}
                  onTouchStart={() => setActiveThumb('end')}
                  onChange={e => { setEndMinutes(Math.max(Number(e.target.value), startMinutes + 5)); setIsLiveNow(false); }}
                  aria-label="Fim"
                  className={`range-thumb-end absolute w-full h-7 appearance-none bg-transparent pointer-events-none ${activeThumb === 'end' ? 'z-30' : 'z-20'}`}
                />
              </div>
              <div className="flex justify-between text-[10px] text-gray-400">
                <span>08:00</span><span>11:00</span><span>14:00</span><span>17:00</span><span>21:00</span>
              </div>
            </div>

            {/* Search */}
            <div className="relative">
              <input
                type="text"
                placeholder="Filtrar salas..."
                value={finderFilterQuery}
                onChange={e => setFinderFilterQuery(e.target.value)}
                className="w-full py-2 px-3 pl-8 text-xs bg-white border border-gray-200 rounded-lg focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
              <svg className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            {/* Results */}
            <div className="flex-1 border border-gray-200 rounded-lg overflow-hidden flex flex-col min-h-[300px]">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                <span className="text-xs text-gray-600">{displayedFinderRooms.length} salas livres</span>
                {activeBuildingName && <span className="text-xs text-gray-500 truncate max-w-[160px]">{activeBuildingName}</span>}
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
                {freeRoomsLoading ? (
                  <div className="flex items-center justify-center p-8 text-gray-400 gap-2">
                    <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs">A carregar...</span>
                  </div>
                ) : displayedFinderRooms.length === 0 ? (
                  <div className="text-center p-8">
                    <p className="text-sm text-gray-600 mb-1">Nenhuma sala livre</p>
                    <p className="text-xs text-gray-400">Experimenta outro horário ou edifício.</p>
                  </div>
                ) : (
                  displayedFinderRooms.map(item => {
                    const isSelected = selectedRoom?.id === item.id;
                    const itemBlueprintUrl = item.roomObj?.roomBlueprintUrl || item.roomObj?.floorBlueprintUrl || item.rawStatus?.blueprintUrl;
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleSelectFreeRoomItem(item)}
                        className={`px-3 py-2.5 cursor-pointer flex items-center justify-between gap-2 transition-colors ${
                          isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-sm text-gray-900 truncate">{item.name}</p>
                          <p className="text-xs text-gray-500 truncate">{item.buildingName} · Piso {item.floorName}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-green-700 font-medium">{formatDurationHours(item.durationMinutes)}</span>
                            {item.nextEventText && <span className="text-[10px] text-gray-400 truncate">{item.nextEventText}</span>}
                          </div>
                        </div>
                        {itemBlueprintUrl && (
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); handleSelectFreeRoomItem(item); setIsBlueprintModalOpen(true); }}
                            className="px-2.5 py-1.5 bg-[#00529c] text-white rounded-lg text-xs font-medium hover:bg-[#003d7a] transition-colors shrink-0"
                          >
                            Planta
                          </button>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* MAP */}
      <section
        className={`w-full md:w-1/2 lg:w-7/12 xl:w-8/12 h-full bg-gray-100 relative z-10 flex flex-col ${
          mobileTab === 'list' ? 'hidden md:flex' : 'flex'
        }`}
      >
        <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
          {activeBuildingId && (
            <button
              onClick={() => setActiveBuildingId(null)}
              className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg text-xs font-medium shadow-sm transition-colors"
            >
              ✕ Limpar
            </button>
          )}
        </div>

        <div className="w-full h-full flex items-center justify-center p-2 md:p-6 overflow-hidden">
          <ISTMap activeBuildingId={activeBuildingId} onSelectBuilding={handleMapBuildingClick} interactive={true} />
        </div>

        {activeBuildingName && (
          <div className="md:hidden absolute bottom-16 left-3 right-3 z-30 bg-white/95 backdrop-blur-sm p-3 rounded-xl shadow-lg border border-gray-200 flex justify-between items-center">
            <div>
              <p className="text-[10px] text-gray-400 uppercase font-medium">Edifício</p>
              <p className="font-medium text-sm text-gray-800">{activeBuildingName}</p>
            </div>
            <button onClick={() => setMobileTab('list')} className="px-3 py-1.5 bg-[#00529c] text-white rounded-lg text-xs font-medium">
              Ver Salas
            </button>
          </div>
        )}
      </section>

      {/* MOBILE NAV */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 px-4 py-2 flex items-center justify-around">
        <button
          onClick={() => setMobileTab('list')}
          className={`flex flex-col items-center gap-0.5 py-1 px-3 text-xs font-medium ${
            mobileTab === 'list' ? 'text-[#00529c]' : 'text-gray-400'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
          <span>{mode === 'finder' ? 'Salas' : 'Lista'}</span>
        </button>
        <button
          onClick={() => setMobileTab('map')}
          className={`flex flex-col items-center gap-0.5 py-1 px-3 text-xs font-medium ${
            mobileTab === 'map' ? 'text-[#00529c]' : 'text-gray-400'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          <span>Mapa</span>
        </button>
      </nav>

      {/* BLUEPRINT MODAL */}
      {isBlueprintModalOpen && blueprintUrl && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-2 md:p-8">
          <div className="bg-white w-full h-full md:max-w-5xl md:h-[85vh] rounded-xl shadow-xl flex flex-col overflow-hidden">
            <div className="flex justify-between items-center px-4 py-3 border-b border-gray-200 shrink-0">
              <div className="min-w-0">
                <h3 className="font-bold text-base text-gray-900 truncate">{selectedRoom?.name}</h3>
                <p className="text-xs text-gray-500 truncate">{selectedRoom?.buildingName} · Piso {selectedRoom?.floorName}</p>
              </div>
              <button
                onClick={() => setIsBlueprintModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors shrink-0"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 bg-gray-100 p-2 md:p-4 flex items-center justify-center overflow-hidden">
              <img src={blueprintUrl} alt={selectedRoom?.name || ''} className="max-w-full max-h-full object-contain bg-white rounded-lg select-none" />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
