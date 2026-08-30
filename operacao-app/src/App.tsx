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
const NovaOrdem = lazy(() => import("./pages/NovaOrdem"));

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
        {/* Antes de "/ordens/:codigo", senão "nova" seria lido como código. */}
        <Route
          path="/ordens/nova"
          element={
            <Suspense fallback={<Spinner label="A preparar o formulário…" />}>
              <NovaOrdem />
            </Suspense>
          }
        />
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
