/**
 * Class action lawsuit search endpoint
 * @module app/api/search/class-actions
 */

import { NextResponse } from 'next/server';
import { searchClassActions } from '@/lib/classActionService';
import { createServiceClient, getUserFromRequest } from '@/lib/supabase';

/**
 * Search for class action lawsuits
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

    const body = await request.json();
    const supabase = createServiceClient();

    // Get user profile data for matching
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Error fetching profile:', profileError);
    }

    // Get user addresses for better matching
    const { data: addresses, error: addressError } = await supabase
      .from('addresses')
      .select('*')
      .eq('user_id', user.id);

    if (addressError) {
      console.error('Error fetching addresses:', addressError);
    }

    // Combine user data for search
    const userData = {
      ...(profile || {}),
      ...(body || {}),
      addresses: addresses || []
    };

    // Search for class actions
    const results = await searchClassActions(userData);

    // Save promising results to database
    if (results.length > 0) {
      const moneyRecords = results
        .filter(result => result.matchScore > 50) // Only save likely matches
        .map(result => ({
          user_id: user.id,
          source_type: 'class_action',
          amount: result.estimatedPayout || 'Unknown',
          amount_numeric: parseFloat(result.estimatedPayout?.split('-')[1]?.replace(/[^0-9.]/g, '')) || null,
          company_name: result.company,
          description: result.title,
          eligibility_requirements: result.eligibility,
          claim_url: result.claimUrl,
          claim_deadline: result.deadline,
          status: 'unclaimed',
          metadata: {
            settlementId: result.id,
            totalSettlement: result.amount,
            categories: result.categories,
            matchScore: result.matchScore,
            eligibilityInfo: result.eligibilityInfo
          }
        }));

      const { error: insertError } = await supabase
        .from('money_found')
        .insert(moneyRecords);

      if (insertError) {
        console.error('Error saving class actions:', insertError);
      }
    }

    return NextResponse.json({
      success: true,
      count: results.length,
      results,
      message: `Found ${results.length} potential class action settlements`
    });

  } catch (error) {
    console.error('Class action search error:', error);
    return NextResponse.json(
      { error: 'Failed to search class action settlements' },
      { status: 500 }
    );
  }
}