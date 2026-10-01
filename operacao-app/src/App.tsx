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
const Orcamentos = lazy(() => import("./pages/Orcamentos"));
const Relatorio = lazy(() => import("./pages/Relatorio"));
const Planos = lazy(() => import("./pages/Planos"));
const Definicoes = lazy(() => import("./pages/Definicoes"));
const AjudaPagina = lazy(() => import("./pages/Ajuda"));
// Obras: fases, tarefas, Gantt, tempos e validação.
const Obras = lazy(() => import("./pages/Obras"));
const ObraDetalhe = lazy(() => import("./pages/ObraDetalhe"));
const ObraModelos = lazy(() => import("./pages/ObraModelos"));
const ObraMetricas = lazy(() => import("./pages/ObraMetricas"));
const MinhasTarefas = lazy(() => import("./pages/MinhasTarefas"));
const Validar = lazy(() => import("./pages/Validar"));

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
        {/* Obras. "modelos" e "metricas" antes de ":codigo", pela mesma razão de "/ordens/nova". */}
        <Route
          path="/obras"
          element={
            <Suspense fallback={<Spinner label="A carregar as obras…" />}>
              <Obras />
            </Suspense>
          }
        />
        <Route
          path="/obras/modelos"
          element={
            <Suspense fallback={<Spinner label="A carregar os modelos…" />}>
              <ObraModelos />
            </Suspense>
          }
        />
        <Route
          path="/obras/metricas"
          element={
            <Suspense fallback={<Spinner label="A calcular as métricas…" />}>
              <ObraMetricas />
            </Suspense>
          }
        />
        <Route
          path="/obras/:codigo"
          element={
            <Suspense fallback={<Spinner label="A carregar a obra…" />}>
              <ObraDetalhe />
            </Suspense>
          }
        />
        <Route
          path="/minhas-tarefas"
          element={
            <Suspense fallback={<Spinner label="A carregar as tuas tarefas…" />}>
              <MinhasTarefas />
            </Suspense>
          }
        />
        <Route
          path="/validar"
          element={
            <Suspense fallback={<Spinner label="A carregar a fila…" />}>
              <Validar />
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
