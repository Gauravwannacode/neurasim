import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, TokenBridge } from "./lib/auth";
import Layout from "./components/Layout";
import Login from "./pages/Login";

// Pages are code-split: Plotly (~4 MB) is only loaded once a chart page is opened.
const Builder = lazy(() => import("./pages/Builder"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Presets = lazy(() => import("./pages/Presets"));
const Benchmark = lazy(() => import("./pages/Benchmark"));

const Loading = () => <div className="p-8 text-slate-500">Loading…</div>;

export default function App() {
  return (
    <AuthProvider>
      <TokenBridge />
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<Layout />}>
            <Route path="/builder" element={<Builder />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/presets" element={<Presets />} />
            <Route path="/benchmark" element={<Benchmark />} />
          </Route>
          <Route path="*" element={<Navigate to="/builder" replace />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  );
}
