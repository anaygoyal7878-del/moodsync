import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

let cachedAdmin: SupabaseClient | null = null;

/**
 * Service-role client. Only ever used inside Edge Functions — it bypasses
 * RLS, so it must never be exposed to a client app.
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (cachedAdmin) return cachedAdmin;

  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables",
    );
  }

  cachedAdmin = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cachedAdmin;
}

/** Client scoped to the caller's JWT, so RLS applies normally. */
export function getSupabaseForRequest(req: Request): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anonKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variables",
    );
  }
  const authHeader = req.headers.get("Authorization") ?? "";
  return createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function requireUser(req: Request) {
  const client = getSupabaseForRequest(req);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return { user: data.user, client };
}
