import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Null when Supabase env vars are absent: the app then runs in guest mode. */
export const supabase: SupabaseClient | null = url && anonKey ? createClient(url, anonKey) : null;
export const authConfigured = supabase !== null;
