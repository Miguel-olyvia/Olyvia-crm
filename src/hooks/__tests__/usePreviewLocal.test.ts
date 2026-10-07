/**
 * `usePreviewLocal`: pre-visualizacao LOCAL de uma imagem escolhida (antes de
 * enviar). O URL de objecto e revogado ao trocar de ficheiro e ao desmontar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePreviewLocal } from "../usePreviewLocal";

const criar = vi.fn();
const revogar = vi.fn();

const imagem = (nome = "eu.png", tipo = "image/png") => new File(["x"], nome, { type: tipo });

describe("usePreviewLocal", () => {
  const original = { criar: URL.createObjectURL, revogar: URL.revokeObjectURL };

  beforeEach(() => {
    criar.mockReset().mockImplementation(() => `blob:${criar.mock.calls.length}`);
    revogar.mockReset();
    URL.createObjectURL = criar as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = revogar as unknown as typeof URL.revokeObjectURL;
  });

  afterEach(() => {
    URL.createObjectURL = original.criar;
    URL.revokeObjectURL = original.revogar;
  });

  it("sem ficheiro nao ha URL", () => {
    const { result } = renderHook(() => usePreviewLocal(null));
    expect(result.current).toBeNull();
    expect(criar).not.toHaveBeenCalled();
  });

  it("uma imagem PNG ou JPEG ganha URL de objecto", () => {
    const { result } = renderHook(() => usePreviewLocal(imagem()));
    expect(result.current).toBe("blob:1");
  });

  it("um PDF ou um tipo que nao e imagem nao tem pre-visualizacao", () => {
    const { result } = renderHook(() => usePreviewLocal(imagem("a.pdf", "application/pdf")));
    expect(result.current).toBeNull();
    const svg = renderHook(() => usePreviewLocal(imagem("a.svg", "image/svg+xml")));
    expect(svg.result.current).toBeNull();
    expect(criar).not.toHaveBeenCalled();
  });

  it("revoga o URL ao desmontar", () => {
    const { unmount } = renderHook(() => usePreviewLocal(imagem()));
    unmount();
    expect(revogar).toHaveBeenCalledWith("blob:1");
  });

  it("ao trocar de ficheiro revoga o anterior", () => {
    const primeiro = imagem("a.png");
    const segundo = imagem("b.png");
    const { result, rerender } = renderHook(({ f }: { f: File | null }) => usePreviewLocal(f), {
      initialProps: { f: primeiro as File | null },
    });
    expect(result.current).toBe("blob:1");
    rerender({ f: segundo });
    expect(revogar).toHaveBeenCalledWith("blob:1");
    expect(result.current).toBe("blob:2");
    rerender({ f: null });
    expect(revogar).toHaveBeenCalledWith("blob:2");
    expect(result.current).toBeNull();
  });
});
