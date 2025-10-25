/**
 * Shared Zod validation schemas for edge functions
 * Ensures consistent input validation across all endpoints
 */
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

// Common validation patterns
const OWNER_REGEX = /^[a-zA-Z0-9-]+$/;
const REPO_REGEX = /^[a-zA-Z0-9._-]+$/;
const BRANCH_REGEX = /^[a-zA-Z0-9._/-]+$/;
const MAX_FILE_SIZE = 10485760; // 10MB
const MAX_PATH_LENGTH = 4096;

// Shared field validators
export const ownerField = z
  .string()
  .min(1)
  .max(39)
  .regex(OWNER_REGEX, 'Invalid owner name - only alphanumeric and hyphens allowed');

export const repoField = z
  .string()
  .min(1)
  .max(100)
  .regex(REPO_REGEX, 'Invalid repo name - only alphanumeric, dots, underscores, and hyphens allowed');

export const pathField = z
  .string()
  .max(MAX_PATH_LENGTH, `Path must be less than ${MAX_PATH_LENGTH} characters`)
  .refine(
    (p) => !p.includes('..') && !p.startsWith('/'),
    'Path traversal not allowed - cannot contain ".." or start with "/"'
  );

export const requiredPathField = z
  .string()
  .min(1, 'Path cannot be empty')
  .max(MAX_PATH_LENGTH, `Path must be less than ${MAX_PATH_LENGTH} characters`)
  .refine(
    (p) => !p.includes('..') && !p.startsWith('/'),
    'Path traversal not allowed - cannot contain ".." or start with "/"'
  );

export const branchField = z
  .string()
  .min(1)
  .max(255)
  .regex(BRANCH_REGEX, 'Invalid branch name - only alphanumeric, dots, underscores, slashes, and hyphens allowed');

export const contentField = z
  .string()
  .max(MAX_FILE_SIZE, `Content must be less than ${MAX_FILE_SIZE / 1024 / 1024}MB`);

export const commitMessageField = z
  .string()
  .min(1)
  .max(500, 'Commit message must be less than 500 characters');

export const refField = z
  .string()
  .min(1)
  .max(255)
  .refine(
    (r) => !r.includes('..') && !r.includes('\0'),
    'Invalid ref - cannot contain ".." or null bytes'
  );

// Common schemas for typical operations
export const fileOperationSchema = z.object({
  owner: ownerField,
  repo: repoField,
  path: pathField,
  branch: branchField.optional().default('main'),
  provider_token: z.string().min(1, 'GitHub token required'),
});

export const repoOperationSchema = z.object({
  owner: ownerField,
  repo: repoField,
  provider_token: z.string().min(1, 'GitHub token required'),
});

// Batch operation limits
export const MAX_BATCH_SIZE = 100;

export const batchItemsField = z
  .array(z.any())
  .max(MAX_BATCH_SIZE, `Batch operations limited to ${MAX_BATCH_SIZE} items`);
