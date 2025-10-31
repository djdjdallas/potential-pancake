/**
 * OAuth callback handler for various providers
 * @module app/api/auth/callback
 */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * Handle OAuth callbacks
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Handle error from OAuth provider
    if (error) {
      return NextResponse.json(
        { error: `OAuth error: ${error}` },
        { status: 400 }
      );
    }

    if (!code) {
      return NextResponse.json(
        { error: 'No authorization code provided' },
        { status: 400 }
      );
    }

    // Parse state to determine provider
    let stateData = {};
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    } catch (e) {
      console.error('Error parsing state:', e);
    }

    const { provider = 'google', userId, redirectTo } = stateData;

    // Handle based on provider
    if (provider === 'google' || provider === 'gmail') {
      // Gmail OAuth is handled separately
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/api/gmail/callback?code=${code}&state=${state}`
      );
    }

    // For other OAuth providers (future implementation)
    return NextResponse.json(
      {
        success: true,
        message: 'OAuth callback received',
        provider
      }
    );

  } catch (error) {
    console.error('OAuth callback error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}