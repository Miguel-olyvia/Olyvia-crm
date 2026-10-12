// Compras › Encomendas: a lista das POs com KPI, pesquisa, filtros e ordenação; a linha abre a folha lateral. Um só botão primário: "Nova encomenda".
import { useState } from "react";
import { Plus } from "lucide-react";
import { Escolher, Interruptor } from "../FiltrosPopover";
import { eur, fmtD, diasEntre, HOJE, nomeForn, fornecedor } from "./base";
import { contadores } from "./contadores";
import { useCtxInv } from "./ctxInv";
import { Confirmar } from "./DialogosInv";
import { filtrarPos, type EstadoPoFiltro } from "./filtros";
import { NovaPoDialogo } from "./NovaPoDialogo";
import { Pesquisa, Pri, Sec, Selo, Vazio } from "./pecasInv";
import { enviarPo, poLate, poOpen, poPublished, poStatus, poStatusLabel, poTotals, restaurarPo, textoPortal } from "./po";
import { ReceberDialogo } from "./ReceberDialogo";
import { TabelaInv, type Coluna } from "./TabelaInv";
import { Kpi } from "./kpiInv";
import { ExportarInv } from "./ExportarInv";
import { CHIP } from "../FiltrosPopover";
import type { Po, Tom } from "./tipos";

const TOM: Record<string, Tom> = { pending: "warn", ordered: "info", partial: "violet", received: "ok", cancelled: "neu" };

export const SeloEstadoPo = ({ p }: { p: Po }) => <Selo tom={TOM[poStatus(p)]}>{poStatusLabel[poStatus(p)]}</Selo>;

const ESTADOS: readonly (readonly [EstadoPoFiltro, string])[] = [["all", "Todas"], ["pending", "Pendente"], ["ordered", "Encomendado"], ["partial", "Parcialmente recebida"], ["received", "Recebida"], ["cancelled", "Cancelada"], ["late", "Atrasadas"], ["portal", "No portal"]];

function colunas(db: ReturnType<typeof useCtxInv>["db"]): Coluna<Po>[] {
  return [
    { id: "id", titulo: "Nº", celula: (p) => <>{p.id}{p.auto ? " · automática" : ""}{p.deleted ? " · Eliminada" : ""}</>, valor: (p) => p.id },
    { id: "sup", titulo: "Fornecedor", celula: (p) => nomeForn(db, p.sup), valor: (p) => nomeForn(db, p.sup) },
    { id: "orig", titulo: "Origem", celula: (p) => (!p.origin || p.origin.k === "stock" ? "Stock" : (p.origin.ref ?? p.origin.ec) + (p.origin.client ? " · " + p.origin.client : "")) },
    { id: "date", titulo: "Data", celula: (p) => fmtD(p.date), valor: (p) => p.date },
    { id: "due", titulo: "Entrega", celula: (p) => <>{fmtD(p.due)}{poLate(p) && <span className="block">{diasEntre(p.due, HOJE)} dias de atraso</span>}</>, valor: (p) => p.due },
    { id: "st", titulo: "Estado", celula: (p) => <span className="grid justify-items-start gap-1"><SeloEstadoPo p={p} />{textoPortal(p) && <span className="text-muted-foreground">{textoPortal(p)}</span>}</span> },
    { id: "val", titulo: "Valor", celula: (p) => eur(poTotals(p).total), valor: (p) => poTotals(p).total, direita: true },
  ];
}

function Filtros({ n }: { n: (k: EstadoPoFiltro) => number }) {
  const { db, filtros, setFiltros } = useCtxInv();
  const f = filtros.po;
  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <Pesquisa valor={f.q} aoMudar={(q) => setFiltros("po", { q })} rotulo="Pesquisar encomendas por nº, produto, SKU, EAN, fornecedor ou cliente" dica="Nº PO, produto, SKU/EAN ou cliente" />
        <div className="w-56"><Escolher rotulo="Fornecedor" valor={f.sup} aoMudar={(sup) => setFiltros("po", { sup })} todas="Todos os fornecedores" opcoes={db.suppliers.filter((s) => !s.deleted).map((s) => ({ valor: s.id, nome: s.name }))} /></div>
        <div className="w-52"><Escolher rotulo="Data a usar" valor={f.campoData} aoMudar={(v) => setFiltros("po", { campoData: v === "real" ? "real" : "date" })} todas="Data da encomenda" opcoes={[{ valor: "real", nome: "Data de entrega real" }]} /></div>
        <label className="text-[15px] text-muted-foreground">De<input type="date" value={f.de} onChange={(e) => setFiltros("po", { de: e.target.value })} className="block h-11 rounded-md border border-[hsl(220_10%_45%)] bg-card px-2 text-[15px] text-foreground" /></label>
        <label className="text-[15px] text-muted-foreground">Até<input type="date" value={f.ate} onChange={(e) => setFiltros("po", { ate: e.target.value })} className="block h-11 rounded-md border border-[hsl(220_10%_45%)] bg-card px-2 text-[15px] text-foreground" /></label>
        <Interruptor nome="Ver eliminadas" ativo={f.eliminadas} aoMudar={() => setFiltros("po", { eliminadas: !f.eliminadas })} />
      </div>
      <div role="group" aria-label="Estado" className="flex flex-wrap gap-2">
        {ESTADOS.map(([k, nome]) => <button key={k} type="button" aria-pressed={f.status === k} onClick={() => setFiltros("po", { status: k })} className={CHIP(f.status === k)}>{nome} <span className="tabular-nums opacity-70">{n(k)}</span></button>)}
      </div>
      <p className="text-[15px] text-muted-foreground">"Recebida" nunca se escolhe à mão e "Parcialmente recebida" é calculado pelas receções.</p>
    </>
  );
}

export function EncomendasInv() {
  const { db, filtros, setFiltros, abrir, agir, ir } = useCtxInv();
  const f = filtros.po;
  const c = contadores(db);
  const lista = filtrarPos(db, f);
  const [dlg, setDlg] = useState<{ t: "nova" } | { t: "enviar" | "receber"; id: string } | null>(null);
  const todas = db.pos.filter((p) => !p.deleted);
  const n = (k: EstadoPoFiltro): number => (k === "all" ? todas.length : k === "late" ? c.late : k === "portal" ? todas.filter(poPublished).length : todas.filter((p) => poStatus(p) === k).length);
  const acao = (p: Po): React.ReactNode => {
    const st = poStatus(p);
    if (p.deleted) return <Sec onClick={() => agir((d) => restaurarPo(d, d.pos.find((x) => x.id === p.id)!), `${p.id} restaurada.`)}>Restaurar</Sec>;
    if (st === "pending") return <Sec onClick={() => setDlg({ t: "enviar", id: p.id })}>Aprovar e enviar</Sec>;
    if (poOpen(p)) return <Sec onClick={() => setDlg({ t: "receber", id: p.id })}>Receber</Sec>;
    return <Sec onClick={() => abrir({ t: "po", id: p.id })}>Ver</Sec>;
  };
  const alvo = dlg && dlg.t !== "nova" ? db.pos.find((p) => p.id === dlg.id) : undefined;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-end gap-3">
        <ExportarInv nome="encomendas" rotulo="encomendas" cabecalho={["Nº", "Fornecedor", "Origem", "Data", "Entrega", "Estado", "Valor"]} linhas={() => lista.map((p) => [p.id, nomeForn(db, p.sup), p.origin.ref || p.origin.k, p.date, p.due, poStatusLabel[poStatus(p)], poTotals(p).total])} /><Pri onClick={() => setDlg({ t: "nova" })}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />Nova encomenda</Pri>
      </div>
      <div className="kpis">
        <Kpi tom="warn" rotulo="Por aprovar" valor={String(c.pending)} nota="pendente → encomendado" aoClicar={() => setFiltros("po", { status: "pending" })} acaoRotulo="Filtrar por pendentes" />
        <Kpi tom="info" rotulo="Encomendadas" valor={String(c.ordered + c.partialPO)} nota={`${c.partialPO} parcialmente recebidas`} aoClicar={() => setFiltros("po", { status: "ordered" })} acaoRotulo="Filtrar por encomendadas" />
        <Kpi tom="bad" rotulo="Atrasadas" valor={String(c.late)} nota="entrega prevista ultrapassada" aoClicar={() => setFiltros("po", { status: "late" })} acaoRotulo="Filtrar por atrasadas" />
        <Kpi rotulo="Valor por receber" valor={eur(c.openValue)} nota="com IVA, só o que falta" />
      </div>
      <Filtros n={n} />
      {lista.length === 0 ? <Vazio titulo="Sem encomendas com estes filtros" texto="Limpe a pesquisa ou escolha outro estado."><Sec onClick={() => ir({ aba: "po", f: {} })}>Limpar filtros</Sec></Vazio> : (
        <TabelaInv titulo="Encomendas a fornecedor" colunas={colunas(db)} linhas={lista} chave={(p) => p.id} abrir={(p) => abrir({ t: "po", id: p.id })} acoes={acao}
          ordemInicial={{ col: "date", dir: "desc" }} classeLinha={(p) => (p.deleted ? "opacity-70" : "")} rotuloAbrir={(p) => `Abrir ${p.id}, ${nomeForn(db, p.sup)}`} />
      )}
      <p className="text-[15px] text-muted-foreground" aria-live="polite">{lista.length} encomenda{lista.length === 1 ? "" : "s"}</p>
      {dlg?.t === "nova" && <NovaPoDialogo aberto aoFechar={() => setDlg(null)} />}
      {dlg?.t === "receber" && alvo && <ReceberDialogo aberto aoFechar={() => setDlg(null)} id={alvo.id} />}
      {dlg?.t === "enviar" && alvo && (
        <Confirmar aberto aoFechar={() => setDlg(null)} titulo={`Aprovar e enviar ${alvo.id}`} ok="Aprovar e enviar"
          texto={<><p><b>{nomeForn(db, alvo.sup)}</b> · {alvo.lines.length} linha(s) · {eur(poTotals(alvo).total)}</p>
            <p>O estado passa de Pendente para Encomendado.</p>
            <p>{fornecedor(db, alvo.sup)?.portal === "active" ? "O fornecedor tem portal ativo: a encomenda é publicada no portal e segue email. Enquanto publicada, linhas, fornecedor, data e estado ficam bloqueados." : "O fornecedor não tem portal ativo: segue o PDF por email."}</p></>}
          aoConfirmar={() => agir((d) => enviarPo(d, d.pos.find((p) => p.id === alvo.id)!), `${alvo.id} aprovada e enviada ao fornecedor.`)} />
      )}
    </div>
  );
}
