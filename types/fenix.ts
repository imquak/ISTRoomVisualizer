// types/fenix.ts

export interface FenixOAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

export interface FenixSpaceRoom {
  id: string;
  name: string;
  topLevelSpace: {
    id: string;
    name: string;
  };
}

export interface FenixClassSession {
  start: string; // ex: "06/09/2026 14:00"
  end: string;   // ex: "06/09/2026 16:00"
  title: string;
  course: string;
  room?: FenixSpaceRoom;
}

export interface FenixBlueprintResponse {
  id: string;
  name: string;
  blueprintUrl?: string;
  rawImageBase64?: string;
}