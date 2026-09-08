import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  try {
    const res = await fetch(`https://fenix.tecnico.ulisboa.pt/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_FENIX_CLIENT_ID!,
        client_secret: process.env.FENIX_CLIENT_SECRET!,
        redirect_uri: `http://194.210.225.38:3000/api/auth/callback`,
        code,
        grant_type: 'authorization_code',
      }),
    });

    const data = await res.json();
    
    if (data.access_token) {
      (await cookies()).set('fenix_token', data.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: data.expires_in,
        path: '/',
      });
    }
  } catch (error) {
    console.error('Fenix Auth Error:', error);
  }

  return NextResponse.redirect(new URL('/', request.url));
}