import { useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { motion } from "motion/react";
import { useAuth } from "../lib/auth";
import CommandPalette from "./CommandPalette";

const links = [
  { to: "/builder", label: "Builder" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/explore", label: "Explore" },
  { to: "/presets", label: "Circuits" },
  { to: "/benchmark", label: "Benchmark" },
];

export default function Layout() {
  const { user, loading, signOut } = useAuth();
  const { pathname, search, hash } = useLocation();
  const [palette, setPalette] = useState(false);
  if (loading) return <div className="p-8 text-slate-400">Loading…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: pathname + search + hash }} />;

  return (
    <div className="flex h-full flex-col">
      <header className="relative z-20 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-ink-700 bg-ink-950 px-4 py-2.5">
        <Link to="/" className="flex items-center gap-2 text-bone">
          <img src="/favicon.svg" className="h-6 w-6" alt="" />
          <span className="text-lg font-semibold tracking-tight">NeuraSim</span>
        </Link>
        <nav className="order-last flex w-full overflow-x-auto sm:justify-center md:absolute md:left-1/2 md:order-none md:w-auto md:-translate-x-1/2" aria-label="Main">
          <div className="flex rounded-full border border-ink-700 bg-ink-900 p-1">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className={({ isActive }) => `relative rounded-full px-2.5 py-1.5 text-sm transition-colors sm:px-4 ${isActive ? "text-ink-950" : "text-slate-400 hover:text-bone"}`}>
                {({ isActive }) => (
                  <>
                    {isActive && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-full bg-bone" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                    <span className="relative font-medium">{l.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
        <div className="ml-auto flex items-center gap-2 text-sm">
          <button className="btn-ghost" onClick={() => setPalette(true)} aria-label="Open command palette">
            <span className="lg:inline">Search</span> <kbd className="hidden font-mono text-xs text-slate-400 lg:inline">Ctrl K</kbd>
          </button>
          {user.avatarUrl && <img src={user.avatarUrl} className="h-7 w-7 rounded-full" alt="" />}
          <span className="hidden text-slate-300 xl:inline">{user.name}</span>
          <button className="btn text-slate-400 hover:text-bone" onClick={signOut}>{user.guest ? "Leave" : "Sign out"}</button>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-auto">
        <Outlet />
      </main>
      <CommandPalette open={palette} setOpen={setPalette} />
    </div>
  );
}
