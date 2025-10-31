/**
 * OpenAI configuration and utilities
 * @module lib/openai
 */

import OpenAI from 'openai';

// Initialize OpenAI client
let openaiClient = null;

export function getOpenAIClient() {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('Missing OpenAI API key');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

// Prompts for different AI operations
export const PROMPTS = {
  EMAIL_ANALYSIS: `You are an expert at finding money-related opportunities in emails.
    Analyze the following email and extract any potential money opportunities such as:
    - Refunds or returns
    - Rebates
    - Class action settlements
    - Price drop refunds
    - Insurance claims
    - Subscription cancellations with refunds
    - Overcharges

    Return a JSON object with this structure:
    {
      "found": boolean,
      "opportunities": [
        {
          "type": "refund|rebate|settlement|price_drop|insurance|subscription|overcharge|other",
          "company": "company name",
          "amount": "amount if mentioned or 'Unknown'",
          "description": "brief description",
          "action_required": "what user needs to do",
          "deadline": "deadline if mentioned or null"
        }
      ]
    }

    Email content:`,

  FORM_FILLING: `You are an expert at filling out claim forms accurately.
    Based on the user information and form fields provided, generate the appropriate values for each field.
    Be accurate and use only the provided information. If information is missing, mark it as null.

    Return a JSON object with field_name: value pairs.

    User Information:`,

  OPPORTUNITY_MATCHING: `You are an expert at matching users to money opportunities.
    Score how relevant this opportunity is to the user on a scale of 0-100.
    Consider factors like:
    - Location match
    - Time period match
    - Product/service usage
    - Demographic match

    Return a JSON object with:
    {
      "score": number (0-100),
      "reasons": ["reason1", "reason2"],
      "likely_eligible": boolean
    }

    User Profile:`,
};

/**
 * Analyze email content for money opportunities using AI
 * @param {string} emailContent - Email text content
 * @returns {Promise<Object>} Extracted money opportunity data
 */
export async function analyzeEmailForMoney(emailContent) {
  try {
    const openai = getOpenAIClient();

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: PROMPTS.EMAIL_ANALYSIS
        },
        {
          role: 'user',
          content: emailContent
        }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });

    const result = JSON.parse(completion.choices[0].message.content);
    return result;
  } catch (error) {
    console.error('Error analyzing email:', error);
    throw new Error('Failed to analyze email content');
  }
}

/**
 * Intelligently fill out a claim form
 * @param {Object} formStructure - Form fields and requirements
 * @param {Object} userData - User's personal information
 * @returns {Promise<Object>} Completed form data
 */
export async function autoFillClaimForm(formStructure, userData) {
  try {
    const openai = getOpenAIClient();

    const prompt = `${PROMPTS.FORM_FILLING}
    ${JSON.stringify(userData)}

    Form Fields:
    ${JSON.stringify(formStructure)}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' }
    });

    const result = JSON.parse(completion.choices[0].message.content);
    return result;
  } catch (error) {
    console.error('Error auto-filling form:', error);
    throw new Error('Failed to auto-fill form');
  }
}

/**
 * Match user profile to money opportunity
 * @param {Object} userProfile - User information
 * @param {Object} opportunity - Money opportunity details
 * @returns {Promise<Object>} Relevance score and eligibility
 */
export async function scoreOpportunityMatch(userProfile, opportunity) {
  try {
    const openai = getOpenAIClient();

    const prompt = `${PROMPTS.OPPORTUNITY_MATCHING}
    ${JSON.stringify(userProfile)}

    Opportunity:
    ${JSON.stringify(opportunity)}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' }
    });

    const result = JSON.parse(completion.choices[0].message.content);
    return result;
  } catch (error) {
    console.error('Error matching opportunity:', error);
    throw new Error('Failed to score opportunity match');
  }
}