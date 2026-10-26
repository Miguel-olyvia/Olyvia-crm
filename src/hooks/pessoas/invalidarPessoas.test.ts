import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { invalidarPessoas } from "./invalidarPessoas";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: vi.fn() }));
import { captureFlowError } from "@/lib/observability/captureFlowError";

describe("invalidarPessoas", () => {
  it("invalida a ficha da pessoa e o prefixo da lista, e mais nada", async () => {
    const client = new QueryClient();
    client.setQueryData(["neg-ficha-pessoa", "org-1", "p1"], { ok: 1 });
    client.setQueryData(["neg-ficha-pessoa", "org-1", "p2"], { ok: 2 });
    client.setQueryData(["neg-ficha-pessoa", "outra", "p1"], { ok: 3 });
    client.setQueryData(["neg-resumo-pessoas", "org-1", { papel: null }], { ok: 4 });
    client.setQueryData(["neg-resumo-pessoas", "outra", { papel: null }], { ok: 5 });
    client.setQueryData(["negocio-workflow-config", "org-1"], { ok: 6 });
    await invalidarPessoas(client, "org-1", "p1");
    const invalida = (chave: unknown[]) => client.getQueryState(chave)?.isInvalidated;
    expect(invalida(["neg-ficha-pessoa", "org-1", "p1"])).toBe(true);
    expect(invalida(["neg-resumo-pessoas", "org-1", { papel: null }])).toBe(true);
    expect(invalida(["neg-ficha-pessoa", "org-1", "p2"])).toBe(false);
    expect(invalida(["neg-ficha-pessoa", "outra", "p1"])).toBe(false);
    expect(invalida(["neg-resumo-pessoas", "outra", { papel: null }])).toBe(false);
    expect(invalida(["negocio-workflow-config", "org-1"])).toBe(false);
  });

  it("se refazer as queries rejeitar, não rejeita (a escrita já aconteceu) e regista o erro", async () => {
    const client = new QueryClient();
    vi.spyOn(client, "invalidateQueries").mockRejectedValue(new Error("falhou"));
    await expect(invalidarPessoas(client, "org-1", "p1")).resolves.toBeUndefined();
    expect(captureFlowError).toHaveBeenCalledTimes(1);
  });

  it("sem organização não invalida nada", async () => {
    const client = new QueryClient();
    client.setQueryData(["neg-ficha-pessoa", null, "p1"], { ok: 1 });
    await invalidarPessoas(client, null, "p1");
    expect(client.getQueryState(["neg-ficha-pessoa", null, "p1"])?.isInvalidated).toBe(false);
  });
});
