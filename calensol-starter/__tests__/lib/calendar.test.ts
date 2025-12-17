import {
  createCalendarEvent,
  updateEventStatus,
  listCalenSolEvents,
  deleteCalendarEvent,
  updateEventTime,
  getCalendarEvent,
  generateEventTitle,
} from '@/lib/calendar';
import { getCalendarClient } from '@/lib/google';

// Mock the google lib
jest.mock('@/lib/google', () => ({
  getCalendarClient: jest.fn(),
  refreshAccessToken: jest.fn(),
}));

describe('lib/calendar.ts', () => {
  const mockCalendarClient = {
    events: {
      insert: jest.fn(),
      get: jest.fn(),
      patch: jest.fn(),
      list: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getCalendarClient as jest.Mock).mockReturnValue(mockCalendarClient);
  });

  describe('createCalendarEvent', () => {
    const mockEvent = {
      title: 'Send 100 USDC to alice',
      scheduledAt: new Date('2024-12-25T15:00:00Z'),
      transactionType: 'transfer' as const,
      amount: 100,
      tokenSymbol: 'USDC',
      recipient: 'ALiCe123...',
    };

    it('should create a calendar event for transfer', async () => {
      const mockResponse = {
        data: {
          id: 'event-123',
          summary: 'Send 100 USDC to alice',
        },
      };

      mockCalendarClient.events.insert.mockResolvedValue(mockResponse);

      const result = await createCalendarEvent(
        'access-token',
        'refresh-token',
        mockEvent,
        'tx-123'
      );

      expect(mockCalendarClient.events.insert).toHaveBeenCalledWith({
        calendarId: 'primary',
        requestBody: expect.objectContaining({
          summary: mockEvent.title,
          colorId: '9', // Blue for transfers
          extendedProperties: {
            private: {
              calensol_tx_id: 'tx-123',
              calensol_type: 'transfer',
              calensol_amount: '100',
              calensol_token: 'USDC',
              calensol_recipient: 'ALiCe123...',
              calensol_status: 'pending',
            },
          },
        }),
      });

      expect(result).toEqual(mockResponse.data);
    });

    it('should create a calendar event for swap', async () => {
      const swapEvent = {
        title: 'Swap 100 USDC',
        scheduledAt: new Date('2024-12-25T15:00:00Z'),
        transactionType: 'swap' as const,
        amount: 100,
        tokenSymbol: 'USDC',
        inputToken: 'USDC',
        outputToken: 'SOL',
      };

      mockCalendarClient.events.insert.mockResolvedValue({
        data: { id: 'event-456' },
      });

      await createCalendarEvent(
        'access-token',
        'refresh-token',
        swapEvent,
        'tx-456'
      );

      expect(mockCalendarClient.events.insert).toHaveBeenCalledWith({
        calendarId: 'primary',
        requestBody: expect.objectContaining({
          colorId: '10', // Green for swaps
        }),
      });
    });

    it('should create a calendar event for stake', async () => {
      const stakeEvent = {
        title: 'Stake 100 SOL',
        scheduledAt: new Date('2024-12-25T15:00:00Z'),
        transactionType: 'stake' as const,
        amount: 100,
        tokenSymbol: 'SOL',
      };

      mockCalendarClient.events.insert.mockResolvedValue({
        data: { id: 'event-789' },
      });

      await createCalendarEvent(
        'access-token',
        'refresh-token',
        stakeEvent,
        'tx-789'
      );

      expect(mockCalendarClient.events.insert).toHaveBeenCalledWith({
        calendarId: 'primary',
        requestBody: expect.objectContaining({
          colorId: '3', // Purple for staking
        }),
      });
    });

    it('should set 30 minute event duration', async () => {
      mockCalendarClient.events.insert.mockResolvedValue({
        data: { id: 'event-123' },
      });

      await createCalendarEvent(
        'access-token',
        'refresh-token',
        mockEvent,
        'tx-123'
      );

      const call = mockCalendarClient.events.insert.mock.calls[0][0];
      const startTime = new Date(call.requestBody.start.dateTime);
      const endTime = new Date(call.requestBody.end.dateTime);
      const durationMs = endTime.getTime() - startTime.getTime();

      expect(durationMs).toBe(30 * 60 * 1000); // 30 minutes
    });

    it('should set reminders', async () => {
      mockCalendarClient.events.insert.mockResolvedValue({
        data: { id: 'event-123' },
      });

      await createCalendarEvent(
        'access-token',
        'refresh-token',
        mockEvent,
        'tx-123'
      );

      expect(mockCalendarClient.events.insert).toHaveBeenCalledWith({
        calendarId: 'primary',
        requestBody: expect.objectContaining({
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'popup', minutes: 10 },
              { method: 'popup', minutes: 1 },
            ],
          },
        }),
      });
    });
  });

  describe('updateEventStatus', () => {
    it('should update event to completed status', async () => {
      mockCalendarClient.events.get.mockResolvedValue({
        data: {
          description: 'Status: Pending\nSome other text',
          extendedProperties: { private: {} },
        },
      });

      await updateEventStatus(
        'access-token',
        'refresh-token',
        'event-123',
        'completed',
        'tx-sig-123'
      );

      expect(mockCalendarClient.events.patch).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: 'event-123',
        requestBody: expect.objectContaining({
          colorId: '10', // Green for completed
          extendedProperties: {
            private: {
              calensol_status: 'completed',
              calensol_signature: 'tx-sig-123',
            },
          },
        }),
      });
    });

    it('should update event to failed status', async () => {
      mockCalendarClient.events.get.mockResolvedValue({
        data: {
          description: 'Status: Pending',
          extendedProperties: { private: {} },
        },
      });

      await updateEventStatus(
        'access-token',
        'refresh-token',
        'event-123',
        'failed'
      );

      expect(mockCalendarClient.events.patch).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: 'event-123',
        requestBody: expect.objectContaining({
          colorId: '11', // Red for failed
        }),
      });
    });

    it('should include explorer link for completed transactions', async () => {
      mockCalendarClient.events.get.mockResolvedValue({
        data: {
          description: 'Status: Pending',
          extendedProperties: { private: {} },
        },
      });

      await updateEventStatus(
        'access-token',
        'refresh-token',
        'event-123',
        'completed',
        'abc123signature'
      );

      const call = mockCalendarClient.events.patch.mock.calls[0][0];
      expect(call.requestBody.description).toContain('abc123signature');
      expect(call.requestBody.description).toContain('explorer.solana.com');
    });
  });

  describe('listCalenSolEvents', () => {
    it('should list CalenSol events', async () => {
      const mockEvents = [
        { id: 'event-1', summary: 'Event 1' },
        { id: 'event-2', summary: 'Event 2' },
      ];

      mockCalendarClient.events.list.mockResolvedValue({
        data: { items: mockEvents },
      });

      const events = await listCalenSolEvents(
        'access-token',
        'refresh-token',
        new Date(),
        50
      );

      expect(mockCalendarClient.events.list).toHaveBeenCalledWith({
        calendarId: 'primary',
        timeMin: expect.any(String),
        maxResults: 50,
        singleEvents: true,
        orderBy: 'startTime',
        privateExtendedProperty: 'calensol_tx_id',
      });

      expect(events).toEqual(mockEvents);
    });

    it('should return empty array when no events', async () => {
      mockCalendarClient.events.list.mockResolvedValue({
        data: { items: null },
      });

      const events = await listCalenSolEvents(
        'access-token',
        'refresh-token'
      );

      expect(events).toEqual([]);
    });

    it('should use default values', async () => {
      mockCalendarClient.events.list.mockResolvedValue({
        data: { items: [] },
      });

      await listCalenSolEvents('access-token', 'refresh-token');

      expect(mockCalendarClient.events.list).toHaveBeenCalledWith({
        calendarId: 'primary',
        timeMin: expect.any(String),
        maxResults: 50,
        singleEvents: true,
        orderBy: 'startTime',
        privateExtendedProperty: 'calensol_tx_id',
      });
    });
  });

  describe('deleteCalendarEvent', () => {
    it('should delete a calendar event', async () => {
      mockCalendarClient.events.delete.mockResolvedValue({});

      await deleteCalendarEvent('access-token', 'refresh-token', 'event-123');

      expect(mockCalendarClient.events.delete).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: 'event-123',
      });
    });
  });

  describe('updateEventTime', () => {
    it('should update event time', async () => {
      const newTime = new Date('2024-12-26T16:00:00Z');

      await updateEventTime('access-token', 'refresh-token', 'event-123', newTime);

      expect(mockCalendarClient.events.patch).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: 'event-123',
        requestBody: {
          start: {
            dateTime: newTime.toISOString(),
            timeZone: expect.any(String),
          },
          end: {
            dateTime: expect.any(String),
            timeZone: expect.any(String),
          },
        },
      });
    });

    it('should set end time 30 minutes after start', async () => {
      const newTime = new Date('2024-12-26T16:00:00Z');

      await updateEventTime('access-token', 'refresh-token', 'event-123', newTime);

      const call = mockCalendarClient.events.patch.mock.calls[0][0];
      const startTime = new Date(call.requestBody.start.dateTime);
      const endTime = new Date(call.requestBody.end.dateTime);

      expect(endTime.getTime() - startTime.getTime()).toBe(30 * 60 * 1000);
    });
  });

  describe('getCalendarEvent', () => {
    it('should get a calendar event by ID', async () => {
      const mockEvent = { id: 'event-123', summary: 'Test Event' };
      mockCalendarClient.events.get.mockResolvedValue({ data: mockEvent });

      const event = await getCalendarEvent(
        'access-token',
        'refresh-token',
        'event-123'
      );

      expect(mockCalendarClient.events.get).toHaveBeenCalledWith({
        calendarId: 'primary',
        eventId: 'event-123',
      });

      expect(event).toEqual(mockEvent);
    });

    it('should return null on error', async () => {
      mockCalendarClient.events.get.mockRejectedValue(new Error('Not found'));

      const event = await getCalendarEvent(
        'access-token',
        'refresh-token',
        'invalid-id'
      );

      expect(event).toBeNull();
    });
  });

  describe('generateEventTitle', () => {
    it('should generate title for transfer', () => {
      const title = generateEventTitle('transfer', 100, 'USDC', 'ABC123...XYZ');

      expect(title).toBe('Send 100 USDC to ABC1...XYZ');
    });

    it('should generate title for swap', () => {
      const title = generateEventTitle('swap', 50, 'SOL');

      expect(title).toBe('Swap 50 SOL');
    });

    it('should generate title for stake', () => {
      const title = generateEventTitle('stake', 200, 'SOL');

      expect(title).toBe('Stake 200 SOL');
    });

    it('should handle missing recipient for transfer', () => {
      const title = generateEventTitle('transfer', 100, 'USDC');

      expect(title).toBe('Send 100 USDC to unknown');
    });

    it('should truncate long recipient addresses', () => {
      const longAddress = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij1234567890';
      const title = generateEventTitle('transfer', 100, 'USDC', longAddress);

      expect(title).toContain('ABCD');
      expect(title).toContain('7890');
      expect(title).toContain('...');
    });
  });
});
