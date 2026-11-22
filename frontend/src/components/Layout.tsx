import { NavLink, Outlet, Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

const links = [
  { to: "/builder", label: "Builder" },
  { to: "/dashboard", label: "Dashboard" },
  { to: "/presets", label: "Presets" },
  { to: "/benchmark", label: "Benchmark" },
];

export default function Layout() {
  const { user, loading, signOut } = useAuth();
  if (loading) return <div className="p-8 text-slate-400">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-ink-700 bg-ink-900 px-4 py-2">
        <div className="flex items-center gap-2">
          <img src="/favicon.svg" className="h-6 w-6" alt="" />
          <span className="font-semibold tracking-tight">NeuraSim</span>
        </div>
        <nav className="flex gap-1">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `rounded-md px-3 py-1.5 text-sm ${
                  isActive ? "bg-ink-700 text-white" : "text-slate-400 hover:text-slate-200"
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          {user.guest && <span className="chip bg-amber-500/15 text-amber-300">Guest mode</span>}
          {user.avatarUrl && <img src={user.avatarUrl} className="h-6 w-6 rounded-full" alt="" />}
          <span className="text-slate-300">{user.name}</span>
          <button className="btn-ghost py-1" onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
