// A lista das encomendas (poListHtml e poRows do mockup): a tabela normal com o rodapé "N encomenda(s)", ou a vista agrupada por fornecedor com os grupos expansíveis.
import { ChevronDown, ChevronRight, Clock } from "lucide-react";
import { HOJE, diasEntre, fmtD, nomeForn } from "./base";
import { Fonte } from "./cabInv";
import { useCtxInv } from "./ctxInv";
import { FILTROS_VAZIOS } from "./filtros";
import { MenuPo } from "./MenuPo";
import { Peq, Sec, Selo, Vazio } from "./pecasInv";
import { can, porqueNao } from "./perfil";
import type { DlgPo } from "./PoDialogos";
import { Dinheiro, OrigemChip, SeloEstadoPo, SeloPortal } from "./poPecas";
import { poLate, poOpen, poStatus, poTotals, restaurarPo } from "./po";
import { useIrReceber } from "./irReceber";
import { TabelaInv, type Coluna } from "./TabelaInv";
import type { Fornecedor, Po } from "./tipos";

type PedirDlg = (id: string, d: DlgPo) => void;

/** O botão principal de cada linha: restaurar, aprovar e enviar, receber ou ver (act0 do mockup). */
function AcaoLinha({ p, pedir }: { p: Po; pedir: PedirDlg }) {
  const { agir, abrir } = useCtxInv();
  const irReceber = useIrReceber();
  const st = poStatus(p);
  if (p.deleted) return <Peq onClick={() => agir((d) => restaurarPo(d, d.pos.find((x) => x.id === p.id) as Po), `${p.id} restaurada.`)}>Restaurar</Peq>;
  if (st === "pending") { const pode = can("purchase_orders.approve"); return <Peq className="btn-p" disabled={!pode} title={pode ? undefined : porqueNao("purchase_orders.approve")} onClick={() => pedir(p.id, { t: "enviar" })}>Aprovar e enviar</Peq>; }
  if (st === "ordered" || st === "partial") { const pode = can("inventory.receive"); return <Peq disabled={!pode} title={pode ? undefined : porqueNao("inventory.receive")} onClick={() => irReceber(p.id)}>Receber</Peq>; }
  return <Peq onClick={() => abrir({ t: "po", id: p.id })}>Ver</Peq>;
}

function colunas(nomeDe: (id: string) => string): Coluna<Po>[] {
  return [
    { id: "id", titulo: "Nº", valor: (p) => p.id, celula: (p) => <><b className="mono">{p.id}</b>{p.deleted && <> <Selo>Eliminada</Selo></>}{p.auto && <><br /><small className="muted">automática</small></>}</> },
    { id: "sup", titulo: "Fornecedor", celula: (p) => nomeDe(p.sup) },
    { id: "orig", titulo: "Origem", celula: (p) => <OrigemChip o={p.origin} /> },
    { id: "date", titulo: "Data", valor: (p) => p.date + p.id, classe: () => "nowrap", celula: (p) => fmtD(p.date) },
    { id: "due", titulo: "Entrega", valor: (p) => p.due, classe: (p) => (poLate(p) ? "nowrap late" : "nowrap"), celula: (p) => <>{fmtD(p.due)}{poLate(p) && <> <Clock className="ic sm" aria-hidden="true" /><br /><small>{diasEntre(p.due, HOJE)} dias de atraso</small></>}</> },
    { id: "st", titulo: "Estado", celula: (p) => <div className="stk"><SeloEstadoPo p={p} /><SeloPortal p={p} /></div> },
    { id: "val", titulo: "Valor", direita: true, valor: (p) => poTotals(p).total, celula: (p) => <Dinheiro n={poTotals(p).total} /> },
  ];
}

function TabelaPos({ lista, pedir }: { lista: Po[]; pedir: PedirDlg }) {
  const { db, abrir } = useCtxInv();
  return (
    <TabelaInv titulo="Encomendas a fornecedor" minimo={1000} colunas={colunas((id) => nomeForn(db, id))} linhas={lista} chave={(p) => p.id} abrir={(p) => abrir({ t: "po", id: p.id })}
      ordemInicial={{ col: "date", dir: "desc" }} classeLinha={(p) => (p.deleted ? "deleted" : "")} rotuloAbrir={(p) => `Abrir ${p.id}, ${nomeForn(db, p.sup)}`}
      acoes={(p) => <><AcaoLinha p={p} pedir={pedir} /><MenuPo p={p} abrir={(tab) => abrir({ t: "po", id: p.id, tab })} dlg={(d) => pedir(p.id, d)} /></>} />
  );
}

interface Grupo { s: Fornecedor; l: Po[] }

function TabelaGrupos({ lista, abertos, alternar, pedir }: { lista: Po[]; abertos: Record<string, boolean>; alternar: (id: string) => void; pedir: PedirDlg }) {
  const { db } = useCtxInv();
  const grupos: Grupo[] = db.suppliers.map((s) => ({ s, l: lista.filter((p) => p.sup === s.id) })).filter((g) => g.l.length);
  const ultima = (g: Grupo): string => g.l.map((p) => p.date).sort().pop() as string;
  const cols: Coluna<Grupo>[] = [
    { id: "f", titulo: "Fornecedor", celula: (g) => { const o = !!abertos[g.s.id]; const Ch = o ? ChevronDown : ChevronRight; return <button type="button" className="link" aria-expanded={o} onClick={() => alternar(g.s.id)}><Ch className="ic sm" aria-hidden="true" /> {g.s.name}</button>; } },
    { id: "n", titulo: "Nº encomendas", direita: true, celula: (g) => g.l.length },
    { id: "r", titulo: "Por receber", direita: true, celula: (g) => g.l.filter(poOpen).length },
    { id: "c", titulo: "Recebidas", direita: true, celula: (g) => g.l.filter((p) => poStatus(p) === "received").length },
    { id: "u", titulo: "Última", celula: (g) => fmtD(ultima(g)) },
    { id: "v", titulo: "Valor total", direita: true, celula: (g) => <Dinheiro n={g.l.reduce((a, p) => a + poTotals(p).total, 0)} /> },
  ];
  return (
    <TabelaInv titulo="Encomendas agrupadas por fornecedor" minimo={900} colunas={cols} linhas={grupos} chave={(g) => g.s.id} classeLinha={() => "grp"}
      extra={(g) => (abertos[g.s.id] ? <tr className="sub"><td colSpan={6}><TabelaPos lista={g.l} pedir={pedir} /></td></tr> : null)} />
  );
}

interface Props { lista: Po[]; abertos: Record<string, boolean>; alternar: (id: string) => void; pedir: PedirDlg }

export function PoLista({ lista, abertos, alternar, pedir }: Props) {
  const { filtros, setFiltros } = useCtxInv();
  const corpo = !lista.length
    ? <Vazio titulo="Sem encomendas com estes filtros" texto="Limpe a pesquisa ou escolha outro estado."><Sec onClick={() => setFiltros("po", FILTROS_VAZIOS.po)}>Limpar filtros</Sec></Vazio>
    : filtros.po.group ? <TabelaGrupos lista={lista} abertos={abertos} alternar={alternar} pedir={pedir} />
    : <><TabelaPos lista={lista} pedir={pedir} /><div className="tbl-foot"><span>{lista.length} encomenda(s)</span><Fonte>purchase_orders · purchase_order_items · fn_po_crm_load</Fonte></div></>;
  return <div id="po-list">{corpo}</div>;
}
