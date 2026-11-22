import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, authConfigured } from "./supabase";

export interface AppUser {
  id: string;
  name: string;
  avatarUrl?: string;
  guest: boolean;
}

interface AuthState {
  user: AppUser | null;
  loading: boolean;
  token: string | null;
  signInWithGitHub: () => Promise<void>;
  continueAsGuest: () => void;
  signOut: () => Promise<void>;
}

const GUEST: AppUser = { id: "guest", name: "Guest", guest: true };
const GUEST_KEY = "neurasim.guest";
const AuthContext = createContext<AuthState | null>(null);

function fromSession(session: Session | null): AppUser | null {
  if (!session) return null;
  const meta = session.user.user_metadata ?? {};
  return {
    id: session.user.id,
    name: meta.user_name ?? meta.full_name ?? session.user.email ?? "User",
    avatarUrl: meta.avatar_url,
    guest: false,
  };
}

function readGuestFlag(): boolean {
  try {
    return localStorage.getItem(GUEST_KEY) === "1";
  } catch {
    return false;
  }
}
function writeGuestFlag(on: boolean) {
  try {
    if (on) localStorage.setItem(GUEST_KEY, "1");
    else localStorage.removeItem(GUEST_KEY);
  } catch {
    /* storage unavailable: guest flag is per-tab only */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [guest, setGuest] = useState<boolean>(() => readGuestFlag());
  const [loading, setLoading] = useState<boolean>(authConfigured);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const value: AuthState = {
    user: fromSession(session) ?? (guest ? GUEST : null),
    token: session?.access_token ?? null,
    loading,
    async signInWithGitHub() {
      if (!supabase) return;
      await supabase.auth.signInWithOAuth({
        provider: "github",
        options: { redirectTo: `${window.location.origin}/builder` },
      });
    },
    continueAsGuest() {
      writeGuestFlag(true);
      setGuest(true);
    },
    async signOut() {
      writeGuestFlag(false);
      setGuest(false);
      if (supabase) await supabase.auth.signOut();
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** Token getter usable outside React (the API client). Kept in sync by <TokenBridge/>. */
let currentToken: string | null = null;
export const getToken = () => currentToken;
export function TokenBridge() {
  const { token } = useAuth();
  currentToken = token;
  return null;
}
