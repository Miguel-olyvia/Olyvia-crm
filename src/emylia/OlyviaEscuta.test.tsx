// 17/11 (Rúben: «leva tempo a reagir», «devia manter-se ligado após a troca de página», «desativar quando se inicia uma gravação»):
// a escuta contínua da Olyvia com um reconhecedor de voz falso (o Web Speech do browser) e o gravador simulado.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import { EV_ABRIR, EV_PASSO } from "./comandoOlyvia";

const g = vi.hoisted(() => ({ estado: "parado" as string }));
vi.mock("./gravador", () => ({ useGravacao: () => ({ estado: g.estado }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { ACORDADA_MS, OlyviaComando, PAUSA_PARA_AGIR } from "./OlyviaComando";

type Res = { transcript: string }[] & { isFinal: boolean };
class Falso {
  lang = ""; continuous = false; interimResults = false; parado = false;
  onstart: (() => void) | null = null;
  onresult: ((e: { results: Res[] }) => void) | null = null;
  onerror: ((e: { error?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start() { ativos.push(this); this.onstart?.(); }
  stop() { this.parado = true; this.onend?.(); }
}
let ativos: Falso[] = [];
const res = (t: string, isFinal = false): Res => Object.assign([{ transcript: t }], { isFinal });
const falar = (rec: Falso, ...rs: Res[]) => act(() => rec.onresult!({ results: rs }));
const ultimo = () => ativos[ativos.length - 1];

function Local() { const l = useLocation(); return <div data-testid="loc">{l.pathname}{l.search}</div>; }
const arvore = (inicio: string) => <MemoryRouter initialEntries={[inicio]}><OlyviaComando /><Local /></MemoryRouter>;
const loc = () => screen.getByTestId("loc").textContent;
const ouvir = (nome: string) => { const vistos: unknown[] = []; window.addEventListener(nome, (e) => vistos.push((e as CustomEvent).detail)); return vistos; };

/** Os outros separadores: um BroadcastChannel falso que entrega as mensagens aos outros canais com o mesmo nome. */
class Canal {
  static todos: Canal[] = [];
  onmessage: ((e: { data: unknown }) => void) | null = null;
  constructor(public nome: string) { Canal.todos.push(this); }
  postMessage(data: unknown) { for (const c of Canal.todos) if (c !== this && c.nome === this.nome) c.onmessage?.({ data }); }
  close() { Canal.todos = Canal.todos.filter((c) => c !== this); }
}

beforeEach(() => {
  localStorage.clear(); ativos = []; g.estado = "parado"; Canal.todos = [];
  vi.stubGlobal("BroadcastChannel", Canal);
  (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = Falso;
});
afterEach(() => {
  cleanup(); vi.useRealTimers(); vi.unstubAllGlobals();
  delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  delete (document as unknown as { visibilityState?: string }).visibilityState;
});

describe("17/11: a escuta contínua da Olyvia", () => {
  it("reage quando se pára de falar um instante, sem esperar que o browser dê a frase por acabada", () => {
    vi.useFakeTimers();
    render(arvore("/negocios?vista=hoje"));
    falar(ultimo(), res("olyvia vai aos negócios"));
    expect(loc()).toBe("/negocios?vista=hoje");
    act(() => { vi.advanceTimersByTime(PAUSA_PARA_AGIR); });
    expect(loc()).toBe("/negocios");
  });

  it("espera pelo fim do nome («abre o Ruben…» → «Branco») e não repete o comando quando o browser fecha a frase", () => {
    vi.useFakeTimers();
    render(arvore("/negocios"));
    const pedidos = ouvir(EV_ABRIR);
    const rec = ultimo();
    falar(rec, res("olyvia abre o ruben"));
    act(() => { vi.advanceTimersByTime(PAUSA_PARA_AGIR - 100); });
    falar(rec, res("olyvia abre o ruben branco"));
    act(() => { vi.advanceTimersByTime(PAUSA_PARA_AGIR); vi.runOnlyPendingTimers(); });
    falar(rec, res("olyvia abre o ruben branco", true));
    act(() => { vi.runOnlyPendingTimers(); });
    expect(pedidos).toEqual([{ nome: "ruben branco", fase: null }]);
  });

  it("os passos curtos agem logo («vai para o fim»)", () => {
    render(arvore("/negocios?negocio=1021"));
    const passos = ouvir(EV_PASSO);
    falar(ultimo(), res("olyvia vai para o fim"));
    expect(passos).toEqual([{ passo: "fim" }]);
  });

  it("mantém-se ligada depois de mudar de página (a mesma escuta continua, sem reiniciar)", () => {
    vi.useFakeTimers();
    render(arvore("/negocios?vista=hoje"));
    expect(ativos).toHaveLength(1);
    falar(ultimo(), res("olyvia vai ao catálogo", true));
    expect(loc()).toBe("/catalogo-custos");
    act(() => { vi.advanceTimersByTime(2000); });
    expect(ativos).toHaveLength(1);
    expect(ativos[0].parado).toBe(false);
  });

  it("pausa sozinha quando começa uma gravação e volta quando ela pára", () => {
    vi.useFakeTimers();
    const r = render(arvore("/negocios"));
    expect(ativos).toHaveLength(1);
    g.estado = "a_ouvir";
    r.rerender(arvore("/negocios"));
    expect(ativos[0].parado).toBe(true);
    expect(screen.getByRole("button", { name: "Olyvia — em pausa (a gravar)" })).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(ativos).toHaveLength(1);
    g.estado = "interrompida";
    r.rerender(arvore("/negocios"));
    expect(ativos).toHaveLength(2);
    expect(ultimo().parado).toBe(false);
  });

  it("só ouve um separador: quando outro pede o micro, este cede; volta quando se toca neste (e avisa o outro)", () => {
    render(arvore("/negocios"));
    expect(ativos).toHaveLength(1);
    const outro = new Canal("olyvia-escuta");
    const recebidos: unknown[] = [];
    outro.onmessage = (e) => recebidos.push(e.data);
    act(() => outro.postMessage({ tipo: "quero", id: "outro-separador" }));
    expect(ativos[0].parado).toBe(true);
    expect(screen.getByRole("button", { name: "Olyvia — a ouvir noutro separador" })).toBeInTheDocument();
    act(() => { fireEvent.pointerDown(window); });
    expect(ativos).toHaveLength(2);
    expect(ultimo().parado).toBe(false);
    expect(recebidos).toContainEqual(expect.objectContaining({ tipo: "quero" }));
  });

  it("um separador escondido não ouve; volta quando se vê outra vez", () => {
    render(arvore("/negocios"));
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(ativos[0].parado).toBe(true);
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    act(() => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(ativos).toHaveLength(2);
  });

  it("travão: cancelada logo ao arrancar três vezes seguidas, pára e avisa (não fica a ligar e desligar); volta ao toque", () => {
    vi.useFakeTimers();
    render(arvore("/negocios"));
    const cancelar = () => { const rec = ultimo(); act(() => { rec.onerror!({ error: "aborted" }); rec.onend!(); }); };
    cancelar();
    act(() => { vi.advanceTimersByTime(600); });
    expect(ativos).toHaveLength(2);
    cancelar();
    act(() => { vi.advanceTimersByTime(1200); });
    expect(ativos).toHaveLength(3);
    cancelar();
    expect(screen.getByRole("status").textContent).toMatch(/ocupado noutro separador/);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(ativos).toHaveLength(3);
    act(() => { fireEvent.pointerDown(window); });
    expect(ativos).toHaveLength(4);
  });

  it("modo conversa: «Olyvia» uma vez e depois as ordens vão sem o nome", () => {
    vi.useFakeTimers();
    render(arvore("/negocios?vista=hoje"));
    const rec = ultimo();
    falar(rec, res("olyvia", true));
    expect(screen.getByRole("button", { name: "Olyvia — a ouvir-te" })).toBeInTheDocument();
    falar(rec, res("olyvia", true), res("vai ao catálogo", true));
    expect(loc()).toBe("/catalogo-custos");
    falar(rec, res("olyvia", true), res("vai ao catálogo", true), res("abre os negócios", true));
    expect(loc()).toBe("/negocios");
  });

  it("a dormir, sem «Olyvia», ignora o que se diz", () => {
    vi.useFakeTimers();
    render(arvore("/negocios?vista=hoje"));
    falar(ultimo(), res("vai ao catálogo", true));
    act(() => { vi.advanceTimersByTime(PAUSA_PARA_AGIR * 2); });
    expect(loc()).toBe("/negocios?vista=hoje");
  });

  it("acordada, uma frase comprida é conversa à volta e não uma ordem", () => {
    vi.useFakeTimers();
    render(arvore("/negocios?vista=hoje"));
    const rec = ultimo();
    falar(rec, res("olyvia", true));
    falar(rec, res("olyvia", true), res("ontem fui ao catálogo da loja e depois passei pela obra do senhor joão para ver", true));
    expect(loc()).toBe("/negocios?vista=hoje");
  });

  it("adormece sozinha passado ACORDADA_MS sem ordens, e com «obrigado»", () => {
    vi.useFakeTimers();
    render(arvore("/negocios?vista=hoje"));
    const rec = ultimo();
    falar(rec, res("olyvia", true));
    act(() => { vi.advanceTimersByTime(ACORDADA_MS + 10); });
    expect(screen.getByRole("button", { name: "Olyvia — à escuta (diz «Olyvia»)" })).toBeInTheDocument();
    falar(rec, res("olyvia", true), res("vai ao catálogo", true));
    expect(loc()).toBe("/negocios?vista=hoje");
    falar(rec, res("olyvia", true), res("vai ao catálogo", true), res("olyvia", true));
    falar(rec, res("olyvia", true), res("vai ao catálogo", true), res("olyvia", true), res("obrigado", true));
    expect(screen.getByRole("button", { name: "Olyvia — à escuta (diz «Olyvia»)" })).toBeInTheDocument();
    falar(rec, res("olyvia", true), res("vai ao catálogo", true), res("olyvia", true), res("obrigado", true), res("vai ao catálogo", true));
    expect(loc()).toBe("/negocios?vista=hoje");
  });

  it("acordada, «abre o teste c p» (letras soletradas) pede o negócio pelo nome", () => {
    vi.useFakeTimers();
    render(arvore("/negocios"));
    const pedidos = ouvir(EV_ABRIR);
    const rec = ultimo();
    falar(rec, res("olyvia", true));
    falar(rec, res("olyvia", true), res("abre o teste c p", true));
    act(() => { vi.runOnlyPendingTimers(); });
    expect(pedidos).toEqual([{ nome: "teste cp", fase: null }]);
  });

  it("quando o browser pede um clique (not-allowed), não desliga a escolha: volta a ouvir no próximo toque", () => {
    vi.useFakeTimers();
    render(arvore("/negocios"));
    const rec = ultimo();
    act(() => { rec.onerror!({ error: "not-allowed" }); rec.onend!(); });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(ativos).toHaveLength(1);
    expect(localStorage.getItem("olyvia-escuta")).toBe("1");
    act(() => { fireEvent.pointerDown(window); });
    expect(ativos).toHaveLength(2);
  });
});
