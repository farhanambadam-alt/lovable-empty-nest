-- Remove plaintext GitHub token storage from profiles table
-- This is a critical security improvement - tokens will now be fetched from Supabase Auth sessions

ALTER TABLE public.profiles DROP COLUMN IF EXISTS github_access_token;

-- Add comment to document why this column was removed
COMMENT ON TABLE public.profiles IS 'User profile data. GitHub tokens are now fetched from auth.sessions for security.';

-- Drop the update_user_github_token function as it's no longer needed
DROP FUNCTION IF EXISTS public.update_user_github_token(uuid, text, text, text);