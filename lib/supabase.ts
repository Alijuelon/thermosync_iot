import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_SUPABASE_URL = 'https://yxjouwqlhxyavkvacffm.supabase.co';

/**
 * Strips accidental `/rest/v1` suffix or trailing slashes so
 * `@supabase/supabase-js` always targets the project root URL.
 */
export function normalizeSupabaseProjectUrl(rawUrl?: string): string {
  if (!rawUrl || !rawUrl.trim()) return DEFAULT_SUPABASE_URL;
  return rawUrl
    .trim()
    .replace(/\/rest\/v1\/?$/i, '')
    .replace(/\/+$/, '');
}

export const SUPABASE_PROJECT_URL = normalizeSupabaseProjectUrl(
  process.env.NEXT_PUBLIC_SUPABASE_URL
);

export const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_5Seo0EalLnpxVHfGbpS_pQ_w5bS7AJj';

let browserClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!browserClient) {
    browserClient = createClient(
      SUPABASE_PROJECT_URL,
      SUPABASE_PUBLISHABLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );
  }
  return browserClient;
}

export function getSupabaseServerClient(): SupabaseClient {
  const key = process.env.SUPABASE_SECRET_KEY || SUPABASE_PUBLISHABLE_KEY;
  return createClient(SUPABASE_PROJECT_URL, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
