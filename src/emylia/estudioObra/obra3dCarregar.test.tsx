// 25/11 (Rúben: «o 3D às vezes não carrega os modelos: só caixas»). O caso: o ficheiro do visualizador com modelos é pedido só quando se abre
// o separador 3D; com um deploy pelo meio já não está no servidor e o import falha. Antes, o ecrã caía no 3D simples em silêncio e ficava
// assim até recarregar (o React guarda a falha do `lazy`; a reserva nunca voltava atrás), mesmo trocando de separador e voltando.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { acoes } from "../motor";
import type { Ctx } from "../pecas";
import { EstudioObra } from "./EstudioObra";
import { obraDeExemplo } from "./exemploObra";
import { carregarVisualizador3D, importacao, reporVisualizador3D } from "@/emylia/planta3d/carregarVisualizador3D";

type Modulo = Awaited<ReturnType<typeof importacao.importar>>;
/** Um visualizador de mentira (o three.js não corre no jsdom): diz quantas peças recebeu. */
const FALSO = { default: ({ espaco }: { espaco: { pecas: unknown[] } }) => <div data-testid="visualizador-com-modelos">{espaco.pecas.length} peças</div> } as unknown as Modulo;
const DEPLOY = () => new TypeError("Failed to fetch dynamically imported module: https://testarh/assets/Visualizador3D-AbCd1234.js");

const original = importacao.importar;
const getContext = HTMLCanvasElement.prototype.getContext;
beforeEach(() => {
  reporVisualizador3D();
  // o browser desenha 3D (o jsdom não tem WebGL)
  (window as unknown as { WebGLRenderingContext: unknown }).WebGLRenderingContext = function WebGL() {};
  HTMLCanvasElement.prototype.getContext = (() => ({ getExtension: () => null })) as unknown as typeof getContext;
});
afterEach(() => {
  cleanup();
  importacao.importar = original;
  HTMLCanvasElement.prototype.getContext = getContext;
  delete (window as unknown as { WebGLRenderingContext?: unknown }).WebGLRenderingContext;
  reporVisualizador3D();
});

function montar() {
  const { S, d } = obraDeExemplo();
  const A = acoes(S, () => {}, (fn) => fn());
  const ctx = { S, A, run: (fn: () => void) => { fn(); r.rerender(<EstudioObra ctx={ctx} d={d} fechar={() => {}} />); }, go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
  const r = render(<EstudioObra ctx={ctx} d={d} fechar={() => {}} />);
  return { d };
}
const sec3d = () => screen.getByRole("region", { name: "O projeto em 3D" });
/** O aviso por cima do 3D simples (o «A abrir o 3D…» também é um estado: procura-se pelo texto). */
const aviso3d = async () => (await within(sec3d()).findByText(/versão nova da aplicação|não abriu/, {}, { timeout: 4000 })).closest("[role=status]") as HTMLElement;

describe("o 3D com modelos carrega sempre (25/11)", () => {
  it("o caso do Rúben: o import do 3D falha (deploy pelo meio); diz porquê e, trocando de separador e voltando, abre com os modelos", async () => {
    let falhar = true;
    importacao.importar = vi.fn(() => (falhar ? Promise.reject(DEPLOY()) : Promise.resolve(FALSO)));
    montar();
    fireEvent.click(screen.getByRole("tab", { name: /3D/ }));
    // não fica em silêncio: o 3D simples com o porquê e o que fazer
    const aviso = await aviso3d();
    expect(aviso.textContent).toMatch(/versão nova da aplicação/);
    within(aviso).getByRole("button", { name: "Recarregar a página" });
    expect(within(sec3d()).queryByTestId("visualizador-com-modelos")).toBeNull();
    // o ficheiro volta a estar acessível (ex.: a rede voltou): trocar de separador e voltar abre o 3D com os modelos (antes ficava nas caixas)
    falhar = false;
    fireEvent.click(screen.getByRole("tab", { name: /Plano/ }));
    fireEvent.click(screen.getByRole("tab", { name: /3D/ }));
    expect(await within(sec3d()).findByTestId("visualizador-com-modelos")).toBeTruthy();
    expect(within(sec3d()).queryByText(/versão nova da aplicação|não abriu/)).toBeNull();
  });

  it("mudar a vista depois de uma falha volta a tentar sozinho; «Tentar de novo» também", async () => {
    let falhar = true;
    importacao.importar = vi.fn(() => (falhar ? Promise.reject(new Error("rede em baixo")) : Promise.resolve(FALSO)));
    montar();
    fireEvent.click(screen.getByRole("tab", { name: /3D/ }));
    const aviso = await aviso3d();
    expect(aviso.textContent).toMatch(/não abriu/);
    falhar = false;
    fireEvent.click(within(sec3d()).getByRole("button", { name: "Como vai ficar" }));
    expect(await within(sec3d()).findByTestId("visualizador-com-modelos")).toBeTruthy();
    // e pelo botão
    cleanup(); reporVisualizador3D(); falhar = true;
    montar();
    fireEvent.click(screen.getByRole("tab", { name: /3D/ }));
    const aviso2 = await aviso3d();
    falhar = false;
    fireEvent.click(within(aviso2).getByRole("button", { name: "Tentar de novo" }));
    expect(await within(sec3d()).findByTestId("visualizador-com-modelos")).toBeTruthy();
  });

  it("o 3D pede-se logo que a obra abre (antes de um deploy o tirar do servidor), e uma vez carregado não se volta a pedir", async () => {
    importacao.importar = vi.fn(() => Promise.resolve(FALSO));
    montar();
    await waitFor(() => expect(importacao.importar).toHaveBeenCalledTimes(1), { timeout: 4000 });
    // com o ficheiro já em memória, um deploy depois não estraga nada: abrir, sair e voltar várias vezes nunca volta a pedir
    importacao.importar = vi.fn(() => Promise.reject(DEPLOY()));
    for (let i = 0; i < 3; i++) {
      fireEvent.click(screen.getByRole("tab", { name: /3D/ }));
      expect(await within(sec3d()).findByTestId("visualizador-com-modelos")).toBeTruthy();
      fireEvent.click(screen.getByRole("tab", { name: /Plano/ }));
    }
    expect(importacao.importar).not.toHaveBeenCalled();
  });

  it("o carregador: uma falha passageira tenta outra vez; uma falha não fica guardada", async () => {
    let n = 0;
    importacao.importar = vi.fn(() => (++n === 1 ? Promise.reject(new Error("rede")) : Promise.resolve(FALSO)));
    await expect(carregarVisualizador3D(2, 0)).resolves.toBe(FALSO);
    expect(n).toBe(2);
    reporVisualizador3D(); n = 0;
    importacao.importar = vi.fn(() => (++n <= 2 ? Promise.reject(DEPLOY()) : Promise.resolve(FALSO)));
    await expect(carregarVisualizador3D(2, 0)).rejects.toThrow(/dynamically imported module/);
    await expect(carregarVisualizador3D(2, 0)).resolves.toBe(FALSO); // a seguir volta a tentar (antes: a mesma falha para sempre)
  });
});
