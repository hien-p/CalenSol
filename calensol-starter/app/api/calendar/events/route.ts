import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { listCalenSolEvents } from '@/lib/calendar';
import { getValidAccessToken } from '@/lib/google';

// GET /api/calendar/events - List CalenSol events from Google Calendar
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const walletAddress = searchParams.get('wallet');
  const timeMin = searchParams.get('timeMin');
  const maxResults = searchParams.get('maxResults');

  if (!walletAddress) {
    return NextResponse.json(
      { error: 'Wallet address is required' },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // Get user
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('smart_wallet_pubkey', walletAddress)
    .single();

  if (userError || !user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  if (!user.google_refresh_token) {
    return NextResponse.json(
      { error: 'Google Calendar not connected' },
      { status: 400 }
    );
  }

  try {
    // Get valid access token
    const tokenData = await getValidAccessToken(
      user.google_access_token,
      user.google_refresh_token,
      user.google_token_expiry
    );

    if (!tokenData) {
      return NextResponse.json(
        { error: 'Failed to get valid access token. Please reconnect Google Calendar.' },
        { status: 401 }
      );
    }

    // Update stored tokens if refreshed
    if (tokenData.accessToken !== user.google_access_token) {
      await supabase
        .from('users')
        .update({
          google_access_token: tokenData.accessToken,
          google_token_expiry: tokenData.expiryDate,
        })
        .eq('id', user.id);
    }

    // List CalenSol events
    const events = await listCalenSolEvents(
      tokenData.accessToken,
      user.google_refresh_token,
      timeMin ? new Date(timeMin) : new Date(),
      maxResults ? parseInt(maxResults) : 50
    );

    // Transform events to include extended properties
    const transformedEvents = events.map((event) => ({
      id: event.id,
      summary: event.summary,
      description: event.description,
      start: event.start,
      end: event.end,
      colorId: event.colorId,
      htmlLink: event.htmlLink,
      calensol: event.extendedProperties?.private
        ? {
            txId: event.extendedProperties.private.calensol_tx_id,
            type: event.extendedProperties.private.calensol_type,
            amount: event.extendedProperties.private.calensol_amount,
            token: event.extendedProperties.private.calensol_token,
            recipient: event.extendedProperties.private.calensol_recipient,
            status: event.extendedProperties.private.calensol_status,
            signature: event.extendedProperties.private.calensol_signature,
          }
        : null,
    }));

    return NextResponse.json({ events: transformedEvents });
  } catch (error) {
    console.error('Failed to list calendar events:', error);
    return NextResponse.json(
      { error: 'Failed to fetch calendar events' },
      { status: 500 }
    );
  }
}
