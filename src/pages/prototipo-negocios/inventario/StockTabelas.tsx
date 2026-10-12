// As tabelas de Existências com o DOM do mockup (stockRowHtml, a vista por produto com linhas que se abrem e a vista por armazém com grupos) e os pedidos de transferência pendentes.
import { Fragment, type ReactNode } from "react";
import { ChevronDown, ChevronRight, ClipboardList, Eye, Lock, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { N, nomeArm, nomeProd, produto } from "./base";
import { Fonte } from "./cabInv";
import { estadoStock, ESTADOS_STOCK, type EstadoStock } from "./contadores";
import { useCtxInv } from "./ctxInv";
import { executarPedidoTransf, livreEm, reservadoEm, reservas } from "./ec";
import { Ed, MenuMais } from "./mockPecas";
import { can } from "./perfil";
import { Selo } from "./pecasInv";
import { definirCampoStock, qtyAt } from "./stock";
import { perm, restaurarLinha } from "./stockAcoes";
import { TabelaInv } from "./TabelaInv";
import type { Inventario, LinhaStock, Tom, Transferencia } from "./tipos";

export const TOM_ESTADO: Record<EstadoStock, Tom> = { low: "bad", ok: "ok", high: "warn" };
export interface AcoesLinha { mov: (pre: { type?: "adjust"; sku: string; wh?: string }) => void; editar: (id: string) => void; eliminar: (id: string) => void }
type Campo = "loc" | "min" | "max" | "rop";

function Barra({ r }: { r: LinhaStock }) {
  const { db } = useCtxInv();
  const res = Math.min(r.qty, reservadoEm(db, r.sku, r.wh)), livre = Math.max(0, r.qty - res), escala = Math.max(r.max || 0, r.qty, 1);
  return <div className="sbar" title={`Reservado ${res} · Livre ${livre} · Máx. ${r.max || "—"}`}><span className="r" style={{ width: `${(res / escala) * 100}%` }} /><span className="f" style={{ width: `${(livre / escala) * 100}%` }} /></div>;
}

function Reservado({ sku, wh }: { sku: string; wh: string }) {
  const { db } = useCtxInv();
  const n = reservadoEm(db, sku, wh), por = reservas(db).resBy[sku + "|" + wh] ?? [];
  if (!n) return <>0</>;
  return <><span tabIndex={0} title={`${por.length} encomenda(s): ${por.join(", ")}`} style={{ textDecoration: "underline dotted", cursor: "help" }}>{N(n)}</span><br /><small className="muted">{por.length} EC</small></>;
}

/** A célula que se edita no sítio (stIE do mockup): bloqueada numa linha eliminada, com o botão "Restaurar". */
function CelulaEd({ r, k }: { r: LinhaStock; k: Campo }) {
  const { agir } = useCtxInv();
  const desbloquear = <> <button type="button" className="btn btn-xs" onClick={(e) => { e.stopPropagation(); agir((d) => restaurarLinha(d, r.id), "Linha restaurada."); }}><Lock className="ic sm" aria-hidden="true" />Restaurar</button></>;
  return <Ed valor={r[k]} tipo={k === "loc" ? "text" : "number"} atributos={k === "loc" ? undefined : { min: 0, step: 1, style: { width: 80 } }} perm="inventory.manage" mostrar={k === "loc" ? r.loc || "—" : String(r[k])} rotulo="Editar"
    aoGravar={(v) => agir((d) => definirCampoStock(d, r.id, k, String(v)), "Gravado.")} {...(r.deleted ? { bloqueio: "Linha eliminada", desbloquear } : {})} />;
}

function MenuLinha({ r, a }: { r: LinhaStock; a: AcoesLinha }) {
  const { db, ir } = useCtxInv();
  const semGerir = !can("inventory.manage");
  return <MenuMais itens={[
    { label: "Editar", icone: <Pencil className="ic" aria-hidden="true" />, desativado: semGerir, run: () => a.editar(r.id) },
    { label: "Registar ajuste", icone: <ClipboardList className="ic" aria-hidden="true" />, desativado: semGerir, run: () => a.mov({ type: "adjust", sku: r.sku, wh: r.wh }) },
    { label: "Ver reservas", icone: <Eye className="ic" aria-hidden="true" />, desativado: !reservadoEm(db, r.sku, r.wh) || !can("contracts.view"), run: () => ir({ aba: "ec", f: { q: r.sku } }) }, "-",
    { label: "Eliminar", icone: <Trash2 className="ic" aria-hidden="true" />, perigo: true, desativado: semGerir, fonte: "rpc_delete_stock", run: () => a.eliminar(r.id) },
  ]} />;
}

function LinhaStockTr({ r, sub, a }: { r: LinhaStock; sub?: boolean; a: AcoesLinha }) {
  const { db, agir, ir } = useCtxInv();
  const p = produto(db, r.sku);
  if (!p) return null;
  const livre = livreEm(db, r.sku, r.wh), est = estadoStock(db, r);
  return (
    <tr className={cn(sub && "subrow", r.deleted && "deleted")}>
      <td>{sub ? null : <><b>{p.name}</b><br /></>}<small className="muted mono">{p.sku} · EAN {p.ean}</small></td>
      <td>{nomeArm(db, r.wh)}</td>
      <td className="mono"><CelulaEd r={r} k="loc" /></td>
      <td className="num">
        <span className="lk"><b>{N(r.qty)}</b> {p.unit} <span className="lk-ic" title="A quantidade só muda por movimentos"><Lock className="ic sm" aria-hidden="true" /></span></span>
        {r.deleted ? null : <><br /><button type="button" className="btn btn-xs" {...perm("inventory.manage")} onClick={() => a.mov({ type: "adjust", sku: r.sku, wh: r.wh })}><ClipboardList className="ic sm" aria-hidden="true" />Registar ajuste</button></>}
        <Barra r={r} />
      </td>
      <td className="num"><Reservado sku={r.sku} wh={r.wh} /></td>
      <td className="num" style={livre < 0 ? { color: "var(--i-bad)", fontWeight: 650 } : undefined}>{N(livre)}{livre < 0 ? <><br /><small>reservas acima do stock</small></> : null}</td>
      <td className="num nowrap"><CelulaEd r={r} k="min" /> / <CelulaEd r={r} k="max" /> / <CelulaEd r={r} k="rop" /></td>
      <td>{r.deleted ? <Selo>Eliminado</Selo> : <Selo tom={TOM_ESTADO[est]}>{ESTADOS_STOCK[est]}</Selo>}</td>
      <td className="act"><div className="row-act">{r.deleted
        ? <button type="button" className="btn btn-sm" onClick={() => agir((d) => restaurarLinha(d, r.id), "Linha de stock restaurada.")}>Restaurar</button>
        : <><button type="button" className="btn btn-sm" {...perm("inventory.manage")} onClick={() => a.mov({ sku: r.sku, wh: r.wh })}>Movimento</button>
          <button type="button" className="btn btn-sm" onClick={() => ir({ aba: "mov", f: { q: r.sku, wh: r.wh } })}>Histórico</button><MenuLinha r={r} a={a} /></>}</div></td>
    </tr>
  );
}

const CABECALHOS: readonly (readonly [string, boolean?])[] = [["Produto"], ["Armazém"], ["Localização"], ["Quantidade", true], ["Reservado", true], ["Livre", true], ["Mín. / Máx. / PE", true], ["Estado"]];
function Tabela({ children }: { children: ReactNode }) {
  return (
    <div className="tw"><table className="min-1000">
      <thead><tr>{CABECALHOS.map(([t, num]) => <th key={t} className={num ? "num" : undefined}>{t}</th>)}<th className="acth"><span className="sr">Ações</span></th></tr></thead>
      <tbody>{children}</tbody>
    </table></div>
  );
}

const pior = (db: Inventario, rs: LinhaStock[]): EstadoStock => (rs.some((r) => estadoStock(db, r) === "low") ? "low" : rs.some((r) => estadoStock(db, r) === "high") ? "high" : "ok");

export function StockPorProduto({ lista, abertos, alternar, a }: { lista: LinhaStock[]; abertos: Record<string, boolean>; alternar: (sku: string) => void; a: AcoesLinha }) {
  const { db, ir } = useCtxInv();
  return (
    <Tabela>
      {[...new Set(lista.map((r) => r.sku))].map((sku) => {
        const rs = lista.filter((r) => r.sku === sku), p = produto(db, sku);
        if (!p) return null;
        const q0 = rs.reduce((s, r) => s + r.qty, 0), res = rs.reduce((s, r) => s + reservadoEm(db, r.sku, r.wh), 0), w = pior(db, rs), o = !!abertos[sku];
        return (
          <Fragment key={sku}>
            <tr className="click" onClick={() => alternar(sku)}>
              <td><button type="button" className="link" style={{ textDecoration: "none", color: "inherit" }} aria-expanded={o} onClick={(e) => { e.stopPropagation(); alternar(sku); }}>{o ? <ChevronDown className="ic sm" aria-hidden="true" /> : <ChevronRight className="ic sm" aria-hidden="true" />} <b>{p.name}</b></button><br /><small className="muted mono">{sku} · EAN {p.ean}</small></td>
              <td>{rs.length} armazém(ns)</td><td>—</td>
              <td className="num"><b>{N(q0)}</b> {p.unit}</td><td className="num">{N(res)}</td><td className="num">{N(q0 - res)}</td><td className="num">—</td>
              <td><Selo tom={TOM_ESTADO[w]}>{ESTADOS_STOCK[w]}</Selo></td>
              <td className="act"><button type="button" className="btn btn-sm" onClick={(e) => { e.stopPropagation(); ir({ aba: "mov", f: { q: sku } }); }}>Histórico</button></td>
            </tr>
            {o ? rs.map((r) => <LinhaStockTr key={r.id} r={r} sub a={a} />) : null}
          </Fragment>
        );
      })}
    </Tabela>
  );
}

export function StockPorArmazem({ lista, a }: { lista: LinhaStock[]; a: AcoesLinha }) {
  const { db } = useCtxInv();
  const cat = (r: LinhaStock): string => produto(db, r.sku)?.cat ?? "";
  return (
    <Tabela>
      {[...new Set(lista.map(cat))].map((g) => (
        <Fragment key={g}><tr className="grp"><td colSpan={9}>{g}</td></tr>{lista.filter((r) => cat(r) === g).map((r) => <LinhaStockTr key={r.id} r={r} a={a} />)}</Fragment>
      ))}
    </Tabela>
  );
}

export function Transferencias({ lista, aoCancelar }: { lista: Transferencia[]; aoCancelar: (id: string) => void }) {
  const { db, agir, abrir } = useCtxInv();
  if (!lista.length) return <p className="muted" style={{ padding: "8px 2px" }}>Sem pedidos pendentes.</p>;
  return (
    <>
      <TabelaInv titulo="Pedidos de transferência pendentes" minimo={900} chave={(t) => t.id} linhas={lista}
        colunas={[
          { id: "p", titulo: "Produto", celula: (t) => <>{nomeProd(db, t.sku)}<br /><small className="muted mono">{t.id}{t.auto ? " · criado na receção" : ""}</small></> },
          { id: "o", titulo: "Origem → Destino", celula: (t) => `${nomeArm(db, t.from)} → ${nomeArm(db, t.to)}` },
          { id: "q", titulo: "Qtd", direita: true, celula: (t) => t.qty },
          { id: "a", titulo: "Disponível na origem", direita: true, celula: (t) => { const av = qtyAt(db, t.sku, t.from); return <>{av}{av < t.qty ? <><br /><Selo tom="bad">Insuficiente</Selo></> : null}</>; } },
          { id: "e", titulo: "EC ligada", celula: (t) => (t.ec ? (can("contracts.view") ? <button type="button" className="link" onClick={() => abrir({ t: "ec", id: t.ec as string })}>{t.ec}</button> : t.ec) : "—") },
        ]}
        acoes={(t) => {
          const ins = qtyAt(db, t.sku, t.from) < t.qty;
          return <>
            <button type="button" className="btn btn-sm btn-p" {...(ins ? { disabled: true, title: "Stock insuficiente na origem: registe uma entrada ou transfira de outro armazém primeiro" } : perm("inventory.manage"))}
              onClick={() => agir((d) => executarPedidoTransf(d, d.transfers.find((x) => x.id === t.id) as Transferencia), "Transferência registada (duas pernas no livro).")}>Transferir</button>
            <button type="button" className="btn btn-sm" {...perm("inventory.manage")} onClick={() => aoCancelar(t.id)}>Cancelar</button>
          </>;
        }} />
      <Fonte>stock_transfer_requests · rpc_register_stock_transfer · rpc_cancel_stock_transfer_request</Fonte>
    </>
  );
}
