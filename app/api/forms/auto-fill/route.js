/**
 * Form auto-fill endpoint using AI
 * @module app/api/forms/auto-fill
 */

import { NextResponse } from 'next/server';
import { autoFillForm } from '@/lib/formService';
import { createServiceClient, getUserFromRequest } from '@/lib/supabase';

/**
 * Auto-fill a claim form using AI
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
    const { formFields, moneyFoundId } = body;

    if (!formFields) {
      return NextResponse.json(
        { error: 'Form fields are required' },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Get user profile data
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (profileError) {
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

    // Get money found details if provided
    let moneyFoundDetails = null;
    if (moneyFoundId) {
      const { data: moneyFound } = await supabase
        .from('money_found')
        .select('*')
        .eq('id', moneyFoundId)
        .eq('user_id', user.id)
        .single();

      moneyFoundDetails = moneyFound;
    }

    // Prepare user data for auto-fill
    const userData = {
      ...profile,
      addresses: addresses || [],
      moneyFoundDetails
    };

    // Auto-fill the form
    const result = await autoFillForm(formFields, userData);

    // Save draft form if successful
    if (result.success && moneyFoundId) {
      await supabase
        .from('claim_forms')
        .upsert({
          user_id: user.id,
          money_found_id: moneyFoundId,
          form_data: result.data,
          status: 'draft',
          updated_at: new Date().toISOString()
        });
    }

    return NextResponse.json(result);

  } catch (error) {
    console.error('Form auto-fill error:', error);
    return NextResponse.json(
      { error: 'Failed to auto-fill form' },
      { status: 500 }
    );
  }
}