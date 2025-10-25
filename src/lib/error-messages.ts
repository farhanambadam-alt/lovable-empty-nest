/**
 * Translates technical error messages into human-friendly ones
 */

interface ErrorContext {
  status?: number;
  message?: string;
  operation?: 'fetch' | 'update' | 'delete' | 'create' | 'upload';
}

export function getHumanFriendlyError(context: ErrorContext): {
  title: string;
  description: string;
} {
  const { status, message, operation = 'fetch' } = context;

  // Check for specific status codes first
  if (status) {
    switch (status) {
      case 404:
        return {
          title: "File not found",
          description: operation === 'fetch' 
            ? "This file doesn't exist anymore. It may have been deleted or moved."
            : "The file you're trying to modify doesn't exist.",
        };
      
      case 403:
        return {
          title: "Permission denied",
          description: "You don't have permission to edit this repository. Check your GitHub access settings.",
        };
      
      case 409:
        return {
          title: "Conflict detected",
          description: "Someone else updated this file. Please refresh and try again.",
        };
      
      case 401:
        return {
          title: "Authentication required",
          description: "Your session may have expired. Please sign in again.",
        };
      
      case 422:
        return {
          title: "Invalid request",
          description: "The changes you're trying to make aren't valid. Please check and try again.",
        };
      
      case 500:
      case 502:
      case 503:
        return {
          title: "Server error",
          description: "GitHub is having issues right now. Please try again in a few moments.",
        };
    }
  }

  // Check for common error messages
  if (message) {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('network') || lowerMessage.includes('fetch failed')) {
      return {
        title: "Connection problem",
        description: "Please check your internet connection and try again.",
      };
    }
    
    if (lowerMessage.includes('token') || lowerMessage.includes('authentication')) {
      return {
        title: "Authentication issue",
        description: "Your GitHub connection needs to be refreshed. Please reconnect your account.",
      };
    }
    
    if (lowerMessage.includes('rate limit')) {
      return {
        title: "Too many requests",
        description: "You've made too many requests. Please wait a minute and try again.",
      };
    }
  }

  // Default messages based on operation
  const operationMessages = {
    fetch: {
      title: "Couldn't load files",
      description: "Something went wrong while loading. Let's try that again.",
    },
    update: {
      title: "Couldn't save changes",
      description: "Your changes weren't saved. Please try again.",
    },
    delete: {
      title: "Couldn't delete file",
      description: "The file wasn't deleted. Please try again.",
    },
    create: {
      title: "Couldn't create file",
      description: "The file wasn't created. Please try again.",
    },
    upload: {
      title: "Upload failed",
      description: "Some files weren't uploaded. Please try again.",
    },
  };

  return operationMessages[operation];
}

/**
 * Extracts status code from various error objects
 */
export function extractErrorStatus(error: any): number | undefined {
  return error?.status || error?.response?.status || error?.statusCode;
}

/**
 * Extracts error message from various error objects
 */
export function extractErrorMessage(error: any): string | undefined {
  return error?.message || error?.error || error?.details || String(error);
}
