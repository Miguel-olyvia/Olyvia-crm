// O circuito do contrato à obra no ecrã (19/10/2026), com o motor, o Inventário e os papéis a sério:
// · o Tiago (1027): o pagamento validado pelo Financeiro (o comercial é recusado, também chamando o motor direto), o plano aprovado pelas
//   Operações, o arranque preso enquanto a encomenda a fornecedor está por aprovar e depois por receber, e a obra a arrancar com tudo no armazém;
// · anular o contrato como Direção (a encomenda eliminada no Inventário) e o sentido inverso (eliminada no Inventário → negócio anulado);
// · as tranches "Por fases" iguais na proposta e no Financeiro V2; o filtro de origem no Hoje do Inventário.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useReducer, useRef, useState, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VERSAO, acoes, proximo, seed, type Aviso, type Estado, type Negocio } from "./motor";
import { FINANCEIRO, OBRA, emFalta, type Grupo } from "./campos";
import type { Ctx } from "./pecas";
import { CaminhoObra } from "./CaminhoObra";
import { PaginaObra } from "./ObraOperacoes";
import { NegocioSimples } from "./NegocioSimples";
import PrototipoNegocios from "./PrototipoNegocios";
import { tranches, totais } from "./DocsCliente";
import { CHAVE_VERSAO } from "./versaoPrototipo";
import { FinanceiroV2 } from "./v2/FinanceiroV2";
import { tranchesDe } from "./v2/estadoV2";
import InventarioPagina from "./inventario/InventarioPagina";
import type { AbaInv } from "./inventario/ctxInv";
import { esquecerInventario, lerInventario } from "./inventario/loja";
import { esquecerPerfil } from "./inventario/perfil";
import { poStatus } from "./inventario/po";
import { esquecerFrota } from "./frota/loja";
import { aprovarPos, posDe, receberTudo } from "./testeObra";

const REF = "CT 2026/1027";
const preencher = (d: { f: Record<string, string> }, gs: Grupo[]) => {
  for (let i = 0; i < 5; i++) {
    const f = emFalta(gs, d.f);
    if (!f.length) return;
    for (const c of f) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x";
  }
};
const deal = (S: Estado, id: number): Negocio => S.deals.find((x) => x.id === id)!;

/** Um Ctx a sério (como v2/testeV2.tsx), com os avisos guardados para ver o que o motor disse. */
function Montar({ S, avisos, children }: { S: Estado; avisos: Aviso[]; children: (ctx: Ctx) => ReactNode }) {
  const [, redesenhar] = useReducer((x: number) => x + 1, 0);
  const ref = useRef<Ctx | null>(null);
  if (!ref.current) {
    const run = (fn: () => void) => { fn(); redesenhar(); };
    ref.current = { S, A: acoes(S, (a) => avisos.push(a), run), run, go: (fn) => () => run(fn), q: "", setQ: vi.fn(), repor: vi.fn() };
  }
  return <>{children(ref.current)}</>;
}
const ultimo = (avisos: Aviso[]) => avisos.at(-1)!;
/** O Tiago pago pelo Financeiro (o motor direto): a EC-1027 no Inventário, com as encomendas a fornecedor do que falta. */
function pagarTiago(S: Estado) {
  const d = deal(S, 1027);
  preencher(d, FINANCEIRO);
  const A = acoes(S, () => {}, (fn) => fn());
  A.role("financeiro"); A.emitir(1027); A.validar(1027);
  return d;
}
function CasaInv({ inicio }: { inicio: AbaInv }) {
  const [aba, setAba] = useState<AbaInv>(inicio);
  return <InventarioPagina aba={aba} aoMudarAba={setAba} />;
}

const original = window.matchMedia;
beforeEach(() => {
  localStorage.clear(); esquecerInventario(); esquecerPerfil(); esquecerFrota();
  window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as typeof window.matchMedia;
});
afterEach(() => { cleanup(); localStorage.clear(); window.matchMedia = original; });

describe("Tiago (1027): do pagamento ao arranque, com os materiais garantidos", () => {
  it("o comercial não valida nem emite (no ecrã e no motor); o Financeiro sim; o arranque espera pela PO aprovada e recebida", () => {
    const S = seed(), d = deal(S, 1027), avisos: Aviso[] = [];
    preencher(d, FINANCEIRO); preencher(d, [OBRA[0]]);

    // o motor direto, como o comercial (há ecrãs que chamam a ação do passo sem olhar para o papel): recusa e diz porquê
    const M = acoes(S, (a) => avisos.push(a), (fn) => fn());
    M.emitir(1027);
    expect(ultimo(avisos)).toMatchObject({ msg: "Sem permissão para tratar de faturas", kind: "bad" });
    expect(d.fin.fatura).toBeNull();
    d.fin.fatura = { n: "FT 2026/999", q: "hoje" };
    M.validar(1027);
    expect(ultimo(avisos)).toMatchObject({ msg: "Sem permissão para validar pagamentos", sub: expect.stringMatching(/finance\.validate_payment/) });
    expect(d.fin.pago).toBe(false);
    M.emitirEc(1027);
    expect(ultimo(avisos).msg).toBe("Sem permissão para validar pagamentos");
    expect(d.obra.ec ?? null).toBeNull();
    d.fin.fatura = null;

    let ctx: Ctx | null = null;
    render(<Montar S={S} avisos={avisos}>{(c) => { ctx = c; return <><CaminhoObra {...c} d={d} /><PaginaObra ctx={c} d={d} /></>; }}</Montar>);
    const caminho = () => screen.getByRole("region", { name: "Do contrato à obra" });
    const oQueFazer = () => screen.getByRole("region", { name: "O que fazer" });

    // no ecrã, o comercial vê de quem é o passo, sem o botão
    expect(within(caminho()).queryByRole("button", { name: "Emitir a fatura" })).toBeNull();
    fireEvent.click(within(caminho()).getByRole("button", { name: "Ver como Sandra" }));
    expect(S.role).toBe("financeiro");
    fireEvent.click(within(caminho()).getByRole("button", { name: "Emitir a fatura" }));
    expect(d.fin.fatura?.n).toMatch(/^FT 2026\//);
    fireEvent.click(within(caminho()).getByRole("button", { name: "Validar o pagamento" }));
    expect(d.fin.pago).toBe(true);
    expect(d.fase).toBe(5);
    expect(d.obra.ec).toMatchObject({ n: "EC-1027", ref: REF });
    expect(posDe(REF).length).toBe(2);
    expect(posDe(REF).every((p) => poStatus(p) === "pending")).toBe(true);

    // as Operações aprovam o plano
    fireEvent.click(within(caminho()).getAllByRole("button", { name: "Ver como Filipe" })[0]);
    expect(S.role).toBe("operacoes");
    fireEvent.click(within(caminho()).getByRole("button", { name: "Aprovar o plano" }));
    expect(d.obra.plano!.estado).toBe("aprovado");

    // arranque preso: as encomendas a fornecedor por aprovar (no cartão do negócio e na página da obra)
    expect(within(caminho()).getByText(/^Para arrancar, falta aprovar as encomendas a fornecedor PO-\S+, PO-\S+ no Inventário \(Compras\)\.$/)).toBeInTheDocument();
    expect(within(caminho()).queryByRole("button", { name: "Arrancar a obra" })).toBeNull();
    expect(within(oQueFazer()).getByText(/^Plano aprovado\. Para arrancar, falta aprovar as encomendas a fornecedor/)).toBeInTheDocument();
    expect(within(oQueFazer()).getByRole("button", { name: "Arrancar a obra" })).toBeDisabled();
    expect(within(oQueFazer()).getByRole("list", { name: "Condições para arrancar" })).toHaveTextContent(/Materiais no armazém \(por fazer\)/);
    act(() => { ctx!.run(() => ctx!.A.arrancar(1027)); });
    expect(d.obra.plano!.estado).toBe("aprovado");
    expect(ultimo(avisos)).toMatchObject({ msg: "Ainda não dá para arrancar", sub: expect.stringMatching(/^Falta aprovar as encomendas a fornecedor/) });

    // aprovadas no Inventário (seguem para o portal do fornecedor): ainda por receber, continua preso, com a data prevista
    act(() => { expect(aprovarPos(REF)).toBe(""); });
    expect(within(caminho()).getByText(/^Para arrancar, falta receber no armazém as encomendas PO-\S+, PO-\S+ \(prevista a \d\d\/\d\d\)\.$/)).toBeInTheDocument();
    expect(within(oQueFazer()).getByRole("button", { name: "Arrancar a obra" })).toBeDisabled();
    act(() => { ctx!.run(() => ctx!.A.arrancar(1027)); });
    expect(d.obra.plano!.estado).toBe("aprovado");
    expect(ultimo(avisos).sub).toMatch(/^Falta receber no armazém as encomendas/);

    // recebidas no armazém: tudo reservado, arranca
    act(() => { expect(receberTudo(REF)).toBe(""); });
    expect(within(caminho()).getByText("Está tudo pronto para arrancar.")).toBeInTheDocument();
    expect(within(oQueFazer()).getByRole("list", { name: "Condições para arrancar" })).toHaveTextContent(/Materiais no armazém \(feito\)/);
    fireEvent.click(within(caminho()).getByRole("button", { name: "Arrancar a obra" }));
    expect(d.obra.plano!.estado).toBe("em curso");
  });

  it("V2: o passo do Financeiro é registar a fatura (sem botão) e emitir recusa; o Financeiro V2 esconde os botões a quem não pode", () => {
    localStorage.setItem(CHAVE_VERSAO, "1");
    const S = seed(), d = deal(S, 1027), avisos: Aviso[] = [];
    expect(proximo(d, S)).toMatchObject({ t: "Registar a fatura", who: "financeiro" });
    expect(proximo(d, S).act).toBeUndefined();
    preencher(d, FINANCEIRO);
    const M = acoes(S, (a) => avisos.push(a), (fn) => fn());
    M.role("financeiro"); M.emitir(1027);
    expect(ultimo(avisos).msg).toBe("A fatura não se emite na Olyvia");
    expect(d.fin.fatura).toBeNull();
    M.role("comercial");
    render(<Montar S={S} avisos={avisos}>{(c) => <FinanceiroV2 {...c} d={d} />}</Montar>);
    expect(screen.queryByRole("region", { name: "Registar fatura" })).toBeNull();
    expect(screen.getByText(/Só o Financeiro ou a Direção registam faturas e validam pagamentos\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Mudar para Sandra" }));
    expect(S.role).toBe("financeiro");
    const reg = screen.getByRole("region", { name: "Registar fatura" });
    fireEvent.change(within(reg).getByLabelText("Número da fatura"), { target: { value: "FT 2026/700" } });
    fireEvent.click(within(reg).getByRole("button", { name: "Registar fatura" }));
    expect(d.fin.fatura?.n).toBe("FT 2026/700");
    expect(d.hist[0].t).toMatch(/^Fatura FT 2026\/700 registada · Adiantamento 50% · emitida no programa certificado$/);
  });
});

describe("anular o contrato (19/10, nos dois sentidos)", () => {
  it("a Direção anula no negócio: o negócio fica perdido com o motivo e a EC-1027 é eliminada no Inventário (POs anuladas)", () => {
    const S = seed(), d = pagarTiago(S), avisos: Aviso[] = [];
    expect(lerInventario().ecs.find((e) => e.id === "EC-1027")!.deleted).toBe(false);
    S.role = "comercial"; S.view = "negocio"; S.deal = 1027;
    render(<Montar S={S} avisos={avisos}>{(c) => <NegocioSimples {...c} />}</Montar>);
    fireEvent.click(screen.getByRole("button", { name: "Anular contrato" }));
    let dlg = screen.getByRole("alertdialog", { name: "Anular contrato" });
    expect(dlg).toHaveTextContent("Só a Direção anula contratos.");
    fireEvent.click(within(dlg).getByRole("button", { name: "Mudar para Direção" }));
    expect(S.role).toBe("direcao");
    dlg = screen.getByRole("alertdialog", { name: "Anular contrato" });
    expect(dlg).toHaveTextContent(/^Anular o contrato CT 2026\/1027\? A encomenda de cliente EC-1027 é eliminada no Inventário: as reservas libertam-se e as encomendas a fornecedor ligadas são anuladas\. O negócio fica perdido, com o motivo\. Não se desfaz\. O sinal \([\d.,]+ €\) devolve-se fora da Olyvia\./);
    fireEvent.change(within(dlg).getByLabelText("Motivo"), { target: { value: "ab" } });
    expect(within(dlg).getByRole("button", { name: "Anular contrato" })).toBeDisabled();
    fireEvent.change(within(dlg).getByLabelText("Motivo"), { target: { value: "O cliente desistiu da obra" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Anular contrato" }));

    expect(d.perdido).toBe(true);
    expect(d.anulado).toMatchObject({ origem: "negocio", motivo: "O cliente desistiu da obra", por: "Direção" });
    expect(d.motivoPerda).toBe("Contrato anulado: O cliente desistiu da obra");
    expect(proximo(d, S).t).toBe("Contrato anulado");
    expect(ultimo(avisos)).toMatchObject({ msg: "Contrato CT 2026/1027 anulado", sub: expect.stringMatching(/^A encomenda EC-1027 foi eliminada no Inventário/) });
    expect(d.hist.some((h) => /O sinal já pago devolve-se fora da Olyvia/.test(h.t))).toBe(true);
    const e = lerInventario().ecs.find((x) => x.id === "EC-1027")!;
    expect(e).toMatchObject({ deleted: true, deleteReason: "O cliente desistiu da obra" });
    expect(posDe(REF).every((p) => poStatus(p) === "cancelled")).toBe(true);
    // já não há botão nem confirmação; fica a faixa do contrato anulado
    expect(screen.queryByRole("button", { name: "Anular contrato" })).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(/Contrato anulado.*O cliente desistiu da obra/);
  });

  it("recusa sem a permissão, sem motivo, depois de a obra arrancar e sem contrato; e o «Marcar perdido» deixa de servir", () => {
    const S = seed(), avisos: Aviso[] = [];
    const A = acoes(S, (a) => avisos.push(a), (fn) => fn());
    A.anularContrato(1027, "Motivo qualquer");
    expect(ultimo(avisos).msg).toBe("Sem permissão para anular contratos");
    A.role("direcao");
    A.anularContrato(1027, "ab");
    expect(ultimo(avisos).msg).toBe("Escreva o motivo (mínimo 3 caracteres)");
    A.anularContrato(1022, "O cliente desistiu");
    expect(ultimo(avisos)).toMatchObject({ msg: "A obra já arrancou", sub: "Anular agora pede o acerto do que já foi feito: fora do protótipo" });
    A.anularContrato(1031, "O cliente desistiu");
    expect(ultimo(avisos).msg).toBe("Não há contrato para anular");
    A.perderSim(1027);
    expect(ultimo(avisos).msg).toBe("Com contrato, anula-se o contrato");
    expect(deal(S, 1027).perdido).toBe(false);
    // sem encomenda no Inventário (ainda não pago): anula só o negócio
    A.anularContrato(1027, "Mudou de ideias");
    expect(deal(S, 1027)).toMatchObject({ perdido: true, anulado: { origem: "negocio" } });
  });

  it("no sentido inverso: eliminar a EC-1027 no Inventário (com a nota do negócio) anula o negócio sozinho", async () => {
    const S = seed();
    pagarTiago(S);
    S.role = "comercial";
    localStorage.setItem("olyvia-prototipo-negocios", JSON.stringify({ ...S, v: VERSAO }));
    render(<PrototipoNegocios />);
    render(<CasaInv inicio="ec" />);
    const linha = await screen.findByRole("row", { name: /^Abrir EC-1027,/ });
    fireEvent.click(within(linha).getByRole("button", { name: "Mais ações" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: /^Simular: anular contrato/ }));
    const dlg = await screen.findByRole("dialog", { name: "Anular contrato CT 2026/1027" });
    expect(dlg).toHaveTextContent("Vem do negócio #1027: o negócio fica anulado (perdido), com este motivo.");
    fireEvent.change(within(dlg).getByRole("textbox"), { target: { value: "Cliente cancelou por telefone" } });
    fireEvent.click(within(dlg).getByRole("button", { name: "Anular contrato" }));
    await waitFor(() => expect(lerInventario().ecs.find((e) => e.id === "EC-1027")!.deleted).toBe(true));
    await waitFor(() => {
      const t = (JSON.parse(localStorage.getItem("olyvia-prototipo-negocios")!) as Estado).deals.find((x) => x.id === 1027)!;
      expect(t).toMatchObject({ perdido: true, anulado: { origem: "inventario", motivo: "Cliente cancelou por telefone" } });
      expect(t.motivoPerda).toBe("Encomenda de cliente eliminada no Inventário: Cliente cancelou por telefone");
    });
  });

  it("no Inventário, anular um contrato pede contracts.cancel ao perfil (o Administrador tem tudo; as Compras não)", async () => {
    const { executar } = await import("./inventario/loja");
    const { eliminarEc } = await import("./inventario/ec");
    const { mudarPerfil } = await import("./inventario/perfil");
    mudarPerfil("compras");
    const r = executar((db) => eliminarEc(db, db.ecs.find((e) => e.origin.k === "CT" && !e.deleted)!, "contrato anulado", { contrato: true }));
    expect(r.ok).toBe(false);
    mudarPerfil("armazem");
    const r2 = executar((db) => eliminarEc(db, db.ecs.find((e) => e.origin.k === "CT" && !e.deleted)!, "contrato anulado", { contrato: true }));
    expect(r2.erro).toBe("Sem permissão: anular contratos (requer contracts.cancel).");
    mudarPerfil("admin");
    expect(executar((db) => eliminarEc(db, db.ecs.find((e) => e.origin.k === "CT" && !e.deleted)!, "contrato anulado", { contrato: true })).ok).toBe(true);
  });
});

describe("tranches \"Por fases\": as mesmas na proposta e no Financeiro V2", () => {
  it("escolher \"Por fases\" guarda as prestações; a proposta e o Financeiro V2 mostram as mesmas; outra condição esquece-as; vazio é 50/50", () => {
    localStorage.setItem(CHAVE_VERSAO, "1");
    const S = seed(), d = deal(S, 1031), avisos: Aviso[] = [];
    d.orc!.enviada = null; // por enviar: as condições ainda mudam
    const A = acoes(S, () => {}, (fn) => fn());
    A.campo(1031, "pagamento", "Por fases");
    expect(d.orc!.pagFases!.length).toBeGreaterThanOrEqual(2);
    const total = totais(d, S).total;
    const proposta = tranches(d, total, S), fin = tranchesDe(d);
    expect(fin.map((t) => t.pct)).toEqual(proposta.map((t) => Math.round(t.p * 10000) / 100));
    expect(fin[0].nome).toMatch(/^Adiantamento /);
    expect(fin.at(-1)!.nome).toMatch(/^Final /);
    S.role = "financeiro";
    render(<Montar S={S} avisos={avisos}>{(c) => <FinanceiroV2 {...c} d={d} />}</Montar>);
    const lista = within(screen.getByRole("region", { name: "Tranches" })).getAllByRole("listitem");
    expect(lista).toHaveLength(proposta.length);
    fin.forEach((t, i) => expect(lista[i]).toHaveTextContent(t.nome));
    cleanup();
    A.campo(1031, "pagamento", "30% + 40% + 30%");
    expect(d.orc!.pagFases).toBeUndefined();
    expect(tranchesDe(d).map((t) => t.pct)).toEqual(tranches(d, total).map((t) => Math.round(t.p * 10000) / 100));
    A.campo(1031, "pagamento", "");
    expect(tranchesDe(d).map((t) => t.pct)).toEqual([50, 50]);
    expect(tranches(d, total).map((t) => t.p)).toEqual([0.5, 0.5]);
  });
});

describe("Hoje do Inventário: Contratos, Vendas diretas e Encomendas manuais pela origem", () => {
  it("\"Contratos\" abre as encomendas de cliente só dos contratos (também as dos negócios, CT 2026/…), com o chip que limpa", async () => {
    const S = seed();
    pagarTiago(S);
    render(<CasaInv inicio="hoje" />);
    const db = lerInventario(), ct = db.ecs.filter((e) => !e.deleted && e.origin.k === "CT").length, todas = db.ecs.filter((e) => !e.deleted).length;
    expect(ct).toBeLessThan(todas);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^Contratos\\s*${ct}$`) }));
    expect(await screen.findByRole("row", { name: /^Abrir EC-1027,/ })).toBeInTheDocument();
    expect(screen.getAllByRole("row", { name: /^Abrir EC-/ })).toHaveLength(ct);
    const chip = screen.getByRole("button", { name: "Origem: Contratos" });
    expect(chip).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(chip);
    await waitFor(() => expect(screen.getAllByRole("row", { name: /^Abrir EC-/ })).toHaveLength(todas));
    expect(screen.queryByRole("button", { name: /^Origem:/ })).toBeNull();
  });
});
