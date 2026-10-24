// Armazém › Existências, igual ao mockup (scrStock): ações no cabeçalho, KPI, pedidos de transferência, filtros e a tabela por produto ou por armazém.
import { useState } from "react";
import { ArrowLeftRight, ChevronDown, ChevronRight, Plus, Upload } from "lucide-react";
import { eur, N, nomeProd, nomeArm } from "./base";
import { AcoesCab, Fonte } from "./cabInv";
import { contadores, ESTADOS_STOCK, type EstadoStock } from "./contadores";
import { useCtxInv } from "./ctxInv";
import { Confirmar } from "./DialogosInv";
import { filtrarStock } from "./filtros";
import { BotaoExportar, ImportarDlg } from "./ImportarInv";
import { Kpi } from "./kpiInv";
import { Check, Chip } from "./mockPecas";
import { MovimentoDialogo, type PreMov } from "./MovimentoDialogo";
import { opcoesArmazens } from "./opcoes";
import { can } from "./perfil";
import { Pesquisa, Vazio } from "./pecasInv";
import { AdicionarStockDlg, EditarStockDlg } from "./StockDialogos";
import { cancelarPedido, defStocks, eliminarLinha, perm } from "./stockAcoes";
import { StockPorArmazem, StockPorProduto, Transferencias, type AcoesLinha } from "./StockTabelas";

type Dlg = { t: "add" | "importar" } | { t: "mov"; pre: PreMov } | { t: "editar"; id: string } | { t: "eliminar"; id: string } | { t: "cancelar"; id: string };
const BARRA = (cor: string): React.CSSProperties => ({ display: "inline-block", width: 10, height: 6, background: cor, borderRadius: 2 });

function Sel({ rotulo, valor, aoMudar, todas, children }: { rotulo: string; valor: string; aoMudar: (v: string) => void; todas: string; children: React.ReactNode }) {
  return <select aria-label={rotulo} value={valor} onChange={(e) => aoMudar(e.target.value)}><option value="">{todas}</option>{children}</select>;
}

function Filtros() {
  const { db, filtros, setFiltros } = useCtxInv();
  const f = filtros.stock;
  const cats = [...new Set(db.products.filter((p) => !p.kit).map((p) => p.cat))];
  const subs = [...new Set(db.products.filter((p) => !p.kit && (!f.cat || p.cat === f.cat)).map((p) => p.sub))];
  return (
    <div className="card filters">
      <div className="frow">
        <Pesquisa valor={f.q} aoMudar={(q) => setFiltros("stock", { q })} rotulo="Pesquisar stock" dica="Nome, SKU ou EAN" />
        <Sel rotulo="Categoria" valor={f.cat} aoMudar={(cat) => setFiltros("stock", { cat, sub: "" })} todas="Todas as categorias">{cats.map((x) => <option key={x}>{x}</option>)}</Sel>
        <Sel rotulo="Subcategoria" valor={f.sub} aoMudar={(sub) => setFiltros("stock", { sub })} todas="Todas as subcategorias">{subs.map((x) => <option key={x}>{x}</option>)}</Sel>
        <Sel rotulo="Armazém" valor={f.wh} aoMudar={(wh) => setFiltros("stock", { wh })} todas="Todos os armazéns">{opcoesArmazens(db, true).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</Sel>
        <Sel rotulo="Estado" valor={f.state} aoMudar={(v) => setFiltros("stock", { state: v as EstadoStock | "" })} todas="Todos os estados">
          {(Object.keys(ESTADOS_STOCK) as EstadoStock[]).map((k) => <option key={k} value={k}>{ESTADOS_STOCK[k]}</option>)}
        </Sel>
        <Check rotulo="Ver eliminados" ativo={f.eliminadas} aoMudar={(v) => setFiltros("stock", { eliminadas: v })} />
      </div>
      <div className="chips" role="group" aria-label="Vista">
        <Chip ativo={f.vista === "product"} aoClicar={() => setFiltros("stock", { vista: "product" })}>Por produto <span className="new">Novo</span></Chip>
        <Chip ativo={f.vista === "wh"} aoClicar={() => setFiltros("stock", { vista: "wh" })}>Por armazém</Chip>
      </div>
    </div>
  );
}

function PainelTransferencias({ n, aoCancelar }: { n: number; aoCancelar: (id: string) => void }) {
  const { db, filtros, setFiltros } = useCtxInv();
  const aberto = filtros.stock.transferencias;
  const Seta = aberto ? ChevronDown : ChevronRight;
  return (
    <div className="card" style={{ marginBottom: 12, borderColor: "hsl(214 80% 55%/.5)" }}>
      <button type="button" className="btn btn-ghost" style={{ width: "100%", justifyContent: "flex-start", padding: "12px 14px", whiteSpace: "normal", textAlign: "left", flexWrap: "wrap" }} aria-expanded={aberto} onClick={() => setFiltros("stock", { transferencias: !aberto })}>
        <ArrowLeftRight className="ic" aria-hidden="true" /><b>{n} pedido(s) de transferência pendente(s)</b><span className="muted" style={{ marginLeft: "auto" }}>{aberto ? "Esconder" : "Ver"} <Seta className="ic sm" aria-hidden="true" /></span>
      </button>
      {aberto ? <div style={{ padding: "0 12px 12px" }}><Transferencias lista={db.transfers.filter((t) => t.state === "pending")} aoCancelar={aoCancelar} /></div> : null}
    </div>
  );
}

export function StockInv() {
  const { db, filtros, setFiltros, agir } = useCtxInv();
  const f = filtros.stock, c = contadores(db), lista = filtrarStock(db, f);
  const [dlg, setDlg] = useState<Dlg | null>(null);
  const [abertos, setAbertos] = useState<Record<string, boolean>>({});
  const acoes: AcoesLinha = { mov: (pre) => setDlg({ t: "mov", pre }), editar: (id) => setDlg({ t: "editar", id }), eliminar: (id) => setDlg({ t: "eliminar", id }) };
  const alvo = dlg && (dlg.t === "eliminar" || dlg.t === "editar") ? db.stocks.find((x) => x.id === dlg.id) : undefined;
  return (
    <>
      <AcoesCab>
        <BotaoExportar def={defStocks(db, () => lista)} />
        <button type="button" className="btn" {...perm("inventory.manage")} onClick={() => setDlg({ t: "importar" })}><Upload className="ic" aria-hidden="true" />Importar</button>
        <button type="button" className="btn" {...perm("inventory.manage")} onClick={() => setDlg({ t: "mov", pre: {} })}><ArrowLeftRight className="ic" aria-hidden="true" />Registar movimento</button>
        <button type="button" className="btn btn-p" {...perm("inventory.manage")} onClick={() => setDlg({ t: "add" })}><Plus className="ic" aria-hidden="true" />Adicionar stock</button>
      </AcoesCab>
      <div className="kpis">
        <Kpi rotulo="Valor em stock" valor={can("purchase_orders.view_prices") ? eur(c.stockValue) : "—"} nota="custo médio ponderado" fonte="stocks × products.average_cost" />
        <Kpi tom="bad" rotulo="Abaixo do ponto de encomenda" valor={String(c.low)} nota="stock livre < ponto de encomenda" fonte="stocks.reorder_point" aoClicar={() => setFiltros("stock", { state: "low" })} />
        <Kpi tom="warn" rotulo="Em excesso" valor={String(c.excess)} nota="acima do máximo" fonte="stocks.max_quantity" aoClicar={() => setFiltros("stock", { state: "high" })} />
        <Kpi tom="info" rotulo="Unidades reservadas" valor={N(c.reservedUnits)} nota="para Encomendas Clientes" fonte="fn_client_order_line_reservations" />
      </div>
      {c.transfers ? <PainelTransferencias n={c.transfers} aoCancelar={(id) => setDlg({ t: "cancelar", id })} /> : null}
      <Filtros />
      {lista.length === 0 ? <Vazio titulo="Sem stock com estes filtros" /> : f.vista === "product"
        ? <StockPorProduto lista={lista} abertos={abertos} alternar={(sku) => setAbertos((o) => ({ ...o, [sku]: !o[sku] }))} a={acoes} />
        : <StockPorArmazem lista={lista} a={acoes} />}
      <div className="tbl-foot"><span>{lista.length} linha(s) · <span style={BARRA("var(--i-warn)")} /> reservado · <span style={BARRA("var(--i-ok)")} /> livre (escala: máximo)</span><Fonte>stocks · products · rpc_get_product_stock_reservations · get_effective_stock</Fonte></div>
      {dlg?.t === "add" && <AdicionarStockDlg aoFechar={() => setDlg(null)} />}
      {dlg?.t === "importar" && <ImportarDlg def={defStocks(db, () => lista)} aoFechar={() => setDlg(null)} />}
      {dlg?.t === "mov" && <MovimentoDialogo aberto aoFechar={() => setDlg(null)} pre={dlg.pre} />}
      {dlg?.t === "editar" && alvo && <EditarStockDlg id={alvo.id} aoFechar={() => setDlg(null)} aoAjuste={() => setDlg({ t: "mov", pre: { type: "adjust", sku: alvo.sku, wh: alvo.wh } })} />}
      {dlg?.t === "eliminar" && alvo && (
        <Confirmar aberto aoFechar={() => setDlg(null)} titulo="Eliminar linha de stock" ok="Eliminar" perigo
          texto={<><p>{nomeProd(db, alvo.sku)} em {nomeArm(db, alvo.wh)}.</p><p className="muted">O stock só muda por movimentos: a linha só pode ser eliminada com quantidade 0.</p></>}
          aoConfirmar={() => agir((d) => eliminarLinha(d, alvo.id))} />
      )}
      {dlg?.t === "cancelar" && (
        <Confirmar aberto aoFechar={() => setDlg(null)} titulo={`Cancelar pedido ${dlg.id}`} ok="Cancelar pedido" perigo motivo="Motivo" texto={<p>O pedido fica cancelado; a EC continua a precisar do material.</p>}
          aoConfirmar={(m) => agir((d) => cancelarPedido(d, dlg.id, m))} />
      )}
    </>
  );
}
