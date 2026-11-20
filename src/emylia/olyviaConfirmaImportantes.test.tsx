// 20/11 (auditoria de 19/11): a Olyvia carregava sem perguntar em botões que fazem andar o negócio. «Fechar levantamento», «Passar ao
// comercial», «Marcar visita» / «Marcar a visita» e «Usar esta planta» passam a pedir «Confirmas?», como o que não se desfaz — pela IA e
// pelo nome dito. Textos parecidos que não são o botão (o passo com o mesmo nome na lista dos passos, «Marcar a visita como feita», um
// cartão, um botão que só abre um painel) continuam sem perguntar.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { eImportante, eIrreversivel, pedeConfirmacao } from "./ecraOlyvia";

type Corpo = { frase: string; elementos?: { texto: string; tipo: string; zona?: string }[]; feito?: string[] };
const g = vi.hoisted(() => ({ invoke: null as null | ((nome: string, o: { body: Corpo }) => Promise<unknown>) }));
vi.mock("./gravador", () => ({ useGravacao: () => ({ estado: "parado", falas: [] }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: (n: string, o: { body: Corpo }) => (g.invoke ? g.invoke(n, o) : Promise.resolve({ data: null, error: new Error("sem função") })) } } }));

import { OlyviaComando } from "./OlyviaComando";

beforeEach(() => { localStorage.clear(); g.invoke = null; document.body.innerHTML = ""; });
afterEach(() => { cleanup(); vi.useRealTimers(); document.body.innerHTML = ""; });

/** Um botão no ecrã (dentro de `dentro`, se vier: o HTML à volta). */
function botao(texto: string, dentro = "", attrs: Record<string, string> = {}): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = texto;
  for (const [k, v] of Object.entries(attrs)) b.setAttribute(k, v);
  if (dentro) {
    const caixa = document.createElement("div");
    caixa.innerHTML = dentro;
    document.body.appendChild(caixa);
    (caixa.querySelector("[data-aqui]") ?? caixa).appendChild(b);
  } else document.body.appendChild(b);
  return b;
}

describe("pedeConfirmacao: os botões importantes", () => {
  it("confirmam: o nome inteiro do botão, com ou sem artigo, maiúsculas e acentos à parte", () => {
    for (const n of ["Fechar levantamento", "Fechar o levantamento", "Passar ao comercial", "Marcar visita", "Marcar a visita", "Usar esta planta", "  usar esta planta  ", "FECHAR LEVANTAMENTO"]) {
      expect(eImportante(n)).toBe(true);
      expect(pedeConfirmacao(botao(n), n)).toBe(true);
    }
    // o botão com ícone e seta («Fechar levantamento →» do BotaoFase): o nome lido é o texto
    const b = botao("Fechar levantamento");
    b.insertAdjacentHTML("beforeend", "<svg aria-hidden='true'></svg>");
    expect(pedeConfirmacao(b)).toBe(true);
  });

  it("não confirmam: textos parecidos que não são o botão", () => {
    for (const n of ["Marcar a visita como feita", "Marcar visita para este negócio", "Marcar visitas novas", "Fechar levantamento · Carlos Mendes",
      "Antes de fechar o levantamento", "Passar ao comercial amanhã", "Usar estas plantas", "Planta", "Marcar", "Visita", "Comercial"]) {
      expect(pedeConfirmacao(botao(n), n)).toBe(false);
    }
    // nada disto é «o que não se desfaz»: só perguntam pela regra nova
    for (const n of ["Fechar levantamento", "Passar ao comercial", "Marcar visita", "Usar esta planta"]) expect(eIrreversivel(n)).toBe(false);
  });

  it("não confirmam: o passo com o mesmo nome na lista dos passos, o passo atual, um separador, uma ligação, um botão que só abre um painel", () => {
    expect(pedeConfirmacao(botao("Passar ao comercial", `<nav aria-label="Passos desta fase"><ol><li data-aqui></li></ol></nav>`))).toBe(false);
    expect(pedeConfirmacao(botao("Marcar a visita", `<ol aria-label="Passos desta fase"><li data-aqui></li></ol>`))).toBe(false);
    expect(pedeConfirmacao(botao("Fechar levantamento", "", { "aria-current": "step" }))).toBe(false);
    expect(pedeConfirmacao(botao("Marcar visita", "", { role: "tab" }))).toBe(false);
    expect(pedeConfirmacao(botao("Marcar visita", "", { "aria-expanded": "false" }))).toBe(false);
    const a = document.createElement("a"); a.href = "/negocios"; a.textContent = "Marcar a visita"; document.body.appendChild(a);
    expect(pedeConfirmacao(a)).toBe(false);
    // sem o elemento, só o nome: só o que não se desfaz
    expect(pedeConfirmacao(null, "Fechar levantamento")).toBe(false);
    expect(pedeConfirmacao(null, "Enviar proposta")).toBe(true);
  });

  it("o que não se desfaz continua a perguntar, esteja onde estiver", () => {
    expect(pedeConfirmacao(botao("Enviar proposta", `<nav><div data-aqui></div></nav>`))).toBe(true);
    expect(pedeConfirmacao(botao("Apagar negócio", "", { "aria-expanded": "false" }))).toBe(true);
  });
});

async function pedir(frase: string) {
  fireEvent.click(screen.getByRole("button", { name: /Olyvia/ }));
  fireEvent.change(screen.getByLabelText("Comando"), { target: { value: frase } });
  await act(async () => { fireEvent.submit(screen.getByLabelText("Comando").closest("form")!); });
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
}
async function responder(texto: string) {
  fireEvent.change(screen.getByLabelText("Comando"), { target: { value: texto } });
  await act(async () => { fireEvent.submit(screen.getByLabelText("Comando").closest("form")!); });
  await act(async () => { await vi.advanceTimersByTimeAsync(500); });
}

describe("a Olyvia pergunta antes de carregar nos botões importantes", () => {
  for (const nome of ["Fechar levantamento", "Passar ao comercial", "Marcar visita", "Marcar a visita", "Usar esta planta"]) {
    it(`pela IA: «${nome}» pergunta; só com «sim» carrega`, async () => {
      vi.useFakeTimers();
      g.invoke = async (_n, o) => ({ data: { acoes: [{ tipo: "clicar", elemento: o.body.elementos!.findIndex((e) => e.texto === nome) }], resposta: "Feito.", continuar: false }, error: null });
      const carregou = vi.fn();
      botao(nome).onclick = carregou;
      render(<MemoryRouter initialEntries={["/pessoas"]}><OlyviaComando /></MemoryRouter>);
      await pedir("está tudo visto com o cliente, podes avançar com isto agora");
      expect(carregou).not.toHaveBeenCalled();
      expect(screen.getByRole("alertdialog").textContent).toContain(`Vou carregar em «${nome}». Confirmas?`);
      await responder("sim");
      expect(carregou).toHaveBeenCalledTimes(1);
    });
  }

  it("pela IA: «não» cancela", async () => {
    vi.useFakeTimers();
    g.invoke = async (_n, o) => ({ data: { acoes: [{ tipo: "clicar", elemento: o.body.elementos!.findIndex((e) => e.texto === "Fechar levantamento") }], resposta: "", continuar: false }, error: null });
    const carregou = vi.fn();
    botao("Fechar levantamento").onclick = carregou;
    render(<MemoryRouter initialEntries={["/pessoas"]}><OlyviaComando /></MemoryRouter>);
    await pedir("já vimos tudo, podes fechar o levantamento desta visita");
    await responder("não");
    expect(carregou).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("pela IA: o passo «Passar ao comercial» da lista dos passos abre-se sem perguntar", async () => {
    vi.useFakeTimers();
    g.invoke = async (_n, o) => ({ data: { acoes: [{ tipo: "clicar", elemento: o.body.elementos!.findIndex((e) => e.texto === "Passar ao comercial") }], resposta: "Abri o passo.", continuar: false }, error: null });
    const abriu = vi.fn();
    botao("Passar ao comercial", `<nav aria-label="Passos desta fase"><ol><li data-aqui></li></ol></nav>`).onclick = abriu;
    render(<MemoryRouter initialEntries={["/pessoas"]}><OlyviaComando /></MemoryRouter>);
    await pedir("mostra-me o passo de passar ao comercial deste negócio");
    expect(abriu).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("pelo nome dito («usar esta planta»): pergunta em vez de carregar logo; «sim» carrega", async () => {
    vi.useFakeTimers();
    const planta = vi.fn();
    botao("Usar esta planta").onclick = planta;
    render(<MemoryRouter initialEntries={["/pessoas"]}><OlyviaComando /></MemoryRouter>);
    await pedir("usar esta planta");
    expect(planta).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog").textContent).toContain("Vou carregar em «Usar esta planta». Confirmas?");
    await responder("sim");
    expect(planta).toHaveBeenCalledTimes(1);
  });

  it("pelo nome dito («carrega em fechar levantamento»): pergunta; «não» não carrega", async () => {
    vi.useFakeTimers();
    const fechar = vi.fn();
    botao("Fechar levantamento").onclick = fechar;
    render(<MemoryRouter initialEntries={["/pessoas"]}><OlyviaComando /></MemoryRouter>);
    await pedir("carrega em fechar levantamento");
    expect(fechar).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog").textContent).toContain("Vou carregar em «Fechar levantamento». Confirmas?");
    await responder("não");
    expect(fechar).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("pelo nome dito, um botão que não é importante carrega logo, como antes", async () => {
    vi.useFakeTimers();
    const estilo = vi.fn();
    botao("Escolher o estilo").onclick = estilo;
    render(<MemoryRouter initialEntries={["/pessoas"]}><OlyviaComando /></MemoryRouter>);
    await pedir("escolher o estilo");
    expect(estilo).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
