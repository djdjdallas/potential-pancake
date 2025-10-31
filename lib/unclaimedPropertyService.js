/**
 * Unclaimed Property search service
 * @module lib/unclaimedPropertyService
 */

import * as cheerio from 'cheerio';

/**
 * State database URLs for unclaimed property
 * In production, these would be actual state database APIs
 */
const STATE_DATABASES = {
  'CA': {
    name: 'California',
    url: 'https://ucpi.sco.ca.gov',
    searchUrl: 'https://ucpi.sco.ca.gov/UCP/Default.aspx'
  },
  'NY': {
    name: 'New York',
    url: 'https://www.osc.state.ny.us',
    searchUrl: 'https://www.osc.state.ny.us/ouf'
  },
  'TX': {
    name: 'Texas',
    url: 'https://claimittexas.gov',
    searchUrl: 'https://claimittexas.gov/app/claim-search'
  },
  'FL': {
    name: 'Florida',
    url: 'https://fltreasurehunt.gov',
    searchUrl: 'https://fltreasurehunt.gov'
  },
  'IL': {
    name: 'Illinois',
    url: 'https://icash.illinoistreasurer.gov',
    searchUrl: 'https://icash.illinoistreasurer.gov'
  }
};

/**
 * Mock unclaimed property data for demonstration
 * In production, this would come from actual state database searches
 */
const MOCK_UNCLAIMED_PROPERTY = [
  {
    state: 'CA',
    propertyId: 'CA-2024-00123',
    ownerName: 'SAMPLE USER',
    amount: '$127.43',
    type: 'Bank Account',
    reportedBy: 'Wells Fargo Bank',
    dateReported: '2023-05-15',
    address: 'Los Angeles, CA'
  },
  {
    state: 'CA',
    propertyId: 'CA-2024-00456',
    ownerName: 'SAMPLE USER',
    amount: '$89.00',
    type: 'Utility Deposit',
    reportedBy: 'Southern California Edison',
    dateReported: '2022-11-20',
    address: 'San Francisco, CA'
  },
  {
    state: 'NY',
    propertyId: 'NY-2024-00789',
    ownerName: 'SAMPLE USER',
    amount: '$342.17',
    type: 'Insurance Refund',
    reportedBy: 'State Farm Insurance',
    dateReported: '2023-08-10',
    address: 'New York, NY'
  },
  {
    state: 'TX',
    propertyId: 'TX-2024-00234',
    ownerName: 'SAMPLE USER',
    amount: '$56.78',
    type: 'Payroll',
    reportedBy: 'Tech Company LLC',
    dateReported: '2023-02-28',
    address: 'Austin, TX'
  },
  {
    state: 'FL',
    propertyId: 'FL-2024-00567',
    ownerName: 'SAMPLE USER',
    amount: 'Over $100',
    type: 'Securities',
    reportedBy: 'TD Ameritrade',
    dateReported: '2023-06-15',
    address: 'Miami, FL'
  }
];

/**
 * Search a single state's unclaimed property database
 * @param {string} state - State abbreviation
 * @param {string} firstName - User's first name
 * @param {string} lastName - User's last name
 * @returns {Promise<Array>} Unclaimed property records
 */
export async function searchStateDatabase(state, firstName, lastName) {
  try {
    // In production, this would make actual API calls or scrape state websites
    // For demonstration, we'll return filtered mock data

    if (!STATE_DATABASES[state]) {
      throw new Error(`State ${state} not supported`);
    }

    // Simulate search with mock data
    const results = MOCK_UNCLAIMED_PROPERTY
      .filter(prop => prop.state === state)
      .map(prop => ({
        ...prop,
        ownerName: `${firstName} ${lastName}`.toUpperCase(),
        matchConfidence: 85 + Math.random() * 15, // 85-100% confidence
        claimUrl: `${STATE_DATABASES[state].searchUrl}?id=${prop.propertyId}`,
        source_type: 'unclaimed_property'
      }));

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));

    return results;
  } catch (error) {
    console.error(`Error searching ${state} database:`, error);
    throw new Error(`Failed to search ${state} unclaimed property database`);
  }
}

/**
 * Search all supported state databases
 * @param {Object} userData - User information including addresses
 * @returns {Promise<Array>} All unclaimed property found
 */
export async function searchAllStates(userData) {
  try {
    const { firstName, lastName, addresses = [] } = userData;

    if (!firstName || !lastName) {
      throw new Error('First and last name required for search');
    }

    // Get unique states from user's current and past addresses
    const statesToSearch = new Set();

    // Add states from addresses
    addresses.forEach(addr => {
      if (addr.state) {
        statesToSearch.add(addr.state.toUpperCase());
      }
    });

    // If no addresses provided, search major states
    if (statesToSearch.size === 0) {
      ['CA', 'NY', 'TX', 'FL', 'IL'].forEach(state => statesToSearch.add(state));
    }

    // Search each state in parallel
    const searchPromises = Array.from(statesToSearch).map(state =>
      searchStateDatabase(state, firstName, lastName).catch(err => {
        console.error(`Error searching ${state}:`, err);
        return []; // Return empty array on error
      })
    );

    const results = await Promise.all(searchPromises);

    // Flatten results from all states
    const allProperty = results.flat();

    // Sort by amount (highest first)
    allProperty.sort((a, b) => {
      const aAmount = parseFloat(a.amount.replace(/[^0-9.]/g, '')) || 0;
      const bAmount = parseFloat(b.amount.replace(/[^0-9.]/g, '')) || 0;
      return bAmount - aAmount;
    });

    return allProperty;
  } catch (error) {
    console.error('Error searching all states:', error);
    throw new Error('Failed to search unclaimed property databases');
  }
}

/**
 * Get list of supported states
 * @returns {Array} List of state objects
 */
export function getSupportedStates() {
  return Object.entries(STATE_DATABASES).map(([code, info]) => ({
    code,
    name: info.name,
    searchUrl: info.searchUrl
  }));
}

/**
 * Parse scraped state database HTML (placeholder)
 * @param {string} html - HTML content
 * @param {string} state - State code
 * @returns {Array} Parsed results
 */
export function parseStateResults(html, state) {
  try {
    const $ = cheerio.load(html);
    const results = [];

    // This would contain state-specific parsing logic
    // Each state has different HTML structure
    // For now, return empty array

    console.log(`Would parse HTML for state: ${state}`);

    return results;
  } catch (error) {
    console.error('Error parsing state results:', error);
    return [];
  }
}

/**
 * Estimate total unclaimed property for user
 * @param {Array} properties - Array of unclaimed properties
 * @returns {Object} Summary statistics
 */
export function calculatePropertyStats(properties) {
  let totalAmount = 0;
  let knownAmount = 0;
  let unknownCount = 0;

  properties.forEach(prop => {
    const amountStr = prop.amount;
    const amount = parseFloat(amountStr.replace(/[^0-9.]/g, ''));

    if (!isNaN(amount)) {
      totalAmount += amount;
      knownAmount += amount;
    } else if (amountStr.toLowerCase().includes('over')) {
      // For "Over $X" amounts, use the minimum
      const overAmount = parseFloat(amountStr.match(/\d+/)?.[0] || '100');
      totalAmount += overAmount;
      unknownCount++;
    } else {
      unknownCount++;
    }
  });

  return {
    totalProperties: properties.length,
    estimatedTotal: totalAmount,
    knownTotal: knownAmount,
    unknownCount,
    averageAmount: properties.length > 0 ? totalAmount / properties.length : 0
  };
}