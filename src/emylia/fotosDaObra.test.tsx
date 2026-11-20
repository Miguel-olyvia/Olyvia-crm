// 20/11/2026 (auditoria de 19/11, Lote 3, dados): mostrar uma fotografia da obra que pode ser uma referência à base ou um data URL antigo,
// e escolher as fotografias de um envio sem limite escondido (antes ficavam só as 4 últimas, caladas).
import { act, render, renderHook, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const guardar = vi.fn();
const apagar = vi.fn(async () => {});
const imagem = vi.fn();
vi.mock("./real/obraFotosReal", async (orig) => ({
  ...(await orig<typeof import("./real/obraFotosReal")>()),
  guardarFotoObra: (...a: unknown[]) => guardar(...a),
  apagarFotoObra: (...a: unknown[]) => apagar(...(a as [])),
  imagemDaFotoObra: (...a: unknown[]) => imagem(...a),
}));

import { EstadoFotos, FotoObra, useFotosAJuntar } from "./fotosDaObra";

const ref = (n: number) => `obrafoto:00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ficheiro = (n: number) => Object.assign(new Blob([String(n)], { type: "image/jpeg" }), { n });
const numDe = (f: unknown) => (f as { n: number }).n;

beforeEach(() => { guardar.mockReset(); apagar.mockClear(); imagem.mockReset(); });

describe("FotoObra", () => {
  it("um data URL antigo mostra-se logo, sem ir à base", () => {
    render(<FotoObra src="data:image/jpeg;base64,AAAA" alt="Antiga" />);
    expect(screen.getByRole("img", { name: "Antiga" })).toHaveAttribute("src", "data:image/jpeg;base64,AAAA");
    expect(imagem).not.toHaveBeenCalled();
  });

  it("uma referência: um rectângulo enquanto lê, depois a imagem", async () => {
    imagem.mockResolvedValue("blob:http://x/1");
    render(<FotoObra src={ref(1)} alt="Do técnico" className="h-20 w-28" />);
    expect(screen.getByRole("img", { name: "Do técnico" }).tagName).toBe("SPAN");
    await waitFor(() => expect(screen.getByRole("img", { name: "Do técnico" })).toHaveAttribute("src", "blob:http://x/1"));
    expect(imagem).toHaveBeenCalledWith(ref(1));
  });

  it("uma referência que não se consegue ler diz que está indisponível", async () => {
    imagem.mockRejectedValue(new Error("Sem permissão"));
    render(<FotoObra src={ref(2)} alt="Do técnico" />);
    await waitFor(() => expect(screen.getByRole("img", { name: "Do técnico: fotografia indisponível" })).toBeInTheDocument());
  });
});

describe("useFotosAJuntar", () => {
  it("guarda cada fotografia ao escolher e fica a referência (com o número do negócio)", async () => {
    guardar.mockImplementation(async (_n: number, f: Blob) => ref(numDe(f)));
    const { result } = renderHook(() => useFotosAJuntar(1026));
    await act(async () => { await result.current.juntar([ficheiro(1), ficheiro(2)]); });
    expect(result.current.fotos).toEqual([ref(1), ref(2)]);
    expect(guardar).toHaveBeenCalledWith(1026, expect.any(Blob));
    expect(result.current.erro).toBeNull();
  });

  it("acima do máximo diz quantas ficaram de fora; nunca tira as que já estavam", async () => {
    guardar.mockImplementation(async (_n: number, f: Blob) => ref(numDe(f)));
    const { result } = renderHook(() => useFotosAJuntar(1026, 3));
    await act(async () => { await result.current.juntar([ficheiro(1), ficheiro(2)]); });
    await act(async () => { await result.current.juntar([ficheiro(3), ficheiro(4), ficheiro(5)]); });
    expect(result.current.fotos).toEqual([ref(1), ref(2), ref(3)]);
    expect(result.current.erro).toBe("Até 3 fotografias por envio: ficaram de fora 2.");
    expect(result.current.cheio).toBe(true);
    await act(async () => { await result.current.juntar([ficheiro(6)]); });
    expect(result.current.erro).toBe("Já tem 3 fotografias neste envio: tire uma para juntar outra.");
    expect(result.current.fotos).toHaveLength(3);
  });

  it("uma que falha a guardar diz-se e as outras ficam", async () => {
    guardar.mockImplementation(async (_n: number, f: Blob) => { const n = numDe(f); if (n === 2) throw new Error("Sem rede"); return ref(n); });
    const { result } = renderHook(() => useFotosAJuntar(1026));
    await act(async () => { await result.current.juntar([ficheiro(1), ficheiro(2), ficheiro(3)]); });
    expect(result.current.fotos).toEqual([ref(1), ref(3)]);
    expect(result.current.erro).toBe("A fotografia não ficou guardada: Sem rede");
  });

  it("tirar apaga da base a que não foi enviada; limpar (depois de enviar) não apaga; descartar (cancelar) apaga todas", async () => {
    guardar.mockImplementation(async (_n: number, f: Blob) => ref(numDe(f)));
    const { result } = renderHook(() => useFotosAJuntar(1026));
    await act(async () => { await result.current.juntar([ficheiro(1), ficheiro(2), ficheiro(3)]); });
    act(() => result.current.tirar(0));
    expect(apagar).toHaveBeenCalledWith(ref(1));
    expect(result.current.fotos).toEqual([ref(2), ref(3)]);
    apagar.mockClear();
    act(() => result.current.limpar());
    expect(apagar).not.toHaveBeenCalled();
    expect(result.current.fotos).toEqual([]);
    await act(async () => { await result.current.juntar([ficheiro(4), ficheiro(5)]); });
    act(() => result.current.descartar());
    expect(apagar).toHaveBeenCalledWith(ref(4));
    expect(apagar).toHaveBeenCalledWith(ref(5));
    expect(result.current.fotos).toEqual([]);
  });

  it("a de exemplo entra como está, se couber", () => {
    const { result } = renderHook(() => useFotosAJuntar(1026, 1));
    act(() => result.current.juntarPronta("data:image/svg+xml,x"));
    act(() => result.current.juntarPronta("data:image/svg+xml,y"));
    expect(result.current.fotos).toEqual(["data:image/svg+xml,x"]);
    expect(result.current.erro).toContain("Já tem 1 fotografias");
    expect(guardar).not.toHaveBeenCalled();
  });
});

describe("EstadoFotos", () => {
  it("nada quando está tudo bem; a guardar; o erro como alerta", () => {
    const { container, rerender } = render(<EstadoFotos aGuardar={0} erro={null} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<EstadoFotos aGuardar={2} erro={null} />);
    expect(screen.getByRole("status")).toHaveTextContent("A guardar 2 fotografias…");
    rerender(<EstadoFotos aGuardar={0} erro="A fotografia não ficou guardada." />);
    expect(screen.getByRole("alert")).toHaveTextContent("A fotografia não ficou guardada.");
  });
});
