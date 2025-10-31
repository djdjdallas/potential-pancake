/**
 * RevenueCat webhook handler for subscription events
 * @module app/api/webhooks/revenuecat
 */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import crypto from 'crypto';

/**
 * Verify webhook signature
 */
function verifyWebhookSignature(payload, signature, secret) {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return hash === signature;
}

/**
 * Handle RevenueCat webhook events
 */
export async function POST(request) {
  try {
    // Get raw body for signature verification
    const rawBody = await request.text();
    const signature = request.headers.get('x-revenuecat-signature');

    // Verify webhook signature (REQUIRED in production)
    if (!process.env.REVENUECAT_WEBHOOK_SECRET) {
      console.error('REVENUECAT_WEBHOOK_SECRET not configured');
      return NextResponse.json(
        { error: 'Webhook configuration error' },
        { status: 500 }
      );
    }

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing webhook signature' },
        { status: 401 }
      );
    }

    const isValid = verifyWebhookSignature(
      rawBody,
      signature,
      process.env.REVENUECAT_WEBHOOK_SECRET
    );

    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid webhook signature' },
        { status: 401 }
      );
    }

    const event = JSON.parse(rawBody);
    const { type, app_user_id, product_id, purchased_at_ms, expiration_at_ms } = event;

    const supabase = createServiceClient();

    // Handle different event types
    switch (type) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL': {
        // Update user subscription status
        const expirationDate = expiration_at_ms
          ? new Date(parseInt(expiration_at_ms)).toISOString()
          : null;

        const tier = product_id?.includes('annual') || product_id?.includes('yearly')
          ? 'yearly'
          : 'monthly';

        const { error } = await supabase
          .from('profiles')
          .update({
            subscription_status: 'active',
            subscription_tier: tier,
            trial_ends_at: expirationDate,
            updated_at: new Date().toISOString()
          })
          .eq('id', app_user_id);

        if (error) {
          console.error('Error updating subscription:', error);
        }

        // Log analytics event
        await supabase
          .from('analytics_events')
          .insert({
            user_id: app_user_id,
            event_name: type === 'INITIAL_PURCHASE' ? 'subscription_started' : 'subscription_renewed',
            event_properties: {
              product_id,
              tier,
              expiration_date: expirationDate
            }
          });

        break;
      }

      case 'CANCELLATION': {
        // Update subscription status to cancelled
        const { error } = await supabase
          .from('profiles')
          .update({
            subscription_status: 'cancelled',
            updated_at: new Date().toISOString()
          })
          .eq('id', app_user_id);

        if (error) {
          console.error('Error cancelling subscription:', error);
        }

        // Log analytics event
        await supabase
          .from('analytics_events')
          .insert({
            user_id: app_user_id,
            event_name: 'subscription_cancelled',
            event_properties: { product_id }
          });

        break;
      }

      case 'EXPIRATION': {
        // Update subscription status to expired
        const { error } = await supabase
          .from('profiles')
          .update({
            subscription_status: 'expired',
            updated_at: new Date().toISOString()
          })
          .eq('id', app_user_id);

        if (error) {
          console.error('Error expiring subscription:', error);
        }

        // Log analytics event
        await supabase
          .from('analytics_events')
          .insert({
            user_id: app_user_id,
            event_name: 'subscription_expired',
            event_properties: { product_id }
          });

        break;
      }

      case 'BILLING_ISSUE': {
        // Update subscription status to billing_issue
        const { error } = await supabase
          .from('profiles')
          .update({
            subscription_status: 'billing_issue',
            updated_at: new Date().toISOString()
          })
          .eq('id', app_user_id);

        if (error) {
          console.error('Error updating billing issue:', error);
        }

        // Log analytics event
        await supabase
          .from('analytics_events')
          .insert({
            user_id: app_user_id,
            event_name: 'billing_issue',
            event_properties: { product_id }
          });

        break;
      }

      case 'PRODUCT_CHANGE': {
        // Handle product change (upgrade/downgrade)
        const newTier = product_id?.includes('annual') || product_id?.includes('yearly')
          ? 'yearly'
          : 'monthly';

        const { error } = await supabase
          .from('profiles')
          .update({
            subscription_tier: newTier,
            updated_at: new Date().toISOString()
          })
          .eq('id', app_user_id);

        if (error) {
          console.error('Error updating product change:', error);
        }

        // Log analytics event
        await supabase
          .from('analytics_events')
          .insert({
            user_id: app_user_id,
            event_name: 'subscription_changed',
            event_properties: {
              new_product_id: product_id,
              new_tier: newTier
            }
          });

        break;
      }

      default:
        console.log('Unhandled webhook event type:', type);
    }

    return NextResponse.json({ received: true });

  } catch (error) {
    console.error('RevenueCat webhook error:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}