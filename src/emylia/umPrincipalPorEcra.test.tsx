// 20/11 (auditoria de 19/11; Rúben: «um botão principal por ecrã»). A Visita inteira (o painel da gravação, o passo aberto e o rodapé dos
// passos) tem UM botão principal em cada estado: antes da visita «Começar a gravar»; a gravar, o Estúdio no passo do Estúdio e «Terminar
// e preencher» nos outros; parada a meio, «Continuar a gravar»; no fim, «Fechar levantamento»; já gravada, «Continuar». Registar a voz,
// carregar um ficheiro e ler a folha ficam no «Mais». Na Lead, «Tudo na chamada» não compete com «Continuar»; nas Medidas, o Estúdio
// das medidas é o principal.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn(async () => ({ data: null, error: null })), from: vi.fn(), functions: { invoke: vi.fn() }, auth: { getUser: vi.fn(async () => ({ data: { user: null } })) } } }));
vi.mock("@/contexts/CompanyContext", () => ({ useCompany: () => ({ activeCompany: null }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ hasPermission: () => false, loading: false }) }));
// a gravação do gravador põe-se à mão (`grav.estado`)
const grav = vi.hoisted(() => ({ estado: null as null | Record<string, unknown> }));
vi.mock("./gravador", async (importOriginal) => {
  const real = await importOriginal<typeof import("./gravador")>();
  return { ...real, useGravacao: () => (grav.estado ?? real.useGravacao()) as ReturnType<typeof real.useGravacao>, microfones: async () => [] };
});

import { TECS, acoes, seed, type Estado, type Negocio } from "./motor";
import { podeRetificar } from "./preparacaoObra";
import type { Ctx } from "./pecas";
import { NegocioSimples } from "./NegocioSimples";
import { limparVisitas } from "./principalDaVisita";

Element.prototype.scrollIntoView = function () {};
// a página inteira do negócio (o Estúdio, o plano, as agendas) demora a montar com a suite toda a correr ao lado
vi.setConfig({ testTimeout: 30_000 });
afterEach(() => { cleanup(); grav.estado = null; limparVisitas(); });
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

/** Escondido no browser: dentro de uma parte escondida, ou de um bloco dobrado (<details> fechado, fora do título). O jsdom desenha-os. */
const escondido = (b: Element) => !!b.closest("[aria-hidden='true'],[hidden]") || (!!b.closest("details:not([open])") && !b.closest("summary"));
/** Os botões com aspeto de principal (o Button por omissão ou destrutivo) que se veem e se podem carregar. */
const principais = () => (Array.from(document.querySelectorAll("button")) as HTMLButtonElement[])
  .filter((b) => /hover:bg-(?:primary|destructive)\/90/.test(b.className) && !b.disabled && !escondido(b))
  .map((b) => (b.textContent ?? "").replace(/\s+/g, " ").trim());

const gravacao = (negocio: number, x: Record<string, unknown>) => ({ negocio, nome: "Hugo", modo: "visita", voltar: "/x", estado: "parado", falas: [], inicioEm: Date.now(), pausas: 0,
  pendentes: 0, falhadas: 0, aRever: 0, aFalar: false, nivel: 0, microfone: "", msg: "", noutroSeparador: false, pedeToque: false, ...x });

/** Um negócio de casa de banho na Visita (segue o Estúdio), aberto no passo `passo`. */
function visita(passo: string, f: Record<string, string> = {}) {
  const S: Estado = seed();
  const d = S.deals.find((x) => x.linha === "wc" && x.fase === 2)! as Negocio;
  Object.assign(d.f, f);
  S.role = "comercial"; S.view = "negocio"; S.deal = d.id;
  const A = acoes(S, vi.fn(), (fn) => fn());
  const ctx = { S, A, run: (fn: () => void) => fn(), go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
  return { S, ctx, d, passo };
}
/** Abre o negócio e vai ao passo pela lista dos passos («Estúdio», «Fim»; vazio: o primeiro por fazer). */
async function abrir(ctx: Ctx, passo = "") {
  await act(async () => { render(<NegocioSimples {...ctx} />); });
  if (!passo) return;
  const lista = screen.getAllByRole("navigation", { name: "Passos desta fase" })[0]!;
  await act(async () => { fireEvent.click(within(lista).getByRole("button", { name: new RegExp(`^${passo === "fim" ? "Fim" : "Estúdio"}`) })); });
}

describe("a Visita: um só botão principal por estado", () => {
  it("antes da visita (nada gravado), num passo qualquer: «Começar a gravar»", async () => {
    const { ctx } = visita("");
    await abrir(ctx);
    expect(principais()).toEqual(["Começar a gravar"]);
    // o «Continuar» do passo está lá, mas secundário
    expect(screen.getAllByRole("button", { name: "Continuar" }).length).toBeGreaterThan(0);
  });

  it("antes da visita, no passo do Estúdio: «Começar a gravar» (o Estúdio fica secundário)", async () => {
    const { ctx, passo } = visita("estudio");
    await abrir(ctx, passo);
    expect(screen.getByRole("button", { name: /Abrir o Estúdio|Continuar no Estúdio/ })).toBeInTheDocument();
    expect(principais()).toEqual(["Começar a gravar"]);
  });

  it("a gravar, no passo do Estúdio: o Estúdio (a gravação continua lá); «Terminar e preencher» fica secundário", async () => {
    const { ctx, d, passo } = visita("estudio");
    grav.estado = gravacao(d.id, { estado: "a_ouvir" });
    await abrir(ctx, passo);
    expect(screen.getByRole("button", { name: "Terminar e preencher" })).toBeInTheDocument();
    expect(principais()).toHaveLength(1);
    expect(principais()[0]).toMatch(/^(Abrir o Estúdio|Continuar no Estúdio)$/);
  });

  it("a gravar, noutro passo: «Terminar e preencher»", async () => {
    const { ctx, d } = visita("");
    grav.estado = gravacao(d.id, { estado: "a_ouvir" });
    await abrir(ctx);
    expect(principais()).toEqual(["Terminar e preencher"]);
  });

  it("a gravação parou a meio: «Continuar a gravar»", async () => {
    const { ctx, d, passo } = visita("estudio");
    grav.estado = gravacao(d.id, { estado: "interrompida" });
    await abrir(ctx, passo);
    expect(principais()).toEqual(["Continuar a gravar"]);
  });

  it("no fim: «Fechar levantamento» («Começar a gravar» fica secundário)", async () => {
    const { ctx, passo } = visita("fim");
    await abrir(ctx, passo);
    expect(screen.getByRole("button", { name: "Começar a gravar" })).toBeInTheDocument();
    expect(principais()).toEqual(["Fechar levantamento"]);
  });

  it("no fim, ainda a gravar: «Terminar e preencher» primeiro", async () => {
    const { ctx, d, passo } = visita("fim");
    grav.estado = gravacao(d.id, { estado: "a_ouvir" });
    await abrir(ctx, passo);
    expect(principais()).toEqual(["Terminar e preencher"]);
  });

  it("já gravada (a transcrição está no negócio): «Continuar» nos passos, o Estúdio no passo dele", async () => {
    const t = { transcricao_visita: "0:03 Cliente: Quero tirar a banheira." };
    const a = visita("", t);
    await abrir(a.ctx);
    expect(principais()).toEqual(["Continuar"]);
    cleanup(); limparVisitas();
    const b = visita("estudio", t);
    await abrir(b.ctx, b.passo);
    expect(principais()).toHaveLength(1);
    expect(principais()[0]).toMatch(/^(Abrir o Estúdio|Continuar no Estúdio)$/);
  });

  it("registar a voz, carregar um ficheiro e ler a folha ficam no «Mais»", async () => {
    const { ctx } = visita("");
    await abrir(ctx);
    for (const nome of [/Registar a minha voz/, /Carregar gravação/, /Ler a folha/]) expect(screen.queryByRole("button", { name: nome })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Mais opções da gravação" }));
    const mais = screen.getByRole("group", { name: "Mais opções da gravação" });
    for (const nome of [/Registar a minha voz/, /Carregar gravação/, /Ler a folha/]) expect(within(mais).getByRole("button", { name: nome })).toBeInTheDocument();
    // abrir o «Mais» não acrescenta principais
    expect(principais()).toEqual(["Começar a gravar"]);
  });
});

describe("a Lead: «Tudo na chamada» não compete com «Continuar»", () => {
  it("«Tudo na chamada» é secundário; dentro dele, o principal é «Iniciar chamada»", async () => {
    const S: Estado = seed();
    const d = S.deals.find((x) => x.fase === 0)! as Negocio;
    S.role = "comercial"; S.view = "negocio"; S.deal = d.id;
    const A = acoes(S, vi.fn(), (fn) => fn());
    const ctx = { S, A, run: (fn: () => void) => fn(), go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
    window.history.replaceState({}, "", `/negocios?negocio=${d.id}`);
    await abrir(ctx);
    const tudo = screen.getByRole("button", { name: "Tudo na chamada" });
    expect(tudo.className).not.toMatch(/hover:bg-primary\/90/);
    expect(principais()).not.toContain("Tudo na chamada");
    expect(principais()).toHaveLength(1);
    fireEvent.click(tudo);
    expect(screen.getByRole("button", { name: "Voltar aos passos" }).className).not.toMatch(/hover:bg-primary\/90/);
    expect(screen.getByRole("button", { name: "Iniciar chamada" }).className).toMatch(/hover:bg-primary\/90/);
  });
});

describe("as Medidas (lote 2, 5a956735): o Estúdio das medidas é o único principal", () => {
  /** Uma obra com o pagamento validado; as Operações no passo Medidas; quem vai medir escolhido ou não. */
  async function medidas(supervisor: boolean) {
    const S: Estado = seed();
    const d = S.deals.find((x) => x.fase === 5 && podeRetificar(x as Negocio))! as Negocio;
    d.f.retif_aceite = "";
    d.f.supervisor_medidas = supervisor ? TECS[0]!.id : "";
    S.role = "operacoes"; S.view = "negocio"; S.deal = d.id;
    const A = acoes(S, vi.fn(), (fn) => fn());
    const ctx = { S, A, run: (fn: () => void) => fn(), go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
    await act(async () => { render(<NegocioSimples {...ctx} />); });
    const lista = screen.getAllByRole("navigation", { name: "Passos desta fase" })[0]!;
    await act(async () => { fireEvent.click(within(lista).getByRole("button", { name: /^Medidas/ })); });
    return d;
  }

  it("com quem vai medir escolhido: o cartão do Estúdio das medidas é o principal; o «Continuar» fica secundário", async () => {
    await medidas(true);
    expect(screen.getByText("Abrir o estúdio das medidas")).toBeInTheDocument();
    for (const b of screen.getAllByRole("button", { name: "Continuar" })) expect(b.className).not.toMatch(/hover:bg-primary\/90/);
    expect(principais()).toEqual([]);
    // os textos são os do fluxo em vigor (as medidas depois do pagamento validado), não os de antes
    const corpo = document.getElementById("passo-corpo")!.textContent ?? "";
    expect(corpo).not.toMatch(/antes do contrato|depois de o cliente aceitar a proposta/i);
    expect(corpo).toMatch(/Estúdio das medidas/);
  });

  it("sem quem vai medir: não há cartão, e o «Continuar» volta a ser o principal", async () => {
    await medidas(false);
    expect(screen.queryByText("Abrir o estúdio das medidas")).toBeNull();
    expect(screen.getByText(/Escolha quem vai medir/)).toBeInTheDocument();
    expect(principais()).toEqual(["Continuar"]);
  });

  it("o Estúdio das medidas aberto tem um só principal: «Aceitar as medidas»", async () => {
    await medidas(true);
    await act(async () => { fireEvent.click(screen.getByText("Abrir o estúdio das medidas").closest("button")!); });
    expect(screen.getByRole("button", { name: /Aceitar as medidas/ })).toBeInTheDocument();
    expect(principais()).toEqual(["Aceitar as medidas"]);
  });
});
