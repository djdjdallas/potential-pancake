/**
 * Gmail OAuth connection initiation
 * @module app/api/gmail/connect
 */

import { NextResponse } from 'next/server';
import { getAuthUrl } from '@/lib/gmailService';
import { getUserFromRequest } from '@/lib/supabase';

/**
 * Initiate Gmail OAuth flow
 */
export async function POST(request) {
  try {
    const user = await getUserFromRequest(request);

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Create state parameter with user info
    const stateData = {
      provider: 'gmail',
      userId: user.id,
      timestamp: Date.now()
    };

    const state = Buffer.from(JSON.stringify(stateData)).toString('base64');

    // Get Gmail OAuth URL
    const authUrl = getAuthUrl(state);

    return NextResponse.json({
      success: true,
      authUrl,
      message: 'Redirect user to the auth URL to connect Gmail'
    });

  } catch (error) {
    console.error('Gmail connect error:', error);
    return NextResponse.json(
      { error: 'Failed to initiate Gmail connection' },
      { status: 500 }
    );
  }
}