import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, TokenBridge } from "./lib/auth";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Builder from "./pages/Builder";
import Dashboard from "./pages/Dashboard";
import Presets from "./pages/Presets";
import Benchmark from "./pages/Benchmark";

export default function App() {
  return (
    <AuthProvider>
      <TokenBridge />
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
    </AuthProvider>
  );
}
