// O hook da vista da família: a ler, erro (com «tentar» e o código da base), ok; uma resposta de um pedido antigo, ou depois de desmontar, descarta-se.
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dados = vi.hoisted(() => ({ lerFamiliaVista: vi.fn() }));
vi.mock("./familiasDados", async (orig) => ({ ...(await orig<typeof import("./familiasDados")>()), ...dados }));

import { SANITA } from "./fixturesFamiliaVista";
import { useFamiliaVista } from "./usarFamiliaVista";

beforeEach(() => { dados.lerFamiliaVista.mockReset(); dados.lerFamiliaVista.mockResolvedValue({ ok: true, v: SANITA }); });
afterEach(() => vi.clearAllMocks());

describe("useFamiliaVista", () => {
  it("começa a ler e fica ok com a família", async () => {
    const { result } = renderHook(() => useFamiliaVista("org-1", "f-sanita"));
    expect(result.current.estado).toEqual({ k: "a-ler" });
    await waitFor(() => expect(result.current.estado).toEqual({ k: "ok", familia: SANITA }));
    expect(dados.lerFamiliaVista).toHaveBeenCalledWith("org-1", "f-sanita");
  });

  it("um erro fica em «erro» com o texto e o código; «tentar» volta a ler", async () => {
    dados.lerFamiliaVista.mockResolvedValueOnce({ ok: false, erro: "Ainda não disponível nesta base", codigo: "PGRST202" });
    const { result } = renderHook(() => useFamiliaVista("org-1", "f-sanita"));
    await waitFor(() => expect(result.current.estado).toEqual({ k: "erro", erro: "Ainda não disponível nesta base", codigo: "PGRST202" }));
    act(() => result.current.tentar());
    expect(result.current.estado).toEqual({ k: "a-ler" });
    await waitFor(() => expect(result.current.estado.k).toBe("ok"));
    expect(dados.lerFamiliaVista).toHaveBeenCalledTimes(2);
  });

  it("uma promessa rejeitada também é um erro (nunca fica a ler para sempre)", async () => {
    dados.lerFamiliaVista.mockRejectedValueOnce(new Error("rede em baixo"));
    const { result } = renderHook(() => useFamiliaVista("org-1", "f-sanita"));
    await waitFor(() => expect(result.current.estado).toMatchObject({ k: "erro", erro: "rede em baixo" }));
  });

  it("mudar de família recomeça a ler e descarta a resposta da anterior", async () => {
    let soltar: (v: unknown) => void = () => undefined;
    dados.lerFamiliaVista.mockImplementationOnce(() => new Promise((r) => { soltar = r; }));
    const { result, rerender } = renderHook(({ id }) => useFamiliaVista("org-1", id), { initialProps: { id: "f1" } });
    rerender({ id: "f2" });
    await waitFor(() => expect(result.current.estado).toEqual({ k: "ok", familia: SANITA }));
    await act(async () => { soltar({ ok: true, v: { ...SANITA, nome: "ANTIGA" } }); });
    expect(result.current.estado).toEqual({ k: "ok", familia: SANITA });
  });
});
