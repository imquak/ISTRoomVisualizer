// app/page.tsx
'use client';
import { useState } from 'react';
import ISTMap from '@/components/ISTMap';

export default function Home() {
  const [activeBuilding, setActiveBuilding] = useState<string | null>(null);

  console.log('Current activeBuilding state:', activeBuilding);
  // Function for testing
  const handleTestHighlight = () => {
    console.log('Test highlight button clicked');
    if (activeBuilding === '2448131361024') {
      setActiveBuilding(null);
    } else {
      setActiveBuilding('2448131361024');
    }
  };

  return (
    
    <main className="flex min-h-screen w-full bg-slate-50 text-slate-900">
      
      <section className="w-1/3 p-8 border-r border-slate-200 bg-white shadow-sm z-10 flex flex-col">
        <h1 className="text-3xl font-bold mb-6 text-slate-800">My Schedule</h1>
        
        <div className="p-6 bg-slate-50 border border-slate-100 rounded-xl mb-6">
          <h2 className="text-lg font-semibold text-slate-700 mb-2">Development Controls</h2>
          <button 
            onClick={handleTestHighlight}
            className={`px-4 py-2 text-white rounded-md transition-colors w-full ${
              activeBuilding === '2448131361024' 
                ? 'bg-red-500 hover:bg-red-600' 
                : 'bg-blue-600 hover:bg-blue-800 active:bg-blue-700'
            }`}
          >
            {activeBuilding === '2448131361024' ? 'Clear Highlight' : 'Test Highlight Civil'}
          </button>
        </div>

        <div className="flex-1 flex items-center justify-center border-2 border-dashed border-slate-200 rounded-xl">
          <p className="text-slate-400 text-sm">Fénix API data</p>
        </div>
      </section>
      
      <section className="w-2/3 p-8 flex items-center justify-center bg-slate-100 overflow-hidden relative">
        <ISTMap activeBuildingId={activeBuilding} />
      </section>
      
    </main>
  );
}