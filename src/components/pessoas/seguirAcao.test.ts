import { describe, expect, it, vi } from "vitest";
import { chaveDoErroAcao, seguirAcao } from "./seguirAcao";

describe("seguirAcao", () => {
  it("uma ação síncrona (sem Promise) chama aoOk logo, sem esperar", () => {
    const aoOk = vi.fn();
    const aoErro = vi.fn();
    seguirAcao(undefined, aoOk, aoErro);
    expect(aoOk).toHaveBeenCalledTimes(1);
    expect(aoErro).not.toHaveBeenCalled();
  });

  it("uma Promise só chama aoOk depois de terminar", async () => {
    const aoOk = vi.fn();
    const aoErro = vi.fn();
    let terminar: () => void = () => undefined;
    seguirAcao(new Promise<void>((r) => { terminar = r; }), aoOk, aoErro);
    expect(aoOk).not.toHaveBeenCalled();
    terminar();
    await Promise.resolve();
    await Promise.resolve();
    expect(aoOk).toHaveBeenCalledTimes(1);
    expect(aoErro).not.toHaveBeenCalled();
  });

  it("uma Promise rejeitada chama aoErro com o erro e nunca aoOk", async () => {
    const aoOk = vi.fn();
    const aoErro = vi.fn();
    const erro = new Error("falhou");
    seguirAcao(Promise.reject(erro), aoOk, aoErro);
    await Promise.resolve();
    await Promise.resolve();
    expect(aoErro).toHaveBeenCalledExactlyOnceWith(erro);
    expect(aoOk).not.toHaveBeenCalled();
  });
});

describe("chaveDoErroAcao", () => {
  it("devolve a chave de um erro que a traz", () => {
    expect(chaveDoErroAcao({ chave: "pessoasPagina.erroNeg.ng011" })).toBe("pessoasPagina.erroNeg.ng011");
  });

  it("qualquer outra coisa dá a mensagem genérica (nunca o texto cru do erro)", () => {
    const generica = "pessoasPagina.erroNeg.generico";
    expect(chaveDoErroAcao(new Error("duplicate key value violates"))).toBe(generica);
    expect(chaveDoErroAcao(null)).toBe(generica);
    expect(chaveDoErroAcao("texto")).toBe(generica);
    expect(chaveDoErroAcao({ chave: "" })).toBe(generica);
    expect(chaveDoErroAcao({ chave: 3 })).toBe(generica);
  });
});
