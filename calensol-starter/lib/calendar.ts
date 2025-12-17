import { getCalendarClient, refreshAccessToken } from '@/lib/google';
import { calendar_v3 } from 'googleapis';
import type { CalenSolEvent, TransactionStatus, TX_COLORS } from '@/types';

// Color coding for transaction types
const EVENT_COLORS = {
  transfer: '9',    // Blue
  swap: '10',       // Green
  stake: '3',       // Purple
  recurring: '5',   // Yellow
  completed: '10',  // Green
  failed: '11',     // Red
} as const;

// Create a calendar event for a scheduled transaction
export async function createCalendarEvent(
  accessToken: string,
  refreshToken: string,
  event: CalenSolEvent,
  transactionId: string
): Promise<calendar_v3.Schema$Event> {
  const calendar = getCalendarClient(accessToken, refreshToken);

  // Build description based on transaction type
  let description = `CalenSol Scheduled Transaction\n\n`;

  if (event.transactionType === 'transfer') {
    description += `Type: Transfer\n`;
    description += `Amount: ${event.amount} ${event.tokenSymbol}\n`;
    description += `To: ${event.recipient}\n`;
  } else if (event.transactionType === 'swap') {
    description += `Type: Swap\n`;
    description += `Amount: ${event.amount} ${event.inputToken}\n`;
    description += `Output: ${event.outputToken}\n`;
  } else if (event.transactionType === 'stake') {
    description += `Type: Stake\n`;
    description += `Amount: ${event.amount} ${event.tokenSymbol}\n`;
  }

  description += `\nStatus: Pending\n`;
  description += `Transaction ID: ${transactionId}`;

  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const endTime = new Date(event.scheduledAt.getTime() + 30 * 60000); // 30 min duration

  const calendarEvent: calendar_v3.Schema$Event = {
    summary: event.title,
    description,
    start: {
      dateTime: event.scheduledAt.toISOString(),
      timeZone: timezone,
    },
    end: {
      dateTime: endTime.toISOString(),
      timeZone: timezone,
    },
    colorId: EVENT_COLORS[event.transactionType],
    extendedProperties: {
      private: {
        calensol_tx_id: transactionId,
        calensol_type: event.transactionType,
        calensol_amount: event.amount.toString(),
        calensol_token: event.tokenSymbol,
        calensol_recipient: event.recipient || '',
        calensol_status: 'pending',
      },
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 10 },
        { method: 'popup', minutes: 1 },
      ],
    },
  };

  const response = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: calendarEvent,
  });

  return response.data;
}

// Update calendar event status after execution
export async function updateEventStatus(
  accessToken: string,
  refreshToken: string,
  eventId: string,
  status: 'completed' | 'failed',
  signature?: string
): Promise<void> {
  const calendar = getCalendarClient(accessToken, refreshToken);

  // Get current event
  const eventResponse = await calendar.events.get({
    calendarId: 'primary',
    eventId,
  });

  const event = eventResponse.data;
  let description = event.description || '';

  // Update status in description
  if (status === 'completed') {
    description = description.replace('Status: Pending', 'Status: Completed');
    if (signature) {
      description += `\n\nTransaction Signature: ${signature}`;
      description += `\nExplorer: https://explorer.solana.com/tx/${signature}?cluster=devnet`;
    }
  } else {
    description = description.replace('Status: Pending', 'Status: Failed');
  }

  await calendar.events.patch({
    calendarId: 'primary',
    eventId,
    requestBody: {
      description,
      colorId: status === 'completed' ? EVENT_COLORS.completed : EVENT_COLORS.failed,
      extendedProperties: {
        private: {
          ...event.extendedProperties?.private,
          calensol_status: status,
          calensol_signature: signature || '',
        },
      },
    },
  });
}

// List CalenSol events from calendar
export async function listCalenSolEvents(
  accessToken: string,
  refreshToken: string,
  timeMin: Date = new Date(),
  maxResults: number = 50
): Promise<calendar_v3.Schema$Event[]> {
  const calendar = getCalendarClient(accessToken, refreshToken);

  const response = await calendar.events.list({
    calendarId: 'primary',
    timeMin: timeMin.toISOString(),
    maxResults,
    singleEvents: true,
    orderBy: 'startTime',
    privateExtendedProperty: 'calensol_tx_id', // Only CalenSol events
  });

  return response.data.items || [];
}

// Delete a calendar event
export async function deleteCalendarEvent(
  accessToken: string,
  refreshToken: string,
  eventId: string
): Promise<void> {
  const calendar = getCalendarClient(accessToken, refreshToken);

  await calendar.events.delete({
    calendarId: 'primary',
    eventId,
  });
}

// Update calendar event time
export async function updateEventTime(
  accessToken: string,
  refreshToken: string,
  eventId: string,
  newTime: Date
): Promise<void> {
  const calendar = getCalendarClient(accessToken, refreshToken);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const endTime = new Date(newTime.getTime() + 30 * 60000);

  await calendar.events.patch({
    calendarId: 'primary',
    eventId,
    requestBody: {
      start: {
        dateTime: newTime.toISOString(),
        timeZone: timezone,
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: timezone,
      },
    },
  });
}

// Get calendar event by ID
export async function getCalendarEvent(
  accessToken: string,
  refreshToken: string,
  eventId: string
): Promise<calendar_v3.Schema$Event | null> {
  const calendar = getCalendarClient(accessToken, refreshToken);

  try {
    const response = await calendar.events.get({
      calendarId: 'primary',
      eventId,
    });
    return response.data;
  } catch (error) {
    console.error('Failed to get calendar event:', error);
    return null;
  }
}

// Generate event title based on transaction
export function generateEventTitle(
  type: 'transfer' | 'swap' | 'stake',
  amount: number,
  tokenSymbol: string,
  recipient?: string
): string {
  switch (type) {
    case 'transfer':
      const shortRecipient = recipient
        ? `${recipient.slice(0, 4)}...${recipient.slice(-4)}`
        : 'unknown';
      return `Send ${amount} ${tokenSymbol} to ${shortRecipient}`;
    case 'swap':
      return `Swap ${amount} ${tokenSymbol}`;
    case 'stake':
      return `Stake ${amount} ${tokenSymbol}`;
    default:
      return `${type} ${amount} ${tokenSymbol}`;
  }
}
