/**
 * Helper to invoke Supabase functions with automatic provider_token injection
 */
import { supabase } from "@/integrations/supabase/client";

export async function invokeFunction<T = any>(
  functionName: string,
  body: Record<string, any> = {}
): Promise<{ data: T | null; error: any }> {
  // Get session to extract provider_token
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.provider_token) {
    return {
      data: null,
      error: new Error('Authentication required. Please sign in again.')
    };
  }

  // Inject provider_token into all function calls
  return supabase.functions.invoke<T>(functionName, {
    body: {
      ...body,
      provider_token: session.provider_token
    }
  });
}
