/**
 * Gmail integration service for scanning emails for money opportunities
 * @module lib/gmailService
 */

import { google } from 'googleapis';
import { analyzeEmailForMoney } from './claude.js';

/**
 * Create OAuth2 client for Gmail
 * @returns {Object} OAuth2 client
 */
export function createOAuth2Client() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const redirectUri = process.env.GMAIL_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Missing Gmail OAuth configuration');
  }

  return new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );
}

/**
 * Get Gmail authorization URL
 * @param {string} state - State parameter for security
 * @returns {string} Authorization URL
 */
export function getAuthUrl(state) {
  const oauth2Client = createOAuth2Client();

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.email'
    ],
    state: state,
    prompt: 'consent'
  });
}

/**
 * Exchange authorization code for tokens
 * @param {string} code - Authorization code
 * @returns {Promise<Object>} Access and refresh tokens
 */
export async function getTokens(code) {
  try {
    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code);
    return tokens;
  } catch (error) {
    console.error('Error getting tokens:', error);
    throw new Error('Failed to exchange authorization code');
  }
}

/**
 * Refresh access token using refresh token
 * @param {string} refreshToken - Refresh token
 * @returns {Promise<string>} New access token
 */
export async function refreshAccessToken(refreshToken) {
  try {
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    const { credentials } = await oauth2Client.refreshAccessToken();
    return credentials.access_token;
  } catch (error) {
    console.error('Error refreshing token:', error);
    throw new Error('Failed to refresh access token');
  }
}

/**
 * Search Gmail for money-related emails
 * @param {string} accessToken - Gmail access token
 * @param {Object} options - Search options
 * @returns {Promise<Array>} List of email messages
 */
export async function searchMoneyEmails(accessToken, options = {}) {
  try {
    const oauth2Client = createOAuth2Client();
    oauth2Client.setCredentials({ access_token: accessToken });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Build search query for money-related emails
    const queries = [
      'refund',
      'rebate',
      'settlement',
      'class action',
      'reimbursement',
      'credit',
      'overpayment',
      'price drop',
      'price adjustment',
      'compensation'
    ];

    const searchQuery = queries.map(q => `"${q}"`).join(' OR ');
    const finalQuery = `(${searchQuery}) newer_than:1y`;

    const response = await gmail.users.messages.list({
      userId: 'me',
      q: finalQuery,
      maxResults: options.maxResults || 50
    });

    if (!response.data.messages) {
      return [];
    }

    // Get full message details for each email
    const messages = await Promise.all(
      response.data.messages.slice(0, 20).map(async (message) => {
        try {
          const fullMessage = await gmail.users.messages.get({
            userId: 'me',
            id: message.id,
            format: 'full'
          });
          return fullMessage.data;
        } catch (error) {
          console.error(`Error fetching message ${message.id}:`, error);
          return null;
        }
      })
    );

    return messages.filter(Boolean);
  } catch (error) {
    console.error('Error searching emails:', error);
    throw new Error('Failed to search Gmail');
  }
}

/**
 * Extract email content from Gmail message
 * @param {Object} message - Gmail message object
 * @returns {Object} Extracted email data
 */
export function extractEmailContent(message) {
  try {
    const headers = message.payload.headers;
    const subject = headers.find(h => h.name === 'Subject')?.value || '';
    const from = headers.find(h => h.name === 'From')?.value || '';
    const date = headers.find(h => h.name === 'Date')?.value || '';

    // Extract body
    let body = '';

    function extractBody(part) {
      if (part.body && part.body.data) {
        const decoded = Buffer.from(part.body.data, 'base64').toString('utf-8');
        body += decoded;
      }

      if (part.parts) {
        part.parts.forEach(extractBody);
      }
    }

    extractBody(message.payload);

    // Clean up HTML if present
    body = body.replace(/<[^>]*>/g, ' ')
               .replace(/\s+/g, ' ')
               .trim();

    return {
      id: message.id,
      subject,
      from,
      date,
      body: body.substring(0, 5000) // Limit body length
    };
  } catch (error) {
    console.error('Error extracting email content:', error);
    return null;
  }
}

/**
 * Scan user's Gmail for money opportunities
 * @param {string} accessToken - Gmail access token
 * @param {string} userId - User ID for storing results
 * @returns {Promise<Object>} Scan results
 */
export async function scanEmailsForMoney(accessToken, userId) {
  try {
    // Search for money-related emails
    const messages = await searchMoneyEmails(accessToken, {
      maxResults: 50
    });

    if (messages.length === 0) {
      return {
        success: true,
        emailsScanned: 0,
        opportunitiesFound: [],
        message: 'No money-related emails found'
      };
    }

    // Extract content from each email
    const emailContents = messages.map(extractEmailContent).filter(Boolean);

    // Analyze each email with AI
    const opportunities = [];
    for (const email of emailContents) {
      try {
        const analysis = await analyzeEmailForMoney(
          `Subject: ${email.subject}\nFrom: ${email.from}\n\n${email.body}`
        );

        if (analysis.found && analysis.opportunities) {
          analysis.opportunities.forEach(opp => {
            opportunities.push({
              ...opp,
              emailId: email.id,
              emailSubject: email.subject,
              emailFrom: email.from,
              emailDate: email.date
            });
          });
        }
      } catch (error) {
        console.error('Error analyzing individual email:', error);
        // Continue with other emails
      }
    }

    return {
      success: true,
      emailsScanned: emailContents.length,
      opportunitiesFound: opportunities,
      message: `Found ${opportunities.length} potential money opportunities`
    };
  } catch (error) {
    console.error('Error scanning emails:', error);
    throw new Error('Failed to scan emails for money opportunities');
  }
}