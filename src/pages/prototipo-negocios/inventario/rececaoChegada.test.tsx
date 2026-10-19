// A Receção por ordem de chegada (19/10): os grupos (Chega hoje / amanhã no topo, com NOVA para as confirmadas desde ontem), a barra de leitura
// (nº da PO pelos últimos dígitos, EAN de qualquer fornecedor), o leitor que não fica preso a um fornecedor, "Receber tudo" com a parte da EC
// reservada e o resto para stock (e a transferência se entra noutro armazém), a conferência com diferença (parcial, com o motivo no histórico),
// o contador do menu (POs por receber) e "Receber no armazém →" do Hoje. Ponta a ponta: o Tiago (1027) pago até ao arranque deixar de esperar.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acoes, seed } from "../motor";
import { FINANCEIRO, emFalta, type Grupo } from "../campos";
import { aprovarPos } from "../testeObra";
import { HOJE, somarDias } from "./base";
import { contadores } from "./contadores";
import type { AbaInv } from "./ctxInv";
import { reservadoEm } from "./ec";
import InventarioPagina from "./InventarioPagina";
import { esquecerInventario, executar, lerInventario } from "./loja";
import { pilulas } from "./menuInv";
import { esquecerPerfil } from "./perfil";
import { faltaMateriais, resumoEcNegocio } from "./ponteNegocios";
import { poRecebivel, poRem, poStatus, portalConfirmar } from "./po";
import { abrirRececaoDaPo, resolverCodigoRececao } from "./rececao";
import { chegamHojePos, grupoRececao, novaConfirmacao } from "./rececaoLista";
import type { Po } from "./tipos";

const REF = "CT 2026/1027";
const preencher = (d: { f: Record<string, string> }, gs: Grupo[]) => {
  for (let i = 0; i < 5; i++) {
    const f = emFalta(gs, d.f);
    if (!f.length) return;
    for (const c of f) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x";
  }
};
/** O Tiago pago pelo Financeiro: a EC-1027 no Inventário e as POs (pendentes) do que falta. */
function pagarTiago(): string[] {
  const S = seed(), A = acoes(S, () => {}, (fn) => fn()), d = S.deals.find((x) => x.id === 1027)!;
  preencher(d, FINANCEIRO); S.role = "financeiro"; A.emitir(d.id); A.validar(d.id);
  return lerInventario().pos.filter((p) => p.originKey === REF).map((p) => p.id);
}
function Casa({ inicio }: { inicio: AbaInv }) {
  const [aba, setAba] = useState<AbaInv>(inicio);
  return <InventarioPagina aba={aba} aoMudarAba={setAba} />;
}
const po = (id: string): Po => lerInventario().pos.find((p) => p.id === id)!;
const lista = (): HTMLElement => screen.getByRole("region", { name: /Encomendas por receber/ });
const ler = (txt: string): void => {
  const campo = screen.getByRole("textbox", { name: /Ler ou escrever/ });
  fireEvent.change(campo, { target: { value: txt } });
  fireEvent.keyDown(campo, { key: "Enter" });
};
const painel = (id: string): HTMLElement => screen.getByRole("dialog", { name: `Dar entrada · ${id}` });
const concluir = (id: string): void => { fireEvent.click(within(painel(id)).getByRole("button", { name: "Concluir" })); };

beforeEach(() => { localStorage.clear(); esquecerInventario(); esquecerPerfil(); });
afterEach(() => { cleanup(); localStorage.clear(); });

describe("Receção por ordem de chegada · ponta a ponta (Tiago 1027)", () => {
  it("pago → PO aprovada e no portal → fornecedor confirma → NOVA no topo → \"0146\" abre o painel → Receber tudo → EC reservada e arranque sem esperar por materiais", async () => {
    const ids = pagarTiago();
    expect(ids).toHaveLength(2);
    expect(aprovarPos(REF)).toBe("");
    expect(ids.every((id) => po(id).portal.state === "sent")).toBe(true);
    // o fornecedor confirma no portal (data prometida daqui a 3 dias)
    const prometida = somarDias(HOJE, 3);
    for (const id of ids) expect(executar((d) => portalConfirmar(d, d.pos.find((x) => x.id === id)!, prometida, "Confirmado")).erro).toBe("");
    expect(ids.every((id) => grupoRececao(po(id)) === 0 && novaConfirmacao(po(id)))).toBe(true);
    // o contador do menu Receção são as POs por receber, a avisar porque há o que chega hoje/amanhã
    const c0 = contadores(lerInventario());
    expect(c0.porReceber).toBe(lerInventario().pos.filter(poRecebivel).length);
    expect(pilulas(lerInventario()).guia).toMatchObject({ n: c0.porReceber, tom: "warn", dica: `${c0.porReceber} por receber · ${c0.chegamHoje} chegam hoje/amanhã` });

    render(<Casa inicio="guia" />);
    const linhas = within(lista()).getAllByRole("row");
    expect(linhas[1]).toHaveTextContent(/^Chega hoje \/ amanhã/);
    const topo = linhas.slice(2, 4);
    expect(topo.map((r) => ids.find((id) => r.textContent?.includes(id))).sort()).toEqual([...ids].sort());
    topo.forEach((r) => expect(within(r).getByText("NOVA")).toBeInTheDocument());
    expect(within(topo[0]).getByText(/^Confirmada p\//)).toBeInTheDocument();

    // os últimos dígitos do número abrem o painel
    const [id1, id2] = ids;
    ler(id1.slice(-4));
    const p1 = painel(id1);
    const antes = po(id1);
    const falta = antes.lines.reduce((a, l) => a + poRem(l), 0);
    const paraEc = antes.lines.reduce((a, l) => a + Math.min(poRem(l), Math.max(0, l.ecUnits - l.ecRecv)), 0);
    expect(paraEc).toBeGreaterThan(0);
    expect(within(p1).getAllByText(/reservadas para Tiago Almeida \(EC-1027\)/).length).toBeGreaterThan(0);
    fireEvent.click(within(p1).getByRole("button", { name: `Receber tudo · ${falta} un` }));
    expect(await screen.findAllByText(/Entrou no Armazém Central .*reservadas para Tiago Almeida/)).not.toHaveLength(0);
    const rec = po(id1).receipts.filter((r) => r.state === "Ativa");
    expect(rec.reduce((a, r) => a + r.toEC, 0)).toBe(paraEc);
    expect(rec.reduce((a, r) => a + r.toStock, 0)).toBe(falta - paraEc);
    expect(rec.every((r) => !r.toEC || r.ec === "EC-1027")).toBe(true);
    expect(poStatus(po(id1))).toBe("received");
    expect(within(painel(id1)).getByRole("button", { name: "Ver EC-1027" })).toBeInTheDocument();
    concluir(id1);
    // o leitor não fica preso ao fornecedor desta PO
    expect(lerInventario().rc).toMatchObject({ sup: "", guia: "", poFilter: "" });

    // a segunda PO pela lista
    fireEvent.click(within(lista()).getByRole("button", { name: `Dar entrada ${id2}` }));
    const f2 = po(id2).lines.reduce((a, l) => a + poRem(l), 0);
    fireEvent.click(within(painel(id2)).getByRole("button", { name: `Receber tudo · ${f2} un` }));
    await waitFor(() => expect(poRecebivel(po(id2))).toBe(false));
    concluir(id2);

    const r = resumoEcNegocio(lerInventario(), REF)!;
    expect(r.pronta).toBe(true);
    expect(faltaMateriais(r)).toEqual([]);
    expect(contadores(lerInventario()).porReceber).toBe(c0.porReceber - 2);
    expect(within(lista()).queryByText(id1)).toBeNull();
  });
});

describe("Receção · barra de leitura, leitor e painel", () => {
  it("um EAN de outro fornecedor encontra a PO, mesmo com a Receção antes noutro fornecedor", () => {
    const zeta = lerInventario().pos.find((p) => p.sup === "zeta" && poRecebivel(p))!;
    executar((d) => abrirRececaoDaPo(d, d.pos.find((x) => x.id === zeta.id)!));
    expect(lerInventario().rc.sup).toBe("zeta");
    // tubo multicamada (TM-16): só a PO pendente do Alfa o tem por receber
    const r = resolverCodigoRececao(lerInventario(), "5601234000042");
    expect(r).toMatchObject({ t: "po", sku: "TM-16" });
    const alvo = r.t === "po" ? r.po : "";
    expect(po(alvo).sup).toBe("alfa");
    executar((d) => { d.rc.poFilter = ""; });
    render(<Casa inicio="guia" />);
    ler("5601234000042");
    expect(within(painel(alvo)).getByText(/Lido: Tubo multicamada/)).toBeInTheDocument();
    expect(resolverCodigoRececao(lerInventario(), "nada-disto")).toEqual({ t: "nada" });
  });

  it("um código que não existe diz \"Não encontrei\" e oferece ler artigo a artigo, que abre limpo", () => {
    render(<Casa inicio="guia" />);
    ler("XPTO-999");
    expect(screen.getByText("Não encontrei «XPTO-999».")).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("search", { name: "Ler na Receção" })).getByRole("button", { name: /Ler artigo a artigo/ }));
    expect(screen.getByRole("dialog", { name: "Ler artigo a artigo" })).toBeInTheDocument();
  });

  it("depois de fechar o painel, o leitor artigo a artigo não fica preso ao fornecedor (Fornecedor: Todos)", () => {
    const zeta = lerInventario().pos.find((p) => p.sup === "zeta" && poRecebivel(p))!;
    render(<Casa inicio="guia" />);
    fireEvent.click(within(lista()).getByRole("button", { name: `Dar entrada ${zeta.id}` }));
    expect(lerInventario().rc).toMatchObject({ sup: "zeta", poFilter: zeta.id });
    fireEvent.click(within(painel(zeta.id)).getByRole("button", { name: "Fechar" }));
    expect(lerInventario().rc).toMatchObject({ sup: "", guia: "", poFilter: "" });
    fireEvent.click(screen.getAllByRole("button", { name: "Ler artigo a artigo" })[0]);
    const tel = screen.getByLabelText("Receção no telemóvel");
    expect(within(tel).getByText("Todos")).toBeInTheDocument();
    expect(within(tel).queryByRole("combobox", { name: "Fornecedor" })).toBeNull();
  });

  it("conferência com diferença: exige o motivo, a PO fica parcial e o motivo fica no histórico da PO e da guia nova", () => {
    // PO-2026-0137 (Silva & Filhos): faltam 2 painéis
    render(<Casa inicio="guia" />);
    fireEvent.click(within(lista()).getByRole("button", { name: "Dar entrada PO-2026-0137" }));
    const p = painel("PO-2026-0137");
    fireEvent.change(within(p).getByRole("combobox", { name: /Guia do fornecedor/ }), { target: { value: "GR 2026/500" } });
    expect(within(p).getByText("Guia nova: fica criada ao receber.")).toBeInTheDocument();
    fireEvent.click(within(p).getByRole("button", { name: /Conferir linha a linha/ }));
    fireEvent.click(within(p).getByRole("button", { name: /^Menos:/ }));
    expect(within(p).getByRole("spinbutton", { name: /Dar entrada/ })).toHaveValue(1);
    fireEvent.click(within(p).getByRole("button", { name: "Confirmar entrada · 1 un" }));
    expect(within(p).getByRole("alert")).toHaveTextContent("escolha o motivo da diferença");
    fireEvent.change(within(p).getByRole("combobox", { name: /Porque veio diferente/ }), { target: { value: "Veio menos" } });
    fireEvent.click(within(p).getByRole("button", { name: "Confirmar entrada · 1 un" }));
    const x = po("PO-2026-0137");
    expect(poStatus(x)).toBe("partial");
    expect(x.log.some((l) => /^Conferência na receção: Veio menos \(PV-450 1 de 2\)$/.test(l.t))).toBe(true);
    const g = lerInventario().guias.find((y) => y.id === "GR 2026/500")!;
    expect(g).toMatchObject({ sup: x.sup, state: "open" });
    expect(g.history.some((h) => /Veio menos/.test(h.t))).toBe(true);
    expect(within(painel("PO-2026-0137")).getByText(/Ainda falta 1 un · 1 linha nesta encomenda/)).toBeInTheDocument();
  });

  it("\"Entra em\" outro armazém: a pré-visualização avisa a transferência e receber cria o pedido para o armazém da EC", () => {
    render(<Casa inicio="guia" />);
    fireEvent.click(within(lista()).getByRole("button", { name: "Dar entrada PO-2026-0137" }));
    const p = painel("PO-2026-0137");
    fireEvent.change(within(p).getByRole("combobox", { name: "Entra em" }), { target: { value: "POR" } });
    expect(lerInventario().rc.wh).toBe("POR");
    expect(within(painel("PO-2026-0137")).getByText(/seguem para Armazém Central \(Lisboa\): é criado um pedido de transferência/)).toBeInTheDocument();
    const antes = lerInventario().transfers.length, resPor = reservadoEm(lerInventario(), "PV-450", "LIS");
    fireEvent.click(within(painel("PO-2026-0137")).getByRole("button", { name: "Receber tudo · 2 un" }));
    const db = lerInventario();
    expect(db.transfers.length).toBe(antes + 1);
    expect(db.transfers.at(-1)).toMatchObject({ from: "POR", to: "LIS", state: "pending", auto: true });
    expect(reservadoEm(db, "PV-450", "LIS")).toBeGreaterThanOrEqual(resPor);
  });

  it("\"Receber no armazém →\" no Hoje: com uma só PO a chegar hoje/amanhã abre o painel dela; com mais, abre a lista", () => {
    const [so] = chegamHojePos(lerInventario().pos);
    expect(chegamHojePos(lerInventario().pos)).toHaveLength(1);
    render(<Casa inicio="hoje" />);
    fireEvent.click(screen.getByRole("button", { name: "Receber no armazém →" }));
    expect(painel(so.id)).toBeInTheDocument();
    cleanup();
    executar((d) => { d.rc.poFilter = ""; });
    const outra = lerInventario().pos.find((p) => p.sup === "zeta" && poRecebivel(p))!;
    expect(executar((d) => portalConfirmar(d, d.pos.find((x) => x.id === outra.id)!, somarDias(HOJE, 1), "Amanhã")).erro).toBe("");
    expect(chegamHojePos(lerInventario().pos).map((p) => p.id).sort()).toEqual([so.id, outra.id].sort());
    render(<Casa inicio="hoje" />);
    fireEvent.click(screen.getByRole("button", { name: "Receber no armazém →" }));
    expect(screen.queryByRole("dialog", { name: /^Dar entrada/ })).toBeNull();
    expect(within(lista()).getAllByRole("row")[1]).toHaveTextContent(/^Chega hoje \/ amanhã · 2/);
  });
});
