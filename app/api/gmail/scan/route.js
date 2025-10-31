/**
 * Gmail scanning endpoint
 * @module app/api/gmail/scan
 */

import { NextResponse } from 'next/server';
import { scanEmailsForMoney, refreshAccessToken } from '@/lib/gmailService';
import { createServiceClient, getUserFromRequest } from '@/lib/supabase';
import { logError, logInfo } from '@/lib/logger';

/**
 * Scan user's Gmail for money opportunities
 */
export async function POST(request) {
  const startTime = Date.now();

  try {
    const user = await getUserFromRequest(request);

    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    logInfo('Starting Gmail scan', { userId: user.id });

    const supabase = createServiceClient();

    // Get user's Gmail tokens
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('gmail_access_token, gmail_refresh_token, gmail_connected')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 404 }
      );
    }

    if (!profile.gmail_connected || !profile.gmail_access_token) {
      return NextResponse.json(
        { error: 'Gmail not connected. Please connect Gmail first.' },
        { status: 400 }
      );
    }

    let accessToken = profile.gmail_access_token;

    // Try to scan emails, refresh token if needed
    let scanResults;
    try {
      scanResults = await scanEmailsForMoney(accessToken, user.id);
    } catch (error) {
      // If error, try refreshing the access token
      if (profile.gmail_refresh_token) {
        logInfo('Access token expired, refreshing', { userId: user.id });

        try {
          accessToken = await refreshAccessToken(profile.gmail_refresh_token);

          // Save new access token
          await supabase
            .from('profiles')
            .update({
              gmail_access_token: accessToken,
              updated_at: new Date().toISOString()
            })
            .eq('id', user.id);

          // Retry scan with new token
          scanResults = await scanEmailsForMoney(accessToken, user.id);
        } catch (refreshError) {
          logError('Token refresh failed', refreshError, { userId: user.id });
          return NextResponse.json(
            { error: 'Gmail authentication expired. Please reconnect Gmail.' },
            { status: 401 }
          );
        }
      } else {
        throw error;
      }
    }

    // Save scan results to database
    const { error: scanError } = await supabase
      .from('email_scans')
      .insert({
        user_id: user.id,
        emails_scanned: scanResults.emailsScanned,
        opportunities_found: scanResults.opportunitiesFound.length,
        status: 'completed'
      });

    if (scanError) {
      logError('Error saving scan results', scanError, { userId: user.id });
    }

    // Save found opportunities to money_found table
    if (scanResults.opportunitiesFound.length > 0) {
      const moneyRecords = scanResults.opportunitiesFound.map(opp => ({
        user_id: user.id,
        source_type: 'email',
        amount: opp.amount || 'Unknown',
        amount_numeric: parseFloat(opp.amount?.replace(/[^0-9.]/g, '')) || null,
        company_name: opp.company,
        description: opp.description,
        eligibility_requirements: opp.action_required,
        claim_deadline: opp.deadline,
        status: 'unclaimed',
        metadata: {
          emailId: opp.emailId,
          emailSubject: opp.emailSubject,
          emailFrom: opp.emailFrom,
          emailDate: opp.emailDate,
          type: opp.type
        }
      }));

      const { error: insertError } = await supabase
        .from('money_found')
        .insert(moneyRecords);

      if (insertError) {
        logError('Error saving money opportunities', insertError, { userId: user.id });
      }
    }

    const duration = Date.now() - startTime;
    logInfo('Gmail scan completed', {
      userId: user.id,
      duration,
      emailsScanned: scanResults.emailsScanned,
      opportunitiesFound: scanResults.opportunitiesFound.length
    });

    return NextResponse.json({
      success: true,
      emailsScanned: scanResults.emailsScanned,
      opportunitiesFound: scanResults.opportunitiesFound.length,
      opportunities: scanResults.opportunitiesFound,
      message: scanResults.message
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    logError('Gmail scan error', error, { duration });

    return NextResponse.json(
      {
        error: 'Failed to scan Gmail',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}