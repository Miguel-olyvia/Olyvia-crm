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
const LocalDetalhe = lazy(() => import("./pages/LocalDetalhe"));
const NovaOrdem = lazy(() => import("./pages/NovaOrdem"));
const Orcamentos = lazy(() => import("./pages/Orcamentos"));
const Relatorio = lazy(() => import("./pages/Relatorio"));
const Planos = lazy(() => import("./pages/Planos"));
const Definicoes = lazy(() => import("./pages/Definicoes"));
const AjudaPagina = lazy(() => import("./pages/Ajuda"));
const Analises = lazy(() => import("./pages/Analises"));
const Agenda = lazy(() => import("./pages/Agenda"));

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
          path="/ordens/:codigo/relatorio"
          element={
            <Suspense fallback={<Spinner label="A montar o relatório…" />}>
              <Relatorio />
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
          path="/ajuda"
          element={
            <Suspense fallback={<Spinner label="A carregar…" />}>
              <AjudaPagina />
            </Suspense>
          }
        />
        <Route
          path="/definicoes"
          element={
            <Suspense fallback={<Spinner label="A carregar as definições…" />}>
              <Definicoes />
            </Suspense>
          }
        />
        <Route
          path="/planos"
          element={
            <Suspense fallback={<Spinner label="A carregar os planos…" />}>
              <Planos />
            </Suspense>
          }
        />
        <Route
          path="/orcamentos"
          element={
            <Suspense fallback={<Spinner label="A carregar os orçamentos…" />}>
              <Orcamentos />
            </Suspense>
          }
        />
        <Route
          path="/agenda"
          element={
            <Suspense fallback={<Spinner label="A montar o dia…" />}>
              <Agenda />
            </Suspense>
          }
        />
        <Route
          path="/analises"
          element={
            <Suspense fallback={<Spinner label="A somar o que já está gravado…" />}>
              <Analises />
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
        <Route
          path="/locais/:codigo"
          element={
            <Suspense fallback={<Spinner label="A carregar o local…" />}>
              <LocalDetalhe />
            </Suspense>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
