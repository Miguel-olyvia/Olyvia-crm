// 17/11 (Rúben: «leva tempo a reagir», «devia manter-se ligado após a troca de página», «desativar quando se inicia uma gravação»):
// a escuta contínua da Olyvia com um reconhecedor de voz falso (o Web Speech do browser) e o gravador simulado.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import { EV_ABRIR, EV_PASSO } from "./comandoOlyvia";

const g = vi.hoisted(() => ({ estado: "parado" as string }));
vi.mock("./gravador", () => ({ useGravacao: () => ({ estado: g.estado }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { OlyviaComando, PAUSA_PARA_AGIR } from "./OlyviaComando";

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

beforeEach(() => {
  localStorage.clear(); ativos = []; g.estado = "parado";
  (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = Falso;
});
afterEach(() => {
  cleanup(); vi.useRealTimers();
  delete (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
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
