import { Navigate, Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { OperacaoLayout } from "./components/OperacaoLayout";
import { Spinner } from "./components/ui";
import Login from "./pages/Login";
import Hoje from "./pages/Hoje";
import Ordens from "./pages/Ordens";

// A ficha e a árvore de locais só carregam quando alguém lá vai — mantém o
// arranque leve para quem abre a app no telemóvel, em obra.
const OrdemDetalhe = lazy(() => import("./pages/OrdemDetalhe"));
const Locais = lazy(() => import("./pages/Locais"));

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <ProtectedRoute>
            <OperacaoLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Hoje />} />
        <Route path="/ordens" element={<Ordens />} />
        <Route
          path="/ordens/:codigo"
          element={
            <Suspense fallback={<Spinner label="A carregar a ordem…" />}>
              <OrdemDetalhe />
            </Suspense>
          }
        />
        <Route
          path="/locais"
          element={
            <Suspense fallback={<Spinner label="A carregar os locais…" />}>
              <Locais />
            </Suspense>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
