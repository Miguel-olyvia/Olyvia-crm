// 12/11 (Rúben: «quem paga?»): com a obra em curso, juntar, prolongar ou atrasar pergunta porquê. Um teste por resposta, e o Estúdio
// a desviar as mudanças para o «Porquê?».
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { acoes } from "../motor";
import type { Ctx } from "../pecas";
import { adendaPorAssinar } from "../testeAdenda";
import { EstudioObra } from "./EstudioObra";
import { obraDeExemplo } from "./exemploObra";
import { margemAoVivo } from "./previsaoObra";
import { custoDosNossos, impactoAjuste, pedePorque, percursoAdenda } from "./quemPaga";
import { ocupacaoDosTecnicos } from "../preparacaoObra";

afterEach(cleanup);

function obra() {
  const { S, d } = obraDeExemplo();
  const avisos: string[] = [];
  const A = acoes(S, (a) => avisos.push(a.msg), (fn) => fn());
  const p = d.obra.plano!;
  const ix = (nome: string) => p.tasks.findIndex((t) => t.nome === nome);
  return { S, d, A, p, ix, avisos };
}
function montar() {
  const { S, d } = obraDeExemplo();
  const A = acoes(S, () => {}, (fn) => fn());
  const ctx = { S, A, run: (fn: () => void) => { fn(); r.rerender(<EstudioObra ctx={ctx} d={d} fechar={() => {}} />); }, go: (fn: () => void) => () => fn(), q: "" } as unknown as Ctx;
  const r = render(<EstudioObra ctx={ctx} d={d} fechar={() => {}} />);
  return { S, d, p: d.obra.plano! };
}

describe("quem paga: o impacto antes de escolher", () => {
  it("só pergunta com a obra em curso e quando custa mais (dias, horas, tarefa nova, atraso)", () => {
    const { S, d, p, ix } = obra();
    const mont = ix("Montagem de móveis"), rev = ix("Revestimento de parede");
    expect(pedePorque(p, { k: "prolongar", ti: mont, dur: p.tasks[mont].dur + 1 })).toBe(true);
    expect(pedePorque(p, { k: "prolongar", ti: mont, dur: p.tasks[mont].dur - 1 })).toBe(false);
    expect(pedePorque(p, { k: "atraso", ti: rev, dias: 2 })).toBe(true);
    // o atraso numa tarefa começada: mais dias de trabalho ao ritmo dela, e o fim anda
    const I = impactoAjuste(S, p, { k: "atraso", ti: rev, dias: 2 }, ocupacaoDosTecnicos(S, d.id))!;
    expect(I.horas).toBeGreaterThan(0);
    expect(I.dias).toBeGreaterThan(0);
    expect(I.totalCliente).toBeGreaterThan(I.precoCliente);
    expect(I.custo).toBeGreaterThan(0);
  });
});

describe("1. «O cliente pediu»: paga o cliente", () => {
  it("prepara uma adenda já preenchida, por disparar; o plano só muda quando ele assinar; depois, o seu percurso até paga", () => {
    const { d, A, p, ix } = obra();
    const rev = ix("Revestimento de parede"), dur0 = p.tasks[rev].dur, h0 = p.tasks[rev].h;
    const n = A.ajusteDoCliente(d.id, { k: "atraso", ti: rev, dias: 2 }, { nota: "quer mais um nicho" })!;
    expect(n).toMatch(/^AD 2026\/1027-/);
    const a = d.adendas!.find((x) => x.n === n)!;
    // por disparar: nada foi ao cliente
    expect(a.estado).toBe("rascunho");
    expect(a.verif).toBe(true);
    expect(percursoAdenda(d, a).t).toBe("Por disparar");
    expect(a.motivo).toBe("O cliente pediu");
    expect(a.ajuste).toMatchObject({ k: "atraso", tarefa: "Revestimento de parede", dias: 2 });
    expect(a.linhas[0]).toMatchObject({ livre: true, perfil: p.tasks[rev].sk });
    expect(a.linhas[0].h).toBeGreaterThan(0);
    // à espera do cliente: nada mudou no plano
    expect(p.tasks[rev].dur).toBe(dur0);
    expect(d.obra.diario!.at(-1)!.t).toMatch(/por disparar/);
    expect(A.verificarEnviarAdenda(d.id, n)).toBe(true);
    expect(percursoAdenda(d, a).t).toBe("À espera do cliente");
    adendaPorAssinar(A, d.id, n);
    expect(percursoAdenda(d, a).t).toBe("Aceite · contrato por assinar");
    A.assinarAdenda(d.id, n);
    expect(a.estado).toBe("assinada");
    expect(percursoAdenda(d, a)).toMatchObject({ t: "Assinada · fatura por emitir", quem: "Financeiro" });
    // o fluxo de pagamento da adenda: a 1.ª parcela faturada e paga
    A.role("financeiro");
    A.faturarParcelaAdenda(d.id, n);
    expect(percursoAdenda(d, a).t).toMatch(/por pagar \(1\.ª parcela\)/);
    A.validarPagamentosAdenda(d.id, n);
    expect(percursoAdenda(d, a).i).toBeGreaterThanOrEqual(3);
    A.role("operacoes");
    const t = p.tasks.find((x) => x.nome === "Revestimento de parede")!;
    expect(t.dur).toBeGreaterThan(dur0);
    expect(t.h).toBeGreaterThan(h0);
    expect(d.obra.alteracoes![0]).toMatchObject({ paga: "cliente", adenda: n, tarefa: "Revestimento de parede" });
  });
  it("a tarefa nova pedida pelo cliente entra com o serviço da adenda, depois de assinada", () => {
    const { d, A, p } = obra();
    const n0 = p.tasks.length;
    const n = A.ajusteDoCliente(d.id, { k: "nova", n: { sid: "pint", q: 10, fase: 4 } })!;
    expect(p.tasks).toHaveLength(n0);
    expect(d.adendas!.find((x) => x.n === n)!.estado).toBe("rascunho");
    expect(d.adendas!.find((x) => x.n === n)!.linhas[0].sid).toBe("pint");
    adendaPorAssinar(A, d.id, n);
    A.assinarAdenda(d.id, n);
    expect(p.tasks).toHaveLength(n0 + 1);
    const t = p.tasks.find((x) => x.adenda === n)!;
    expect(t.svcs).toEqual(["pint"]);
    expect(t.dia).toBeGreaterThanOrEqual(p.dia);
  });
});

describe("2. «Imprevisto em obra»: o registo do imprevisto, já preenchido", () => {
  it("no Estúdio, prolongar a montagem pergunta porquê; o imprevisto abre com a tarefa e os dias", () => {
    const { p } = montar();
    const mont = p.tasks.findIndex((t) => t.nome === "Montagem de móveis"), dur0 = p.tasks[mont].dur;
    fireEvent.click(screen.getByRole("button", { name: /^Montagem de móveis:/ }));
    fireEvent.click(within(screen.getByRole("complementary", { name: "A tarefa" })).getByRole("button", { name: "Dura: mais" }));
    // não mudou: pergunta primeiro
    expect(p.tasks[mont].dur).toBe(dur0);
    const porque = screen.getByRole("complementary", { name: "Quem paga a mudança" });
    const g = within(porque).getByRole("radiogroup", { name: "Quem paga" });
    expect(within(g).getByRole("radio", { name: /O cliente pediu.*€ para o cliente/ })).toBeTruthy();
    expect(within(g).getByRole("radio", { name: /Atraso ou erro nosso.*€ de margem/ })).toBeTruthy();
    fireEvent.click(within(g).getByRole("radio", { name: /Imprevisto em obra/ }));
    fireEvent.click(within(porque).getByRole("button", { name: "Registar o imprevisto" }));
    const im = screen.getByRole("complementary", { name: "Registar imprevisto" });
    expect(within(im).getByRole("button", { name: "Montagem de móveis" }).getAttribute("aria-pressed")).toBe("true");
    expect(p.tasks[mont].dur).toBe(dur0);
  });
});

describe("3. «Atraso ou erro nosso»: paga a empresa", () => {
  it("entra já; o custo fica nas mudanças e no diário, e sai da margem ao vivo", () => {
    const { S, d, A, p, ix } = obra();
    const rev = ix("Revestimento de parede"), fim0 = Math.max(...p.tasks.map((t) => t.dia + t.dur));
    const m0 = margemAoVivo(d, S)!;
    expect(A.ajusteNosso(d.id, { k: "atraso", ti: rev, dias: 2 }, { nota: "azulejo mal assente" })).toBe(true);
    expect(Math.max(...p.tasks.map((t) => t.dia + t.dur))).toBeGreaterThan(fim0);
    const alt = d.obra.alteracoes![0];
    expect(alt).toMatchObject({ paga: "empresa", tarefa: "Revestimento de parede", motivo: "Atraso ou erro nosso: azulejo mal assente", cliente: false });
    expect(alt.custo).toBeGreaterThan(0);
    expect(d.obra.diario!.at(-1)!.t).toMatch(/paga a empresa/);
    expect(custoDosNossos(d).custo).toBe(alt.custo);
    const m1 = margemAoVivo(d, S)!;
    expect(m1.nossos).toBe(alt.custo);
    expect(m1.margemViva).toBeLessThan(m0.margemViva);
    // nada vai ao cliente (sem adenda)
    expect((d.adendas ?? []).some((a) => a.ajuste)).toBe(false);
  });
  it("no Estúdio, «E se atrasar?» pergunta porquê e aplica pago pela empresa", () => {
    const { d } = montar();
    fireEvent.click(screen.getByRole("button", { name: /^Revestimento de parede:/ }));
    const painel = screen.getByRole("complementary", { name: "A tarefa" });
    fireEvent.click(within(painel).getByRole("button", { name: "Ver no plano" }));
    const previa = screen.getByRole("region", { name: "Antes de aplicar" });
    const g = within(previa).getByRole("radiogroup", { name: "Quem paga" });
    fireEvent.click(within(g).getByRole("radio", { name: /Atraso ou erro nosso/ }));
    fireEvent.click(within(previa).getByRole("button", { name: "Aplicar: paga a empresa" }));
    expect(d.obra.alteracoes![0]).toMatchObject({ paga: "empresa", tarefa: "Revestimento de parede" });
    expect(screen.getByText(/Atrasos e erros nossos: 1 mudança/)).toBeTruthy();
  });
});

describe("o alerta das adendas por disparar, em cima do Estúdio (sem sair dele)", () => {
  it("o pedido do cliente fica no alerta: ver ou mudar, enviar ao cliente; o percurso segue lá", () => {
    const { d, p } = montar();
    const mont = p.tasks.findIndex((t) => t.nome === "Montagem de móveis");
    fireEvent.click(screen.getByRole("button", { name: /^Montagem de móveis:/ }));
    fireEvent.click(within(screen.getByRole("complementary", { name: "A tarefa" })).getByRole("button", { name: "Dura: mais" }));
    const porque = screen.getByRole("complementary", { name: "Quem paga a mudança" });
    fireEvent.click(within(porque).getByRole("radio", { name: /O cliente pediu/ }));
    fireEvent.click(within(porque).getByRole("button", { name: "Preparar a adenda" }));
    const al = screen.getByRole("region", { name: "Adendas da obra" });
    expect(within(al).getByText("1 adenda por disparar")).toBeTruthy();
    const a = d.adendas!.find((x) => x.ajuste)!;
    const cartao = within(al).getByRole("article", { name: `Adenda ${a.n}` });
    expect(within(cartao).getByText(/Pedido do cliente · Montagem de móveis/)).toBeTruthy();
    expect(within(cartao).getByText(/com IVA/)).toBeTruthy();
    // ver ou mudar, por cima: mais horas, o total sobe
    const antes = a.linhas[0].h;
    fireEvent.click(within(cartao).getByRole("button", { name: "Ver ou mudar" }));
    const dlg = screen.getByRole("dialog", { name: `Adenda ${a.n}` });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: `Adenda ${a.n}` })).toBeNull();
    expect(screen.getByRole("region", { name: "Adendas da obra" })).toBeTruthy(); // o Estúdio ficou
    fireEvent.click(within(screen.getByRole("article", { name: `Adenda ${a.n}` })).getByRole("button", { name: "Ver ou mudar" }));
    const dlg2 = screen.getByRole("dialog", { name: `Adenda ${a.n}` });
    void dlg;
    fireEvent.change(within(dlg2).getByLabelText(/^Horas de/), { target: { value: String(antes + 2) } });
    fireEvent.click(within(dlg2).getByRole("button", { name: "Guardar" }));
    expect(a.linhas[0].h).toBe(antes + 2);
    expect(a.ajuste!.k !== "nova" && a.ajuste!.horas).toBe(antes + 2);
    // disparar: vai ao cliente; o alerta mostra o percurso
    fireEvent.click(within(screen.getByRole("article", { name: `Adenda ${a.n}` })).getByRole("button", { name: "Enviar ao cliente" }));
    expect(a.estado).toBe("enviada");
    expect(within(screen.getByRole("region", { name: "Adendas da obra" })).getByRole("listitem", { name: `Adenda ${a.n}: À espera do cliente` })).toBeTruthy();
    expect(p.tasks[mont].dur).toBe(p.tasks[mont].dur); // o plano não mexeu
  });
  it("descartar tira a adenda (nada foi ao cliente) e o imprevisto com custo fica por disparar", () => {
    const { d } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Registar imprevisto" }));
    const painel = screen.getByRole("complementary", { name: "Registar imprevisto" });
    fireEvent.change(within(painel).getByPlaceholderText(/cano de esgoto/), { target: { value: "Tubo partido na parede" } });
    fireEvent.click(within(painel).getByRole("button", { name: "Revestimento de parede" }));
    fireEvent.click(within(painel).getByRole("button", { name: "Sim, vai numa adenda" }));
    fireEvent.click(within(painel).getByRole("button", { name: /Registar e preparar a adenda/ }));
    const im = d.obra.imprevistos!.find((x) => x.texto === "Tubo partido na parede")!;
    const a = d.adendas!.find((x) => x.n === im.adenda)!;
    expect(a.estado).toBe("rascunho");
    const cartao = within(screen.getByRole("region", { name: "Adendas da obra" })).getByRole("article", { name: `Adenda ${a.n}` });
    expect(within(cartao).getByText(/Imprevisto · Tubo partido na parede/)).toBeTruthy();
    fireEvent.click(within(cartao).getByRole("button", { name: "Descartar" }));
    expect(a.estado).toBe("anulada");
    expect(im.estado).toBe("aberto");
  });
  it("no bloco Imprevistos do Estúdio, «Fazer a proposta» também prepara a adenda por disparar", () => {
    const { d } = montar();
    const im = d.obra.imprevistos!.find((x) => x.estado === "aberto")!;
    const cartaoIm = screen.getByRole("article", { name: `Imprevisto ${im.id}` });
    fireEvent.click(within(cartaoIm).getByRole("button", { name: "Fazer a proposta ao cliente" }));
    fireEvent.click(within(screen.getByRole("article", { name: `Imprevisto ${im.id}` })).getByRole("button", { name: "Preparar a adenda" }));
    expect(im.estado).toBe("proposta");
    const a = d.adendas!.find((x) => x.n === im.adenda)!;
    expect(a.estado).toBe("rascunho");
    expect(within(screen.getByRole("article", { name: `Imprevisto ${im.id}` })).getByText("adenda por disparar")).toBeTruthy();
    const al = screen.getByRole("region", { name: "Adendas da obra" });
    fireEvent.click(within(within(al).getByRole("article", { name: `Adenda ${a.n}` })).getByRole("button", { name: "Enviar ao cliente" }));
    expect(a.estado).toBe("enviada");
  });
});
