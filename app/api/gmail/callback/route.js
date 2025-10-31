/**
 * Gmail OAuth callback handler
 * @module app/api/gmail/callback
 */

import { NextResponse } from 'next/server';
import { getTokens } from '@/lib/gmailService';
import { createServiceClient } from '@/lib/supabase';

/**
 * Handle Gmail OAuth callback
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code) {
      return NextResponse.json(
        { error: 'No authorization code provided' },
        { status: 400 }
      );
    }

    // Parse state to get user info
    let stateData = {};
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    } catch (e) {
      console.error('Error parsing state:', e);
    }

    const { userId } = stateData;

    if (!userId) {
      return NextResponse.json(
        { error: 'Invalid state parameter' },
        { status: 400 }
      );
    }

    // Exchange code for tokens
    const tokens = await getTokens(code);

    if (!tokens || !tokens.access_token) {
      return NextResponse.json(
        { error: 'Failed to get access token' },
        { status: 400 }
      );
    }

    // Save tokens to user profile
    const supabase = createServiceClient();

    const { error: updateError } = await supabase
      .from('profiles')
      .update({
        gmail_connected: true,
        gmail_access_token: tokens.access_token,
        gmail_refresh_token: tokens.refresh_token,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (updateError) {
      console.error('Error updating profile:', updateError);
      return NextResponse.json(
        { error: 'Failed to save Gmail connection' },
        { status: 500 }
      );
    }

    // Redirect to mobile app using deep link scheme
    // For mobile: foundmoney://gmail-connected?success=true
    // For web: fallback to web URL
    const isMobile = request.headers.get('user-agent')?.toLowerCase().includes('mobile');
    const successUrl = isMobile
      ? 'foundmoney://gmail-connected?success=true'
      : `${process.env.NEXT_PUBLIC_APP_URL}/gmail-connected?success=true`;

    return NextResponse.redirect(successUrl);

  } catch (error) {
    console.error('Gmail callback error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}