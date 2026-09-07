'use client';
import { useState, useMemo, useEffect } from 'react';
import ISTMap from '@/components/ISTMap';
import roomsData from '@/lib/data/data.json';
import { FenixClassSession } from '@/types/fenix';

type Room = {
  id: string;
  name: string;
  buildingId: string;
  buildingName: string;
  floorId: string;
  floorName: string;
  floorBlueprintUrl: string | null;
};

const roomsList = (Object.values(roomsData) as Room[]).filter(room => room.name.trim() !== '');

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [schedule, setSchedule] = useState<FenixClassSession[]>([]);

  useEffect(() => {
    fetch('/api/schedule').then(async (res) => {
      if (res.ok) {
        setIsAuthenticated(true);
        const data = await res.json();
        setSchedule(data.events || data || []); 
      }
    });
  }, []);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return roomsList
      .filter(room => room.name.toLowerCase().includes(query))
      .slice(0, 6);
  }, [searchQuery]);

  const handleSelectRoom = (room: Room) => {
    setSelectedRoom(room);
    setSearchQuery(""); 
  };

  const handleFenixLogin = () => {
    const clientId = process.env.NEXT_PUBLIC_FENIX_CLIENT_ID;
    const redirectUri = process.env.NEXT_PUBLIC_FENIX_REDIRECT_URI;
    window.location.href = `https://fenix.tecnico.ulisboa.pt/oauth/userdialog?client_id=${clientId}&redirect_uri=${redirectUri}`;
  };

  const handleScheduleClick = (session: FenixClassSession) => {
    if (!session.room) return;
    const targetRoom = roomsList.find(r => r.name === session.room?.name || r.id === session.room?.id);
    if (targetRoom) handleSelectRoom(targetRoom);
  };

  return (
    <main className="flex min-h-screen w-full bg-slate-50 text-slate-900">
      <section className="w-1/3 p-8 border-r border-slate-200 bg-white shadow-sm z-10 flex flex-col h-screen overflow-hidden">
        <h1 className="text-3xl font-bold mb-6 text-slate-800">Find a Room</h1>
        
        <div className="relative mb-6 shrink-0">
          <input 
            type="text"
            placeholder="Search e.g., '2.7' or 'Amphitheater'..."
            className="w-full p-3 pl-4 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#00529c] focus:outline-none"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchResults.length > 0 && (
            <ul className="absolute top-full left-0 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden">
              {searchResults.map(room => (
                <li 
                  key={room.id} 
                  onClick={() => handleSelectRoom(room)}
                  className="px-4 py-3 hover:bg-slate-50 cursor-pointer border-b last:border-b-0 border-slate-100 transition-colors"
                >
                  <p className="font-semibold text-slate-800">{room.name}</p>
                  <p className="text-xs text-slate-500">{room.buildingName} • Piso {room.floorName}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selectedRoom && (
          <div className="mb-6 shrink-0">
            <h2 className="text-xl font-bold text-[#00529c]">{selectedRoom.name}</h2>
            <p className="text-slate-600">{selectedRoom.buildingName}</p>
            <p className="text-slate-500 text-sm">Piso {selectedRoom.floorName}</p>
          </div>
        )}

        <div className="flex-1 bg-slate-100 border border-slate-200 rounded-xl overflow-y-auto relative p-4 flex flex-col">
          {!isAuthenticated ? (
            <div className="flex flex-col items-center justify-center flex-1 text-center">
              <p className="text-slate-500 mb-4 text-sm">Login with Fenix to view your schedule and locate classes.</p>
              <button onClick={handleFenixLogin} className="px-5 py-2.5 bg-[#00529c] text-white rounded-lg hover:bg-[#003d7a] transition-colors font-medium">
                Login with Fenix
              </button>
            </div>
          ) : (
            <div className="flex flex-col space-y-3">
              <h3 className="font-bold text-slate-700 sticky top-0 bg-slate-100 py-2 z-10 border-b border-slate-200">Your Schedule</h3>
              {schedule.length > 0 ? schedule.map((session, i) => (
                <div 
                  key={i} 
                  onClick={() => handleScheduleClick(session)}
                  className="p-3 bg-white rounded-lg shadow-sm border border-slate-200 cursor-pointer hover:border-[#00529c] hover:shadow-md transition-all"
                >
                  <p className="font-semibold text-sm text-[#00529c] truncate">{session.title || session.course}</p>
                  <p className="text-xs text-slate-600 mt-1">{session.start} - {session.end}</p>
                  {session.room && (
                    <p className="text-xs font-medium text-slate-800 mt-1.5 flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-green-500"></span>
                      Room: {session.room.name}
                    </p>
                  )}
                </div>
              )) : (
                <p className="text-sm text-slate-500 text-center mt-6">No upcoming evaluations or classes.</p>
              )}
            </div>
          )}
        </div>
      </section>
      
      <section className="w-2/3 p-8 flex items-center justify-center bg-slate-100 overflow-hidden relative">
        <ISTMap activeBuildingId={selectedRoom?.buildingId || null} />
      </section>
    </main>
  );
}