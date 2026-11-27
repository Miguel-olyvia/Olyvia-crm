// 27/11: o corpo da pré-visualização do GLB próprio (ModeloGlbPreviaCorpo.tsx): o ficheiro escolhido tem de estar na cache dos GLB ANTES de o 3D o ler (a leitura acontece no desenho do
// filho), um GLB já guardado vai pelo URL e não se semeia, e o semeado liberta-se ao sair. O 3D em si (Previa3DProduto) está simulado: só regista o que viu na cache ao desenhar.
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./Previa3DProduto", async () => {
  const { glbEmCache } = await import("./planta3d/modelosHtml/glb");
  return {
    Previa3DProduto: (p: { nome: string; glbProprio?: string | null }) => <div data-testid="previa3d" data-glb={p.glbProprio ?? ""} data-na-cache={String(glbEmCache().includes(p.glbProprio ?? ""))} />,
  };
});

import ModeloGlbPreviaCorpo from "./ModeloGlbPreviaCorpo";
import { glbDeTeste } from "./planta3d/__fixtures__/glbDeTeste";
import { glbEmCache } from "./planta3d/modelosHtml/glb";

afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("ModeloGlbPreviaCorpo", () => {
  it("um ficheiro escolhido (local) já está na cache quando o 3D desenha, e o 3D recebe a chave, não um blob:", () => {
    render(<ModeloGlbPreviaCorpo nome="SORTY" fonte={{ t: "local", chave: "glb-local:corpo-1", dados: glbDeTeste() }} />);
    const previa = screen.getByTestId("previa3d");
    expect(previa).toHaveAttribute("data-glb", "glb-local:corpo-1");
    expect(previa).toHaveAttribute("data-na-cache", "true");
    expect(glbEmCache()).toContain("glb-local:corpo-1");
  });

  it("semeia uma cópia: os bytes do diálogo ficam inteiros", () => {
    const dados = glbDeTeste();
    const antes = new Uint8Array(dados.slice(0));
    render(<ModeloGlbPreviaCorpo nome="X" fonte={{ t: "local", chave: "glb-local:corpo-2", dados }} />);
    expect(new Uint8Array(dados)).toEqual(antes);
  });

  it("um GLB já guardado vai pelo URL e não se semeia", () => {
    const url = "https://cdn.teste/catalogo-modelos3d/x/y.glb";
    render(<ModeloGlbPreviaCorpo nome="X" fonte={{ t: "url", url }} />);
    expect(screen.getByTestId("previa3d")).toHaveAttribute("data-glb", url);
    expect(glbEmCache()).not.toContain(url);
  });

  it("ao sair, o ficheiro semeado liberta-se da cache passado o tempo de espera habitual (30 s), e não antes", () => {
    vi.useFakeTimers();
    const { unmount } = render(<ModeloGlbPreviaCorpo nome="X" fonte={{ t: "local", chave: "glb-local:corpo-3", dados: glbDeTeste() }} />);
    unmount();
    act(() => { vi.advanceTimersByTime(29_000); });
    expect(glbEmCache()).toContain("glb-local:corpo-3");
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(glbEmCache()).not.toContain("glb-local:corpo-3");
  });
});
