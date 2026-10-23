// O Portal do Fornecedor simulado (20/10, demo) e a expedição com guia de remessa (SÓ PROTÓTIPO), ponta a ponta com o Tiago (1027):
// pagamento validado → EC → POs → aprovadas e publicadas no portal → o fornecedor abre (vista), confirma e expede com a guia → o armazém lê o
// número da guia na Receção e dá entrada com as quantidades da guia → EC pronta → a carrinha carrega e entrega a fase → a obra arranca.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { acoes, seed, type Estado } from "../motor";
import { FINANCEIRO, OBRA, emFalta, type Grupo } from "../campos";
import { aprovarPos, posDe } from "../testeObra";
import { faltaParaArrancar } from "../preparacaoObra";
import { HOJE, poPorId, somarDias } from "../inventario/base";
import type { AbaInv } from "../inventario/ctxInv";
import { resumoGuia } from "../inventario/guias";
import InventarioPagina from "../inventario/InventarioPagina";
import { esquecerInventario, executar, lerInventario } from "../inventario/loja";
import { esquecerPerfil } from "../inventario/perfil";
import { faltaMateriais, resumoEcNegocio } from "../inventario/ponteNegocios";
import { percursoPo, podeExpedir, porExpedir, poStatus, portalConfirmar, portalExpedir, portalVista, proximaGuiaRemessa, selarPortal } from "../inventario/po";
import { abrirRececaoDaPo, fixarRececao, resolverCodigoRececao } from "../inventario/rececao";
import { chegamHojePos, grupoRececao, seloRececao } from "../inventario/rececaoLista";
import { receberLinhas } from "../inventario/receber";
import type { Po } from "../inventario/tipos";
import { esquecerFrota, executar as executarFrota, lerFrota } from "../frota/loja";
import { obrasDoEstado } from "../frota/pontes";
import { carregarFase, entregarFase, fasesTransporte, ligarObra } from "../frota/transporteObra";
import { contagensPortal, fornecedorInicial, posDoPortal } from "./dadosPortal";
import PortalFornecedor from "./PortalFornecedor";

const REF = "CT 2026/1027";
const preencher = (d: { f: Record<string, string> }, gs: Grupo[]) => {
  for (let i = 0; i < 5; i++) {
    const f = emFalta(gs, d.f);
    if (!f.length) return;
    for (const c of f) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-10-20" : "x";
  }
};
/** O Tiago pago pelo Financeiro: a EC-1027 no Inventário e as POs (pendentes) do que falta. */
function pagarTiago(): { S: Estado; A: ReturnType<typeof acoes> } {
  const S = seed(), A = acoes(S, () => {}, (fn) => fn()), d = S.deals.find((x) => x.id === 1027)!;
  preencher(d, FINANCEIRO); preencher(d, [OBRA[0]]); A.role("financeiro"); A.emitir(1027); A.validar(1027);
  return { S, A };
}
const po = (id: string): Po => lerInventario().pos.find((p) => p.id === id)!;
const agirPo = (id: string, fn: (d: ReturnType<typeof lerInventario>, p: Po) => unknown) => executar((d) => fn(d, poPorId(d, id)!));
const tudoPorExpedir = (p: Po) => p.lines.map((l) => ({ lineId: l.id, qty: porExpedir(p, l) }));

beforeEach(() => { localStorage.clear(); esquecerInventario(); esquecerPerfil(); esquecerFrota(); });
afterEach(() => { cleanup(); localStorage.clear(); });

describe("Portal do Fornecedor simulado · regras da expedição (só protótipo)", () => {
  it("do pagamento à obra arrancada: portal vista → confirmar → expedir com guia → receção pela guia → carrinha → arrancar", () => {
    const { S, A } = pagarTiago();
    const d = S.deals.find((x) => x.id === 1027)!;
    expect(d.fin.pago).toBe(true);
    expect(d.obra.ec).toMatchObject({ n: "EC-1027", ref: REF });
    const ids = posDe(REF).map((p) => p.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => po(id).status === "pending")).toBe(true);
    // aprovadas no Inventário: publicadas no portal do fornecedor (acesso ativo)
    expect(aprovarPos(REF)).toBe("");
    expect(ids.every((id) => po(id).portal.state === "sent")).toBe(true);
    const sup = po(ids[0]).sup;
    expect(lerInventario().suppliers.find((s) => s.id === sup)!.portal).toBe("active");
    expect(posDoPortal(lerInventario(), sup).map((p) => p.id)).toEqual(expect.arrayContaining(ids.filter((id) => po(id).sup === sup)));
    expect(contagensPortal(posDoPortal(lerInventario(), sup)).to_confirm).toBeGreaterThan(0);
    expect(fornecedorInicial(lerInventario())).not.toBe("");

    // antes de confirmar não se expede
    expect(agirPo(ids[0], (db, p) => portalExpedir(db, p, { guia: "GR X", data: HOJE, linhas: tudoPorExpedir(p) })).erro).toBe("Confirme a encomenda antes de a expedir.");

    const prometida = somarDias(HOJE, 3);
    const guias: Record<string, string> = {};
    for (const id of ids) {
      expect(agirPo(id, (db, p) => portalVista(db, p)).erro).toBe("");
      expect(po(id).portal.state).toBe("seen");
      expect(agirPo(id, (db, p) => portalConfirmar(db, p, prometida, "Confirmado no portal")).erro).toBe("");
      expect(podeExpedir(po(id))).toBe(true);
      // as regras: guia obrigatória, nunca mais do que falta expedir
      expect(agirPo(id, (db, p) => portalExpedir(db, p, { guia: " ", data: HOJE, linhas: tudoPorExpedir(p) })).erro).toBe("Indique o número da guia de remessa.");
      expect(agirPo(id, (db, p) => portalExpedir(db, p, { guia: "GR Z", data: HOJE, linhas: [{ lineId: p.lines[0].id, qty: porExpedir(p, p.lines[0]) + 1 }] })).erro).toMatch(/^Nunca mais do que falta expedir/);
      const g = proximaGuiaRemessa(lerInventario());
      expect(g).toMatch(/^GR 2026\/\d+$/);
      const r = agirPo(id, (db, p) => portalExpedir(db, p, { guia: g, data: HOJE, linhas: tudoPorExpedir(p), transportador: "Transporte próprio" }));
      expect(r.erro).toBe("");
      guias[id] = g;
      // a mesma guia não se repete
      expect(agirPo(id, (db, p) => portalExpedir(db, p, { guia: g, data: HOJE, linhas: tudoPorExpedir(p) })).ok).toBe(false);
      const x = po(id);
      expect(podeExpedir(x)).toBe(false);
      expect(selarPortal(x)).toEqual([`Expedida pelo fornecedor · guia ${g}`, "violet"]);
      expect(seloRececao(x)[0]).toBe(`Expedida · guia ${g}`);
      expect(grupoRececao(x)).toBe(-1);
      expect(percursoPo(x).find((s) => s.nome === "Expedida")).toMatchObject({ estado: "atual", detalhe: expect.stringContaining(g) });
      // a guia do fornecedor fica aberta, ligada à PO, com o anunciado = expedido
      const gd = lerInventario().guias.find((y) => y.id === g)!;
      expect(gd).toMatchObject({ sup: x.sup, state: "open", pos: [id], doPortal: true });
      expect(x.portal.emails!.some((m) => /expediu/.test(m.t))).toBe(true);
    }
    expect(chegamHojePos(lerInventario().pos).map((p) => p.id)).toEqual(expect.arrayContaining(ids));

    // o armazém lê o número da guia: abre a receção dessa PO, com a guia escolhida, e recebe o que veio na guia
    for (const id of ids) {
      const lido = resolverCodigoRececao(lerInventario(), guias[id]);
      expect(lido).toEqual({ t: "guia", guia: guias[id], pos: [id] });
      const r = executar((db) => {
        fixarRececao(db, { guia: guias[id] });
        const p = poPorId(db, id)!;
        abrirRececaoDaPo(db, p);
        expect(db.rc.guia).toBe(guias[id]);
        const e = p.portal.expedicoes![0];
        return receberLinhas(db, p, e.linhas, db.rc.wh, db.rc.guia);
      });
      expect(r.erro).toBe("");
      expect(poStatus(po(id))).toBe("received");
      const gd = lerInventario().guias.find((y) => y.id === guias[id])!;
      expect(resumoGuia(lerInventario(), gd).div).toBe(0);
      expect(percursoPo(po(id)).every((s) => s.estado === "feito")).toBe(true);
    }
    const ec = resumoEcNegocio(lerInventario(), REF)!;
    expect(ec.pronta).toBe(true);
    expect(faltaMateriais(ec)).toEqual([]);

    // as Operações aprovam o plano; a carrinha carrega e entrega a primeira fase (Frota)
    A.role("operacoes");
    A.aprovarPlano(1027);
    expect(d.obra.plano!.estado).toBe("aprovado");
    const o = () => obrasDoEstado(S).find((x) => x.id === 1027)!;
    const v = lerFrota().viaturas.find((x) => x.armazem && x.armazemId)!;
    expect(executarFrota((F) => ligarObra(F, v.id, 1027)).ok).toBe(true);
    const f = fasesTransporte(lerInventario(), o())[0];
    expect(executar((db) => carregarFase(db, o(), v, f.fase)).erro).toBe("");
    expect(fasesTransporte(lerInventario(), o())[0].estado).toBe("na carrinha");
    expect(executar((db) => entregarFase(db, o(), f.fase)).erro).toBe("");
    expect(fasesTransporte(lerInventario(), o())[0].estado).toBe("entregue");

    // e a obra arranca
    expect(faltaParaArrancar(d, lerInventario())).toEqual([]);
    A.arrancar(1027);
    expect(d.obra.plano!.estado).toBe("em curso");
  });

  it("expedição parcial: só o expedido vem na guia; a segunda expedição leva o resto", () => {
    pagarTiago();
    expect(aprovarPos(REF)).toBe("");
    const p0 = posDe(REF).find((p) => p.lines.some((l) => l.packs * l.packN >= 2))!;
    const id = p0.id;
    agirPo(id, (db, p) => portalConfirmar(db, p, somarDias(HOJE, 2), ""));
    const l0 = po(id).lines.find((l) => l.packs * l.packN >= 2)!;
    const metade = Math.floor(porExpedir(po(id), l0) / 2);
    expect(agirPo(id, (db, p) => portalExpedir(db, p, { guia: "GR 2026/901", data: HOJE, linhas: [{ lineId: l0.id, qty: metade }] })).erro).toBe("");
    expect(porExpedir(po(id), po(id).lines.find((l) => l.id === l0.id)!)).toBe(l0.packs * l0.packN - metade);
    expect(podeExpedir(po(id))).toBe(true);
    expect(agirPo(id, (db, p) => portalExpedir(db, p, { guia: "GR 2026/902", data: HOJE, linhas: tudoPorExpedir(p) })).erro).toBe("");
    expect(po(id).portal.expedicoes!.map((e) => e.guia)).toEqual(["GR 2026/901", "GR 2026/902"]);
    expect(podeExpedir(po(id))).toBe(false);
  });
});

function CasaInv({ inicio }: { inicio: AbaInv }) {
  const [aba, setAba] = useState<AbaInv>(inicio);
  return <InventarioPagina aba={aba} aoMudarAba={setAba} />;
}

describe("Portal do Fornecedor simulado · no ecrã", () => {
  it("abre a encomenda (fica vista), confirma, expede com a guia e a Receção dá entrada lendo a guia, já com as quantidades dela", async () => {
    pagarTiago();
    expect(aprovarPos(REF)).toBe("");
    const id = posDe(REF)[0].id, sup = po(id).sup;
    render(<PortalFornecedor sup={sup} aoMudarFornecedor={() => {}} aoVoltar={() => {}} />);
    expect(screen.getByText("Portal do Fornecedor")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Voltar ao CRM" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Ver encomendas por confirmar/ }));
    expect(screen.getByRole("tab", { name: /Por confirmar/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("button", { name: `Abrir ${id}` }));
    expect(screen.getByRole("heading", { name: `Encomenda ${id}` })).toBeInTheDocument();
    await waitFor(() => expect(po(id).portal.state).toBe("seen"));

    fireEvent.click(screen.getByRole("button", { name: "Confirmar encomenda" }));
    const dc = screen.getByRole("dialog", { name: `Confirmar encomenda ${id}` });
    fireEvent.change(within(dc).getByLabelText("Data de entrega prevista"), { target: { value: somarDias(HOJE, 4) } });
    fireEvent.click(within(dc).getByRole("button", { name: "Confirmar encomenda" }));
    await waitFor(() => expect(po(id).portal.state).toBe("confirmed"));
    expect(po(id).portal.promised).toBe(somarDias(HOJE, 4));

    fireEvent.click(screen.getByRole("button", { name: "Expedir encomenda" }));
    const de = screen.getByRole("dialog", { name: `Expedir encomenda ${id}` });
    const guia = (within(de).getByLabelText("Nº da guia de remessa") as HTMLInputElement).value;
    expect(guia).toMatch(/^GR 2026\/\d+$/);
    fireEvent.change(within(de).getByLabelText("Transportador (opcional)"), { target: { value: "Transportes Silva" } });
    // expedição parcial na primeira linha (se der), o resto inteiro
    const l0 = po(id).lines[0];
    const q0 = Math.max(1, porExpedir(po(id), l0) - 1);
    fireEvent.change(within(de).getAllByRole("spinbutton")[0], { target: { value: String(q0) } });
    const total = q0 + po(id).lines.slice(1).reduce((a, l) => a + porExpedir(po(id), l), 0);
    fireEvent.click(within(de).getByRole("button", { name: `Expedir · ${total} un` }));
    await waitFor(() => expect(po(id).portal.expedicoes).toHaveLength(1));
    expect(screen.getByRole("dialog", { name: `Guia de remessa ${guia}` })).toHaveTextContent("Transportes Silva");
    cleanup();

    // no CRM: a Receção lê a guia e o painel vem com as quantidades da guia
    render(<CasaInv inicio="guia" />);
    const campo = screen.getByRole("textbox", { name: /Ler ou escrever/ });
    fireEvent.change(campo, { target: { value: guia } });
    fireEvent.keyDown(campo, { key: "Enter" });
    const painel = screen.getByRole("dialog", { name: `Dar entrada · ${id}` });
    expect(within(painel).getByText(new RegExp(`Guia de remessa ${guia.replace("/", "\\/")} do fornecedor`))).toBeInTheDocument();
    fireEvent.click(within(painel).getByRole("button", { name: `Receber tudo · ${total} un` }));
    await waitFor(() => expect(po(id).receipts.filter((r) => r.state === "Ativa").reduce((a, r) => a + r.qty, 0)).toBe(total));
    expect(po(id).receipts.every((r) => r.guia === guia)).toBe(true);
    expect(poStatus(po(id))).toBe(total === po(id).lines.reduce((a, l) => a + l.packs * l.packN, 0) ? "received" : "partial");
  });
});
