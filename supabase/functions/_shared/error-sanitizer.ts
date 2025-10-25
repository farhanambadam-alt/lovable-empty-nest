/**
 * Security-focused error sanitization for edge functions
 * Prevents information leakage to clients while logging details server-side
 */

export interface SanitizedError {
  message: string;
  status: number;
}

/**
 * Sanitizes GitHub API errors to prevent information disclosure
 * @param status - HTTP status code from GitHub API
 * @param rawError - Raw error message from GitHub (for server logs only)
 * @returns Sanitized error message safe for client consumption
 */
export function sanitizeGitHubError(status: number, rawError?: string): SanitizedError {
  // Log detailed error server-side only
  if (rawError) {
    console.error(`[GitHub API Error] Status ${status}:`, rawError);
  }

  // Return generic, safe messages to clients
  switch (status) {
    case 401:
      return {
        message: 'Authentication failed. Please reconnect your GitHub account.',
        status: 401
      };
    
    case 403:
      return {
        message: 'Insufficient permissions. Please check your GitHub access settings.',
        status: 403
      };
    
    case 404:
      return {
        message: 'Resource not found. The repository or file may have been deleted.',
        status: 404
      };
    
    case 409:
      return {
        message: 'Conflict detected. The resource may have been modified. Please refresh and try again.',
        status: 409
      };
    
    case 422:
      return {
        message: 'Invalid data provided. Please check your input and try again.',
        status: 422
      };
    
    case 429:
      return {
        message: 'Rate limit exceeded. Please wait a moment and try again.',
        status: 429
      };
    
    case 500:
    case 502:
    case 503:
      return {
        message: 'GitHub service temporarily unavailable. Please try again shortly.',
        status: 503
      };
    
    default:
      return {
        message: 'Operation failed. Please try again.',
        status: 500
      };
  }
}

/**
 * Sanitizes general errors for client consumption
 * @param error - Any error object
 * @returns Safe error message
 */
export function sanitizeGeneralError(error: unknown): string {
  // Log detailed error server-side
  console.error('[General Error]:', error);
  
  // Return generic message to client
  if (error instanceof Error) {
    // Only return safe, non-sensitive error messages
    const safeMessages = [
      'network',
      'timeout',
      'connection',
      'aborted'
    ];
    
    const errorMessage = error.message.toLowerCase();
    if (safeMessages.some(msg => errorMessage.includes(msg))) {
      return 'Network error. Please check your connection and try again.';
    }
  }
  
  return 'An unexpected error occurred. Please try again.';
}
