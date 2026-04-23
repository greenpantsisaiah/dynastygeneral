/**
 * Server-only Supabase client using the service-role key. Bypasses RLS.
 * Use ONLY in webhook handlers and other system contexts where the
 * caller is verified by other means (Stripe signature, internal job).
 *
 * NEVER import this in a client component or in any handler that
 * doesn't already verify the caller.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// We don't generate Supabase Database types in v1; admin operations
// use a loose `any` schema. Service-role context bypasses RLS so the
// type system isn't where we enforce safety here; the webhook
// signature is. If/when we generate types (`supabase gen types
// typescript`), swap `any` for the generated Database type.
type AdminClient = SupabaseClient<any, "public", any>; // eslint-disable-line @typescript-eslint/no-explicit-any

let cached: AdminClient | null = null;

export function getAdminClient(): AdminClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
