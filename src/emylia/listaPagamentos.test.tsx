// 20/11/2026 (auditoria de 19/11, F10 e F12): a lista «Pagamentos», a mesma no Financeiro e na Obra (as parcelas do contrato, as das adendas
// e a nota de crédito, cada uma com um só botão), e uma só conta para o valor de cada parcela, igual em todo o lado e à do servidor.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement } from "react";
import { esquecerInventario } from "./inventario/loja";
import { acoes, totaisIva, valorSinal, seed, type Estado, type Negocio } from "./motor";
import { FINANCEIRO, OBRA, emFalta, type Grupo } from "./campos";
import { PAGAMENTO_50_25_25, prestacoes, valoresPrestacoes } from "./planoObra";
import { parcelasDoContrato } from "./parcelas";
import { parcelasAdenda, totaisAdenda } from "./adendas";
import { tranches } from "./DocsCliente";
import { tranchesDoPlano, valorTranche } from "./v2/financeiro";
import { gruposPagamentos, linhasPagamentos } from "./listaPagamentos";
import { Pagamentos } from "./Pagamentos";
import { passosDaFase } from "./PaginaNegocio";
import { Montar, primarios } from "./v2/testeV2";
import { adendaAssinada } from "./testeAdenda";
import { aprovarPos, receberTudo } from "./testeObra";
import { registarNoEcra } from "./testeFaturaAdenda";
import { lerFaturaErp } from "./erpEticadata";
import type { Ctx } from "./pecas";

// sem ligação ao Eticadata: aparece «Registar sem confirmar»
vi.mock("./erpEticadata", async (orig) => ({ ...(await orig<typeof import("./erpEticadata")>()), lerFaturaErp: vi.fn() }));
const lerMock = vi.mocked(lerFaturaErp);

beforeEach(() => { esquecerInventario(); lerMock.mockResolvedValue({ ok: false, motivo: "sem_ligacao", msg: "Sem ligação ao Eticadata." }); });
afterEach(() => { cleanup(); localStorage.clear(); lerMock.mockReset(); });

const N = "AD 2026/1027-1";
const preencher = (d: { f: Record<string, string> }, gs: Grupo[]) => {
  for (let i = 0; i < 5; i++) for (const c of emFalta(gs, d.f)) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x";
};
/** 1027 (contrato assinado) com as condições dadas: a 1.ª parcela registada e paga, o plano aprovado e uma adenda assinada. */
function preparar(pagamento: string, comAdenda = true) {
  const S: Estado = seed(), d = S.deals.find((x) => x.id === 1027) as Negocio;
  d.f.pagamento = pagamento;
  preencher(d, FINANCEIRO); preencher(d, [OBRA[0]]);
  const A = acoes(S, vi.fn(), (fn) => fn());
  A.role("financeiro"); A.registarFaturaErp(d.id, "FT 2026/1027", null); A.validar(d.id);
  A.role("operacoes"); A.supervisorMedidas(d.id, "hn"); A.retificarMedidas(d.id); A.aprovarPlano(d.id);
  if (comAdenda) juntarAdenda(S, A, d);
  S.role = "financeiro";
  return { S, A, d };
}
function juntarAdenda(S: Estado, A: ReturnType<typeof acoes>, d: Negocio) {
  A.role("comercial"); A.criarAdenda(d.id, [{ sid: "pint", q: 20 }], "O cliente pediu"); adendaAssinada(A, d.id, N);
  S.role = "financeiro";
}
const resumo = (S: Estado, d: Negocio) => gruposPagamentos(S, d).map((g) => [g.tipo, g.linhas.map((x) => [x.estado, x.acao])]);

describe("a lista «Pagamentos» nos três esquemas, com uma adenda", () => {
  it("100%: o contrato numa parcela, já paga; a adenda numa parcela, por faturar", () => {
    const { S, d } = preparar("100% na adjudicação");
    expect(resumo(S, d)).toEqual([["contrato", [["paga", null]]], ["adenda", [["faturar", "registar"]]]]);
    const [c] = linhasPagamentos(S, d);
    expect(c).toMatchObject({ numero: "FT 2026/1027", momento: "No início, antes de tudo", valor: valoresPrestacoes(totaisIva(d, S).total, [{ p: 1 }])[0] });
    expect(c.textoEstado).toMatch(/^paga · RC 2026\//);
  });

  it("50-50: a parcela final espera pelo fim da obra; a 2.ª da adenda espera pela anterior", () => {
    const { S, d } = preparar("50% + 50% no fim");
    expect(resumo(S, d)).toEqual([
      ["contrato", [["paga", null], ["espera", null]]],
      ["adenda", [["faturar", "registar"], ["espera", null]]],
    ]);
    const L = linhasPagamentos(S, d);
    expect(L[1]).toMatchObject({ titulo: `2.ª parcela (${prestacoes("50% + 50% no fim")[1].l.toLowerCase()}, 50%)`, motivo: "Cai no Financeiro no fim da obra, antes da entrega." });
    expect(L[3]).toMatchObject({ adenda: N, motivo: "Depois da parcela anterior." });
  });

  it("50-25-25: com o contrato assinado a do arranque fica por faturar; no ecrã: registar o número → «Ok, já foi paga» → paga, sem botão", async () => {
    // 20/11 (Rúben): a parcela do arranque cai no Financeiro logo com o contrato assinado, sem esperar pelo «Arrancar a obra»
    const { S, A, d } = preparar(PAGAMENTO_50_25_25, false);
    expect(resumo(S, d)[0]).toEqual(["contrato", [["paga", null], ["faturar", "registar"], ["espera", null]]]);
    expect(aprovarPos("CT 2026/1027")).toBe(""); expect(receberTudo("CT 2026/1027")).toBe("");
    juntarAdenda(S, A, d);
    expect(resumo(S, d)[0]).toEqual(["contrato", [["paga", null], ["faturar", "registar"], ["espera", null]]]);

    render(<Montar S={S}>{(ctx) => <Pagamentos ctx={ctx} d={d} />}</Montar>);
    const linha = () => screen.getByTestId("pagamento-c:t2");
    // um só botão principal em cada linha que é a vez
    for (const li of screen.getAllByRole("listitem")) expect(primarios(li).length).toBeLessThanOrEqual(1);
    expect(within(linha()).getByRole("button", { name: "Registar o número da fatura" })).toBeTruthy();
    fireEvent.change(within(linha()).getByLabelText(/Número da fatura no Eticadata/), { target: { value: "FAT 15200126/901" } });
    fireEvent.click(within(linha()).getByRole("button", { name: "Registar o número da fatura" }));
    await waitFor(() => expect(within(linha()).getByRole("button", { name: "Ok, já foi paga" })).toBeTruthy());
    expect(within(linha()).queryByLabelText(/Número da fatura no Eticadata/)).toBeNull();
    fireEvent.click(within(linha()).getByRole("button", { name: "Ok, já foi paga" }));
    expect(within(linha()).queryByRole("button")).toBeNull();
    expect(linha().textContent).toMatch(/paga · RC 2026\//);
    expect(parcelasDoContrato(S, d)[1]).toMatchObject({ paga: true });

    // a adenda, na mesma lista: o número (sem ligação ao ERP, sem confirmar) e depois o «Ok, já foi paga»
    const bloco = screen.getByTestId(`fin-adenda-${N}`);
    await registarNoEcra(bloco, "FAT 15200126/902");
    await waitFor(() => expect(d.adendas![0].faturas?.[0]?.n).toBe("FAT 15200126/902"));
    fireEvent.click(within(screen.getByTestId(`pagamento-a:${N}:0`)).getByRole("button", { name: "Ok, já foi paga" }));
    expect(d.adendas![0].faturas![0].recibo).toBeTruthy();
    expect(within(screen.getByTestId(`pagamento-a:${N}:0`)).queryByRole("button")).toBeNull();
  });

  it("o estado do Eticadata é texto: sem «Verificar» nem «Validar à mão» repetidos", () => {
    const S = seed(), d = S.deals.find((x) => x.id === 1027)!;
    d.fin.fatura = { n: "FT 2026/418", q: "15/10" }; d.fin.pago = false;
    d.fin.erp = { estado: "por pagar", data: "2026-11-19", total: 100, pago: 0, emFalta: 100, vencimento: "2026-12-19", atcud: "X", nif: "", recibos: [], bd: "Emp_Z004", lidaEm: "2026-11-19T10:00:00Z" };
    S.role = "financeiro";
    render(<Montar S={S}>{(ctx) => <Pagamentos ctx={ctx} d={d} />}</Montar>);
    const li = screen.getByTestId(`pagamento-c:${parcelasDoContrato(S, d)[0].id}`);
    expect(li.textContent).toMatch(/No Eticadata: /);
    expect(within(li).getAllByRole("button").map((b) => b.textContent)).toEqual(["Ok, já foi paga"]);
    expect(screen.queryByRole("button", { name: /Verificar|Validar à mão/ })).toBeNull();
  });

  it("a nota de crédito registada aparece na lista, sem botão", () => {
    const { S, d } = preparar("50% + 50% no fim");
    d.f.nota_credito = "NC 2026/7";
    const g = gruposPagamentos(S, d).at(-1)!;
    expect(g).toMatchObject({ tipo: "nota", linhas: [{ estado: "paga", acao: null, textoEstado: "NC 2026/7 registada" }] });
  });

  it("o Financeiro e a Obra usam o mesmo componente (o passo «Pagamentos»)", () => {
    const { S, A, d } = preparar("50% + 50% no fim");
    const ctx: Ctx = { S, A, run: (fn) => fn(), go: (fn) => () => fn(), q: "" };
    const corpo = (fase: number) => {
      const p = passosDaFase(ctx, d, true, fase).find((x) => x.titulo === "Pagamentos");
      return p && isValidElement(p.corpo) ? p.corpo.type : null;
    };
    expect(corpo(4)).toBe(Pagamentos);
    expect(corpo(5)).toBe(Pagamentos);
  });
});

describe("uma só conta para o valor de cada parcela", () => {
  it("a conta do servidor: round(total × pct, 2) e, na última, o resto", () => {
    expect(valoresPrestacoes(1234.57, [{ p: 0.5 }, { p: 0.25 }, { p: 0.25 }])).toEqual([617.29, 308.64, 308.64]);
    expect(valoresPrestacoes(100, [{ p: 1 / 3 }, { p: 1 / 3 }, { p: 1 / 3 }])).toEqual([33.33, 33.33, 33.34]);
    // 1,005 × 100 dá 100,4999… em vírgula flutuante: o Postgres arredonda para 1,01, e aqui também
    expect(valoresPrestacoes(2.01, [{ p: 0.5 }, { p: 0.5 }])).toEqual([1.01, 1]);
    expect(valoresPrestacoes(64971.81, [{ p: 0.3 }, { p: 0.2 }, { p: 0.15 }, { p: 0.1 }, { p: 0.25 }]).reduce((a, v) => a + v, 0)).toBeCloseTo(64971.81, 6);
    // valorTranche é a mesma conta, sobre a fração exata (antes sobre a percentagem já arredondada: 33,33% de 100 000 dava 33 330,00)
    const T = tranchesDoPlano("À medida", [{ l: "a", p: 1 / 3, fase: 0 }, { l: "b", p: 1 / 3, fase: 1 }, { l: "c", p: 1 / 3, fase: "fim" }]);
    expect(T.map((t) => valorTranche(100000, T, t.id))).toEqual(valoresPrestacoes(100000, [{ p: 1 / 3 }, { p: 1 / 3 }, { p: 1 / 3 }]));
    expect(valorTranche(100000, T, "t1")).toBe(33333.33);
  });

  for (const pagamento of ["100% na adjudicação", "50% + 50% no fim", PAGAMENTO_50_25_25]) {
    it(`${pagamento}: o portal e a proposta, o Financeiro, o sinal e a lista dão os mesmos cêntimos, com um total que não divide certo`, () => {
      const { S, d } = preparar(pagamento);
      // um desconto que deixa o total com cêntimos que não se dividem por 4
      for (let k = 1; k < 200; k++) { d.orc!.desconto = k * 0.37; const c = Math.round(totaisIva(d, S).total * 100); if (c % 4 && c % 2) break; }
      const total = totaisIva(d, S).total, cent = Math.round(total * 100);
      expect(cent % 4).not.toBe(0);
      const L = prestacoes(d.f.pagamento, d.orc!.pagFases);
      // a conta do servidor, em cêntimos inteiros
      const servidor = L.map((x) => Math.round(cent * x.p) / 100);
      servidor[servidor.length - 1] = (cent - servidor.slice(0, -1).reduce((a, v) => a + Math.round(v * 100), 0)) / 100;
      const portal = tranches(d, total, S).map((x) => x.v);
      const financeiro = parcelasDoContrato(S, d).map((x) => x.v);
      const lista = linhasPagamentos(S, d).filter((x) => x.tipo === "contrato").map((x) => x.valor);
      expect(portal).toEqual(servidor);
      expect(financeiro).toEqual(servidor);
      expect(lista).toEqual(servidor);
      expect(valorSinal(d, S)).toBe(servidor[0]);
      expect(Math.round(portal.reduce((a, v) => a + v, 0) * 100)).toBe(cent);
      // as adendas: a mesma conta sobre o total delas
      const a = d.adendas![0];
      expect(parcelasAdenda(d, a).map((x) => x.v)).toEqual(valoresPrestacoes(totaisAdenda(a).total, L));
    });
  }
});
