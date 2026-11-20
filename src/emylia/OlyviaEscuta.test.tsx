// 17/11 (Rúben: «leva tempo a reagir», «devia manter-se ligado após a troca de página», «desativar quando se inicia uma gravação»):
// a escuta contínua da Olyvia com um reconhecedor de voz falso (o Web Speech do browser) e o gravador simulado.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import { EV_ABRIR, EV_PASSO, EV_PESQUISA } from "./comandoOlyvia";

const g = vi.hoisted(() => ({ estado: "parado" as string, falas: [] as { inicio: number; fim: number; texto: string; falante: string; confianca_falante: number; revista?: boolean }[], invoke: null as null | ((nome: string, o: { body: { frase: string } }) => Promise<unknown>) }));
vi.mock("./gravador", () => ({ useGravacao: () => ({ estado: g.estado, falas: g.falas }) }));
// a IA (olyvia-comando): por omissão não há (como antes de a função estar publicada)
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: (n: string, o: { body: { frase: string } }) => (g.invoke ? g.invoke(n, o) : Promise.resolve({ data: null, error: new Error("sem função") })) } } }));

import { ACORDADA_MS, ECO_MS, OlyviaComando, PAUSA_A_MEIO, PAUSA_FRASE, PAUSA_ORDEM, RECICLAR_MS, SURDA_MS, eEco } from "./OlyviaComando";

type Res = { transcript: string }[] & { isFinal: boolean };
class Falso {
  lang = ""; continuous = false; interimResults = false; parado = false;
  onstart: (() => void) | null = null;
  onresult: ((e: { results: Res[] }) => void) | null = null;
  onerror: ((e: { error?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  onspeechstart: (() => void) | null = null;
  onspeechend: (() => void) | null = null;
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
  // 20/11: a escuta vem desligada por omissão; estes testes são da escuta ligada
  localStorage.clear(); localStorage.setItem("olyvia-escuta-v2", "1"); ativos = []; g.estado = "parado"; g.falas = []; g.invoke = null; Canal.todos = [];
  vi.stubGlobal("BroadcastChannel", Canal);
  (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = Falso;
});
afterEach(() => {
  cleanup(); vi.useRealTimers(); vi.unstubAllGlobals();
  delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  delete (document as unknown as { visibilityState?: string }).visibilityState;
});

describe("17/11: a escuta contínua da Olyvia", () => {
  it("18/11: age quando se pára de falar, sem esperar que o browser dê a frase por acabada — mas não numa pausa curta", () => {
    vi.useFakeTimers();
    render(arvore("/negocios?vista=hoje"));
    falar(ultimo(), res("olyvia vai aos negócios"));
    act(() => { vi.advanceTimersByTime(PAUSA_FRASE - 200); });
    expect(loc()).toBe("/negocios?vista=hoje");
    act(() => { vi.advanceTimersByTime(250); });
    expect(loc()).toBe("/negocios");
  });

  it("18/11 (Rúben: «se a pessoa fizer uma pequena pausa, ele não quebra»): a frase a meio («… do») espera muito mais, e junta o resto", async () => {
    vi.useFakeTimers();
    const pedidos: string[] = [];
    g.invoke = async (_n, o) => { pedidos.push(o.body.frase); return { data: { acoes: [], resposta: "Está bem.", continuar: false }, error: null }; };
    render(arvore("/negocios?vista=hoje"));
    const rec = ultimo();
    falar(rec, res("olyvia", true));
    // o browser fecha a frase no «do» (pausa para pensar)…
    falar(rec, res("olyvia", true), res("quero que me mostres o negócio do", true));
    await act(async () => { await vi.advanceTimersByTimeAsync(PAUSA_FRASE + 500); });
    expect(pedidos).toEqual([]);
    // …e a pessoa continua noutro resultado: é uma frase só
    falar(rec, res("olyvia", true), res("quero que me mostres o negócio do", true), res("carlos mendes que fica em oeiras", true));
    await act(async () => { await vi.advanceTimersByTimeAsync(PAUSA_FRASE + 50); });
    expect(pedidos).toEqual(["quero que me mostres o negocio do carlos mendes que fica em oeiras"]);
  });

  it("18/11: se o browser fecha a sessão de reconhecimento a meio da espera, o que se disse não se perde", async () => {
    vi.useFakeTimers();
    const pedidos: string[] = [];
    g.invoke = async (_n, o) => { pedidos.push(o.body.frase); return { data: { acoes: [], resposta: "", continuar: false }, error: null }; };
    render(arvore("/negocios?vista=hoje"));
    const rec = ultimo();
    falar(rec, res("olyvia", true));
    falar(rec, res("olyvia", true), res("preciso de ver as obras que estão em curso agora"));
    await act(async () => { rec.onend!(); await vi.advanceTimersByTimeAsync(10); });
    expect(pedidos).toEqual(["preciso de ver as obras que estao em curso agora"]);
    // e a sessão nova não o repete
    await act(async () => { await vi.advanceTimersByTimeAsync(PAUSA_A_MEIO); });
    expect(pedidos).toHaveLength(1);
  });

  it("18/11: a frase a meio acaba por ir sozinha passado PAUSA_A_MEIO (não fica à espera para sempre)", async () => {
    vi.useFakeTimers();
    const pedidos: string[] = [];
    g.invoke = async (_n, o) => { pedidos.push(o.body.frase); return { data: { acoes: [], resposta: "", continuar: false }, error: null }; };
    render(arvore("/negocios?vista=hoje"));
    const rec = ultimo();
    falar(rec, res("olyvia", true));
    falar(rec, res("olyvia", true), res("preciso de ver as obras que estão em curso e", true));
    await act(async () => { await vi.advanceTimersByTimeAsync(PAUSA_A_MEIO + 50); });
    expect(pedidos).toEqual(["preciso de ver as obras que estao em curso e"]);
  });

  it("espera pelo fim do nome («abre o Ruben…» → «Branco») e não repete o comando quando o browser fecha a frase", () => {
    vi.useFakeTimers();
    render(arvore("/negocios"));
    const pedidos = ouvir(EV_ABRIR);
    const rec = ultimo();
    falar(rec, res("olyvia abre o ruben"));
    act(() => { vi.advanceTimersByTime(PAUSA_ORDEM); });
    falar(rec, res("olyvia abre o ruben branco"));
    act(() => { vi.advanceTimersByTime(PAUSA_FRASE + 50); });
    falar(rec, res("olyvia abre o ruben branco", true));
    act(() => { vi.runOnlyPendingTimers(); });
    expect(pedidos).toEqual([{ nome: "ruben branco", fase: null }]);
  });

  it("17/11 (Rúben: disse «agora abre o Carlos Mendes», apanhou «Carlos», parou, depois «Mendes», e não fez nada): nada se perde", () => {
    vi.useFakeTimers();
    render(arvore("/negocios"));
    const pedidos = ouvir(EV_ABRIR);
    const rec = ultimo();
    falar(rec, res("olyvia"));
    // uma pausa curta depois de «Carlos» já não chega para agir com meio nome
    falar(rec, res("olyvia agora abre o carlos"));
    act(() => { vi.advanceTimersByTime(PAUSA_ORDEM + 100); });
    expect(pedidos).toEqual([]);
    falar(rec, res("olyvia agora abre o carlos mendes", true));
    act(() => { vi.runOnlyPendingTimers(); });
    expect(pedidos).toEqual([{ nome: "carlos mendes", fase: null }]);
  });

  it("e se agiu a meio (pausa grande), o resto do nome completa a ordem, no mesmo resultado ou noutro", () => {
    vi.useFakeTimers();
    render(arvore("/negocios"));
    const pedidos = ouvir(EV_ABRIR);
    const rec = ultimo();
    falar(rec, res("olyvia", true));
    falar(rec, res("olyvia", true), res("agora abre o carlos"));
    act(() => { vi.advanceTimersByTime(PAUSA_FRASE + 50); });
    expect(pedidos).toEqual([{ nome: "carlos", fase: null }]);
    // o mesmo resultado cresce («… mendes») e o browser fecha-o: só «mendes» é novo, e completa a ordem de antes
    falar(rec, res("olyvia", true), res("agora abre o carlos mendes", true));
    act(() => { vi.runOnlyPendingTimers(); });
    expect(pedidos).toEqual([{ nome: "carlos", fase: null }, { nome: "carlos mendes", fase: null }]);
  });

  it("noutro resultado: «procura o Nuno» … «Pereira»", () => {
    vi.useFakeTimers();
    render(arvore("/negocios"));
    const buscas = ouvir(EV_PESQUISA);
    const rec = ultimo();
    falar(rec, res("olyvia", true));
    falar(rec, res("olyvia", true), res("procura o nuno", true));
    act(() => { vi.advanceTimersByTime(PAUSA_ORDEM + 50); });
    expect(buscas).toEqual(["nuno"]);
    falar(rec, res("olyvia", true), res("procura o nuno", true), res("pereira", true));
    act(() => { vi.advanceTimersByTime(PAUSA_FRASE + 50); });
    expect(buscas).toEqual(["nuno", "nuno pereira"]);
  });

  it("os passos curtos agem logo («vai para o fim»)", () => {
    render(arvore("/negocios?negocio=1021"));
    const passos = ouvir(EV_PASSO);
    falar(ultimo(), res("olyvia vai para o fim"));
    expect(passos).toMatchObject([{ passo: "fim" }]);
  });

  it("mantém-se ligada depois de mudar de página (a mesma escuta continua, sem reiniciar)", () => {
    vi.useFakeTimers();
    render(arvore("/negocios?vista=hoje"));
    expect(ativos).toHaveLength(1);
    falar(ultimo(), res("olyvia vai ao catálogo", true));
    act(() => { vi.advanceTimersByTime(PAUSA_ORDEM + 50); });
    expect(loc()).toBe("/catalogo/servicos");
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
    act(() => { vi.advanceTimersByTime(PAUSA_ORDEM + 50); });
    expect(loc()).toBe("/catalogo/servicos");
    falar(rec, res("olyvia", true), res("vai ao catálogo", true), res("abre os negócios", true));
    act(() => { vi.advanceTimersByTime(PAUSA_ORDEM + 50); });
    expect(loc()).toBe("/negocios");
  });

  it("a dormir, sem «Olyvia», ignora o que se diz", () => {
    vi.useFakeTimers();
    render(arvore("/negocios?vista=hoje"));
    falar(ultimo(), res("vai ao catálogo", true));
    act(() => { vi.advanceTimersByTime(PAUSA_FRASE * 2); });
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
    expect(loc()).toBe("/catalogo/servicos");
  });

  it("acordada, qualquer fala renova o tempo (não adormece a meio de uma conversa)", () => {
    vi.useFakeTimers();
    render(arvore("/negocios?vista=hoje"));
    const rec = ultimo();
    falar(rec, res("olyvia", true));
    act(() => { vi.advanceTimersByTime(ACORDADA_MS - 1000); });
    // (18/11: entretanto a sessão renovou-se num silêncio — a fala chega à sessão nova)
    falar(ultimo(), res("hum deixa-me ver"));
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
    // (18/11: a sessão renovou-se num silêncio — as falas seguintes chegam à sessão nova)
    const r2 = ultimo();
    expect(r2).not.toBe(rec);
    falar(r2, res("vai ao catálogo", true));
    expect(loc()).toBe("/negocios?vista=hoje");
    falar(r2, res("vai ao catálogo", true), res("olyvia", true));
    falar(r2, res("vai ao catálogo", true), res("olyvia", true), res("obrigado", true));
    expect(screen.getByRole("button", { name: "Olyvia — à escuta (diz «Olyvia»)" })).toBeInTheDocument();
    falar(r2, res("vai ao catálogo", true), res("olyvia", true), res("obrigado", true), res("vai ao catálogo", true));
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
      expect(loc()).toBe("/catalogo/servicos");
    });
    it("só «Olyvia»: a fala seguinte é a ordem; as falas revistas não contam outra vez", () => {
      g.estado = "a_ouvir";
      const r = render(arvore("/negocios?vista=hoje"));
      g.falas = [fala(1, "Olyvia.")];
      r.rerender(arvore("/negocios?vista=hoje"));
      g.falas = [...g.falas, fala(3, "Vai ao catálogo.")];
      r.rerender(arvore("/catalogo/servicos"));
      expect(loc()).toBe("/catalogo/servicos");
      // a 2.ª passagem repete o texto revisto: não volta a mandar
      g.falas = [fala(1, "Olyvia.", true), fala(3, "Olyvia, vai aos negócios.", true)];
      r.rerender(arvore("/catalogo/servicos"));
      expect(loc()).toBe("/catalogo/servicos");
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
    expect(localStorage.getItem("olyvia-escuta-v2")).toBe("1");
    act(() => { fireEvent.pointerDown(window); });
    expect(ativos).toHaveLength(2);
  });
});

describe("18/11 (Rúben: «há vezes em que simplesmente não me ouve… tenho de parar, esperar e falar calmamente»)", () => {
  it("sessão surda: o Chrome ouve fala mas não devolve palavras → recomeça sozinha e a fala seguinte conta", () => {
    vi.useFakeTimers();
    render(arvore("/negocios?vista=hoje"));
    const preso = ultimo();
    act(() => { preso.onspeechstart?.(); vi.advanceTimersByTime(SURDA_MS + 1200); });
    expect(preso.parado).toBe(true);
    const novo = ultimo();
    expect(novo).not.toBe(preso);
    falar(novo, res("olyvia vai aos negócios", true));
    act(() => { vi.advanceTimersByTime(PAUSA_ORDEM + 50); });
    expect(loc()).toBe("/negocios");
  });

  it("a meio de uma fala normal (com palavras a chegar) não recomeça", () => {
    vi.useFakeTimers();
    render(arvore("/negocios?vista=hoje"));
    const rec = ultimo();
    act(() => { rec.onspeechstart?.(); });
    for (let i = 0; i < 6; i++) { act(() => { vi.advanceTimersByTime(1000); }); falar(rec, res(`conversa solta ${i}`)); }
    expect(rec.parado).toBe(false);
    expect(ultimo()).toBe(rec);
  });

  it("uma sessão longa renova-se num silêncio (antes que o Chrome a feche a meio de uma frase)", () => {
    vi.useFakeTimers();
    render(arvore("/negocios?vista=hoje"));
    const rec = ultimo();
    act(() => { vi.advanceTimersByTime(RECICLAR_MS + 1500); });
    expect(rec.parado).toBe(true);
    expect(ultimo()).not.toBe(rec);
  });

  it("enquanto a Olyvia fala, não desliga a escuta: ignora o eco dela, e «Olyvia, …» interrompe-a e manda", async () => {
    vi.useFakeTimers();
    const falou: string[] = []; let cancelada = 0;
    class Fala { onend: (() => void) | null = null; onerror: (() => void) | null = null; lang = ""; rate = 1; voice: unknown = null; constructor(public text: string) {} }
    vi.stubGlobal("SpeechSynthesisUtterance", Fala);
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: { getVoices: () => [], cancel: () => { cancelada++; }, speak: (u: Fala) => { falou.push(u.text); } } });
    g.invoke = async () => ({ data: { acoes: [], resposta: "A obra dura cinco dias úteis.", continuar: false }, error: null });
    render(arvore("/negocios?vista=hoje"));
    const rec = ultimo();
    falar(rec, res("olyvia quanto tempo vai durar esta obra e quem está na equipa", true));
    await act(async () => { await vi.advanceTimersByTimeAsync(PAUSA_FRASE + 100); });
    {
      expect(falou).toEqual(["A obra dura cinco dias úteis."]);
      expect(rec.parado).toBe(false); // continua a ouvir
      // o eco: as palavras dela, ignoradas
      falar(rec, res("olyvia quanto tempo vai durar esta obra e quem está na equipa", true), res("a obra dura cinco dias"));
      act(() => { vi.advanceTimersByTime(PAUSA_FRASE + 100); });
      expect(loc()).toBe("/negocios?vista=hoje");
      // «Olyvia, vai aos negócios» por cima: cala-a e faz
      falar(rec, res("olyvia quanto tempo vai durar esta obra e quem está na equipa", true), res("a obra dura cinco dias olyvia vai aos negócios", true));
      act(() => { vi.advanceTimersByTime(PAUSA_ORDEM + 100); });
      expect(cancelada).toBeGreaterThan(0);
      expect(loc()).toBe("/negocios");
      delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis;
    }
  });

  it("o eco é só o que ela disse; o resto é da pessoa", () => {
    expect(eEco("a obra dura cinco", "A obra dura cinco dias úteis.")).toBe(true);
    expect(eEco("vai aos negócios", "A obra dura cinco dias úteis.")).toBe(false);
    expect(ECO_MS).toBeGreaterThan(1000);
  });
});

describe("20/11 (Rúben, decisão da auditoria): a escuta vem desligada e explica-se na 1.ª vez", () => {
  it("sem escolha guardada não ouve; ligar pela 1.ª vez mostra a explicação, e só «Ligar a escuta» liga", () => {
    localStorage.clear();
    render(arvore("/negocios"));
    expect(ativos).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    fireEvent.click(screen.getByRole("switch", { name: "Escuta sempre" }));
    // ainda não liga: primeiro a explicação (o som vai ao Chrome, servidores da Google)
    expect(ativos).toHaveLength(0);
    const caixa = screen.getByRole("dialog", { name: "Ligar a escuta" });
    expect(caixa.textContent).toMatch(/servidores da Google/);
    fireEvent.click(screen.getByRole("button", { name: "Agora não" }));
    expect(screen.queryByRole("dialog", { name: "Ligar a escuta" })).toBeNull();
    expect(screen.getByRole("switch", { name: "Escuta sempre" }).getAttribute("aria-checked")).toBe("false");
    // outra vez, e liga
    fireEvent.click(screen.getByRole("switch", { name: "Escuta sempre" }));
    fireEvent.click(screen.getByRole("button", { name: "Ligar a escuta" }));
    expect(screen.getByRole("switch", { name: "Escuta sempre" }).getAttribute("aria-checked")).toBe("true");
    expect(localStorage.getItem("olyvia-escuta-v2")).toBe("1");
    // desligar e voltar a ligar já não pergunta
    fireEvent.click(screen.getByRole("switch", { name: "Escuta sempre" }));
    fireEvent.click(screen.getByRole("switch", { name: "Escuta sempre" }));
    expect(screen.queryByRole("dialog", { name: "Ligar a escuta" })).toBeNull();
    expect(screen.getByRole("switch", { name: "Escuta sempre" }).getAttribute("aria-checked")).toBe("true");
  });

  it("a escolha antiga (olyvia-escuta = 1, gravada a todos) não liga a escuta", () => {
    localStorage.clear(); localStorage.setItem("olyvia-escuta", "1");
    render(arvore("/negocios"));
    expect(ativos).toHaveLength(0);
  });

  it("com a escuta desligada, as falas da gravação não são ordens, nem quando se liga a meio", () => {
    localStorage.clear(); localStorage.setItem("olyvia-escuta-explicada", "1");
    g.estado = "a gravar"; g.falas = [];
    const { rerender } = render(arvore("/hoje"));
    g.falas = [{ inicio: 1, fim: 2, texto: "Olyvia, vai aos negócios", falante: "A", confianca_falante: 1 }];
    rerender(arvore("/hoje"));
    fireEvent.click(screen.getByRole("button", { expanded: false }));
    fireEvent.click(screen.getByRole("switch", { name: "Escuta sempre" }));
    g.falas = [...g.falas];
    rerender(arvore("/hoje"));
    expect(loc()).toBe("/hoje");
    // a fala nova, já com a escuta ligada, é ordem
    g.falas = [...g.falas, { inicio: 5, fim: 6, texto: "Olyvia, vai aos negócios", falante: "A", confianca_falante: 1 }];
    rerender(arvore("/hoje"));
    expect(loc()).toBe("/negocios");
  });
});
