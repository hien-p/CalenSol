import { google } from 'googleapis';
import {
  oauth2Client,
  SCOPES,
  getAuthUrl,
  getTokensFromCode,
  refreshAccessToken,
  getCalendarClient,
  getUserInfo,
  isTokenExpired,
  getValidAccessToken,
} from '@/lib/google';

// Mock googleapis
jest.mock('googleapis', () => {
  const mockOAuth2Client = {
    generateAuthUrl: jest.fn(),
    getToken: jest.fn(),
    setCredentials: jest.fn(),
    refreshAccessToken: jest.fn(),
  };

  const mockCalendar = {
    events: {
      list: jest.fn(),
      insert: jest.fn(),
      get: jest.fn(),
      patch: jest.fn(),
      delete: jest.fn(),
    },
  };

  const mockOauth2 = {
    userinfo: {
      get: jest.fn(),
    },
  };

  return {
    google: {
      auth: {
        OAuth2: jest.fn(() => mockOAuth2Client),
      },
      calendar: jest.fn(() => mockCalendar),
      oauth2: jest.fn(() => mockOauth2),
    },
  };
});

describe('lib/google.ts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('SCOPES', () => {
    it('should include calendar scopes', () => {
      expect(SCOPES).toContain('https://www.googleapis.com/auth/calendar');
      expect(SCOPES).toContain('https://www.googleapis.com/auth/calendar.events');
    });

    it('should include userinfo scopes', () => {
      expect(SCOPES).toContain('https://www.googleapis.com/auth/userinfo.email');
      expect(SCOPES).toContain('https://www.googleapis.com/auth/userinfo.profile');
    });
  });

  describe('getAuthUrl', () => {
    it('should generate auth URL with correct parameters', () => {
      const mockUrl = 'https://accounts.google.com/o/oauth2/auth?...';
      const mockOAuth2 = new (google.auth.OAuth2 as jest.Mock)();
      mockOAuth2.generateAuthUrl.mockReturnValue(mockUrl);

      const url = getAuthUrl('test-wallet-address');

      expect(mockOAuth2.generateAuthUrl).toHaveBeenCalledWith({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
        state: 'test-wallet-address',
      });
    });

    it('should work without state parameter', () => {
      const mockUrl = 'https://accounts.google.com/o/oauth2/auth?...';
      const mockOAuth2 = new (google.auth.OAuth2 as jest.Mock)();
      mockOAuth2.generateAuthUrl.mockReturnValue(mockUrl);

      getAuthUrl();

      expect(mockOAuth2.generateAuthUrl).toHaveBeenCalledWith({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
        state: undefined,
      });
    });
  });

  describe('getTokensFromCode', () => {
    it('should exchange code for tokens', async () => {
      const mockTokens = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        expiry_date: Date.now() + 3600000,
      };

      const mockOAuth2 = new (google.auth.OAuth2 as jest.Mock)();
      mockOAuth2.getToken.mockResolvedValue({ tokens: mockTokens });

      const tokens = await getTokensFromCode('test-code');

      expect(mockOAuth2.getToken).toHaveBeenCalledWith('test-code');
      expect(tokens).toEqual(mockTokens);
    });

    it('should throw error on invalid code', async () => {
      const mockOAuth2 = new (google.auth.OAuth2 as jest.Mock)();
      mockOAuth2.getToken.mockRejectedValue(new Error('Invalid code'));

      await expect(getTokensFromCode('invalid-code')).rejects.toThrow('Invalid code');
    });
  });

  describe('refreshAccessToken', () => {
    it('should refresh access token using refresh token', async () => {
      const mockCredentials = {
        access_token: 'new-access-token',
        expiry_date: Date.now() + 3600000,
      };

      const mockOAuth2 = new (google.auth.OAuth2 as jest.Mock)();
      mockOAuth2.refreshAccessToken.mockResolvedValue({ credentials: mockCredentials });

      const credentials = await refreshAccessToken('test-refresh-token');

      expect(mockOAuth2.setCredentials).toHaveBeenCalledWith({
        refresh_token: 'test-refresh-token',
      });
      expect(credentials).toEqual(mockCredentials);
    });

    it('should throw error on invalid refresh token', async () => {
      const mockOAuth2 = new (google.auth.OAuth2 as jest.Mock)();
      mockOAuth2.refreshAccessToken.mockRejectedValue(new Error('Invalid refresh token'));

      await expect(refreshAccessToken('invalid-token')).rejects.toThrow('Invalid refresh token');
    });
  });

  describe('getCalendarClient', () => {
    it('should create authenticated calendar client', () => {
      const client = getCalendarClient('test-access-token', 'test-refresh-token');

      expect(google.auth.OAuth2).toHaveBeenCalled();
      expect(google.calendar).toHaveBeenCalledWith({
        version: 'v3',
        auth: expect.anything(),
      });
    });

    it('should work without refresh token', () => {
      const client = getCalendarClient('test-access-token');

      expect(google.auth.OAuth2).toHaveBeenCalled();
    });
  });

  describe('getUserInfo', () => {
    it('should fetch user info from Google', async () => {
      const mockUserInfo = {
        id: '123',
        email: 'test@example.com',
        name: 'Test User',
      };

      const mockOauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      (mockOauth2.userinfo.get as jest.Mock).mockResolvedValue({ data: mockUserInfo });

      const userInfo = await getUserInfo('test-access-token');

      expect(userInfo).toEqual(mockUserInfo);
    });
  });

  describe('isTokenExpired', () => {
    it('should return true for null expiry date', () => {
      expect(isTokenExpired(null)).toBe(true);
    });

    it('should return true for expired token', () => {
      const pastDate = new Date(Date.now() - 3600000).toISOString();
      expect(isTokenExpired(pastDate)).toBe(true);
    });

    it('should return false for valid token', () => {
      const futureDate = new Date(Date.now() + 3600000).toISOString();
      expect(isTokenExpired(futureDate)).toBe(false);
    });

    it('should return true for current time (boundary case)', () => {
      const now = new Date().toISOString();
      expect(isTokenExpired(now)).toBe(true);
    });
  });

  describe('getValidAccessToken', () => {
    it('should return null if no refresh token', async () => {
      const result = await getValidAccessToken('access', null, null);
      expect(result).toBeNull();
    });

    it('should return existing token if not expired', async () => {
      const futureDate = new Date(Date.now() + 3600000).toISOString();
      const result = await getValidAccessToken('access-token', 'refresh-token', futureDate);

      expect(result).toEqual({
        accessToken: 'access-token',
        expiryDate: futureDate,
      });
    });

    it('should refresh token if expired', async () => {
      const pastDate = new Date(Date.now() - 3600000).toISOString();
      const mockCredentials = {
        access_token: 'new-access-token',
        expiry_date: Date.now() + 3600000,
      };

      const mockOAuth2 = new (google.auth.OAuth2 as jest.Mock)();
      mockOAuth2.refreshAccessToken.mockResolvedValue({ credentials: mockCredentials });

      const result = await getValidAccessToken('old-access-token', 'refresh-token', pastDate);

      expect(result).toBeTruthy();
      expect(result?.accessToken).toBe('new-access-token');
    });

    it('should return null if refresh fails', async () => {
      const pastDate = new Date(Date.now() - 3600000).toISOString();
      const mockOAuth2 = new (google.auth.OAuth2 as jest.Mock)();
      mockOAuth2.refreshAccessToken.mockRejectedValue(new Error('Refresh failed'));

      const result = await getValidAccessToken('old-access-token', 'refresh-token', pastDate);

      expect(result).toBeNull();
    });
  });
});
