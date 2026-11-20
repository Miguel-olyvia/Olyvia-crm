// 19/11/2026 (auditoria, ponto 1): a Olyvia não inventa números de fatura nas adendas. Antes, na versão «Atual», faturarAdendas e
// faturarParcelaAdenda criavam «FT 2026/n» com um contador (S.ft) que só existia no browser. Agora, como nas parcelas do contrato: o
// Financeiro emite no Eticadata, escreve o número, a Olyvia confirma-o no ERP e regista-o (registarFaturaAdenda). O «Emitir a fatura» do
// Hoje passou a «Registar a fatura» e leva ao campo do número.
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acoes, minhas, seed, type Estado, type Negocio } from "./motor";
import { FINANCEIRO, OBRA, emFalta, type Grupo } from "./campos";
import { esquecerInventario } from "./inventario/loja";
import { Montar } from "./v2/testeV2";
import { TrabalhosAMais } from "./TrabalhosAMais";
import { alvoFaturaAdenda, parcelasAdenda, type Adenda } from "./adendas";
import { erpLembrado, lerFaturaErp, type InfoErp } from "./erpEticadata";
import { fazer } from "./pecas";
import { adendaAssinada } from "./testeAdenda";
import { registarNoEcra } from "./testeFaturaAdenda";

vi.mock("./erpEticadata", async (orig) => ({ ...(await orig<typeof import("./erpEticadata")>()), lerFaturaErp: vi.fn() }));
const lerMock = vi.mocked(lerFaturaErp);

afterEach(() => { cleanup(); localStorage.clear(); lerMock.mockReset(); });
beforeEach(() => { esquecerInventario(); });

const N = "AD 2026/1027-1";
function preparar() {
  const S: Estado = seed(), d = S.deals.find((x) => x.id === 1027) as Negocio;
  const encher = (gs: Grupo[]) => { for (let i = 0; i < 5; i++) for (const c of emFalta(gs, d.f)) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x"; };
  encher(FINANCEIRO); encher([OBRA[0]]);
  const avisar = vi.fn();
  const A = acoes(S, avisar, (fn) => fn());
  A.role("financeiro"); A.registarFaturaErp(d.id, `FT 2026/${d.id}`, null); A.validar(d.id);
  A.role("operacoes"); (A.supervisorMedidas(d.id, "hn"), A.retificarMedidas(d.id), A.aprovarPlano(d.id));
  A.role("comercial");
  A.criarAdenda(d.id, [{ sid: "pint", q: 20 }], "O cliente pediu");
  adendaAssinada(A, d.id, N);
  const a = d.adendas!.find((x) => x.n === N) as Adenda;
  A.role("financeiro");
  return { S, A, d, a, avisar };
}
const info = (total: number, extra: Partial<InfoErp> = {}): InfoErp => ({
  estado: "por pagar", data: "2026-11-19", total, pago: 0, emFalta: total, vencimento: "2026-12-19", atcud: "ABCD-1", nif: "", recibos: [], bd: "Emp_Z004", lidaEm: "2026-11-19T10:00:00Z", ...extra,
});

describe("a Olyvia já não emite faturas das adendas", () => {
  it("faturarAdendas e faturarParcelaAdenda recusam, dizem porquê e não mexem no contador", () => {
    const { S, A, d, a, avisar } = preparar();
    const ft = S.ft;
    A.faturarAdendas(d.id);
    A.faturarAdendas(d.id, N);
    A.faturarParcelaAdenda(d.id, N);
    expect(a.faturas ?? []).toHaveLength(0);
    expect(S.ft).toBe(ft);
    expect(avisar).toHaveBeenCalledWith(expect.objectContaining({ msg: "A Olyvia não emite faturas", kind: "bad" }));
    expect(d.hist.some((h) => /FT 2026\/\d+ emitida \(adenda/.test(h.t))).toBe(false);
  });

  it("o passo do Hoje é «Registar a fatura» e leva ao negócio, ao campo do número da adenda certa", () => {
    const { S, A, d } = preparar();
    const p = minhas(S, "financeiro").find((x) => x.d === d && x.p.arg === N)!.p;
    expect(p).toMatchObject({ t: `Registar a fatura da adenda ${N} · 1.ª parcela`, act: "abrirFaturaAdenda", btn: "Registar a fatura" });
    S.view = "hoje";
    fazer(A, p.act!, d.id, p.arg);
    expect(S).toMatchObject({ view: "negocio", deal: d.id, pulse: alvoFaturaAdenda(N) });
    expect(d.adendas![0].faturas ?? []).toHaveLength(0);
  });
});

describe("registarFaturaAdenda: o número do Eticadata, confirmado no ERP", () => {
  it("com a leitura do ERP: regista com o valor da parcela, diz no histórico que foi confirmada e lembra a leitura", () => {
    const { A, d, a } = preparar();
    const v = parcelasAdenda(d, a)[0].v;
    expect(A.registarFaturaAdenda(d.id, N, " FAT  15200126/801 ", info(v))).toBe(true);
    expect(a.faturas![0]).toMatchObject({ n: "FAT 15200126/801", i: 0, v });
    expect(d.hist[0].t).toMatch(/Fatura FAT 15200126\/801 registada \(adenda .*\) · confirmada no Eticadata · por pagar/);
    expect(erpLembrado("FAT 15200126/801")?.total).toBe(v);
  });

  it("sem ligação ao ERP (info null): regista, sem confirmar", () => {
    const { A, d, a } = preparar();
    expect(A.registarFaturaAdenda(d.id, N, "FAT 15200126/802", null)).toBe(true);
    expect(a.faturas![0].n).toBe("FAT 15200126/802");
    expect(d.hist[0].t).toMatch(/sem confirmar no Eticadata/);
  });

  it("recusa o número vazio, o repetido (do contrato ou de outra adenda) e a fatura anulada no ERP", () => {
    const { A, d, a, avisar } = preparar();
    expect(A.registarFaturaAdenda(d.id, N, "   ")).toBe(false);
    expect(A.registarFaturaAdenda(d.id, N, d.fin.fatura!.n.toLowerCase())).toBe(false);
    expect(avisar).toHaveBeenCalledWith(expect.objectContaining({ msg: expect.stringMatching(/já está registada/) }));
    expect(A.registarFaturaAdenda(d.id, N, "FAT 1/9", info(10, { estado: "anulada" }))).toBe(false);
    expect(a.faturas ?? []).toHaveLength(0);
  });

  it("o total no ERP diferente do da parcela: regista, mas avisa para confirmar o número", () => {
    const { A, d, avisar } = preparar();
    expect(A.registarFaturaAdenda(d.id, N, "FAT 15200126/803", info(1))).toBe(true);
    expect(avisar).toHaveBeenCalledWith(expect.objectContaining({ msg: expect.stringMatching(/no Eticadata não é o da parcela/), kind: "bad" }));
  });
});

describe("o campo do número nos Trabalhos a mais (RegistarFaturaAdendaErp)", () => {
  it("lê o número no ERP e regista a fatura com a leitura; sem botão «Emitir»", async () => {
    const { S, d, a } = preparar();
    const v = parcelasAdenda(d, a)[0].v;
    lerMock.mockResolvedValue({ ok: true, info: info(v) });
    render(<Montar S={S}>{(ctx) => <TrabalhosAMais {...ctx} d={d} />}</Montar>);
    const cartao = screen.getByRole("listitem", { name: `Adenda ${N}` });
    expect(within(cartao).queryByRole("button", { name: /Emitir a fatura/ })).toBeNull();
    await registarNoEcra(cartao, "FAT 15200126/804", false);
    await waitFor(() => expect(a.faturas?.[0]?.n).toBe("FAT 15200126/804"));
    expect(lerMock).toHaveBeenCalledWith("FAT 15200126/804");
    expect(d.hist[0].t).toMatch(/confirmada no Eticadata/);
  });

  it("a fatura que não existe no ERP não se regista (e não há «Registar sem confirmar»)", async () => {
    const { S, d, a } = preparar();
    lerMock.mockResolvedValue({ ok: false, motivo: "nao_existe", msg: "A fatura FAT 9/9 não existe no Eticadata (Emp_Z004)." });
    render(<Montar S={S}>{(ctx) => <TrabalhosAMais {...ctx} d={d} />}</Montar>);
    const cartao = screen.getByRole("listitem", { name: `Adenda ${N}` });
    await registarNoEcra(cartao, "FAT 9/9", false);
    expect(await within(cartao).findByRole("alert")).toHaveTextContent(/não existe no Eticadata/);
    expect(within(cartao).queryByRole("button", { name: "Registar sem confirmar" })).toBeNull();
    expect(a.faturas ?? []).toHaveLength(0);
  });

  it("aberto pelo «Registar a fatura» do Hoje, o cursor vai para o campo do número", () => {
    const { S, A, d } = preparar();
    A.abrirFaturaAdenda(d.id, N);
    render(<Montar S={S}>{(ctx) => <TrabalhosAMais {...ctx} d={d} />}</Montar>);
    expect(document.activeElement).toBe(screen.getByLabelText(/Número da fatura no Eticadata/));
  });
});
