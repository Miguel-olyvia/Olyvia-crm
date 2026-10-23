// 21/10/2026: o pagamento da adenda segue o caminho do contrato. A 1.ª parcela de cada adenda assinada tem os mesmos dois passos do
// contrato no bloco Pagamento (Do contrato à obra) e no Hoje do Financeiro; valida-se sem esperar pelo aviso do cliente, pela ordem
// das parcelas (a 1.ª antes de qualquer outra); a 1.ª paga emite a encomenda dos materiais da adenda no Inventário (EC-<id>-A1).
// As parcelas seguintes só se faturam depois de paga a 1.ª (a do fim, com a obra concluída).
// Os caminhos que falhavam: A (duas faturas, sem aviso no portal: validar não fazia nada), B (o cliente paga a 2.ª, o Financeiro valida:
// sem EC), o estado antigo do CT 1038 (as duas emitidas, nenhuma paga); C (pago no portal e validado) e E (só mão de obra) já iam bem.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acoes, minhas, seed, type Estado, type Negocio } from "./motor";
import { FINANCEIRO, OBRA, emFalta, type Grupo } from "./campos";
import { esquecerInventario, lerInventario } from "./inventario/loja";
import { CaminhoObra } from "./CaminhoObra";
import { DocumentosSimples } from "./FasesSimples";
import { Hoje } from "./Hoje";
import { PortalCliente } from "./PortalCliente";
import { TrabalhosAMais } from "./TrabalhosAMais";
import { Montar } from "./v2/testeV2";
import { faturaAValidar, parcelaFaturavel, parcelasAdenda, primeiraPaga, type Adenda } from "./adendas";
import { passosPreparacao } from "./preparacaoObra";
import { adendaAssinada } from "./testeAdenda";

afterEach(() => { cleanup(); localStorage.clear(); });
beforeEach(() => { esquecerInventario(); });

const N = "AD 2026/1027-1";
type A_ = ReturnType<typeof acoes>;
/** 1027 pago (EC-1027 no Inventário) e plano aprovado; o cliente assina uma adenda de pintura (com materiais) ou só de mão de obra. */
function preparar(soMaoDeObra = false) {
  const S: Estado = seed(), d = S.deals.find((x) => x.id === 1027) as Negocio;
  const encher = (gs: Grupo[]) => { for (let i = 0; i < 5; i++) for (const c of emFalta(gs, d.f)) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x"; };
  encher(FINANCEIRO); encher([OBRA[0]]);
  const avisar = vi.fn();
  const A: A_ = acoes(S, avisar, (fn) => fn());
  A.role("financeiro"); A.emitir(d.id); A.validar(d.id);
  A.role("operacoes"); A.aprovarPlano(d.id);
  A.role("comercial");
  if (soMaoDeObra) A.criarAdenda(d.id, [], "Surpresa em obra", { livres: [{ n: "Afinar as portas", h: 4, preco: 300, perfil: "Montador", mats: [] }] });
  else A.criarAdenda(d.id, [{ sid: "pint", q: 20 }], "O cliente pediu");
  adendaAssinada(A, d.id, N);
  const a = d.adendas!.find((x) => x.n === N) as Adenda;
  return { S, A, d, a, avisar };
}
/** O estado de antes da correção (como o CT 1038): a 1.ª e a 2.ª parcela já emitidas, nenhuma paga. */
function duasFaturasAntigas(A: A_, d: Negocio, a: Adenda) {
  A.role("financeiro"); A.faturarAdendas(d.id);
  const P = parcelasAdenda(d, a);
  a.faturas!.push({ n: "FT 2026/422", q: "21/10", i: 1, l: P[1].l, p: P[1].p, v: P[1].v });
  a.faturas![0].n = "FT 2026/421";
}
const caminho = (S: Estado, d: Negocio) => render(<Montar S={S}>{(ctx) => <CaminhoObra {...ctx} d={d} />}</Montar>);
const blocoPagamento = () => screen.getByRole("heading", { name: "Pagamento" }).closest("div.rounded-xl") as HTMLElement;
const ecDaAdendaNoInventario = () => lerInventario().ecs.find((e) => e.id === "EC-1027-A1" && !e.deleted);
/** A linha do Hoje com o texto (o passo e o detalhe, "t · sub"). */
const linhaHoje = (t: RegExp): HTMLElement => screen.getByText(t).closest("li") as HTMLElement;

describe("o pagamento da adenda no bloco Pagamento, como o contrato", () => {
  it("o bloco Pagamento mostra a fatura e o pagamento da 1.ª parcela da adenda e só fica pronto com ela paga", () => {
    const { S, d } = preparar();
    S.role = "financeiro";
    caminho(S, d);
    const bloco = blocoPagamento();
    expect(within(bloco).getByText(`Emitir a fatura da adenda ${N} · 1.ª parcela`)).toBeTruthy();
    expect(within(bloco).getByText(`Validar o pagamento da adenda ${N} · 1.ª parcela`).closest("li")!.textContent).toMatch(/Depois da fatura\./);
    expect(within(bloco).queryByText("pronto")).toBeNull();
    // emitir no próprio bloco
    fireEvent.click(within(bloco).getByRole("button", { name: "Emitir a fatura" }));
    const f0 = d.adendas![0].faturas![0];
    expect(within(blocoPagamento()).getByText(`Fatura ${f0.n} · adenda ${N} · 1.ª parcela`)).toBeTruthy();
    expect(within(blocoPagamento()).queryByText("pronto")).toBeNull();
  });

  it("caminho A: duas faturas, sem aviso no portal; validar no bloco Pagamento escolhe a da 1.ª parcela e emite a EC-1027-A1", () => {
    const { S, A, d, a } = preparar();
    duasFaturasAntigas(A, d, a);
    S.role = "financeiro";
    caminho(S, d);
    const pg = within(blocoPagamento()).getByText(`Validar o pagamento da adenda ${N} · 1.ª parcela`).closest("li")!;
    expect(pg.textContent).toMatch(/Confirmar que o valor da FT 2026\/421 entrou/);
    fireEvent.click(within(pg).getByRole("button", { name: "Validar o pagamento" }));
    expect(a.faturas![0].recibo?.n).toMatch(/^RC 2026\//);
    expect(a.faturas![1].recibo).toBeUndefined();
    expect(d.obra.ecsAjuste?.find((e) => e.adenda === N)?.n).toBe("EC-1027-A1");
    expect(ecDaAdendaNoInventario()).toBeTruthy();
    // o bloco fica pronto (o contrato e a 1.ª parcela da adenda pagos) e a bolinha da encomenda da adenda feita
    const bloco = blocoPagamento();
    expect(within(bloco).getByText(`Pagamento validado · adenda ${N}`)).toBeTruthy();
    expect(within(bloco).getByText("pronto")).toBeTruthy();
    expect(screen.getByText(`Encomenda da adenda ${N} · EC-1027-A1`)).toBeTruthy();
  });

  it("caminho B: o cliente paga a 2.ª parcela no portal; o Financeiro valida no Hoje e é a 1.ª que fica paga, com a EC no Inventário", () => {
    const { S, A, d, a } = preparar();
    duasFaturasAntigas(A, d, a);
    // o portal mostra as duas já emitidas, a 1.ª primeiro, e avisa que a 2.ª é depois
    render(<Montar S={S}>{(ctx) => <PortalCliente ctx={ctx} d={d} fechar={() => {}} />}</Montar>);
    const t1 = screen.getByText("Pagar a fatura FT 2026/421"), t2 = screen.getByText("Pagar a fatura FT 2026/422");
    expect(t1.compareDocumentPosition(t2) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const c2 = t2.parentElement!;
    expect(c2.textContent).toMatch(/primeiro, a 1\.ª parcela/);
    fireEvent.click(within(c2).getByRole("radio", { name: "Transferência" }));
    fireEvent.click(within(c2).getByRole("button", { name: "Já paguei" }));
    expect(a.faturas![1].pag?.comprovativo).toBeTruthy();
    cleanup();

    // o Hoje do Financeiro: uma só tarefa de validar (a do bloco Pagamento), da 1.ª parcela
    const doHoje = minhas(S, "financeiro").filter((x) => x.d === d && x.p.act === "validarPagamentosAdenda");
    expect(doHoje).toHaveLength(1);
    S.role = "financeiro";
    render(<Montar S={S}>{(ctx) => <Hoje {...ctx} />}</Montar>);
    fireEvent.click(within(linhaHoje(new RegExp(`^Validar o pagamento da adenda ${N.replace("/", "\\/")} · 1\\.ª parcela · `))).getByRole("button", { name: "Validar o pagamento" }));
    expect(a.faturas![0].recibo).toBeTruthy();
    expect(a.faturas![1].recibo).toBeUndefined();
    expect(primeiraPaga(a)).toBe(true);
    expect(d.obra.ecsAjuste?.some((e) => e.n === "EC-1027-A1" && e.adenda === N)).toBe(true);
    expect(ecDaAdendaNoInventario()).toBeTruthy();
    cleanup();

    // a 2.ª valida-se depois, no Financeiro do negócio
    expect(faturaAValidar(a).f?.n).toBe("FT 2026/422");
    A.validarPagamentosAdenda(d.id, N);
    expect(a.faturas![1].recibo).toBeTruthy();
  });

  it("estado antigo do CT 1038 (as duas emitidas, nenhuma paga): validar sem número escolhe a FT da 1.ª parcela e emite a EC", () => {
    const { A, d, a, avisar } = preparar();
    duasFaturasAntigas(A, d, a);
    A.validarPagamentosAdenda(d.id);
    expect(a.faturas!.find((f) => f.n === "FT 2026/421")!.recibo).toBeTruthy();
    expect(a.faturas!.find((f) => f.n === "FT 2026/422")!.recibo).toBeUndefined();
    expect(ecDaAdendaNoInventario()).toBeTruthy();
    expect(avisar).toHaveBeenCalledWith(expect.objectContaining({ msg: expect.stringMatching(/^Recibo RC 2026\//), sub: expect.stringMatching(/1\.ª parcela da adenda .*FT 2026\/421/) }));
  });

  it("só a 2.ª emitida (a 1.ª não): não se valida, avisa porquê", () => {
    const { A, d, a, avisar } = preparar();
    const P = parcelasAdenda(d, a);
    a.faturas = [{ n: "FT 2026/422", q: "21/10", i: 1, l: P[1].l, p: P[1].p, v: P[1].v }];
    A.role("financeiro"); A.validarPagamentosAdenda(d.id);
    expect(a.faturas[0].recibo).toBeUndefined();
    expect(avisar).toHaveBeenCalledWith(expect.objectContaining({ msg: "Nada por validar", sub: expect.stringMatching(/Primeiro, a fatura da 1\.ª parcela/) }));
  });

  it("nada por validar: avisa e não emite recibos", () => {
    const { A, d, avisar } = preparar();
    A.role("financeiro"); A.validarPagamentosAdenda(d.id);
    expect(avisar).toHaveBeenCalledWith(expect.objectContaining({ msg: "Nada por validar" }));
    expect(d.adendas![0].faturas ?? []).toHaveLength(0);
  });

  it("caminho C: o cliente paga a 1.ª no portal, o Financeiro valida no Financeiro do negócio: EC-1027-A1", () => {
    const { S, A, d, a } = preparar();
    A.role("financeiro"); A.faturarAdendas(d.id);
    render(<Montar S={S}>{(ctx) => <PortalCliente ctx={ctx} d={d} fechar={() => {}} />}</Montar>);
    const c = screen.getByText(`Pagar a fatura ${a.faturas![0].n}`).parentElement!;
    fireEvent.click(within(c).getByRole("radio", { name: "Transferência" }));
    fireEvent.click(within(c).getByRole("button", { name: "Já paguei" }));
    cleanup();
    S.role = "financeiro";
    render(<Montar S={S}>{(ctx) => <DocumentosSimples {...ctx} d={d} />}</Montar>);
    const bloco = screen.getByTestId(`fin-adenda-${N}`);
    expect(bloco.textContent).toMatch(/O cliente avisou no portal/);
    fireEvent.click(within(bloco).getAllByRole("button", { name: "Validar o pagamento" })[0]);
    expect(a.faturas![0].recibo).toBeTruthy();
    expect(d.obra.ecsAjuste?.[0]).toMatchObject({ n: "EC-1027-A1", adenda: N });
    expect(ecDaAdendaNoInventario()).toBeTruthy();
  });

  it("caminho E: só mão de obra: «Sem materiais a encomendar»; validar a 1.ª parcela no bloco Pagamento não emite encomenda", () => {
    const { S, A, d, a } = preparar(true);
    A.role("financeiro"); A.faturarAdendas(d.id);
    S.role = "financeiro";
    caminho(S, d);
    expect(screen.getByText(`Encomenda da adenda ${N}`).closest("li")!.textContent).toMatch(/Sem materiais a encomendar/);
    const pg = within(blocoPagamento()).getByText(`Validar o pagamento da adenda ${N} · 1.ª parcela`).closest("li")!;
    expect(pg.textContent).not.toMatch(/encomenda dos materiais/);
    fireEvent.click(within(pg).getByRole("button", { name: "Validar o pagamento" }));
    expect(primeiraPaga(a)).toBe(true);
    expect(d.obra.ecsAjuste?.some((e) => e.adenda === N) ?? false).toBe(false);
    expect(within(blocoPagamento()).getByText("pronto")).toBeTruthy();
  });

  it("Arrancar a obra: por adenda, «1.ª parcela da adenda paga» e depois «Encomenda da adenda»", () => {
    const { S, A, d } = preparar();
    S.role = "operacoes";
    caminho(S, d);
    const lista = screen.getByRole("list", { name: "Condições para arrancar" });
    const itens = within(lista).getAllByRole("listitem").map((x) => x.textContent ?? "");
    const i1 = itens.findIndex((t) => t.startsWith(`1.ª parcela da adenda ${N} paga`)), i2 = itens.findIndex((t) => t.startsWith(`Encomenda da adenda ${N}`));
    expect(i1).toBeGreaterThanOrEqual(0);
    expect(i2).toBe(i1 + 1);
    expect(itens[i1]).toMatch(/por fazer/);
    cleanup();
    A.role("financeiro"); A.faturarAdendas(d.id); A.validarPagamentosAdenda(d.id);
    caminho(S, d);
    const it2 = within(screen.getByRole("list", { name: "Condições para arrancar" })).getAllByRole("listitem").map((x) => x.textContent ?? "");
    expect(it2.find((t) => t.startsWith(`1.ª parcela da adenda ${N} paga`))).toMatch(/\(feito\)/);
    expect(it2.find((t) => t.startsWith(`Encomenda da adenda ${N}`))).toMatch(/\(feito\)/);
  });
});

describe("as parcelas seguintes da adenda, como no contrato", () => {
  it("a 2.ª (no fim da obra) só se fatura com a 1.ª paga e a obra concluída: o botão fica desativado até lá", () => {
    const { S, A, d, a } = preparar();
    A.role("financeiro"); A.faturarAdendas(d.id);
    expect(parcelaFaturavel(d, a)).toMatchObject({ p: { i: 1, fim: true }, motivo: "Depois de paga a 1.ª parcela." });
    // a ação também recusa (não só o botão)
    A.faturarParcelaAdenda(d.id, N);
    expect(a.faturas).toHaveLength(1);
    S.role = "financeiro";
    render(<Montar S={S}>{(ctx) => <DocumentosSimples {...ctx} d={d} />}</Montar>);
    let bloco = screen.getByTestId(`fin-adenda-${N}`);
    const emitir = () => within(screen.getByTestId(`fin-adenda-${N}`)).getByRole("button", { name: "Emitir a fatura" }) as HTMLButtonElement;
    expect(emitir().disabled).toBe(true);
    expect(bloco.textContent).toMatch(/Depois de paga a 1\.ª parcela\./);
    cleanup();
    // os Trabalhos a mais: o mesmo
    render(<Montar S={S}>{(ctx) => <TrabalhosAMais {...ctx} d={d} />}</Montar>);
    expect((screen.getByRole("button", { name: "Emitir a fatura da 2.ª parcela" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/2\.ª parcela: depois de paga a 1\.ª parcela\./)).toBeTruthy();
    // e o pagamento da 1.ª valida-se sem o aviso do cliente
    expect((screen.getByRole("button", { name: "Validar o pagamento" }) as HTMLButtonElement).disabled).toBe(false);
    cleanup();

    A.validarPagamentosAdenda(d.id);
    expect(parcelaFaturavel(d, a).motivo).toBe("No fim da obra, com a obra concluída.");
    render(<Montar S={S}>{(ctx) => <DocumentosSimples {...ctx} d={d} />}</Montar>);
    bloco = screen.getByTestId(`fin-adenda-${N}`);
    expect(emitir().disabled).toBe(true);
    expect(bloco.textContent).toMatch(/No fim da obra, com a obra concluída\./);
    cleanup();
    A.faturarParcelaAdenda(d.id, N);
    expect(a.faturas).toHaveLength(1);

    // a obra concluída: já se fatura
    d.obra.plano!.estado = "concluída";
    expect(parcelaFaturavel(d, a).motivo).toBeNull();
    render(<Montar S={S}>{(ctx) => <DocumentosSimples {...ctx} d={d} />}</Montar>);
    expect(emitir().disabled).toBe(false);
    fireEvent.click(emitir());
    expect(a.faturas).toHaveLength(2);
    expect(a.faturas![1].i).toBe(1);
  });

  it("os passos do bloco Pagamento só mostram a 1.ª parcela; o Hoje do Financeiro não tem linhas à parte (sem duplicados)", () => {
    const { S, A, d } = preparar();
    const ids = passosPreparacao(d, S).filter((x) => x.trilho === "pag").map((x) => x.id);
    expect(ids).toEqual(["ft", "pg", `ft-ad-${N}`, `pg-ad-${N}`]);
    const fat = minhas(S, "financeiro").filter((x) => x.d === d && /adenda/.test(x.p.t));
    expect(fat.map((x) => x.p.t)).toEqual([`Emitir a fatura da adenda ${N} · 1.ª parcela`]);
    A.role("financeiro"); A.faturarAdendas(d.id);
    expect(minhas(S, "financeiro").filter((x) => x.d === d && /adenda/.test(x.p.t)).map((x) => x.p.t)).toEqual([`Validar o pagamento da adenda ${N} · 1.ª parcela`]);
  });

  it("com a obra já em curso, a adenda assinada depois continua no Hoje do Financeiro", () => {
    const { S, A, d } = preparar();
    A.role("financeiro"); A.faturarAdendas(d.id);
    d.obra.plano!.estado = "em curso";
    expect(minhas(S, "financeiro").filter((x) => x.d === d && x.p.act === "validarPagamentosAdenda")).toHaveLength(1);
    A.validarPagamentosAdenda(d.id);
    expect(minhas(S, "financeiro").filter((x) => x.d === d && /adenda/.test(x.p.t))).toHaveLength(0);
  });
});
