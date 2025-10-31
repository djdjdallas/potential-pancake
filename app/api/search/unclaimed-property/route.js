/**
 * Unclaimed property search endpoint
 * @module app/api/search/unclaimed-property
 */

import { NextResponse } from 'next/server';
import { searchAllStates, calculatePropertyStats } from '@/lib/unclaimedPropertyService';
import { createServiceClient, getUserFromRequest } from '@/lib/supabase';

/**
 * Search for unclaimed property
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

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: 'User profile not found' },
        { status: 404 }
      );
    }

    if (!profile.first_name || !profile.last_name) {
      return NextResponse.json(
        {
          error: 'First and last name required for unclaimed property search',
          requiresProfile: true
        },
        { status: 400 }
      );
    }

    // Get user addresses
    const { data: addresses, error: addressError } = await supabase
      .from('addresses')
      .select('*')
      .eq('user_id', user.id);

    if (addressError) {
      console.error('Error fetching addresses:', addressError);
    }

    // Search data
    const searchData = {
      firstName: body.firstName || profile.first_name,
      lastName: body.lastName || profile.last_name,
      addresses: addresses || []
    };

    // Search all states
    const results = await searchAllStates(searchData);

    // Calculate statistics
    const stats = calculatePropertyStats(results);

    // Save results to database
    if (results.length > 0) {
      const moneyRecords = results.map(property => ({
        user_id: user.id,
        source_type: 'unclaimed_property',
        amount: property.amount,
        amount_numeric: parseFloat(property.amount?.replace(/[^0-9.]/g, '')) || null,
        company_name: property.reportedBy,
        description: `${property.type} - ${property.address}`,
        eligibility_requirements: `Property ID: ${property.propertyId}`,
        claim_url: property.claimUrl,
        status: 'unclaimed',
        metadata: {
          state: property.state,
          propertyId: property.propertyId,
          propertyType: property.type,
          dateReported: property.dateReported,
          matchConfidence: property.matchConfidence,
          ownerName: property.ownerName
        }
      }));

      const { error: insertError } = await supabase
        .from('money_found')
        .insert(moneyRecords);

      if (insertError) {
        console.error('Error saving unclaimed property:', insertError);
      }
    }

    return NextResponse.json({
      success: true,
      count: results.length,
      results,
      statistics: stats,
      message: `Found ${results.length} unclaimed properties worth approximately $${stats.estimatedTotal.toFixed(2)}`
    });

  } catch (error) {
    console.error('Unclaimed property search error:', error);
    return NextResponse.json(
      { error: 'Failed to search unclaimed property' },
      { status: 500 }
    );
  }
}