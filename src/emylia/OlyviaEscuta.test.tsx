// 17/11 (Rúben: «leva tempo a reagir», «devia manter-se ligado após a troca de página», «desativar quando se inicia uma gravação»):
// a escuta contínua da Olyvia com um reconhecedor de voz falso (o Web Speech do browser) e o gravador simulado.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import { EV_ABRIR, EV_PASSO } from "./comandoOlyvia";

const g = vi.hoisted(() => ({ estado: "parado" as string, falas: [] as { inicio: number; fim: number; texto: string; falante: string; confianca_falante: number; revista?: boolean }[], invoke: null as null | ((nome: string, o: { body: { frase: string } }) => Promise<unknown>) }));
vi.mock("./gravador", () => ({ useGravacao: () => ({ estado: g.estado, falas: g.falas }) }));
// a IA (olyvia-comando): por omissão não há (como antes de a função estar publicada)
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: (n: string, o: { body: { frase: string } }) => (g.invoke ? g.invoke(n, o) : Promise.resolve({ data: null, error: new Error("sem função") })) } } }));

import { ACORDADA_MS, OlyviaComando, PAUSA_FRASE, PAUSA_PARA_AGIR } from "./OlyviaComando";

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
  localStorage.clear(); ativos = []; g.estado = "parado"; g.falas = []; g.invoke = null; Canal.todos = [];
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
    expect(screen.getByRole("button", { name: "Olyvia — a ouvir a conversa (diz «Olyvia, …»)" })).toBeInTheDocument();
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

  it("acordada e sem IA, uma frase comprida não salta de página por uma palavra solta («catálogo»)", async () => {
    vi.useFakeTimers();
    render(arvore("/negocios?vista=hoje"));
    const rec = ultimo();
    falar(rec, res("olyvia", true));
    falar(rec, res("olyvia", true), res("ontem fui ao catálogo da loja e depois passei pela obra do senhor joão para ver", true));
    await act(async () => { await vi.runOnlyPendingTimersAsync(); });
    expect(loc()).toBe("/negocios?vista=hoje");
  });

  it("17/11 (Rúben: «falo em linguagem natural e não regista nada»): a frase natural comprida vai à IA, e faz o que ela diz", async () => {
    vi.useFakeTimers();
    const pedidos: string[] = [];
    g.invoke = async (_n, o) => { pedidos.push(o.body.frase); return { data: { acoes: [{ tipo: "navegar", texto: "Catálogo e custos" }], resposta: "A abrir o catálogo." }, error: null }; };
    render(arvore("/negocios?vista=hoje"));
    const rec = ultimo();
    falar(rec, res("olyvia", true));
    // sem «fim de frase» do browser: uma pausa curta chega
    falar(rec, res("olyvia", true), res("preciso de ver quanto custam os materiais todos que temos no catálogo"));
    await act(async () => { await vi.advanceTimersByTimeAsync(PAUSA_FRASE + 50); });
    expect(pedidos).toEqual(["preciso de ver quanto custam os materiais todos que temos no catalogo"]);
    expect(loc()).toBe("/catalogo-custos");
  });

  it("acordada, qualquer fala renova o tempo (não adormece a meio de uma conversa)", () => {
    vi.useFakeTimers();
    render(arvore("/negocios?vista=hoje"));
    const rec = ultimo();
    falar(rec, res("olyvia", true));
    act(() => { vi.advanceTimersByTime(ACORDADA_MS - 1000); });
    falar(rec, res("olyvia", true), res("hum deixa-me ver"));
    act(() => { vi.advanceTimersByTime(ACORDADA_MS - 1000); });
    expect(screen.getByRole("button", { name: "Olyvia — a ouvir-te" })).toBeInTheDocument();
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

  describe("17/11 (Rúben: «isto vai substituir a gravação da chamada»): a gravar, ouve pelas falas do gravador", () => {
    const fala = (inicio: number, texto: string, revista = false) => ({ inicio, fim: inicio + 2, texto, falante: "comercial", confianca_falante: 1, revista });
    it("a conversa não são ordens; «Olyvia, …» é", () => {
      g.estado = "a_ouvir";
      const r = render(arvore("/negocios?vista=hoje"));
      g.falas = [fala(1, "Bom dia, então vamos ver o catálogo de azulejos")];
      r.rerender(arvore("/negocios?vista=hoje"));
      expect(loc()).toBe("/negocios?vista=hoje");
      g.falas = [...g.falas, fala(5, "Olívia, vai ao catálogo.")];
      r.rerender(arvore("/negocios?vista=hoje"));
      expect(loc()).toBe("/catalogo-custos");
    });
    it("só «Olyvia»: a fala seguinte é a ordem; as falas revistas não contam outra vez", () => {
      g.estado = "a_ouvir";
      const r = render(arvore("/negocios?vista=hoje"));
      g.falas = [fala(1, "Olyvia.")];
      r.rerender(arvore("/negocios?vista=hoje"));
      g.falas = [...g.falas, fala(3, "Vai ao catálogo.")];
      r.rerender(arvore("/catalogo-custos"));
      expect(loc()).toBe("/catalogo-custos");
      // a 2.ª passagem repete o texto revisto: não volta a mandar
      g.falas = [fala(1, "Olyvia.", true), fala(3, "Olyvia, vai aos negócios.", true)];
      r.rerender(arvore("/catalogo-custos"));
      expect(loc()).toBe("/catalogo-custos");
    });
    it("as falas que já estavam ao abrir não são ordens novas", () => {
      g.estado = "a_ouvir";
      g.falas = [fala(1, "Olyvia, vai ao catálogo.")];
      render(arvore("/negocios?vista=hoje"));
      expect(loc()).toBe("/negocios?vista=hoje");
    });
    it("«Olyvia, começa a gravar» carrega no botão do painel", async () => {
      vi.useFakeTimers();
      const carregou = vi.fn();
      const b = document.createElement("button"); b.textContent = "Começar a gravar"; b.onclick = carregou; document.body.appendChild(b);
      render(arvore("/negocios?negocio=1"));
      falar(ultimo(), res("olyvia começa a gravar", true));
      await act(async () => { await vi.runOnlyPendingTimersAsync(); });
      expect(carregou).toHaveBeenCalledTimes(1);
      b.remove();
    });
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
