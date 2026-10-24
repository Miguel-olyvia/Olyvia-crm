// A configuração do Workflow que as ações de um negócio usam: a do provider da página «Negócio e metas»; fora dele (a página de Pessoas), a
// que ficou guardada neste navegador, ou a predefinição.
import { afterEach, describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { guardarWorkflow } from "./workflowGuardado";
import { useConfigWorkflow, WorkflowExemploContext, type WorkflowExemplo } from "./useWorkflowExemplo";
import { copiarConfig, PREDEFINICAO } from "./workflowNegocio";

afterEach(() => window.localStorage.clear());

describe("useConfigWorkflow", () => {
  it("sem provider nem nada guardado, é a predefinição", () => {
    const { result } = renderHook(() => useConfigWorkflow());
    expect(result.current).toEqual(PREDEFINICAO);
  });

  it("sem provider, usa a configuração guardada neste navegador (a que se escolheu em «Negócio e metas»)", () => {
    guardarWorkflow({ ...copiarConfig(PREDEFINICAO), propostaGanho: "criarContrato", motivosPerda: ["Preço", "Outro"] });
    const { result } = renderHook(() => useConfigWorkflow());
    expect(result.current).toMatchObject({ propostaGanho: "criarContrato", motivosPerda: ["Preço", "Outro"] });
  });

  it("com provider, vale a do provider", () => {
    const config = { ...copiarConfig(PREDEFINICAO), motivosPerda: ["Só este"] };
    const valor: WorkflowExemplo = { config, avisos: [], reposta: null, mudar: () => {}, repor: () => {}, limparAvisos: () => {} };
    const envolver = ({ children }: { children: ReactNode }) => <WorkflowExemploContext.Provider value={valor}>{children}</WorkflowExemploContext.Provider>;
    const { result } = renderHook(() => useConfigWorkflow(), { wrapper: envolver });
    expect(result.current).toBe(config);
  });
});
