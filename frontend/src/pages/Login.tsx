import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { authConfigured } from "../lib/supabase";

const GITHUB_PATH =
  "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z";

export default function Login() {
  const { user, loading, signInWithGitHub, continueAsGuest } = useAuth();
  if (!loading && user) return <Navigate to="/builder" replace />;

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="panel w-full max-w-md p-8">
        <div className="mb-6 flex items-center gap-3">
          <img src="/favicon.svg" className="h-10 w-10" alt="" />
          <div>
            <h1 className="text-2xl font-semibold">NeuraSim</h1>
            <p className="text-sm text-slate-400">Interactive spiking neural network simulator</p>
          </div>
        </div>
        <p className="mb-6 text-sm leading-relaxed text-slate-300">
          Build networks of biologically-inspired neurons, watch them spike in real time, and see why
          event-driven computation is so energy efficient.
        </p>
        <button
          className="btn-primary w-full justify-center py-2.5"
          disabled={!authConfigured}
          onClick={signInWithGitHub}
        >
          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
            <path d={GITHUB_PATH} />
          </svg>
          Sign in with GitHub
        </button>
        {!authConfigured && (
          <p className="mt-2 text-xs text-amber-300/80">
            Supabase is not configured (set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY). Guest mode is
            fully functional.
          </p>
        )}
        <button className="btn-ghost mt-3 w-full justify-center py-2.5" onClick={continueAsGuest}>
          Continue as guest
        </button>
      </div>
    </div>
  );
}
