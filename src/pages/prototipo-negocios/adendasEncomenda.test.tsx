// 21/10/2026 (decisão B): a adenda assinada junta as tarefas ao plano, mas os materiais dela só vão para o Inventário quando o Financeiro
// valida o pagamento DESSA adenda (como no contrato). Testado pelos ecrãs: Do contrato à obra (bolinhas por adenda nos Materiais e no Plano,
// a lista para arrancar), o Financeiro (fatura e pagamento da adenda), o portal do cliente (paga), os Materiais, a nota de encomenda e o Hoje.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eur, minhas, seed, type Estado, type Negocio } from "./motor";
import { FINANCEIRO, OBRA, emFalta, type Grupo } from "./campos";
import { esquecerInventario, lerInventario } from "./inventario/loja";
import { CaminhoObra } from "./CaminhoObra";
import { DocumentosSimples } from "./FasesSimples";
import { MateriaisObra } from "./MateriaisObra";
import { PortalCliente } from "./PortalCliente";
import { NotaEncomendaDoc } from "./DocsCliente";
import { FinanceiroV2 } from "./v2/FinanceiroV2";
import { CHAVE_VERSAO } from "./versaoPrototipo";
import { Montar } from "./v2/testeV2";
import { faltaParaArrancar } from "./preparacaoObra";
import { receberTudo } from "./testeObra";
import { totaisAdenda } from "./adendas";
import { adendaAssinada } from "./testeAdenda";

afterEach(() => { cleanup(); localStorage.clear(); });
beforeEach(() => { esquecerInventario(); });

const N = "AD 2026/1027-1";
/** 1027 pago (EC-1027 no Inventário) e plano aprovado; o cliente assina uma adenda de pintura (tem consumíveis na receita). */
function preparar() {
  const S: Estado = seed(), d = S.deals.find((x) => x.id === 1027) as Negocio;
  const encher = (gs: Grupo[]) => { for (let i = 0; i < 5; i++) for (const c of emFalta(gs, d.f)) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x"; };
  encher(FINANCEIRO); encher([OBRA[0]]);
  let A!: Parameters<Parameters<typeof Montar>[0]["children"]>[0]["A"];
  render(<Montar S={S}>{(ctx) => { A = ctx.A; return null; }}</Montar>);
  cleanup();
  A.role("financeiro"); A.emitir(d.id); A.validar(d.id);
  A.role("operacoes"); A.aprovarPlano(d.id);
  A.role("comercial"); A.criarAdenda(d.id, [{ sid: "pint", q: 20 }], "O cliente pediu"); adendaAssinada(A, d.id, N);
  return { S, A, d };
}
const caminho = (S: Estado, d: Negocio) => render(<Montar S={S}>{(ctx) => <CaminhoObra {...ctx} d={d} />}</Montar>);
const condicoes = () => screen.getByRole("list", { name: "Condições para arrancar" });

describe("adenda com encomenda própria, no pagamento dela", () => {
  it("assinada: as bolinhas da adenda nos Materiais (à espera do pagamento) e no Plano (+dias); o plano volta a aprovação; nada no Inventário", () => {
    const { S, d } = preparar();
    expect(d.obra.plano!.estado).toBe("por aprovar");
    expect(lerInventario().ecs.some((e) => e.id.startsWith("EC-1027-A"))).toBe(false);
    S.role = "operacoes";
    caminho(S, d);
    // (o mesmo texto aparece na bolinha, no trilho Materiais, e na lista para arrancar, em baixo)
    const mat = screen.getAllByText("Encomenda da adenda AD 2026/1027-1")[0].closest("li")!;
    expect(mat.textContent).toMatch(/Emite-se quando o pagamento da 1\.ª parcela da adenda for validado\./);
    expect(mat.textContent).toMatch(/\(ainda não\)/);
    expect(screen.getByText(/^Tarefas da adenda AD 2026\/1027-1 juntas ao plano · \+\d+ dias?$/)).toBeTruthy();
    // o plano reaberto pela adenda: aprovar de novo
    expect(screen.getByRole("button", { name: "Aprovar o plano" })).toBeTruthy();
    // para arrancar: a adenda (fatura e pagamento) e, na lista, a encomenda dela por fazer
    expect(screen.getByText(/Para arrancar, falta .*faturar a 1\.ª parcela da adenda AD 2026\/1027-1 e receber o pagamento/)).toBeTruthy();
    expect(within(condicoes()).getByText("Encomenda da adenda AD 2026/1027-1").closest("li")!.textContent).toMatch(/por fazer/);
  });

  it("o gate antes do arranque inclui a adenda; o Financeiro fatura, o cliente paga no portal, o Financeiro valida e a EC-1027-A1 nasce ligada à adenda", () => {
    const { S, A, d } = preparar();
    A.role("operacoes"); A.aprovarPlano(d.id);
    expect(receberTudo("CT 2026/1027")).toBe("");
    // com tudo o resto pronto, só a adenda segura o arranque
    expect(faltaParaArrancar(d)).toEqual([`faturar a 1.ª parcela da adenda ${N} e receber o pagamento`]);
    A.arrancar(d.id);
    expect(d.obra.plano!.estado).toBe("aprovado");
    // o Hoje do Financeiro: emitir a fatura da adenda
    expect(minhas(S, "financeiro").some((x) => x.d === d && x.p.act === "faturarAdendas")).toBe(true);

    // o Financeiro, no passo Financeiro do negócio: a adenda com o valor com IVA, emite a fatura
    S.role = "financeiro";
    render(<Montar S={S}>{(ctx) => <DocumentosSimples {...ctx} d={d} />}</Montar>);
    let bloco = screen.getByTestId(`fin-adenda-${N}`);
    expect(bloco.textContent).toContain(`${eur(totaisAdenda(d.adendas![0]).total)} € com IVA`);
    expect(bloco.textContent).toMatch(/Emite-se quando o pagamento da 1\.ª parcela da adenda for validado\./);
    fireEvent.click(within(bloco).getByRole("button", { name: "Emitir a fatura" }));
    const a = d.adendas![0], ft = () => a.faturas![0];
    // 21/10 (decisão C): a 1.ª parcela (50%, como no contrato)
    expect(ft()).toMatchObject({ i: 0, p: 0.5, n: expect.stringMatching(/^FT 2026\//) });
    expect(within(bloco).queryByRole("button", { name: "Validar o pagamento" })).toBeNull(); // ainda sem aviso do cliente
    cleanup();

    // o cliente paga no portal (o cartão da fatura da adenda)
    render(<Montar S={S}>{(ctx) => <PortalCliente ctx={ctx} d={d} fechar={() => {}} />}</Montar>);
    const cartao = screen.getByText(`Pagar a fatura ${ft().n}`).parentElement!;
    expect(cartao.textContent).toMatch(/Adenda AD 2026\/1027-1/);
    fireEvent.click(within(cartao).getByRole("radio", { name: "Transferência" }));
    fireEvent.click(within(cartao).getByRole("button", { name: "Já paguei" }));
    expect(ft().pag?.comprovativo).toBeTruthy();
    expect(lerInventario().ecs.some((e) => e.id === "EC-1027-A1")).toBe(false); // avisar não chega: falta validar
    cleanup();

    // o Financeiro valida: sai o recibo e a encomenda da adenda vai para o Inventário
    expect(minhas(S, "financeiro").some((x) => x.d === d && x.p.act === "validarPagamentosAdenda")).toBe(true);
    render(<Montar S={S}>{(ctx) => <DocumentosSimples {...ctx} d={d} />}</Montar>);
    bloco = screen.getByTestId(`fin-adenda-${N}`);
    fireEvent.click(within(bloco).getByRole("button", { name: "Validar o pagamento" }));
    expect(ft().recibo?.n).toMatch(/^RC 2026\//);
    expect(bloco.textContent).toMatch(/Encomenda EC-1027-A1 no Inventário/);
    const ec = lerInventario().ecs.find((e) => e.id === "EC-1027-A1")!;
    expect(ec.deleted).toBeFalsy();
    expect(ec.origin.ref).toBe("CT 2026/1027 · A1");
    expect(d.obra.ecsAjuste![0]).toMatchObject({ n: "EC-1027-A1", adenda: N });
    cleanup();

    // Do contrato à obra: a bolinha da adenda feita, com o número; a lista para arrancar já a tem
    S.role = "operacoes";
    caminho(S, d);
    expect(screen.getByText("Encomenda da adenda AD 2026/1027-1 · EC-1027-A1").closest("li")!.textContent).toMatch(/Emitida ao validar o pagamento da adenda/);
    expect(within(condicoes()).getByText("Encomenda da adenda AD 2026/1027-1").closest("li")!.textContent).toMatch(/\(feito\)/);
    cleanup();

    // os Materiais e a nota de encomenda do cliente mostram as linhas da EC da adenda
    render(<Montar S={S}>{(ctx) => <MateriaisObra {...ctx} d={d} />}</Montar>);
    expect(screen.getByText(/Encomenda da adenda AD 2026\/1027-1 · EC-1027-A1 · emitida ao validar o pagamento da adenda/)).toBeTruthy();
    expect(screen.queryByRole("region", { name: `Materiais da adenda ${N}` })).toBeNull();
    cleanup();
    const nome = d.obra.ecsAjuste![0].linhas[0].n;
    render(<NotaEncomendaDoc d={d} />);
    expect(screen.getAllByText(nome).length).toBeGreaterThan(0);
    cleanup();

    // as encomendas a fornecedor da adenda não seguram o arranque depois de recebidas; arranca
    expect(receberTudo("CT 2026/1027 · A1")).toBe("");
    expect(faltaParaArrancar(d)).toEqual([]);
    A.role("operacoes"); A.arrancar(d.id);
    expect(d.obra.plano!.estado).toBe("em curso");
  });

  it("antes do pagamento da adenda, os Materiais mostram os dela à parte e o botão dos ajustes não os encomenda", () => {
    const { S, d } = preparar();
    S.role = "operacoes";
    render(<Montar S={S}>{(ctx) => <MateriaisObra {...ctx} d={d} />}</Montar>);
    const sec = screen.getByRole("region", { name: `Materiais da adenda ${N}` });
    expect(sec.textContent).toMatch(/Encomendam-se quando o pagamento da 1.ª parcela da adenda for validado/);
    expect(screen.queryByRole("button", { name: "Encomendar os materiais novos" })).toBeNull();
  });

  it("com a obra já a andar, a adenda assinada não segura nada (o gate é só antes do arranque)", () => {
    const { d } = preparar();
    expect(faltaParaArrancar(d).some((x) => /adenda/.test(x))).toBe(true);
    d.obra.plano!.estado = "em curso";
    expect(faltaParaArrancar(d).some((x) => /adenda/.test(x))).toBe(false);
  });

  it("a adenda recusada não aparece em lado nenhum: sem bolinhas, sem gate, sem bloco no Financeiro", () => {
    const S: Estado = seed(), d = S.deals.find((x) => x.id === 1027) as Negocio;
    let A!: Parameters<Parameters<typeof Montar>[0]["children"]>[0]["A"];
    render(<Montar S={S}>{(ctx) => { A = ctx.A; return null; }}</Montar>);
    cleanup();
    A.criarAdenda(d.id, [{ sid: "pint", q: 20 }], "O cliente pediu");
    A.verificarEnviarAdenda(d.id, N);
    A.recusarAdenda(d.id, N, "O preço");
    caminho(S, d);
    expect(screen.queryByText(/da adenda AD 2026\/1027-1/)).toBeNull();
    cleanup();
    S.role = "financeiro";
    render(<Montar S={S}>{(ctx) => <DocumentosSimples {...ctx} d={d} />}</Montar>);
    expect(screen.queryByTestId(`fin-adenda-${N}`)).toBeNull();
    expect(faltaParaArrancar(d).some((x) => /adenda/.test(x))).toBe(false);
  });

  it("V2: o Financeiro regista a fatura da adenda (do programa certificado) no próprio Financeiro do negócio", () => {
    const { S, d } = preparar();
    localStorage.setItem(CHAVE_VERSAO, "1");
    S.role = "financeiro";
    render(<Montar S={S}>{(ctx) => <FinanceiroV2 {...ctx} d={d} />}</Montar>);
    const bloco = screen.getByTestId(`fin-adenda-${N}`);
    expect(within(bloco).queryByRole("button", { name: "Emitir a fatura" })).toBeNull();
    fireEvent.change(within(bloco).getByLabelText(`Número da fatura da adenda ${N}`), { target: { value: "FT 2026/777" } });
    fireEvent.click(within(bloco).getByRole("button", { name: "Registar a fatura" }));
    expect(d.adendas![0].faturas![0].n).toBe("FT 2026/777");
    expect(bloco.textContent).toMatch(/Fatura FT 2026\/777 registada/);
    // o Hoje da V2 diz para registar, sem o botão que emitiria
    d.adendas![0].faturas = [];
    expect(minhas(S, "financeiro").find((x) => x.d === d && x.p.t === "Registar a fatura da adenda")?.p.act).toBeUndefined();
  });
});
