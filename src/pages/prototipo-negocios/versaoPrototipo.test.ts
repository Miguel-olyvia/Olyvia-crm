import { afterEach, describe, expect, it, vi } from "vitest";
import { CHAVE_VERSAO, gravarVersao, lerVersao, versaoDe, vistaEquivalente } from "./versaoPrototipo";

afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe("versão do protótipo · o que fica guardado", () => {
  it("é compatível com o interruptor antigo: '1' é a V2 e '0' (ou nada) é a Atual", () => {
    expect(versaoDe("1")).toBe("v2");
    expect(versaoDe("0")).toBe("atual");
    expect(versaoDe(null)).toBe("atual");
    expect(versaoDe("funcional")).toBe("funcional");
    expect(versaoDe("lixo")).toBe("atual");
  });
  it("grava na mesma chave: a V2 continua '1' e a Atual '0', para quem voltar a uma versão antiga do protótipo", () => {
    gravarVersao("v2");
    expect(localStorage.getItem(CHAVE_VERSAO)).toBe("1");
    gravarVersao("atual");
    expect(localStorage.getItem(CHAVE_VERSAO)).toBe("0");
    gravarVersao("funcional");
    expect(localStorage.getItem(CHAVE_VERSAO)).toBe("funcional");
    expect(lerVersao()).toBe("funcional");
  });
  it("sem storage (o browser recusa) lê a Atual e gravar não rebenta", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("bloqueado"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("bloqueado"); });
    expect(lerVersao()).toBe("atual");
    expect(() => gravarVersao("v2")).not.toThrow();
  });
});

describe("versão do protótipo · a vista equivalente", () => {
  it("Leads e Clientes passam a Pessoas na V2 e na V2 funcional; Pessoas passa a Leads na Atual; as outras ficam", () => {
    expect(vistaEquivalente("leads", "v2")).toBe("pessoas");
    expect(vistaEquivalente("clientes", "funcional")).toBe("pessoas");
    expect(vistaEquivalente("pessoas", "atual")).toBe("leads");
    expect(vistaEquivalente("pessoas", "funcional")).toBe("pessoas");
    expect(vistaEquivalente("negocios", "atual")).toBe("negocios");
    expect(vistaEquivalente("hoje", "funcional")).toBe("hoje");
  });
});
