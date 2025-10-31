/**
 * Supabase client utility for server-side operations
 * @module lib/supabase
 */

import { createClient } from '@supabase/supabase-js';

// Create Supabase client with service role key for admin operations
export function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

// Create Supabase client with anon key for client operations
export function createAnonClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}

// Helper function to get user from request headers
export async function getUserFromRequest(request) {
  try {
    const authorization = request.headers.get('authorization');
    if (!authorization) return null;

    const token = authorization.replace('Bearer ', '');
    if (!token) return null;

    const supabase = createAnonClient();
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error) return null;
    return user;
  } catch (error) {
    console.error('Error getting user from request:', error);
    return null;
  }
}