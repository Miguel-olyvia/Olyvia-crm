import { Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense } from "react";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { DucLayout } from "./components/DucLayout";
import { Spinner } from "./components/ui";
import Login from "./pages/Login";
import DucList from "./pages/DucList";
import DucDetail from "./pages/DucDetail";

// Editor visual (React Flow) só carrega quando se abre /config — mantém o bundle
// de arranque leve.
const DucConfig = lazy(() => import("./pages/DucConfig"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Help = lazy(() => import("./pages/Help"));
const Dashboard = lazy(() => import("./pages/Dashboard"));

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <ProtectedRoute>
            <DucLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<DucList />} />
        <Route
          path="/dashboard"
          element={
            <Suspense fallback={<Spinner label="A carregar dashboard…" />}>
              <Dashboard />
            </Suspense>
          }
        />
        <Route path="/duc/:id" element={<DucDetail />} />
        <Route
          path="/config"
          element={
            <Suspense fallback={<Spinner label="A carregar editor…" />}>
              <DucConfig />
            </Suspense>
          }
        />
        <Route
          path="/notificacoes"
          element={
            <Suspense fallback={<Spinner label="A carregar…" />}>
              <Notifications />
            </Suspense>
          }
        />
        <Route
          path="/ajuda"
          element={
            <Suspense fallback={<Spinner label="A carregar…" />}>
              <Help />
            </Suspense>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
