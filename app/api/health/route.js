/**
 * Health check endpoint
 * @module app/api/health
 */

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';

/**
 * Health check endpoint
 */
export async function GET() {
  const checks = {
    timestamp: new Date().toISOString(),
    status: 'healthy',
    services: {},
  };

  // Check Supabase connection
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from('profiles').select('id').limit(1);
    checks.services.database = error ? 'unhealthy' : 'healthy';
  } catch (error) {
    checks.services.database = 'unhealthy';
    checks.status = 'degraded';
  }

  // Check environment variables
  const requiredEnvVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'OPENAI_API_KEY',
  ];

  const missingEnvVars = requiredEnvVars.filter(
    (envVar) => !process.env[envVar] || process.env[envVar].includes('your_')
  );

  checks.services.configuration = missingEnvVars.length === 0 ? 'healthy' : 'unhealthy';
  if (missingEnvVars.length > 0) {
    checks.status = 'unhealthy';
    checks.missingEnvVars = missingEnvVars;
  }

  const statusCode = checks.status === 'healthy' ? 200 : 503;

  return NextResponse.json(checks, { status: statusCode });
}
