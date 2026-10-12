// Compras › Encomendas (scrPO do mockup): cabeçalho com Exportar, Importar e Nova encomenda, os quatro cartões, os filtros e a lista (normal ou agrupada por fornecedor).
// A linha abre a folha lateral; o primeiro botão de cada linha faz a ação do estado (aprovar, receber, ver ou restaurar).
import { useState } from "react";
import { Plus, Upload } from "lucide-react";
import { eur } from "./base";
import { AcoesCab } from "./cabInv";
import { contadores } from "./contadores";
import { useCtxInv } from "./ctxInv";
import { filtrarPos, type EstadoPoFiltro } from "./filtros";
import { BotaoExportar, ImportarDlg } from "./ImportarInv";
import { Kpi } from "./kpiInv";
import { NovaPoDialogo } from "./NovaPoDialogo";
import { can, porqueNao } from "./perfil";
import { PoDialogos, type DlgPo } from "./PoDialogos";
import { PoFiltros } from "./PoFiltros";
import { PoLista } from "./PoLista";
import { defPos } from "./poCsv";
import { poPublished, poStatus } from "./po";

const PM = "purchase_orders.manage";

function Acoes({ aoNova, aoImportar, exportar }: { aoNova: () => void; aoImportar: () => void; exportar: React.ReactNode }) {
  const pode = can(PM);
  return (
    <AcoesCab>
      {exportar}
      <button type="button" className="btn" disabled={!pode} title={pode ? undefined : porqueNao(PM)} onClick={aoImportar}><Upload className="ic" aria-hidden="true" />Importar</button>
      <button type="button" className="btn btn-p" disabled={!pode} title={pode ? undefined : "Requer purchase_orders.manage"} onClick={aoNova}><Plus className="ic" aria-hidden="true" />Nova encomenda</button>
    </AcoesCab>
  );
}

export function EncomendasInv() {
  const { db, filtros, setFiltros } = useCtxInv();
  const f = filtros.po;
  const c = contadores(db);
  const lista = filtrarPos(db, f);
  const [nova, setNova] = useState(false), [importar, setImportar] = useState(false);
  const [dlg, setDlg] = useState<{ id: string; d: DlgPo } | null>(null);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const todas = db.pos.filter((p) => !p.deleted);
  const n = (k: EstadoPoFiltro): number => (k === "all" ? todas.length : k === "late" ? c.late : k === "portal" ? todas.filter(poPublished).length : todas.filter((p) => poStatus(p) === k).length);
  const def = defPos(db, () => lista);
  return (
    <>
      <Acoes aoNova={() => setNova(true)} aoImportar={() => setImportar(true)} exportar={<BotaoExportar def={def} />} />
      <div className="kpis">
        <Kpi tom="warn" rotulo="Por aprovar" valor={String(c.pending)} nota="pending → ordered" fonte="purchase_orders.status" aoClicar={() => setFiltros("po", { status: "pending" })} />
        <Kpi tom="info" rotulo="Encomendadas" valor={String(c.ordered + c.partialPO)} nota={`${c.partialPO} parcialmente recebidas`} fonte="purchase_orders" aoClicar={() => setFiltros("po", { status: "ordered" })} />
        <Kpi tom="bad" rotulo="Atrasadas" valor={String(c.late)} nota="entrega prevista ultrapassada" fonte="purchase_orders.expected_delivery_date" aoClicar={() => setFiltros("po", { status: "late" })} />
        <Kpi rotulo="Valor por receber" valor={can("purchase_orders.view_prices") ? eur(c.openValue) : "—"} nota="com IVA, só o que falta" fonte="purchase_order_items (quantidade − recebida − anulada)" />
      </div>
      <PoFiltros n={n} />
      <PoLista lista={lista} abertos={abertos} alternar={(id) => setAbertos((x) => ({ ...x, [id]: !x[id] }))} pedir={(id, d) => setDlg({ id, d })} />
      {nova && <NovaPoDialogo aberto aoFechar={() => setNova(false)} />}
      {importar && <ImportarDlg def={def} aoFechar={() => setImportar(false)} />}
      {dlg && <PoDialogos id={dlg.id} dlg={dlg.d} fechar={() => setDlg(null)} />}
    </>
  );
}
