/**
 * Anthropic Claude configuration and utilities
 * @module lib/claude
 */

import Anthropic from '@anthropic-ai/sdk';

// Initialize Claude client
let claudeClient = null;

export function getClaudeClient() {
  if (!claudeClient) {
    const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Missing Claude API key (set CLAUDE_API_KEY or ANTHROPIC_API_KEY)');
    }
    claudeClient = new Anthropic({ apiKey });
  }
  return claudeClient;
}

// Model configuration with fallback
const MODELS = {
  PRIMARY: 'claude-haiku-4-5-20251001', // Fast and cost-effective
  FALLBACK: 'claude-sonnet-4-5-20250929', // More capable fallback
};

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
    }`,

  FORM_FILLING: `You are an expert at filling out claim forms accurately.
    Based on the user information and form fields provided, generate the appropriate values for each field.
    Be accurate and use only the provided information. If information is missing, mark it as null.

    Return a JSON object with field_name: value pairs.`,

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
    }`,
};

/**
 * Make Claude API call with primary/fallback model support
 * @param {Array} messages - Message array
 * @param {string} systemPrompt - System prompt
 * @param {Object} schema - JSON schema for structured output
 * @param {boolean} useFallback - Whether to use fallback model
 * @returns {Promise<Object>} Parsed JSON response
 */
async function callClaude(messages, systemPrompt, schema, useFallback = false) {
  const client = getClaudeClient();
  const model = useFallback ? MODELS.FALLBACK : MODELS.PRIMARY;

  try {
    // Use tool calling for reliable JSON output
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      temperature: 0.3,
      system: systemPrompt,
      messages,
      tools: [
        {
          name: 'return_structured_data',
          description: 'Returns the structured data in the specified JSON format',
          input_schema: schema,
        },
      ],
      tool_choice: { type: 'tool', name: 'return_structured_data' },
    });

    // Extract tool use result
    const toolUse = response.content.find((block) => block.type === 'tool_use');
    if (!toolUse) {
      throw new Error('No structured output returned');
    }

    return toolUse.input;
  } catch (error) {
    // If primary model fails and we haven't tried fallback yet, retry with fallback
    if (!useFallback && error.status !== 401) {
      console.log(`Primary model failed, trying fallback model: ${error.message}`);
      return callClaude(messages, systemPrompt, schema, true);
    }
    throw error;
  }
}

/**
 * Analyze email content for money opportunities using AI
 * @param {string} emailContent - Email text content
 * @returns {Promise<Object>} Extracted money opportunity data
 */
export async function analyzeEmailForMoney(emailContent) {
  try {
    const schema = {
      type: 'object',
      properties: {
        found: { type: 'boolean' },
        opportunities: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: {
                type: 'string',
                enum: ['refund', 'rebate', 'settlement', 'price_drop', 'insurance', 'subscription', 'overcharge', 'other'],
              },
              company: { type: 'string' },
              amount: { type: 'string' },
              description: { type: 'string' },
              action_required: { type: 'string' },
              deadline: { type: ['string', 'null'] },
            },
            required: ['type', 'company', 'amount', 'description', 'action_required', 'deadline'],
          },
        },
      },
      required: ['found', 'opportunities'],
    };

    const result = await callClaude(
      [
        {
          role: 'user',
          content: `Email content:\n\n${emailContent}`,
        },
      ],
      PROMPTS.EMAIL_ANALYSIS,
      schema
    );

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
    // Create dynamic schema based on form structure
    const schema = {
      type: 'object',
      properties: {},
      required: [],
    };

    // Build schema from form structure
    Object.entries(formStructure).forEach(([fieldName, fieldInfo]) => {
      schema.properties[fieldName] = {
        type: ['string', 'null'],
        description: fieldInfo.description || fieldInfo.label || fieldName,
      };
      if (fieldInfo.required) {
        schema.required.push(fieldName);
      }
    });

    const result = await callClaude(
      [
        {
          role: 'user',
          content: `User Information:\n${JSON.stringify(userData, null, 2)}\n\nForm Fields:\n${JSON.stringify(formStructure, null, 2)}`,
        },
      ],
      PROMPTS.FORM_FILLING,
      schema
    );

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
    const schema = {
      type: 'object',
      properties: {
        score: {
          type: 'number',
          minimum: 0,
          maximum: 100,
          description: 'Relevance score from 0-100',
        },
        reasons: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of reasons for the score',
        },
        likely_eligible: {
          type: 'boolean',
          description: 'Whether the user is likely eligible',
        },
      },
      required: ['score', 'reasons', 'likely_eligible'],
    };

    const result = await callClaude(
      [
        {
          role: 'user',
          content: `User Profile:\n${JSON.stringify(userProfile, null, 2)}\n\nOpportunity:\n${JSON.stringify(opportunity, null, 2)}`,
        },
      ],
      PROMPTS.OPPORTUNITY_MATCHING,
      schema
    );

    return result;
  } catch (error) {
    console.error('Error matching opportunity:', error);
    throw new Error('Failed to score opportunity match');
  }
}
