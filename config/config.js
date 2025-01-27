const SOL_AMOUNT_THRESHOLD = 0.1;
const MAX_TX_LIMIT = 30;
const FRESH_THRESHHOLD = 30;
const maxRequestsPerSecond = 8; // Max requests per second
const delayBetweenRequests = 1000 / maxRequestsPerSecond; // Delay between requests to stay within the rate limit

module.exports = {
  SOL_AMOUNT_THRESHOLD,
  MAX_TX_LIMIT,
  maxRequestsPerSecond,
  delayBetweenRequests,
  FRESH_THRESHHOLD
};