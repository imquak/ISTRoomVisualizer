import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET() {

  const token = (await cookies()).get('fenix_token')?.value;
  
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const res = await fetch('https://fenix.tecnico.ulisboa.pt/api/fenix/v1/person/calendar/classes?format=json', {
      headers: { Authorization: `Bearer ${token}` },
    });
    console.log(res);

    if (!res.ok) throw new Error('Failed to fetch schedule');
    
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch schedule' }, { status: 500 });
  }
}