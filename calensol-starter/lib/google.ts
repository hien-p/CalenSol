import { google } from 'googleapis';

// OAuth2 client configuration
export const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Required scopes for Google Calendar access
export const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

// Generate OAuth URL for user consent
export function getAuthUrl(state?: string): string {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force refresh token
    state, // Pass wallet address or user ID
  });
}

// Exchange authorization code for tokens
export async function getTokensFromCode(code: string) {
  const { tokens } = await oauth2Client.getToken(code);
  return tokens;
}

// Refresh access token using refresh token
export async function refreshAccessToken(refreshToken: string) {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  client.setCredentials({
    refresh_token: refreshToken,
  });

  const { credentials } = await client.refreshAccessToken();
  return credentials;
}

// Create an authenticated Calendar client
export function getCalendarClient(accessToken: string, refreshToken?: string) {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  auth.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  return google.calendar({ version: 'v3', auth });
}

// Get user info from Google
export async function getUserInfo(accessToken: string) {
  const oauth2 = google.oauth2({
    version: 'v2',
    auth: oauth2Client,
  });

  oauth2Client.setCredentials({ access_token: accessToken });

  const { data } = await oauth2.userinfo.get();
  return data;
}

// Check if tokens are expired
export function isTokenExpired(expiryDate: string | null): boolean {
  if (!expiryDate) return true;
  return new Date(expiryDate) <= new Date();
}

// Get valid access token, refreshing if necessary
export async function getValidAccessToken(
  accessToken: string | null,
  refreshToken: string | null,
  expiryDate: string | null
): Promise<{ accessToken: string; expiryDate: string } | null> {
  if (!refreshToken) return null;

  if (accessToken && !isTokenExpired(expiryDate)) {
    return { accessToken, expiryDate: expiryDate! };
  }

  try {
    const credentials = await refreshAccessToken(refreshToken);
    return {
      accessToken: credentials.access_token!,
      expiryDate: credentials.expiry_date
        ? new Date(credentials.expiry_date).toISOString()
        : new Date(Date.now() + 3600 * 1000).toISOString(),
    };
  } catch (error) {
    console.error('Failed to refresh access token:', error);
    return null;
  }
}
