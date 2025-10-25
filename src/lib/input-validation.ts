/**
 * Client-side input validation schemas using Zod
 * Provides defense-in-depth security by validating user inputs before submission
 */
import { z } from 'zod';

const MAX_FILE_SIZE = 10485760; // 10MB in bytes
const MAX_COMMIT_MESSAGE_LENGTH = 500;
const MAX_FILE_NAME_LENGTH = 255;
const MAX_PATH_LENGTH = 4096;

// File and folder name validation
const INVALID_FILE_CHARS_REGEX = /[<>:"/\\|?*\x00-\x1F]/;
const FILE_NAME_REGEX = /^[^<>:"/\\|?*\x00-\x1F]+$/;

// Branch name validation (alphanumeric, dots, underscores, slashes, hyphens)
const BRANCH_NAME_REGEX = /^[a-zA-Z0-9._\-\/]+$/;

// Repository name validation
const REPO_NAME_REGEX = /^[a-zA-Z0-9._-]+$/;

export const commitMessageSchema = z
  .string()
  .trim()
  .min(1, 'Commit message is required')
  .max(MAX_COMMIT_MESSAGE_LENGTH, `Commit message must be less than ${MAX_COMMIT_MESSAGE_LENGTH} characters`);

export const fileContentSchema = z
  .string()
  .max(MAX_FILE_SIZE, `File content must be less than ${MAX_FILE_SIZE / 1024 / 1024}MB`)
  .refine(
    (content) => new TextEncoder().encode(content).length <= MAX_FILE_SIZE,
    `File content must be less than ${MAX_FILE_SIZE / 1024 / 1024}MB (bytes)`
  );

export const fileNameSchema = z
  .string()
  .trim()
  .min(1, 'File name is required')
  .max(MAX_FILE_NAME_LENGTH, `File name must be less than ${MAX_FILE_NAME_LENGTH} characters`)
  .regex(FILE_NAME_REGEX, 'File name contains invalid characters (< > : " / \\ | ? *)')
  .refine(
    (name) => !name.startsWith('.') || name.length > 1,
    'File name cannot be just a dot'
  )
  .refine(
    (name) => name !== '.' && name !== '..',
    'File name cannot be "." or ".."'
  );

export const folderNameSchema = z
  .string()
  .trim()
  .min(1, 'Folder name is required')
  .max(MAX_FILE_NAME_LENGTH, `Folder name must be less than ${MAX_FILE_NAME_LENGTH} characters`)
  .regex(FILE_NAME_REGEX, 'Folder name contains invalid characters (< > : " / \\ | ? *)')
  .refine(
    (name) => name !== '.' && name !== '..',
    'Folder name cannot be "." or ".."'
  );

export const branchNameSchema = z
  .string()
  .trim()
  .min(1, 'Branch name is required')
  .max(255, 'Branch name must be less than 255 characters')
  .regex(BRANCH_NAME_REGEX, 'Branch name can only contain letters, numbers, dots, underscores, slashes, and hyphens');

export const pathSchema = z
  .string()
  .max(MAX_PATH_LENGTH, `Path must be less than ${MAX_PATH_LENGTH} characters`)
  .refine(
    (path) => !path.includes('..') && !path.startsWith('/'),
    'Path traversal not allowed - cannot contain ".." or start with "/"'
  );

export const repoNameSchema = z
  .string()
  .trim()
  .min(1, 'Repository name is required')
  .max(100, 'Repository name must be less than 100 characters')
  .regex(REPO_NAME_REGEX, 'Repository name can only contain alphanumeric characters, dots, underscores, and hyphens');

/**
 * Helper function to validate input and return user-friendly error messages
 */
export function validateInput<T>(schema: z.ZodSchema<T>, value: unknown): string | null {
  try {
    schema.parse(value);
    return null; // No error
  } catch (error) {
    if (error instanceof z.ZodError) {
      return error.errors[0].message;
    }
    return 'Validation failed';
  }
}
