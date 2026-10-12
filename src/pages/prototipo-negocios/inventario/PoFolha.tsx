// A folha lateral de uma PO (poSheet do mockup): cabeçalho com estado, fornecedor, origem, entrega e linha temporal, sete separadores e o rodapé com a ação principal do estado
// (gravar e encomendar, ou receber). Os campos editam-se na própria célula; os diálogos pedem motivo quando a regra o exige.
import { useState } from "react";
import { Printer, Send, Trash2, Truck } from "lucide-react";
import { AbasFolha, Folha } from "./DialogosInv";
import { nomeForn, poPorId } from "./base";
import { Fonte } from "./cabInv";
import { useCtxInv } from "./ctxInv";
import { MenuPo } from "./MenuPo";
import { Dados, Ligacao, Pri, Sec, Selo } from "./pecasInv";
import { can, porqueNao } from "./perfil";
import { PoDialogos, type DlgPo } from "./PoDialogos";
import { PoHdr, Timeline, poDe } from "./PoCab";
import { PORTAL_FORN, duplicarPo, gravarPo, poLate, poOpen, restaurarPo } from "./po";
import { SeloEstadoPo, SeloPortal } from "./poPecas";
import type { AcoesPo, EstadoPd, TabPo } from "./poTipos";
import { PoTabs } from "./PoTabsSwitch";

export function PoFolha({ id, tabInicial, aoFechar }: { id: string; tabInicial?: string; aoFechar: () => void }) {
  const { db, agir, abrir } = useCtxInv();
  const p = poPorId(db, id);
  const [tab, setTab] = useState<TabPo>((tabInicial as TabPo) || "lines");
  const [dlg, setDlg] = useState<DlgPo | null>(null);
  const [pd, setPd] = useState<EstadoPd>({ notesInt: p?.notesInt ?? "", notesSup: p?.notesSup ?? "", add: "", dirty: false });
  if (!p) return null;
  const restaurar = (): void => { agir((d) => restaurarPo(d, poDe(d, id)), `${id} restaurada.`); };
  const duplicar = (): void => {
    const r = agir((d) => duplicarPo(d, id), (n) => `Rascunho ${n.id} criado a partir de ${id}.`);
    if (r.ok) abrir({ t: "po", id: r.valor.id });
  };
  const a: AcoesPo = { pedir: setDlg, irTab: setTab, duplicar, restaurar };
  const gravar = (encomendar: boolean): void => {
    const r = agir((d) => gravarPo(d, poDe(d, id), { notesInt: pd.notesInt, notesSup: pd.notesSup }, encomendar), encomendar ? `${id} gravada e encomendada num só passo.` : `${id} gravada (as edições nas células gravam logo).`);
    if (r.ok) setPd((x) => ({ ...x, dirty: false }));
  };
  const sup = db.suppliers.find((s) => s.id === p.sup);
  const aprova = can("purchase_orders.approve"), recebe = can("inventory.receive");
  const pdf = <div className="left"><Sec className="btn-ghost" onClick={() => setDlg({ t: "pdf" })}><Printer className="ic" aria-hidden="true" />PDF</Sec></div>;
  const rodape = p.deleted ? <><Sec onClick={aoFechar}>Fechar</Sec><Pri onClick={restaurar}>Restaurar</Pri></>
    : p.status === "pending" ? <><div className="left"><Sec className="btn-ghost" onClick={() => setDlg({ t: "eliminar" })}><Trash2 className="ic" aria-hidden="true" />Eliminar</Sec></div><Sec onClick={() => gravar(false)}>Gravar{pd.dirty ? " *" : ""}</Sec>
      <Pri disabled={!aprova} title={aprova ? undefined : "Requer purchase_orders.approve"} onClick={() => gravar(true)}><Send className="ic" aria-hidden="true" />Gravar e encomendar</Pri></>
    : poOpen(p) ? <>{pdf}<Sec onClick={() => gravar(false)}>Gravar{pd.dirty ? " *" : ""}</Sec><Pri disabled={!recebe} title={recebe ? undefined : porqueNao("inventory.receive")} onClick={() => setDlg({ t: "receber" })}><Truck className="ic" aria-hidden="true" />Receber</Pri></>
    : <>{pdf}<Sec onClick={() => gravar(false)}>Gravar notas</Sec><Pri onClick={aoFechar}>Fechar</Pri></>;
  return (
    <Folha aberta aoFechar={aoFechar} chave={id} titulo={p.id} subtitulo="Compras › Encomenda a fornecedor" rodape={rodape}
      acoesTopo={<MenuPo p={p} rotulo="Mais ações" abrir={(t) => setTab((t as TabPo) || "lines")} dlg={setDlg} />}
      selos={<><SeloEstadoPo p={p} /><SeloPortal p={p} />{poLate(p) && <Selo tom="bad">Atrasada</Selo>}{p.deleted && <Selo>Eliminada</Selo>}</>}
      abas={<>
        <Dados itens={[
          ["Fornecedor", <span key="f">{can("suppliers.view") ? <Ligacao aoClicar={() => abrir({ t: "sup", id: p.sup })}>{nomeForn(db, p.sup)}</Ligacao> : nomeForn(db, p.sup)} {sup && <Selo tom={PORTAL_FORN[sup.portal][1]}>Portal: {PORTAL_FORN[sup.portal][0]}</Selo>}</span>],
          ["Origem", p.origin.k === "stock" ? "Reposição de stock" : <span key="o">Gerada de {p.origin.ref}{p.origin.ec && can("contracts.view") ? <> → <Ligacao aoClicar={() => abrir({ t: "ec", id: p.origin.ec as string })}>Ver Encomenda Cliente {p.origin.ec}</Ligacao></> : null}</span>],
          ["Entregar em", <PoHdr key="w" p={p} k="wh" a={a} />],
          ["Data · entrega prevista", <span key="d"><PoHdr p={p} k="date" a={a} /> · <PoHdr p={p} k="due" a={a} /></span>],
        ]} />
        <Timeline p={p} />
        <Fonte>purchase_orders · supplier_po_publications · purchase_order_receipts</Fonte>
        <AbasFolha<TabPo> rotulo="Partes da encomenda" atual={tab} escolher={setTab} abas={[["lines", "Linhas", p.lines.length], ["rec", "Receções", p.receipts.length], ["guias", "Guias", db.guias.filter((g) => g.pos.includes(id)).length], ["portal", "Portal"], ["ann", "Anulações", p.cancels.filter((c) => !c.undone).length], ["notes", "Notas"], ["hist", "Histórico"]]} />
      </>}>
      <PoTabs tab={tab} p={p} a={a} pd={pd} setPd={setPd} />
      <PoDialogos id={id} dlg={dlg} fechar={() => setDlg(null)} aoEliminar={aoFechar} />
    </Folha>
  );
}
