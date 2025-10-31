/**
 * Comprehensive search across all money sources
 * @module app/api/search/all
 */

import { NextResponse } from 'next/server';
import { searchClassActions } from '@/lib/classActionService';
import { searchAllStates } from '@/lib/unclaimedPropertyService';
import { scanEmailsForMoney } from '@/lib/gmailService';
import { createServiceClient, getUserFromRequest } from '@/lib/supabase';
import { logError, logInfo } from '@/lib/logger';
import { validateBodySize } from '@/lib/validation';

/**
 * Run comprehensive search across all sources
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

    // Validate request size
    const body = await request.json();
    const sizeValidation = validateBodySize(body, 100); // 100KB max
    if (!sizeValidation.valid) {
      return NextResponse.json(
        { error: sizeValidation.error },
        { status: 413 }
      );
    }

    logInfo('Starting comprehensive search', { userId: user.id });

    const supabase = createServiceClient();

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 404 }
      );
    }

    // Get user addresses
    const { data: addresses } = await supabase
      .from('addresses')
      .select('*')
      .eq('user_id', user.id);

    const userData = {
      ...profile,
      addresses: addresses || []
    };

    const results = {
      classActions: [],
      unclaimedProperty: [],
      emailOpportunities: [],
      totalFound: 0,
      estimatedValue: 0
    };

    const errors = [];

    // 1. Search Class Actions
    try {
      logInfo('Searching class actions', { userId: user.id });
      const classActionResults = await searchClassActions(userData);
      results.classActions = classActionResults;

      // Save to database
      if (classActionResults.length > 0) {
        const records = classActionResults
          .filter(r => r.matchScore > 50)
          .map(r => ({
            user_id: user.id,
            source_type: 'class_action',
            amount: r.estimatedPayout || 'Unknown',
            amount_numeric: parseFloat(r.estimatedPayout?.split('-')[1]?.replace(/[^0-9.]/g, '')) || null,
            company_name: r.company,
            description: r.title,
            eligibility_requirements: r.eligibility,
            claim_url: r.claimUrl,
            claim_deadline: r.deadline,
            status: 'unclaimed',
            metadata: r
          }));

        const { error: insertError } = await supabase.from('money_found').insert(records);
        if (insertError) {
          logError('Failed to save class action results', insertError, { userId: user.id });
        }
      }
    } catch (error) {
      logError('Class action search error', error, { userId: user.id });
      errors.push('Class action search failed');
    }

    // 2. Search Unclaimed Property
    try {
      if (profile.first_name && profile.last_name) {
        logInfo('Searching unclaimed property', { userId: user.id });
        const propertyResults = await searchAllStates({
          firstName: profile.first_name,
          lastName: profile.last_name,
          addresses: addresses || []
        });
        results.unclaimedProperty = propertyResults;

        // Save to database
        if (propertyResults.length > 0) {
          const records = propertyResults.map(p => ({
            user_id: user.id,
            source_type: 'unclaimed_property',
            amount: p.amount,
            amount_numeric: parseFloat(p.amount?.replace(/[^0-9.]/g, '')) || null,
            company_name: p.reportedBy,
            description: `${p.type} - ${p.address}`,
            eligibility_requirements: `Property ID: ${p.propertyId}`,
            claim_url: p.claimUrl,
            status: 'unclaimed',
            metadata: p
          }));

          const { error: insertError } = await supabase.from('money_found').insert(records);
          if (insertError) {
            logError('Failed to save unclaimed property results', insertError, { userId: user.id });
          }
        }
      }
    } catch (error) {
      logError('Unclaimed property search error', error, { userId: user.id });
      errors.push('Unclaimed property search failed');
    }

    // 3. Scan Gmail (if connected)
    try {
      if (profile.gmail_connected && profile.gmail_access_token) {
        logInfo('Scanning Gmail', { userId: user.id });
        const gmailResults = await scanEmailsForMoney(
          profile.gmail_access_token,
          user.id
        );
        results.emailOpportunities = gmailResults.opportunitiesFound || [];

        // Save to database
        if (gmailResults.opportunitiesFound?.length > 0) {
          const records = gmailResults.opportunitiesFound.map(o => ({
            user_id: user.id,
            source_type: 'email',
            amount: o.amount || 'Unknown',
            amount_numeric: parseFloat(o.amount?.replace(/[^0-9.]/g, '')) || null,
            company_name: o.company,
            description: o.description,
            eligibility_requirements: o.action_required,
            claim_deadline: o.deadline,
            status: 'unclaimed',
            metadata: o
          }));

          const { error: insertError } = await supabase.from('money_found').insert(records);
          if (insertError) {
            logError('Failed to save Gmail scan results', insertError, { userId: user.id });
          }
        }
      }
    } catch (error) {
      logError('Gmail scan error', error, { userId: user.id });
      errors.push('Gmail scan failed');
    }

    // Calculate totals
    results.totalFound =
      results.classActions.length +
      results.unclaimedProperty.length +
      results.emailOpportunities.length;

    // Estimate total value
    let estimatedValue = 0;

    // Add class action estimates
    results.classActions.forEach(ca => {
      const maxAmount = parseFloat(ca.estimatedPayout?.split('-')[1]?.replace(/[^0-9.]/g, '')) || 0;
      estimatedValue += maxAmount;
    });

    // Add unclaimed property
    results.unclaimedProperty.forEach(prop => {
      const amount = parseFloat(prop.amount?.replace(/[^0-9.]/g, '')) || 100; // Default $100 for unknown
      estimatedValue += amount;
    });

    // Add email opportunities
    results.emailOpportunities.forEach(opp => {
      const amount = parseFloat(opp.amount?.replace(/[^0-9.]/g, '')) || 50; // Default $50 for unknown
      estimatedValue += amount;
    });

    results.estimatedValue = estimatedValue;

    const duration = Date.now() - startTime;
    logInfo('Comprehensive search completed', {
      userId: user.id,
      duration,
      totalFound: results.totalFound,
      estimatedValue
    });

    return NextResponse.json({
      success: true,
      results,
      errors: errors.length > 0 ? errors : undefined,
      message: `Found ${results.totalFound} opportunities worth approximately $${estimatedValue.toFixed(2)}`
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    logError('Comprehensive search error', error, {
      userId: 'unknown',
      duration
    });

    return NextResponse.json(
      {
        error: 'Failed to complete comprehensive search',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      },
      { status: 500 }
    );
  }
}