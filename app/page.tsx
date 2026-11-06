'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import ISTMap, { BUILDING_NAMES } from '@/components/ISTMap';
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

// Filter out rooms without a valid name or building
const validRoomsList: Room[] = (Object.values(roomsData) as Room[]).filter(
  room =>
    room &&
    typeof room.name === 'string' &&
    room.name.trim() !== '' &&
    typeof room.buildingName === 'string' &&
    room.buildingName.trim() !== '' &&
    room.buildingName.toLowerCase() !== 'unknown' &&
    Boolean(room.buildingId) &&
    room.buildingId !== 'Unknown'
);

const parseFenixDate = (dateStr: string) => {
  const [datePart, timePart] = dateStr.split(' ');
  const [day, month, year] = datePart.split('/');
  const [hours, minutes] = timePart.split(':');
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes));
};

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });

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
  const getCurrentClampedMinutes = () => {
    const now = new Date();
    const mins = now.getHours() * 60 + now.getMinutes();
    return Math.max(480, Math.min(1260, mins));
  };

  const [sliderMinutes, setSliderMinutes] = useState<number>(getCurrentClampedMinutes);
  const [isLiveNow, setIsLiveNow] = useState(true);
  const [minDuration, setMinDuration] = useState<number>(30); // minutes

  const selectedAt = useMemo(() => {
    const d = new Date();
    d.setHours(Math.floor(sliderMinutes / 60), sliderMinutes % 60, 0, 0);
    return d;
  }, [sliderMinutes]);

  const handleSetNow = () => {
    setSliderMinutes(getCurrentClampedMinutes());
    setIsLiveNow(true);
  };

  const handleAdjustMinutes = (delta: number) => {
    setSliderMinutes(prev => Math.max(480, Math.min(1260, prev + delta)));
    setIsLiveNow(false);
  };

  const handleSetSpecificTime = (hour: number, minute: number = 0) => {
    setSliderMinutes(hour * 60 + minute);
    setIsLiveNow(false);
  };

  const sliderTimeFormatted = useMemo(() => {
    const h = Math.floor(sliderMinutes / 60);
    const m = sliderMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }, [sliderMinutes]);

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
        minDuration,
        at: selectedAt,
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
  }, [mode, backendOnline, activeBuildingId, minDuration, selectedAt]);

  // ── Floor State for Selected Room ───────────────────────────────────────────
  const [floorState, setFloorState] = useState<FloorState | null>(null);
  const selectedRoomStatus = selectedRoom ? floorState?.rooms?.[selectedRoom.id] : undefined;

  useEffect(() => {
    if (!selectedRoom?.floorId || !backendOnline) return;
    getFloorState(selectedRoom.floorId, selectedAt)
      .then(setFloorState)
      .catch(() => setFloorState(null));
  }, [selectedRoom, backendOnline, selectedAt]);

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
  // If Go backend is offline or loading, we still show the valid rooms for the active building
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
      // Local fallback: show valid rooms for the selected building (or all if none selected)
      const base = activeBuildingId
        ? validRoomsList.filter(r => r.buildingId === activeBuildingId)
        : validRoomsList.slice(0, 50);

      list = base.map(r => ({
        id: r.id,
        name: r.name,
        buildingName: r.buildingName,
        buildingId: r.buildingId,
        floorName: r.floorName,
        status: 'FREE',
        durationMinutes: 60,
        nextEventText: undefined,
        roomObj: r,
      }));
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

    return list;
  }, [backendOnline, freeRooms, activeBuildingId, finderFilterQuery]);

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
    <main className="flex flex-col md:flex-row h-[100dvh] w-full bg-slate-50 text-slate-900 overflow-hidden font-sans">
      {/* ─────────────────────────────────────────────────────────────────────
          SIDEBAR / MAIN PANEL
      ───────────────────────────────────────────────────────────────────── */}
      <section
        className={`w-full md:w-1/2 lg:w-5/12 xl:w-4/12 h-full bg-white shadow-md z-20 flex flex-col overflow-hidden border-r border-slate-200 transition-all ${
          mobileTab === 'map' ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* Header & Mode Switcher */}
        <header className="p-3 md:p-5 border-b border-slate-200 bg-white shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl md:text-2xl font-black text-[#00529c] tracking-tight">
                IST Room Visualizer
              </h1>
              <p className="text-[11px] md:text-xs text-slate-500 font-medium">
                Campus Alameda • IST Lisboa
              </p>
            </div>

            {/* Backend connection pill */}
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-slate-100 border border-slate-200 text-[10px] font-semibold">
              <span
                className={`w-2 h-2 rounded-full ${
                  backendOnline === true
                    ? 'bg-emerald-500'
                    : backendOnline === false
                    ? 'bg-amber-500'
                    : 'bg-slate-400 animate-pulse'
                }`}
              />
              <span className="text-slate-600 hidden sm:inline">
                {backendOnline === true ? 'Go Engine Online' : 'Dados Locais'}
              </span>
            </div>
          </div>

          {/* Mode Switch Tabs */}
          <div className="grid grid-cols-2 p-1 bg-slate-100 rounded-xl gap-1 border border-slate-200">
            <button
              type="button"
              onClick={() => setMode('normal')}
              className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs md:text-sm font-bold transition-all ${
                mode === 'normal'
                  ? 'bg-white text-[#00529c] shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span>Explorar & Horário</span>
            </button>

            <button
              type="button"
              onClick={() => setMode('finder')}
              className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs md:text-sm font-bold transition-all ${
                mode === 'finder'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Salas Livres</span>
            </button>
          </div>
        </header>

        {/* ───────────────────────────────────────────────────────────────────
            MODE 1: NORMAL MODE (Original Search + Horário)
        ─────────────────────────────────────────────────────────────────── */}
        {mode === 'normal' && (
          <div className="flex-1 overflow-y-auto p-3 md:p-5 flex flex-col gap-4">
            {/* Search Input */}
            <div className="relative shrink-0">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Pesquisa sala, ex: V1.12, QA02.4, PA1..."
                  className="w-full p-3 pl-10 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#00529c] focus:outline-none text-base bg-white shadow-sm"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
                <svg
                  className="w-5 h-5 text-slate-400 absolute left-3 top-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600"
                  >
                    ✕
                  </button>
                )}
              </div>

              {searchResults.length > 0 && (
                <ul className="absolute top-full left-0 w-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden max-h-[35vh] overflow-y-auto divide-y divide-slate-100">
                  {searchResults.map(room => (
                    <li
                      key={room.id}
                      onClick={() => handleSelectRoom(room)}
                      className="px-4 py-3 hover:bg-blue-50/70 cursor-pointer transition-colors flex justify-between items-center"
                    >
                      <div>
                        <p className="font-bold text-sm text-slate-800">{room.name}</p>
                        <p className="text-xs text-slate-500">
                          {room.buildingName} • Piso {room.floorName}
                        </p>
                      </div>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-[#00529c] bg-blue-50 px-2 py-1 rounded">
                        Ver
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Selected Room Card */}
            {selectedRoom && (
              <div className="shrink-0 p-4 bg-gradient-to-br from-blue-50 to-indigo-50/40 border border-blue-200 rounded-2xl shadow-sm">
                <div className="flex justify-between items-start gap-2">
                  <div className="overflow-hidden">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg md:text-xl font-black text-[#00529c] truncate">
                        {selectedRoom.name}
                      </h2>
                      {selectedRoomStatus && (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            selectedRoomStatus.status === 'FREE'
                              ? 'bg-emerald-100 text-emerald-800'
                              : selectedRoomStatus.status === 'CLOSING_SOON'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {selectedRoomStatus.status === 'FREE' ? '● Livre' : '● Ocupada'}
                        </span>
                      )}
                    </div>
                    <p className="text-slate-700 text-xs md:text-sm font-semibold mt-0.5">
                      {selectedRoom.buildingName}
                    </p>
                    <p className="text-slate-500 text-xs">Piso {selectedRoom.floorName}</p>
                  </div>

                  <div className="flex flex-col gap-1.5 shrink-0">
                    {blueprintUrl && (
                      <button
                        onClick={() => setIsBlueprintModalOpen(true)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-[#00529c] text-white rounded-xl shadow-sm hover:bg-[#003d7a] transition-all text-xs font-bold"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                          />
                        </svg>
                        <span>Planta</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Live Room Status Details */}
                {selectedRoomStatus?.currentEvent && (
                  <div className="mt-3 pt-2.5 border-t border-blue-200/60 text-xs text-slate-700">
                    <span className="font-bold text-rose-700">Aula em curso: </span>
                    {selectedRoomStatus.currentEvent.courseAcron || selectedRoomStatus.currentEvent.title}
                    <span className="text-slate-500 ml-1">
                      (até {fmtTime(selectedRoomStatus.currentEvent.end)})
                    </span>
                  </div>
                )}
                {selectedRoomStatus?.nextEvent && selectedRoomStatus.status !== 'OCCUPIED' && (
                  <div className="mt-1 text-xs text-amber-700">
                    <span className="font-bold">Próxima aula: </span>
                    {selectedRoomStatus.nextEvent.courseAcron || selectedRoomStatus.nextEvent.title}
                    <span className="ml-1">às {fmtTime(selectedRoomStatus.nextEvent.start)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Personal Schedule Section */}
            <div className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden flex flex-col">
              <div className="p-3.5 bg-slate-100/80 border-b border-slate-200 flex justify-between items-center">
                <h3 className="font-bold text-sm text-slate-800 flex items-center gap-2">
                  <svg className="w-4 h-4 text-[#00529c]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  O teu horário Fénix
                </h3>
                {isAuthenticated && (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    Sincronizado
                  </span>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-3">
                {!isAuthenticated ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-4">
                    <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-[#00529c] mb-3">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <p className="text-slate-600 text-xs md:text-sm mb-4 max-w-xs">
                      Inicia sessão com o Fénix para veres as tuas aulas e localizares as salas diretamente no mapa.
                    </p>
                    <button
                      onClick={handleFenixLogin}
                      className="px-5 py-2.5 bg-[#00529c] text-white rounded-xl hover:bg-[#003d7a] transition-all text-xs font-bold shadow-md shadow-blue-900/10"
                    >
                      Login com o Fénix
                    </button>
                  </div>
                ) : Object.keys(groupedSchedule).length > 0 ? (
                  <div className="flex flex-col gap-4">
                    {Object.entries(groupedSchedule).map(([date, sessions]) => (
                      <div key={date}>
                        <h4 className="text-[11px] font-black text-slate-500 uppercase tracking-wider mb-2 pl-2 border-l-2 border-[#00529c]">
                          {new Date(parseFenixDate(sessions[0].classPeriod.start)).toLocaleDateString('pt-PT', {
                            weekday: 'long',
                            day: 'numeric',
                            month: 'short',
                          })}
                        </h4>

                        <div className="flex flex-col gap-2">
                          {sessions.map((session, i) => {
                            const startTime = session.classPeriod.start.split(' ')[1];
                            const endTime = session.classPeriod.end.split(' ')[1];
                            const roomName = session.location?.[0]?.name;

                            return (
                              <div
                                key={i}
                                onClick={() => handleScheduleClick(session)}
                                className="flex bg-white rounded-xl shadow-sm border border-slate-200 cursor-pointer hover:border-[#00529c] hover:shadow-md transition-all group overflow-hidden"
                              >
                                <div className="bg-slate-50 text-slate-600 font-mono text-[11px] p-2.5 flex flex-col items-center justify-center border-r border-slate-200 min-w-[62px]">
                                  <span className="font-bold text-slate-800">{startTime}</span>
                                  <span className="text-slate-300 leading-none">|</span>
                                  <span>{endTime}</span>
                                </div>

                                <div className="p-2.5 flex-1 overflow-hidden">
                                  <div className="flex justify-between items-start mb-0.5">
                                    <p className="font-bold text-xs text-slate-800 group-hover:text-[#00529c] transition-colors truncate pr-1">
                                      {session.course.acronym}
                                    </p>
                                    {roomName && (
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-[#00529c] border border-blue-200 shrink-0">
                                        {roomName}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-slate-600 line-clamp-1">
                                    {session.title.split(' : ')[0]}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 text-center py-8">Nenhuma aula agendada encontrada.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ───────────────────────────────────────────────────────────────────
            MODE 2: EMPTY ROOM FINDER (Salas Livres)
        ─────────────────────────────────────────────────────────────────── */}
        {mode === 'finder' && (
          <div className="flex-1 overflow-y-auto p-3 md:p-5 flex flex-col gap-4">
            {/* Active Building Banner */}
            <div className="p-3 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                    />
                  </svg>
                  Edifício Selecionado
                </span>
                {activeBuildingId && (
                  <button
                    onClick={() => setActiveBuildingId(null)}
                    className="text-[10px] font-bold text-emerald-700 hover:text-emerald-900 underline"
                  >
                    Ver todo o campus
                  </button>
                )}
              </div>

              {/* Building Dropdown / Quick Switcher */}
              <div className="flex items-center gap-2">
                <select
                  value={activeBuildingId || ''}
                  onChange={e => setActiveBuildingId(e.target.value || null)}
                  className="w-full p-2 bg-white border border-emerald-300 rounded-xl text-xs md:text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                >
                  <option value="">Todos os edifícios do Campus Alameda</option>
                  {availableBuildings.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.count} salas)
                    </option>
                  ))}
                </select>
              </div>

              <p className="text-[10px] text-emerald-700 mt-1.5">
                Dica: Clica diretamente num edifício no mapa para filtrar instantaneamente.
              </p>
            </div>

            {/* Improved Time Selection Card */}
            <div className="p-3.5 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700">Horário pretendido:</span>
                  <span className="text-sm md:text-base font-black font-mono text-[#00529c] bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200">
                    {sliderTimeFormatted}
                  </span>
                  {isLiveNow && (
                    <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                      Agora
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleSetNow}
                  className="text-xs font-bold text-[#00529c] hover:bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 transition-colors"
                >
                  Repor Agora
                </button>
              </div>

              {/* Time Stepper & Slider */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleAdjustMinutes(-15)}
                  className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 font-bold flex items-center justify-center shrink-0 border border-slate-300 text-sm transition-all"
                  aria-label="Menos 15 minutos"
                >
                  -15m
                </button>

                <div className="flex-1">
                  <input
                    type="range"
                    min={480}
                    max={1260}
                    step={5}
                    value={sliderMinutes}
                    onChange={e => {
                      setSliderMinutes(Number(e.target.value));
                      setIsLiveNow(false);
                    }}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                  />
                  <div className="flex justify-between text-[10px] font-semibold text-slate-400 mt-1">
                    <span>08:00</span>
                    <span>11:00</span>
                    <span>14:00</span>
                    <span>17:00</span>
                    <span>21:00</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleAdjustMinutes(15)}
                  className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 font-bold flex items-center justify-center shrink-0 border border-slate-300 text-sm transition-all"
                  aria-label="Mais 15 minutos"
                >
                  +15m
                </button>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <button
                  onClick={() => handleSetSpecificTime(10, 0)}
                  className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold transition-colors"
                >
                  10:00
                </button>
                <button
                  onClick={() => handleSetSpecificTime(12, 0)}
                  className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold transition-colors"
                >
                  12:00
                </button>
                <button
                  onClick={() => handleSetSpecificTime(14, 0)}
                  className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold transition-colors"
                >
                  14:00
                </button>
                <button
                  onClick={() => handleSetSpecificTime(16, 0)}
                  className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold transition-colors"
                >
                  16:00
                </button>
                <button
                  onClick={() => handleAdjustMinutes(60)}
                  className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-bold border border-emerald-200 transition-colors"
                >
                  +1 hora
                </button>
                <button
                  onClick={() => handleAdjustMinutes(120)}
                  className="px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[11px] font-bold border border-emerald-200 transition-colors"
                >
                  +2 horas
                </button>
              </div>

              {/* Duration Filter Chips */}
              <div className="flex items-center justify-between border-t border-slate-100 pt-2.5">
                <span className="text-[11px] font-semibold text-slate-500">Duração mínima:</span>
                <div className="flex gap-1">
                  {[30, 60, 90, 120].map(mins => (
                    <button
                      key={mins}
                      onClick={() => setMinDuration(mins)}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${
                        minDuration === mins
                          ? 'bg-slate-800 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {mins >= 60 ? `${mins / 60}h` : `${mins}m`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Filter within free rooms search bar */}
            <div className="relative">
              <input
                type="text"
                placeholder="Filtrar nesta lista (ex: piso, sala)..."
                value={finderFilterQuery}
                onChange={e => setFinderFilterQuery(e.target.value)}
                className="w-full px-3 py-2 pl-9 text-xs bg-white border border-slate-200 rounded-xl focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              />
              <svg
                className="w-4 h-4 text-slate-400 absolute left-3 top-2.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            {/* Free Rooms List */}
            <div className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden flex flex-col min-h-[300px]">
              <div className="p-3 bg-slate-100/90 border-b border-slate-200 flex justify-between items-center">
                <span className="text-xs font-bold text-slate-700">
                  Salas encontradas ({displayedFinderRooms.length})
                </span>
                {activeBuildingName && (
                  <span className="text-[11px] font-semibold text-emerald-800 truncate max-w-[180px]">
                    {activeBuildingName}
                  </span>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-2.5 divide-y divide-slate-100">
                {freeRoomsLoading ? (
                  <div className="flex flex-col items-center justify-center p-8 text-center text-slate-500 gap-2">
                    <div className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
                    <p className="text-xs">A calcular disponibilidade em tempo real...</p>
                  </div>
                ) : displayedFinderRooms.length === 0 ? (
                  <div className="text-center p-8 text-slate-500">
                    <p className="font-semibold text-sm text-slate-700 mb-1">Nenhuma sala livre encontrada</p>
                    <p className="text-xs text-slate-500 max-w-xs mx-auto">
                      Tenta ajustar a duração mínima ({minDuration}m), alterar o horário ({sliderTimeFormatted}) ou selecionar outro edifício.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {displayedFinderRooms.map(item => {
                      const isSelected = selectedRoom?.id === item.id;
                      return (
                        <div
                          key={item.id}
                          onClick={() => handleSelectFreeRoomItem(item)}
                          className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col gap-1.5 ${
                            isSelected
                              ? 'bg-blue-50 border-[#00529c] shadow-sm'
                              : 'bg-white border-slate-200 hover:border-emerald-400 hover:shadow-xs'
                          }`}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-black text-sm text-slate-800 flex items-center gap-1.5">
                                {item.name}
                                {isSelected && (
                                  <span className="text-[9px] bg-[#00529c] text-white px-1.5 py-0.2 rounded font-bold">
                                    Ativa
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-slate-500">
                                {item.buildingName} • Piso {item.floorName}
                              </p>
                            </div>

                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                              {item.durationMinutes ? `${item.durationMinutes} min livres` : 'Livre'}
                            </span>
                          </div>

                          {item.nextEventText && (
                            <p className="text-[11px] text-amber-700 font-medium">{item.nextEventText}</p>
                          )}

                          <div className="flex justify-end pt-1 gap-2 border-t border-slate-100">
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                handleSelectFreeRoomItem(item);
                                setIsBlueprintModalOpen(true);
                              }}
                              className="text-[10px] font-bold text-[#00529c] hover:underline flex items-center gap-1"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                              </svg>
                              Localizar Planta
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ─────────────────────────────────────────────────────────────────────
          MAP PANEL (Interactive Campus Map)
      ───────────────────────────────────────────────────────────────────── */}
      <section
        className={`w-full md:w-1/2 lg:w-7/12 xl:w-8/12 h-full bg-slate-100 relative z-10 flex flex-col transition-all ${
          mobileTab === 'list' ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* Top Control Bar on Map */}
        <div className="absolute top-3 right-3 z-30 flex items-center gap-2">
          {activeBuildingId && (
            <button
              onClick={() => setActiveBuildingId(null)}
              className="px-3 py-1.5 bg-white/90 backdrop-blur-md border border-slate-300 text-slate-700 hover:bg-white rounded-xl text-xs font-bold shadow-md transition-all flex items-center gap-1"
            >
              <span>✕ Limpar Seleção</span>
            </button>
          )}

          {/* Quick instructions pill on desktop */}
          <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 bg-white/90 backdrop-blur-md border border-slate-200 text-slate-600 rounded-xl text-xs shadow-sm font-medium">
            <svg className="w-4 h-4 text-[#00529c]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
            </svg>
            <span>Clica num edifício no mapa</span>
          </div>
        </div>

        {/* Map Container */}
        <div className="w-full h-full flex items-center justify-center p-2 md:p-6 overflow-hidden">
          <ISTMap
            activeBuildingId={activeBuildingId}
            onSelectBuilding={handleMapBuildingClick}
            interactive={true}
          />
        </div>

        {/* Floating Building Card on Mobile Map View */}
        {activeBuildingName && (
          <div className="md:hidden absolute bottom-16 left-3 right-3 z-30 bg-white/95 backdrop-blur-md p-3.5 rounded-2xl shadow-xl border border-slate-200 flex justify-between items-center">
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">Edifício Selecionado</p>
              <h4 className="font-black text-sm text-slate-800">{activeBuildingName}</h4>
            </div>
            <button
              onClick={() => setMobileTab('list')}
              className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-sm"
            >
              Ver Salas Livres
            </button>
          </div>
        )}
      </section>

      {/* ─────────────────────────────────────────────────────────────────────
          MOBILE BOTTOM NAVIGATION (Sticky on small screens)
      ───────────────────────────────────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-4 py-2 flex items-center justify-around shadow-lg">
        <button
          onClick={() => setMobileTab('list')}
          className={`flex flex-col items-center gap-1 py-1 px-4 rounded-xl text-xs font-bold transition-all ${
            mobileTab === 'list' ? 'text-[#00529c]' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
          </svg>
          <span>{mode === 'finder' ? 'Salas Livres' : 'Pesquisa & Horário'}</span>
        </button>

        <button
          onClick={() => setMobileTab('map')}
          className={`flex flex-col items-center gap-1 py-1 px-4 rounded-xl text-xs font-bold transition-all ${
            mobileTab === 'map' ? 'text-[#00529c]' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
            />
          </svg>
          <span>Mapa {activeBuildingId ? '●' : ''}</span>
        </button>
      </nav>

      {/* ─────────────────────────────────────────────────────────────────────
          BLUEPRINT MODAL (High-Resolution Zoomable Floor/Room View)
      ───────────────────────────────────────────────────────────────────── */}
      {isBlueprintModalOpen && blueprintUrl && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-2 md:p-10">
          <div className="bg-white w-full h-full md:max-w-6xl md:h-[88vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden relative border border-slate-700/20">
            {/* Modal Header */}
            <div className="flex justify-between items-center px-4 md:px-6 py-3 md:py-4 border-b border-slate-200 bg-slate-50 shrink-0">
              <div className="overflow-hidden pr-4">
                <h3 className="text-base md:text-xl font-black text-slate-800 truncate">
                  {selectedRoom?.name}
                </h3>
                <p className="text-xs md:text-sm text-slate-500 truncate">
                  {selectedRoom?.buildingName} • Piso {selectedRoom?.floorName}
                </p>
              </div>

              <button
                onClick={() => setIsBlueprintModalOpen(false)}
                className="p-2 rounded-xl hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors shrink-0"
                aria-label="Fechar"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Blueprint Image */}
            <div className="flex-1 bg-slate-200 p-2 md:p-6 flex items-center justify-center overflow-hidden">
              <img
                src={blueprintUrl}
                alt={`${selectedRoom?.name}`}
                className="w-full h-full object-contain bg-white shadow-md rounded-xl select-none"
              />
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
