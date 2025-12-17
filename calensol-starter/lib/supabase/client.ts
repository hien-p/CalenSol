import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types';

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Singleton client for client-side usage
let browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function getSupabaseClient() {
  if (!browserClient) {
    browserClient = createClient();
  }
  return browserClient;
}
