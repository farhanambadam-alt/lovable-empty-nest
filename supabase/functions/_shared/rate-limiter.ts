/**
 * Rate limiter for edge functions
 * Prevents abuse and DoS attacks by limiting requests per user
 */

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

// In-memory store for rate limiting (resets on function cold start)
// For production, consider using Redis or Supabase for persistent storage
const requestCounts = new Map<string, { count: number; resetAt: number }>();

/**
 * Default rate limit: 100 requests per minute per user
 */
const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  maxRequests: 100,
  windowMs: 60000, // 1 minute
};

/**
 * Check if a user has exceeded their rate limit
 * @param userId - The user's ID
 * @param config - Optional rate limit configuration
 * @returns true if request is allowed, false if rate limit exceeded
 */
export function checkRateLimit(
  userId: string,
  config: RateLimitConfig = DEFAULT_RATE_LIMIT
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const userKey = userId;
  
  // Get or initialize user's request data
  let userData = requestCounts.get(userKey);
  
  // Reset if window has expired
  if (!userData || now >= userData.resetAt) {
    userData = {
      count: 0,
      resetAt: now + config.windowMs,
    };
    requestCounts.set(userKey, userData);
  }
  
  // Increment request count
  userData.count++;
  
  // Check if limit exceeded
  const allowed = userData.count <= config.maxRequests;
  const remaining = Math.max(0, config.maxRequests - userData.count);
  
  return {
    allowed,
    remaining,
    resetAt: userData.resetAt,
  };
}

/**
 * Cleanup old entries from the rate limit store
 * Should be called periodically to prevent memory leaks
 */
export function cleanupRateLimitStore(): void {
  const now = Date.now();
  for (const [key, value] of requestCounts.entries()) {
    if (now >= value.resetAt) {
      requestCounts.delete(key);
    }
  }
}

/**
 * Get rate limit headers for response
 */
export function getRateLimitHeaders(
  result: ReturnType<typeof checkRateLimit>,
  config: RateLimitConfig = DEFAULT_RATE_LIMIT
): Record<string, string> {
  return {
    'X-RateLimit-Limit': config.maxRequests.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': Math.ceil(result.resetAt / 1000).toString(),
  };
}
