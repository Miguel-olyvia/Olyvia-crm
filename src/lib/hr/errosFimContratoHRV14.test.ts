// HRV14: a base recusa o «Terminar» imediato de um contrato com itens por devolver («Ha N item(ns) por devolver.»). Os dois mapas de erros do fim
// de contrato (o real, em src/lib/hr, e a cópia do ecrã do RH) têm de a traduzir, nas cinco línguas, com o número que a base diz quando vem.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tabelaFundida } from "@/translations/tabelaFundida";

const captura = vi.hoisted(() => vi.fn());
vi.mock("@/lib/observability/captureFlowError", () => ({ captureFlowError: (...a: unknown[]) => captura(...a) }));
vi.mock("@/components/rh-exemplo/hooks/captureFlowError", () => ({ captureFlowError: (...a: unknown[]) => captura(...a) }));
// A cadeia de imports chega ao cliente Supabase, que rebenta sem VITE_SUPABASE_URL (um worktree sem .env): este teste não precisa dele.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import * as real from "@/lib/hr/errosFimContrato";
import * as exemplo from "@/components/rh-exemplo/lib/errosFimContrato";

const CHAVE = "hr.fimContrato.erro.HRV14";
const erroDaBase = (n: number) => ({ code: "HRV14", message: `Ha ${n} item(ns) por devolver.`, details: "Registe a devolução (ou a perda) de cada item antes de terminar o contrato." });

beforeEach(() => { captura.mockClear(); window.localStorage.setItem("language", "pt"); });

describe.each([["src/lib/hr", real], ["rh-exemplo/lib", exemplo]] as const)("HRV14 em %s/errosFimContrato", (_nome, modulo) => {
  it("tem a chave própria", () => {
    expect(modulo.chaveDeErroFimContrato({ code: "HRV14" })).toBe(CHAVE);
    expect(modulo.CHAVE_POR_CODIGO_FIM_CONTRATO.HRV14).toBe(CHAVE);
  });

  it("diz quantos itens há, na língua do ecrã, sem o código em bruto e sem ir para o registo de defeitos", async () => {
    const texto = await modulo.mensagemDeErroFimContrato(erroDaBase(3), "hr-contrato-fim-write");
    expect(texto).toBe("Há itens por devolver (3). Registe a devolução (ou a perda) de cada item antes de terminar o contrato.");
    expect(texto).not.toMatch(/HRV14|item\(ns\)/);
    expect(captura).not.toHaveBeenCalled();
  });

  it("sem número legível na mensagem fica o texto sem número", async () => {
    const texto = await modulo.mensagemDeErroFimContrato({ code: "HRV14", message: "outra coisa" }, "hr-contrato-fim-write");
    expect(texto).toBe("Há itens por devolver. Registe a devolução (ou a perda) de cada item antes de terminar o contrato.");
  });

  it("em inglês", async () => {
    window.localStorage.setItem("language", "en");
    const texto = await modulo.mensagemDeErroFimContrato(erroDaBase(1), "hr-contrato-fim-write");
    expect(texto).toBe("There are items to return (1). Record the return (or loss) of each item before ending the contract.");
  });
});

describe("HRV14 traduzido nas cinco línguas", () => {
  it.each(["en", "pt", "es", "fr", "de"] as const)("%s", (lingua) => {
    expect(tabelaFundida[lingua]?.[CHAVE], lingua).toBeTruthy();
  });
});
