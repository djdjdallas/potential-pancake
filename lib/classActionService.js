/**
 * Class Action Lawsuit search service
 * @module lib/classActionService
 */

import * as cheerio from 'cheerio';
import { scoreOpportunityMatch } from './claude.js';

/**
 * Mock class action database (in production, this would connect to real APIs)
 * These are real examples of current/recent settlements
 */
const CLASS_ACTION_DATABASE = [
  {
    id: 'facebook-privacy-2024',
    company: 'Meta (Facebook)',
    title: 'Facebook Privacy Settlement',
    amount: '$725 million',
    estimatedPayout: '$30-$200',
    description: 'Settlement for Facebook users between 2007-2022 regarding data privacy',
    eligibility: 'Any US Facebook user between May 2007 and December 2022',
    deadline: '2024-08-25',
    claimUrl: 'https://www.facebookuserprivacysettlement.com',
    categories: ['privacy', 'social media', 'data breach']
  },
  {
    id: 'google-plus-2024',
    company: 'Google',
    title: 'Google Plus Data Breach',
    amount: '$7.5 million',
    estimatedPayout: '$5-$12',
    description: 'Settlement for Google Plus users affected by data breach',
    eligibility: 'Google Plus users between 2015-2019',
    deadline: '2024-10-08',
    claimUrl: 'https://www.googleplusdatalitigation.com',
    categories: ['privacy', 'social media', 'data breach']
  },
  {
    id: 'zoom-privacy-2024',
    company: 'Zoom',
    title: 'Zoom Privacy Settlement',
    amount: '$85 million',
    estimatedPayout: '$15-$25',
    description: 'Settlement for Zoom users regarding privacy and "Zoombombing"',
    eligibility: 'Zoom users between March 2016 and July 2021',
    deadline: '2024-07-15',
    claimUrl: 'https://www.zoomsettlement.com',
    categories: ['privacy', 'video conferencing', 'security']
  },
  {
    id: 'tiktok-illinois-2024',
    company: 'TikTok',
    title: 'TikTok Biometric Privacy',
    amount: '$92 million',
    estimatedPayout: '$27-$167',
    description: 'Settlement for Illinois TikTok users regarding biometric data',
    eligibility: 'Illinois residents who used TikTok',
    deadline: '2024-09-01',
    claimUrl: 'https://www.tiktokdataprivacysettlement.com',
    categories: ['privacy', 'biometric', 'social media']
  },
  {
    id: 'fortnite-refund-2024',
    company: 'Epic Games',
    title: 'Fortnite FTC Refund',
    amount: '$245 million',
    estimatedPayout: '$20-$500',
    description: 'FTC refunds for unwanted Fortnite charges',
    eligibility: 'Parents whose children made unauthorized purchases',
    deadline: '2025-01-10',
    claimUrl: 'https://www.ftc.gov/fortnite',
    categories: ['gaming', 'refund', 'consumer protection']
  },
  {
    id: 'walmart-weighted-goods-2024',
    company: 'Walmart',
    title: 'Walmart Weighted Goods',
    amount: '$45 million',
    estimatedPayout: '$10-$500',
    description: 'Settlement for overcharged weighted goods and bagged citrus',
    eligibility: 'Purchased weighted goods or bagged citrus at Walmart 2018-2024',
    deadline: '2024-11-02',
    claimUrl: 'https://www.walmartweightedgoodssettlement.com',
    categories: ['retail', 'overcharge', 'consumer']
  },
  {
    id: 'apple-butterfly-keyboard-2024',
    company: 'Apple',
    title: 'MacBook Butterfly Keyboard',
    amount: '$50 million',
    estimatedPayout: '$50-$395',
    description: 'Settlement for defective butterfly keyboards in MacBooks',
    eligibility: 'Purchased MacBook with butterfly keyboard 2015-2019',
    deadline: '2024-12-15',
    claimUrl: 'https://www.keyboardsettlement.com',
    categories: ['technology', 'product defect', 'computer']
  },
  {
    id: 'verizon-admin-fee-2024',
    company: 'Verizon',
    title: 'Verizon Administrative Fees',
    amount: '$100 million',
    estimatedPayout: '$15-$100',
    description: 'Settlement for undisclosed administrative charges',
    eligibility: 'Verizon postpaid customers 2016-2023',
    deadline: '2024-08-20',
    claimUrl: 'https://www.verizonadminfeesettlement.com',
    categories: ['telecom', 'fees', 'consumer']
  }
];

/**
 * Search class action database based on user data
 * @param {Object} userData - User information for matching
 * @returns {Promise<Array>} Array of matching class actions
 */
export async function searchClassActions(userData) {
  try {
    const results = [];

    // Filter settlements by basic criteria
    for (const settlement of CLASS_ACTION_DATABASE) {
      // Check if deadline has passed
      const deadline = new Date(settlement.deadline);
      if (deadline < new Date()) {
        continue;
      }

      // Score match with AI if user data provided
      let matchScore = 50; // Default score
      let eligibilityInfo = {
        likely_eligible: true,
        reasons: ['General eligibility - review requirements']
      };

      if (userData && Object.keys(userData).length > 0) {
        try {
          const scoreResult = await scoreOpportunityMatch(userData, settlement);
          matchScore = scoreResult.score;
          eligibilityInfo = {
            likely_eligible: scoreResult.likely_eligible,
            reasons: scoreResult.reasons
          };
        } catch (error) {
          console.error('Error scoring match:', error);
        }
      }

      // Include settlements with score > 30
      if (matchScore > 30) {
        results.push({
          ...settlement,
          matchScore,
          eligibilityInfo,
          source_type: 'class_action'
        });
      }
    }

    // Sort by match score and payout amount
    results.sort((a, b) => {
      // First by match score
      if (b.matchScore !== a.matchScore) {
        return b.matchScore - a.matchScore;
      }
      // Then by estimated payout
      const aMax = parseInt(a.estimatedPayout.split('-')[1] || '0');
      const bMax = parseInt(b.estimatedPayout.split('-')[1] || '0');
      return bMax - aMax;
    });

    return results;
  } catch (error) {
    console.error('Error searching class actions:', error);
    throw new Error('Failed to search class action settlements');
  }
}

/**
 * Scrape class action websites for updates (placeholder)
 * @param {string} url - URL to scrape
 * @returns {Promise<Object>} Scraped data
 */
export async function scrapeClassActionSite(url) {
  try {
    // In production, this would actually scrape the website
    // For now, return mock data
    console.log('Would scrape:', url);

    return {
      success: true,
      message: 'Scraping functionality would be implemented here',
      url: url
    };
  } catch (error) {
    console.error('Error scraping site:', error);
    throw new Error('Failed to scrape class action site');
  }
}

/**
 * Get details for a specific class action
 * @param {string} settlementId - Settlement ID
 * @returns {Object} Settlement details
 */
export function getClassActionDetails(settlementId) {
  const settlement = CLASS_ACTION_DATABASE.find(s => s.id === settlementId);

  if (!settlement) {
    throw new Error('Settlement not found');
  }

  return settlement;
}

/**
 * Check if user has already claimed a settlement
 * @param {string} userId - User ID
 * @param {string} settlementId - Settlement ID
 * @returns {Promise<boolean>} True if already claimed
 */
export async function hasUserClaimed(userId, settlementId) {
  // This would check the database in production
  // For now, return false
  return false;
}