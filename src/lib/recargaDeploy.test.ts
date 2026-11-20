// 20/11 (auditoria de 19/11, lote 3): os separadores abertos durante um deploy. Um só tratamento (vite:preloadError e as promessas
// rejeitadas), uma recarga a saltar a cache por vez, e a marca limpa depois de a app ficar bem montada.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ESTAVEL_MS, MARCA_RECARREGOU, forceReload, instalarTratamentoDeDeploy, limparMarcaQuandoEstavel, navegacao, recarregarUmaVez, reporRecarga } from "./recargaDeploy";

const substituir = vi.fn<(url: string) => void>();
const original = { ...navegacao };
beforeEach(() => { sessionStorage.clear(); reporRecarga(); substituir.mockReset(); navegacao.substituir = substituir; navegacao.recarregar = vi.fn(); });
afterEach(() => { Object.assign(navegacao, original); vi.useRealTimers(); });

const ERRO = new Error("Failed to fetch dynamically imported module: https://app/assets/Pagina-abc123.js");
const preload = () => { const e = new Event("vite:preloadError", { cancelable: true }) as Event & { payload?: unknown }; e.payload = ERRO; window.dispatchEvent(e); return e; };
const rejeitada = (reason: unknown) => { const e = new Event("unhandledrejection", { cancelable: true }) as Event & { reason?: unknown }; e.reason = reason; window.dispatchEvent(e); return e; };

describe("recarregar a saltar a cache, uma vez", () => {
  it("forceReload pede o mesmo endereço com um parâmetro novo (salta o index.html em cache)", () => {
    forceReload();
    const url = new URL(substituir.mock.calls[0][0]);
    expect(url.pathname).toBe(window.location.pathname);
    expect(url.searchParams.get("v")).toBeTruthy();
  });

  it("a primeira vez recarrega e marca; a segunda (a marca está) não, quem chama mostra o erro", () => {
    expect(recarregarUmaVez()).toBe(true);
    expect(sessionStorage.getItem(MARCA_RECARREGOU)).toBe("true");
    expect(substituir).toHaveBeenCalledTimes(1);
    reporRecarga();
    expect(recarregarUmaVez()).toBe(false);
    expect(substituir).toHaveBeenCalledTimes(1);
  });

  it("com a app bem montada a marca limpa-se passado um bocado: um deploy seguinte volta a recarregar sozinho", () => {
    vi.useFakeTimers();
    sessionStorage.setItem(MARCA_RECARREGOU, "true");
    limparMarcaQuandoEstavel();
    vi.advanceTimersByTime(ESTAVEL_MS - 1);
    expect(sessionStorage.getItem(MARCA_RECARREGOU)).toBe("true"); // um chunk partido logo a seguir a montar não faz um ciclo
    vi.advanceTimersByTime(1);
    expect(sessionStorage.getItem(MARCA_RECARREGOU)).toBeNull();
    expect(recarregarUmaVez()).toBe(true);
  });
});

describe("o tratamento global", () => {
  let montada = false;
  const aviso = vi.fn(), falhou = vi.fn(), outro = vi.fn();
  let desinstalar = () => {};
  beforeEach(() => { montada = false; aviso.mockReset(); falhou.mockReset(); outro.mockReset(); desinstalar = instalarTratamentoDeDeploy({ montada: () => montada, aviso, falhou, outro }); });
  afterEach(() => desinstalar());

  it("vite:preloadError antes de a app montar: recarrega uma vez e o erro não segue", () => {
    expect(preload().defaultPrevented).toBe(true);
    expect(substituir).toHaveBeenCalledTimes(1);
    reporRecarga();
    // já recarregou nesta sessão: o erro segue (o ecrã de falha do main.tsx)
    expect(preload().defaultPrevented).toBe(false);
    expect(substituir).toHaveBeenCalledTimes(1);
  });

  it("vite:preloadError com a app a correr: avisa, não recarrega por cima do trabalho, e o erro segue para o ErrorBoundary", () => {
    montada = true;
    expect(preload().defaultPrevented).toBe(false);
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(substituir).not.toHaveBeenCalled();
  });

  it("uma promessa rejeitada por um chunk antigo: montada avisa; antes de montar recarrega uma vez e depois mostra a falha", () => {
    montada = true;
    expect(rejeitada(ERRO).defaultPrevented).toBe(true);
    expect(aviso).toHaveBeenCalledTimes(1);
    montada = false;
    expect(rejeitada(ERRO).defaultPrevented).toBe(true);
    expect(substituir).toHaveBeenCalledTimes(1);
    reporRecarga();
    rejeitada(ERRO);
    expect(falhou).toHaveBeenCalledWith(ERRO);
    // outro erro qualquer vai para o Sentry, sem recarregar
    const x = new Error("outra coisa");
    rejeitada(x);
    expect(outro).toHaveBeenCalledWith(x);
    expect(substituir).toHaveBeenCalledTimes(1);
  });
});

describe("vercel.json", () => {
  const cfg = JSON.parse(readFileSync(resolve(__dirname, "../../vercel.json"), "utf8")) as { rewrites: { source: string; destination: string }[] };
  const casa = (source: string, caminho: string) => new RegExp(`^${source}$`).test(caminho);
  it("a reescrita para o index.html não apanha /assets: um ficheiro de um deploy antigo dá 404 a sério (não o index.html)", () => {
    const geral = cfg.rewrites.find((r) => r.destination === "/index.html")!;
    expect(casa(geral.source, "/assets/Pagina-abc123.js")).toBe(false);
    expect(casa(geral.source, "/assets/index-abc.css")).toBe(false);
    // as rotas da app continuam a abrir o index.html
    expect(casa(geral.source, "/negocios")).toBe(true);
    expect(casa(geral.source, "/prototipo/estudio")).toBe(true);
    expect(casa(geral.source, "/")).toBe(true);
    expect(casa(geral.source, "/assets-da-empresa")).toBe(true);
  });
});
