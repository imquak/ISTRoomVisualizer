'use client';
import { useState, useMemo, useEffect } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
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
  roomBlueprintUrl: string | null;
};

const roomsList = (Object.values(roomsData) as Room[]).filter(room => room.name.trim() !== '');

const parseFenixDate = (dateStr: string) => {
  const [datePart, timePart] = dateStr.split(' ');
  const [day, month, year] = datePart.split('/');
  const [hours, minutes] = timePart.split(':');
  return new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes));
};

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [isBlueprintModalOpen, setIsBlueprintModalOpen] = useState(false);
  
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [schedule, setSchedule] = useState<FenixClassSession[]>([]);

  useEffect(() => {
    fetch('/api/auth/schedule').then(async (res) => {
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

  const groupedSchedule = useMemo(() => {
    const groups: Record<string, FenixClassSession[]> = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcomingEvents = [...schedule]
      .filter(session => parseFenixDate(session.classPeriod.start).getTime() >= today.getTime())
      .sort((a, b) => 
        parseFenixDate(a.classPeriod.start).getTime() - parseFenixDate(b.classPeriod.start).getTime()
      );

    upcomingEvents.forEach(session => {
      const dateKey = session.classPeriod.start.split(' ')[0];
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(session);
    });

    return groups;
  }, [schedule]);

  const handleSelectRoom = (room: Room) => {
    setSelectedRoom(room);
    setSearchQuery("");
    setIsBlueprintModalOpen(false);
  };

  const handleFenixLogin = () => {
    const clientId = process.env.NEXT_PUBLIC_FENIX_CLIENT_ID;
    const redirectUri = process.env.NEXT_PUBLIC_FENIX_REDIRECT_URI;
    window.location.href = `https://fenix.tecnico.ulisboa.pt/oauth/userdialog?client_id=${clientId}&redirect_uri=${redirectUri}`;
  };

  const handleScheduleClick = (session: FenixClassSession) => {
    const roomName = session.location?.[0]?.name;
    if (!roomName) return;
    
    const targetRoom = roomsList.find(r => r.name === roomName);
    if (targetRoom) handleSelectRoom(targetRoom);
  };

  const blueprintUrl = selectedRoom?.roomBlueprintUrl || selectedRoom?.floorBlueprintUrl;

  return (
    <main className="flex flex-col-reverse md:flex-row h-[100dvh] w-full bg-slate-50 text-slate-900 overflow-hidden">

      <section className="w-full h-[60dvh] md:h-full md:w-1/3 p-3 md:p-8 bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.05)] md:shadow-sm z-20 flex flex-col overflow-hidden border-t md:border-t-0 md:border-r border-slate-200">
        
        <h1 className="hidden md:block text-3xl font-bold mb-6 text-slate-800">IST Room Visualizer</h1>
        
        <div className="relative mb-3 md:mb-6 shrink-0">
          <input 
            type="text"
            placeholder="Pesquisa, por exemplo: V1.12 ou QA02.4"
            className="w-full p-2.5 md:p-3 pl-4 border border-slate-300 rounded-xl focus:ring-2 focus:ring-[#00529c] focus:outline-none text-sm md:text-base"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchResults.length > 0 && (
            <ul className="absolute top-full left-0 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-lg z-50 overflow-hidden max-h-[30vh] overflow-y-auto">
              {searchResults.map(room => (
                <li 
                  key={room.id} 
                  onClick={() => handleSelectRoom(room)}
                  className="px-4 py-2.5 hover:bg-slate-50 cursor-pointer border-b last:border-b-0 border-slate-100 transition-colors"
                >
                  <p className="font-semibold text-sm text-slate-800">{room.name}</p>
                  <p className="text-[10px] md:text-xs text-slate-500">{room.buildingName} • Piso {room.floorName}</p>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selectedRoom && (
          <div className="mb-3 md:mb-6 shrink-0 p-3 md:p-4 bg-blue-50 border border-blue-100 rounded-xl flex justify-between items-center">
            <div className="overflow-hidden pr-2">
              <h2 className="text-base md:text-xl font-bold text-[#00529c] truncate">{selectedRoom.name}</h2>
              <p className="text-slate-700 text-xs md:text-sm font-medium truncate">{selectedRoom.buildingName}</p>
              <p className="text-slate-500 text-[10px] md:text-xs mt-0.5">Piso {selectedRoom.floorName}</p>
            </div>
            
            {blueprintUrl && (
              <button 
                onClick={() => setIsBlueprintModalOpen(true)}
                className="flex flex-col items-center justify-center p-2 md:p-2.5 bg-white border border-blue-200 rounded-lg shadow-sm hover:bg-blue-100 hover:border-[#00529c] transition-all group shrink-0"
              >
                <svg className="w-5 h-5 md:w-6 md:h-6 text-[#00529c]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                <span className="text-[8px] md:text-[10px] font-bold text-[#00529c] mt-1 uppercase tracking-wider">Localizar a sala</span>
              </button>
            )}
          </div>
        )}

        <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl overflow-y-auto relative flex flex-col">
          {!isAuthenticated ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-4 md:p-6">
              <p className="text-slate-500 mb-4 text-xs md:text-sm">Faz login com o Fenix para veres o teu horário.</p>
              <button onClick={handleFenixLogin} className="px-4 md:px-5 py-2 md:py-2.5 bg-[#00529c] text-white rounded-lg hover:bg-[#003d7a] transition-colors text-sm font-medium">
                Login com o Fenix
              </button>
            </div>
          ) : (
            <div className="flex flex-col p-3 md:p-4">
              <h3 className="font-bold text-sm md:text-lg text-slate-800 mb-2 md:mb-4 sticky top-0 bg-slate-50 py-2 z-10 border-b border-slate-200">
                O teu horário
              </h3>
              
              {Object.keys(groupedSchedule).length > 0 ? (
                Object.entries(groupedSchedule).map(([date, sessions]) => (
                  <div key={date} className="mb-4 md:mb-6">
                    <h4 className="text-[10px] md:text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 md:mb-3 pl-2 border-l-2 border-[#00529c]">
                      {new Date(parseFenixDate(sessions[0].classPeriod.start)).toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'short' })}
                    </h4>
                    
                    <div className="flex flex-col gap-2 md:gap-3">
                      {sessions.map((session, i) => {
                        const startTime = session.classPeriod.start.split(' ')[1];
                        const endTime = session.classPeriod.end.split(' ')[1];
                        const roomName = session.location?.[0]?.name;

                        return (
                          <div 
                            key={i} 
                            onClick={() => handleScheduleClick(session)}
                            className="flex bg-white rounded-lg shadow-sm border border-slate-200 cursor-pointer hover:border-[#00529c] hover:shadow-md transition-all group overflow-hidden"
                          >
                            <div className="bg-slate-100 text-slate-600 font-mono text-[10px] md:text-xs p-2 md:p-3 flex flex-col items-center justify-center border-r border-slate-200 min-w-[55px] md:min-w-[70px]">
                              <span className="font-bold text-slate-800">{startTime}</span>
                              <span className="text-slate-400 my-0.5">|</span>
                              <span>{endTime}</span>
                            </div>
                            
                            <div className="p-2 md:p-3 flex-1 overflow-hidden">
                              <div className="flex justify-between items-start mb-1">
                                <p className="font-bold text-xs md:text-sm text-slate-800 group-hover:text-[#00529c] transition-colors truncate pr-2">
                                  {session.course.acronym}
                                </p>
                                {roomName && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] md:text-xs font-medium bg-blue-100 text-blue-800 shrink-0">
                                    {roomName}
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] md:text-xs text-slate-600 line-clamp-1">{session.title.split(' : ')[0]}</p>
                              <p className="text-[8px] md:text-[10px] text-slate-400 mt-0.5 uppercase tracking-wide">{session.title.split(' : ')[1] || 'Class'}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs md:text-sm text-slate-500 text-center mt-6">Nenhuma aula encontrada.</p>
              )}
            </div>
          )}
        </div>
      </section>
      
      <section className="w-full h-[40dvh] md:h-full md:w-2/3 p-2 md:p-8 bg-slate-100 relative z-10 flex items-center justify-center">
        <div className="w-full h-full flex items-center justify-center [&>svg]:w-full [&>svg]:h-full [&>svg]:max-h-full [&>svg]:object-contain">
          <ISTMap activeBuildingId={selectedRoom?.buildingId || null} />
        </div>
      </section>

      {isBlueprintModalOpen && blueprintUrl && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 md:p-12">
          <div className="bg-white w-full h-full md:max-w-6xl md:h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden relative">
            
            <div className="flex justify-between items-center px-4 md:px-6 py-3 md:py-4 border-b border-slate-200 bg-slate-50 shrink-0">
              <div className="overflow-hidden pr-4">
                <h3 className="text-base md:text-xl font-bold text-slate-800 truncate">{selectedRoom?.name}</h3>
                <p className="text-xs md:text-sm text-slate-500 truncate">{selectedRoom?.buildingName} - Piso {selectedRoom?.floorName}</p>
              </div>
              <button 
                onClick={() => setIsBlueprintModalOpen(false)}
                className="p-1.5 md:p-2 rounded-lg hover:bg-slate-200 text-slate-500 transition-colors shrink-0"
                aria-label="Close modal"
              >
                <svg className="w-5 h-5 md:w-6 md:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex-1 bg-slate-200 p-2 md:p-8 flex items-center justify-center overflow-hidden">
              <img
                src={blueprintUrl}
                alt={`${selectedRoom?.name}`}
                className="w-full h-full object-contain bg-white shadow-sm rounded-lg"
              />
            </div>
            
          </div>
        </div>
      )}

    </main>
  );
}