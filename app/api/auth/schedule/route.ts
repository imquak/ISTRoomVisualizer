import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET() {
  // 1. Check if we are using the dummy client ID from .env.local
  const isMockMode = process.env.NEXT_PUBLIC_FENIX_CLIENT_ID === "your_client_id";

  if (isMockMode) {
    // Bypass Fenix and return a fake schedule for testing
    return NextResponse.json({
      events: [
        {
          title: "Sistemas Operativos - Teórica",
          start: "07/09/2026 14:00",
          end: "07/09/2026 15:30",
          room: { id: "1409823014912028", name: "2.1" } // Maps to Pavilhão de Mecânica III
        },
        {
          title: "Análise Matemática I - Prática",
          start: "08/09/2026 09:30",
          end: "08/09/2026 11:00",
          room: { id: "2448131363231", name: "Q01" } // Maps to Pavilhão de Química
        }
      ]
    });
  }

  // 2. Real Fenix Authentication Flow (Active when you add real credentials)
  const token = (await cookies()).get('fenix_token')?.value;
  
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const res = await fetch('https://fenix.tecnico.ulisboa.pt/api/fenix/v1/person/calendar', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error('Failed to fetch schedule');
    
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch schedule' }, { status: 500 });
  }
}