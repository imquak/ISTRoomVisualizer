import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/?error=no_code_provided', request.url));
  }

  try {
    const redirectUri = process.env.NEXT_PUBLIC_FENIX_REDIRECT_URI!;
    
    const res = await fetch(`https://fenix.tecnico.ulisboa.pt/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_FENIX_CLIENT_ID!,
        client_secret: process.env.FENIX_CLIENT_SECRET!,
        redirect_uri: redirectUri,
        code,
        grant_type: 'authorization_code',
      }),
    });

    const data = await res.json();
    
    if (data.access_token) {
      (await cookies()).set('fenix_token', data.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: data.expires_in || 60 * 60 * 24 * 30, 
        path: '/',
        sameSite: 'lax',
      });
      return NextResponse.redirect(new URL('/', request.url));
    } else {
      console.error('Fenix API Error:', data);
      return NextResponse.redirect(new URL(`/?error=${data.error_description || data.error || 'token_failed'}`, request.url));
    }
  } catch (error) {
    console.error('Server Error:', error);
    return NextResponse.redirect(new URL('/?error=internal_server_error', request.url));
  }
}