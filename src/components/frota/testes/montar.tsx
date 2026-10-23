// Monta a Frota (/frota/*) num router de memória, com um QueryClient novo (o invalidateQueries fica espiado) e as
// pílulas do menu lateral (useContadoresFrota), para os testes verem os ecrãs ligados.
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import { LanguageProvider } from "@/contexts/LanguageContext";
import Frota from "@/pages/frota/Frota";
import { useContadoresFrota } from "../useContadoresFrota";
import type { EcraFrota } from "../contexto";

export const ECRAS: EcraFrota[] = ["hoje", "viaturas", "atribuicoes", "condutores", "manutencao", "custos", "ocorrencias", "documentos", "relatorios", "atividade", "ligacoes"];

function Contadores() {
  const c = useContadoresFrota();
  return <output data-testid="contadores">{JSON.stringify({ hoje: c("hoje"), viaturas: c("viaturas"), ocorrencias: c("ocorrencias"), manutencao: c("manutencao") })}</output>;
}
export const contadores = (): Record<string, number | null> => JSON.parse(screen.getByTestId("contadores").textContent ?? "{}");

export function novoQc(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
}

/** Abre a Frota em `caminho`; devolve o QueryClient e o espião do invalidateQueries. */
export function montar(caminho: string, qc = novoQc()) {
  const invalidar = vi.spyOn(qc, "invalidateQueries");
  const r = render(
    <QueryClientProvider client={qc}>
      <LanguageProvider>
        <MemoryRouter initialEntries={[caminho]}>
          <Contadores />
          <Routes>
            {ECRAS.map((e) => <Route key={e} path={`/frota/${e}`} element={<Frota key={e} ecra={e} />} />)}
          </Routes>
        </MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>,
  );
  return { ...r, qc, invalidar };
}

/** As chaves invalidadas (["frota", org, tabela] e as externas), para comparar com o mapa INVALIDA. */
export const chavesInvalidadas = (espiao: ReturnType<typeof vi.spyOn>): string[] =>
  espiao.mock.calls.map((c) => JSON.stringify((c[0] as { queryKey?: unknown } | undefined)?.queryKey ?? null));
