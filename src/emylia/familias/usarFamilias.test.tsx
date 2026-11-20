// 20/11: os hooks das famílias gravadas na base: a lista (a ler, erro com «Tentar de novo», ok), guardar e apagar a reler a lista, e a marca «noutra família».
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dados = vi.hoisted(() => ({ lerFamilias: vi.fn(), guardarFamilia: vi.fn(), apagarFamilia: vi.fn(), familiasDosProdutos: vi.fn() }));
vi.mock("./familiasDados", async (orig) => ({ ...(await orig<typeof import("./familiasDados")>()), ...dados }));

import { useFamilias, useFamiliasDosProdutos } from "./usarFamilias";

const ORG = "org-1";
const R1 = { id: "f1", nome: "Velar", nProdutos: 2, versao: "v1" };
const R2 = { id: "f2", nome: "Roca", nProdutos: 1, versao: "v1" };
beforeEach(() => {
  Object.values(dados).forEach((f) => f.mockReset());
  dados.lerFamilias.mockResolvedValue({ ok: true, v: [R1] });
});
afterEach(() => vi.clearAllMocks());

describe("useFamilias: carregar", () => {
  it("começa a ler e fica ok com a lista da organização", async () => {
    const { result } = renderHook(() => useFamilias(ORG));
    expect(result.current.estado).toEqual({ k: "a-ler" });
    await waitFor(() => expect(result.current.estado).toEqual({ k: "ok", familias: [R1] }));
    expect(dados.lerFamilias).toHaveBeenCalledWith(ORG);
  });

  it("um erro fica em «erro»; «tentar» volta a ler", async () => {
    dados.lerFamilias.mockResolvedValueOnce({ ok: false, erro: "Sem ligação." });
    const { result } = renderHook(() => useFamilias(ORG));
    await waitFor(() => expect(result.current.estado).toEqual({ k: "erro", erro: "Sem ligação." }));
    act(() => result.current.tentar());
    await waitFor(() => expect(result.current.estado).toEqual({ k: "ok", familias: [R1] }));
    expect(dados.lerFamilias).toHaveBeenCalledTimes(2);
  });
});

describe("useFamilias: escrever", () => {
  it("criar devolve o que a base gravou e relê a lista (sem voltar a «a ler»)", async () => {
    dados.guardarFamilia.mockResolvedValue({ ok: true, v: { id: "f2", nome: "Roca", versao: "v1" } });
    const { result } = renderHook(() => useFamilias(ORG));
    await waitFor(() => expect(result.current.estado.k).toBe("ok"));
    dados.lerFamilias.mockResolvedValue({ ok: true, v: [R1, R2] });
    let r: unknown;
    await act(async () => { r = await result.current.guardar({ id: null, nome: "Roca", eixos: [], produtos: ["p1"], versao: null }); });
    expect(r).toEqual({ ok: true, v: { id: "f2", nome: "Roca", versao: "v1" } });
    expect(dados.guardarFamilia).toHaveBeenCalledWith(ORG, { id: null, nome: "Roca", eixos: [], produtos: ["p1"], versao: null });
    expect(result.current.estado).toEqual({ k: "ok", familias: [R1, R2] });
  });

  it("editar leva a versão; o conflito (CT004) volta como erro e a lista relê-se", async () => {
    dados.guardarFamilia.mockResolvedValue({ ok: false, erro: "A família foi alterada por outra pessoa: reabra-a.", codigo: "CT004" });
    const { result } = renderHook(() => useFamilias(ORG));
    await waitFor(() => expect(result.current.estado.k).toBe("ok"));
    let r: unknown;
    await act(async () => { r = await result.current.guardar({ id: "f1", nome: "Velar", eixos: [], produtos: ["p1"], versao: "v0" }); });
    expect(r).toMatchObject({ ok: false, codigo: "CT004" });
    expect(dados.lerFamilias).toHaveBeenCalledTimes(2);
  });

  it("um erro de rede ao guardar não relê a lista (a lista que se vê fica)", async () => {
    dados.guardarFamilia.mockResolvedValue({ ok: false, erro: "Sem ligação." });
    const { result } = renderHook(() => useFamilias(ORG));
    await waitFor(() => expect(result.current.estado.k).toBe("ok"));
    await act(async () => { await result.current.guardar({ id: null, nome: "X", eixos: [], produtos: ["p1"], versao: null }); });
    expect(dados.lerFamilias).toHaveBeenCalledTimes(1);
    expect(result.current.estado).toEqual({ k: "ok", familias: [R1] });
  });

  it("apagar chama a base e relê a lista", async () => {
    dados.apagarFamilia.mockResolvedValue({ ok: true, v: { ok: true } });
    const { result } = renderHook(() => useFamilias(ORG));
    await waitFor(() => expect(result.current.estado.k).toBe("ok"));
    dados.lerFamilias.mockResolvedValue({ ok: true, v: [] });
    await act(async () => { await result.current.apagar("f1"); });
    expect(dados.apagarFamilia).toHaveBeenCalledWith(ORG, "f1");
    expect(result.current.estado).toEqual({ k: "ok", familias: [] });
  });
});

describe("useFamiliasDosProdutos: a marca «já está noutra família»", () => {
  it("marca os produtos que estão noutra família, menos a que se edita", async () => {
    dados.familiasDosProdutos.mockResolvedValue({ ok: true, v: new Map([["a", { familiaId: "f1", nome: "Velar" }], ["b", { familiaId: "f2", nome: "Roca" }]]) });
    const { result } = renderHook(() => useFamiliasDosProdutos(ORG, ["a", "b", "c"], "f1"));
    await waitFor(() => expect([...result.current.ocupados]).toEqual(["b"]));
    expect(result.current.erro).toBeNull();
    expect(dados.familiasDosProdutos).toHaveBeenCalledWith(ORG, ["a", "b", "c"]);
  });

  it("uma falha não bloqueia: fica sem marcas e com o erro", async () => {
    dados.familiasDosProdutos.mockResolvedValue({ ok: false, erro: "Sem ligação." });
    const { result } = renderHook(() => useFamiliasDosProdutos(ORG, ["a"], null));
    await waitFor(() => expect(result.current.erro).toBe("Sem ligação."));
    expect(result.current.ocupados.size).toBe(0);
  });

  it("a função ainda por criar na base não conta como erro", async () => {
    dados.familiasDosProdutos.mockResolvedValue({ ok: false, erro: "Ainda não disponível nesta base" });
    const { result } = renderHook(() => useFamiliasDosProdutos(ORG, ["a"], null));
    await waitFor(() => expect(dados.familiasDosProdutos).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });
    expect(result.current.erro).toBeNull();
  });
});
