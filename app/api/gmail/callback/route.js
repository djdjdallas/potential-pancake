/**
 * Gmail OAuth callback handler
 * @module app/api/gmail/callback
 */

import { NextResponse } from 'next/server';
import { getTokens } from '@/lib/gmailService';
import { createServiceClient } from '@/lib/supabase';

/**
 * Create an error page HTML
 */
function createErrorPage(errorMessage) {
  const deepLink = 'foundmoney://gmail-connected?success=false';
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Connection Failed</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #EF4444 0%, #DC2626 100%);
            color: white;
          }
          .container {
            text-align: center;
            padding: 2rem;
          }
          .icon {
            font-size: 64px;
            margin-bottom: 1rem;
          }
          h1 {
            font-size: 24px;
            margin-bottom: 0.5rem;
          }
          p {
            font-size: 16px;
            opacity: 0.9;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">❌</div>
          <h1>Connection Failed</h1>
          <p>${errorMessage}</p>
          <p style="margin-top: 2rem; font-size: 14px;">You can close this window and try again.</p>
        </div>
        <script>
          setTimeout(() => {
            window.location.href = '${deepLink}';
          }, 2000);
        </script>
      </body>
    </html>
  `;
}

/**
 * Handle Gmail OAuth callback
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code) {
      const errorHtml = createErrorPage('No authorization code provided');
      return new Response(errorHtml, {
        status: 400,
        headers: { 'Content-Type': 'text/html' },
      });
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
      const errorHtml = createErrorPage('Invalid state parameter');
      return new Response(errorHtml, {
        status: 400,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    // Exchange code for tokens
    const tokens = await getTokens(code);

    if (!tokens || !tokens.access_token) {
      const errorHtml = createErrorPage('Failed to get access token from Google');
      return new Response(errorHtml, {
        status: 400,
        headers: { 'Content-Type': 'text/html' },
      });
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
      const errorHtml = createErrorPage('Failed to save Gmail connection');
      return new Response(errorHtml, {
        status: 500,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    // Return HTML page that redirects to mobile app deep link
    // This works with Expo WebBrowser.openAuthSessionAsync
    const deepLink = 'foundmoney://gmail-connected?success=true';

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Gmail Connected</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #10B981 0%, #059669 100%);
              color: white;
            }
            .container {
              text-align: center;
              padding: 2rem;
            }
            .icon {
              font-size: 64px;
              margin-bottom: 1rem;
            }
            h1 {
              font-size: 24px;
              margin-bottom: 0.5rem;
            }
            p {
              font-size: 16px;
              opacity: 0.9;
            }
            .loading {
              margin-top: 2rem;
              font-size: 14px;
              opacity: 0.7;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="icon">✅</div>
            <h1>Gmail Connected Successfully!</h1>
            <p>Redirecting back to Found Money...</p>
            <p class="loading">If you're not redirected automatically, you can close this window.</p>
          </div>
          <script>
            // Try to redirect to the app
            window.location.href = '${deepLink}';

            // Also try opening with a slight delay as fallback
            setTimeout(() => {
              window.location.replace('${deepLink}');
            }, 100);

            // Close window after a few seconds if still open
            setTimeout(() => {
              window.close();
            }, 2000);
          </script>
        </body>
      </html>
    `;

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html',
      },
    });

  } catch (error) {
    console.error('Gmail callback error:', error);
    const errorHtml = createErrorPage('An unexpected error occurred');
    return new Response(errorHtml, {
      status: 500,
      headers: { 'Content-Type': 'text/html' },
    });
  }
}