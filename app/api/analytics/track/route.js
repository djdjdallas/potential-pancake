/**
 * Analytics tracking endpoint
 * @module app/api/analytics/track
 */

import { NextResponse } from 'next/server';
import { createServiceClient, getUserFromRequest } from '@/lib/supabase';
import Mixpanel from 'mixpanel';

// Initialize Mixpanel if token is available
let mixpanel = null;
if (process.env.MIXPANEL_TOKEN) {
  mixpanel = Mixpanel.init(process.env.MIXPANEL_TOKEN);
}

/**
 * Track analytics events
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { eventName, eventProperties = {}, userId, anonymous = false } = body;

    if (!eventName) {
      return NextResponse.json(
        { error: 'Event name is required' },
        { status: 400 }
      );
    }

    // Get user if not anonymous
    let user = null;
    if (!anonymous) {
      user = await getUserFromRequest(request);
      if (!user && !userId) {
        return NextResponse.json(
          { error: 'Authentication required for non-anonymous events' },
          { status: 401 }
        );
      }
    }

    const finalUserId = user?.id || userId || 'anonymous';

    // Save to database
    const supabase = createServiceClient();

    const { error: dbError } = await supabase
      .from('analytics_events')
      .insert({
        user_id: finalUserId === 'anonymous' ? null : finalUserId,
        event_name: eventName,
        event_properties: {
          ...eventProperties,
          timestamp: new Date().toISOString(),
          source: 'backend'
        }
      });

    if (dbError) {
      console.error('Error saving analytics event:', dbError);
    }

    // Send to Mixpanel if configured
    if (mixpanel) {
      mixpanel.track(eventName, {
        distinct_id: finalUserId,
        ...eventProperties,
        source: 'backend'
      });

      // Set user properties for identified users
      if (finalUserId !== 'anonymous' && eventProperties.userProperties) {
        mixpanel.people.set(finalUserId, eventProperties.userProperties);
      }
    }

    return NextResponse.json({
      success: true,
      eventName,
      userId: finalUserId,
      message: 'Event tracked successfully'
    });

  } catch (error) {
    console.error('Analytics tracking error:', error);
    return NextResponse.json(
      { error: 'Failed to track event' },
      { status: 500 }
    );
  }
}

/**
 * Batch track multiple events
 */
export async function PUT(request) {
  try {
    const body = await request.json();
    const { events, userId } = body;

    if (!events || !Array.isArray(events)) {
      return NextResponse.json(
        { error: 'Events array is required' },
        { status: 400 }
      );
    }

    // Get user if authenticated
    const user = await getUserFromRequest(request);
    const finalUserId = user?.id || userId || 'anonymous';

    // Save all events to database
    const supabase = createServiceClient();

    const eventRecords = events.map(event => ({
      user_id: finalUserId === 'anonymous' ? null : finalUserId,
      event_name: event.name || event.eventName,
      event_properties: {
        ...(event.properties || event.eventProperties || {}),
        timestamp: new Date().toISOString(),
        source: 'backend',
        batch: true
      }
    }));

    const { error: dbError } = await supabase
      .from('analytics_events')
      .insert(eventRecords);

    if (dbError) {
      console.error('Error saving analytics events:', dbError);
    }

    // Send to Mixpanel if configured
    if (mixpanel) {
      events.forEach(event => {
        mixpanel.track(event.name || event.eventName, {
          distinct_id: finalUserId,
          ...(event.properties || event.eventProperties || {}),
          source: 'backend',
          batch: true
        });
      });
    }

    return NextResponse.json({
      success: true,
      count: events.length,
      userId: finalUserId,
      message: `${events.length} events tracked successfully`
    });

  } catch (error) {
    console.error('Batch analytics tracking error:', error);
    return NextResponse.json(
      { error: 'Failed to track events' },
      { status: 500 }
    );
  }
}