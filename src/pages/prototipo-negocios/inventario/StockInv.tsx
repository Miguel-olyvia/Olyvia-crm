// Armazém › Existências: o stock por produto ou por armazém, com KPI, pedidos de transferência, filtros e ordenação; a linha abre o detalhe do produto.
// Um só botão primário: "Adicionar stock".
import { useState } from "react";
import { Plus } from "lucide-react";
import { Kpi } from "./kpiInv";
import { ExportarInv } from "./ExportarInv";
import { CHIP, Escolher, Interruptor } from "../FiltrosPopover";
import { cancelarPedidoTransf } from "./cadastros";
import { contadores, estadoStock, ESTADOS_STOCK, type EstadoStock } from "./contadores";
import { eur, N, nomeArm, nomeProd, produto } from "./base";
import { useCtxInv } from "./ctxInv";
import { Confirmar, Dlg } from "./DialogosInv";
import { executarPedidoTransf, livreEm, reservadoEm } from "./ec";
import { filtrarStock } from "./filtros";
import { MovimentoDialogo } from "./MovimentoDialogo";
import { opcoesArmazens, opcoesProdutos } from "./opcoes";
import { Lista, Nota, Pesquisa, Pri, Sec, Selo, Texto, Vazio } from "./pecasInv";
import { adicionarStock, qtyAt } from "./stock";
import { TabelaInv, type Coluna } from "./TabelaInv";
import type { Inventario, LinhaStock, Tom, Transferencia } from "./tipos";

const TOM: Record<string, Tom> = { low: "bad", ok: "ok", high: "warn" };
const VAZIO = { sku: "", wh: "", loc: "", min: "0", max: "0", rop: "0", qty: "0", cost: "", erro: "" };

function AdicionarDialogo({ aoFechar }: { aoFechar: () => void }) {
  const { db, agir, abrir } = useCtxInv();
  const [f, setF] = useState({ ...VAZIO, wh: db.settings.defaultWh });
  const m = (p: Partial<typeof f>): void => setF((x) => ({ ...x, ...p, erro: "" }));
  const gravar = (): void => {
    if (!f.sku) { setF((x) => ({ ...x, erro: "Escolha um produto válido." })); return; }
    const r = agir((d) => adicionarStock(d, { sku: f.sku, wh: f.wh, loc: f.loc, min: Number(f.min) || 0, max: Number(f.max) || 0, rop: Number(f.rop) || 0, qty: Number(f.qty), cost: f.cost === "" ? null : Number(f.cost) }), "Stock adicionado.");
    if (!r.ok) { setF((x) => ({ ...x, erro: r.erro })); return; }
    aoFechar();
    abrir({ t: "stock", sku: f.sku });
  };
  return (
    <Dlg aberto aoFechar={aoFechar} titulo="Adicionar stock" largo rodape={<><Sec onClick={aoFechar}>Cancelar</Sec><Pri onClick={gravar}>Adicionar</Pri></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Lista rotulo="Produto" valor={f.sku} aoMudar={(v) => m({ sku: v })} opcoes={[["", "Escolher produto…"], ...opcoesProdutos(db, false)]} obrigatorio />
        <Lista rotulo="Armazém" valor={f.wh} aoMudar={(v) => m({ wh: v })} opcoes={opcoesArmazens(db)} />
        <Texto rotulo="Localização" valor={f.loc} aoMudar={(v) => m({ loc: v })} />
        <Texto rotulo="Mínimo" tipo="number" valor={f.min} aoMudar={(v) => m({ min: v })} atributos={{ min: 0, step: 1 }} />
        <Texto rotulo="Máximo" tipo="number" valor={f.max} aoMudar={(v) => m({ max: v })} atributos={{ min: 0, step: 1 }} />
        <Texto rotulo="Ponto de encomenda" tipo="number" valor={f.rop} aoMudar={(v) => m({ rop: v })} atributos={{ min: 0, step: 1 }} />
        <Texto rotulo="Quantidade inicial" tipo="number" valor={f.qty} aoMudar={(v) => m({ qty: v })} atributos={{ min: 0, step: 1 }} ajuda="Entra por um movimento de Entrada (fica no livro)." />
        <Texto rotulo="Custo unitário" tipo="number" valor={f.cost} aoMudar={(v) => m({ cost: v })} atributos={{ min: 0, step: 0.01 }} ajuda="Atualiza o custo médio ponderado." />
      </div>
      {f.erro && <Nota tom="bad" alerta>{f.erro}</Nota>}
    </Dlg>
  );
}

function Transferencias({ lista }: { lista: Transferencia[] }) {
  const { db, agir, abrir } = useCtxInv();
  const [cancelar, setCancelar] = useState<string | null>(null);
  if (!lista.length) return <p className="text-[15px] text-muted-foreground">Sem pedidos pendentes.</p>;
  return (
    <>
      <TabelaInv rolar titulo="Pedidos de transferência pendentes" chave={(t) => t.id} linhas={lista}
        colunas={[
          { id: "p", titulo: "Produto", celula: (t) => <>{nomeProd(db, t.sku)} · {t.id}{t.auto ? " · criado na receção" : ""}</> },
          { id: "o", titulo: "Origem → Destino", celula: (t) => `${nomeArm(db, t.from)} → ${nomeArm(db, t.to)}` }, { id: "q", titulo: "Qtd", direita: true, celula: (t) => t.qty },
          { id: "a", titulo: "Disponível na origem", direita: true, celula: (t) => { const av = qtyAt(db, t.sku, t.from); return <>{av}{av < t.qty ? " · insuficiente" : ""}</>; } },
          { id: "e", titulo: "EC ligada", celula: (t) => (t.ec ? <button type="button" className="min-h-11 cursor-pointer text-primary underline-offset-4 hover:underline" onClick={() => abrir({ t: "ec", id: t.ec as string })}>{t.ec}</button> : "—") },
        ]}
        acoes={(t) => <><Sec disabled={qtyAt(db, t.sku, t.from) < t.qty} title={qtyAt(db, t.sku, t.from) < t.qty ? "Stock insuficiente na origem" : undefined} onClick={() => agir((d) => executarPedidoTransf(d, d.transfers.find((x) => x.id === t.id) as Transferencia), "Transferência registada (duas pernas no livro).")}>Transferir</Sec><Sec onClick={() => setCancelar(t.id)}>Cancelar</Sec></>} />
      {cancelar && <Confirmar aberto aoFechar={() => setCancelar(null)} titulo={`Cancelar pedido ${cancelar}`} ok="Cancelar pedido" perigo motivo="Motivo" texto={<p>O pedido fica cancelado; a EC continua a precisar do material.</p>} aoConfirmar={(m) => agir((d) => cancelarPedidoTransf(d, cancelar, m), "Pedido cancelado.")} />}
    </>
  );
}

function Filtros() {
  const { db, filtros, setFiltros } = useCtxInv();
  const f = filtros.stock;
  const cats = [...new Set(db.products.filter((p) => !p.kit).map((p) => p.cat))];
  const subs = [...new Set(db.products.filter((p) => !p.kit && (!f.cat || p.cat === f.cat)).map((p) => p.sub))];
  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <Pesquisa valor={f.q} aoMudar={(q) => setFiltros("stock", { q })} rotulo="Pesquisar stock por nome, SKU ou EAN" dica="Nome, SKU ou EAN" />
        <div className="w-48"><Escolher rotulo="Categoria" valor={f.cat} aoMudar={(cat) => setFiltros("stock", { cat, sub: "" })} todas="Todas as categorias" opcoes={cats} /></div>
        <div className="w-48"><Escolher rotulo="Subcategoria" valor={f.sub} aoMudar={(sub) => setFiltros("stock", { sub })} todas="Todas as subcategorias" opcoes={subs} /></div>
        <div className="w-56"><Escolher rotulo="Armazém" valor={f.wh} aoMudar={(wh) => setFiltros("stock", { wh })} todas="Todos os armazéns" opcoes={opcoesArmazens(db, true).map(([valor, nome]) => ({ valor, nome }))} /></div>
        <div className="w-44"><Escolher rotulo="Estado" valor={f.state} aoMudar={(v) => setFiltros("stock", { state: v as EstadoStock | "" })} todas="Todos os estados" opcoes={(Object.keys(ESTADOS_STOCK) as EstadoStock[]).map((k) => ({ valor: k, nome: ESTADOS_STOCK[k] }))} /></div>
        <Interruptor nome="Ver eliminados" ativo={f.eliminadas} aoMudar={() => setFiltros("stock", { eliminadas: !f.eliminadas })} />
      </div>
      <div role="group" aria-label="Vista" className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={f.vista === "product"} onClick={() => setFiltros("stock", { vista: "product" })} className={CHIP(f.vista === "product")}>Por produto</button>
        <button type="button" aria-pressed={f.vista === "wh"} onClick={() => setFiltros("stock", { vista: "wh" })} className={CHIP(f.vista === "wh")}>Por armazém</button>
      </div>
    </>
  );
}

const pior = (db: Inventario, rs: LinhaStock[]): EstadoStock => (rs.some((r) => estadoStock(db, r) === "low") ? "low" : rs.some((r) => estadoStock(db, r) === "high") ? "high" : "ok");

function colunasProduto(db: Inventario): Coluna<{ sku: string; rs: LinhaStock[] }>[] {
  return [

    { id: "p", titulo: "Produto", celula: (g) => <>{nomeProd(db, g.sku)} · {g.sku}</>, valor: (g) => nomeProd(db, g.sku) },
    { id: "a", titulo: "Armazéns", celula: (g) => `${g.rs.length} armazém(ns)` },
    { id: "q", titulo: "Quantidade", direita: true, celula: (g) => `${N(g.rs.reduce((a, r) => a + r.qty, 0))} ${produto(db, g.sku)?.unit}`, valor: (g) => g.rs.reduce((a, r) => a + r.qty, 0) },
    { id: "r", titulo: "Reservado", direita: true, celula: (g) => N(g.rs.reduce((a, r) => a + reservadoEm(db, r.sku, r.wh), 0)) },
    { id: "l", titulo: "Livre", direita: true, celula: (g) => N(g.rs.reduce((a, r) => a + livreEm(db, r.sku, r.wh), 0)), valor: (g) => g.rs.reduce((a, r) => a + livreEm(db, r.sku, r.wh), 0) },
    { id: "s", titulo: "Estado", celula: (g) => <Selo tom={TOM[pior(db, g.rs)]}>{ESTADOS_STOCK[pior(db, g.rs)]}</Selo> },
  ];
}

function colunasArmazem(db: Inventario): Coluna<LinhaStock>[] {
  return [

    { id: "p", titulo: "Produto", celula: (r) => <>{nomeProd(db, r.sku)} · {r.sku}</>, valor: (r) => nomeProd(db, r.sku) },
    { id: "w", titulo: "Armazém", celula: (r) => nomeArm(db, r.wh), valor: (r) => nomeArm(db, r.wh) }, { id: "loc", titulo: "Localização", celula: (r) => r.loc || "—" },
    { id: "q", titulo: "Quantidade", direita: true, celula: (r) => N(r.qty), valor: (r) => r.qty }, { id: "r", titulo: "Reservado", direita: true, celula: (r) => N(reservadoEm(db, r.sku, r.wh)) },
    { id: "l", titulo: "Livre", direita: true, celula: (r) => N(livreEm(db, r.sku, r.wh)), valor: (r) => livreEm(db, r.sku, r.wh) },
    { id: "m", titulo: "Mín. / Máx. / PE", direita: true, celula: (r) => `${r.min} / ${r.max} / ${r.rop}` },
    { id: "s", titulo: "Estado", celula: (r) => (r.deleted ? <Selo>Eliminado</Selo> : <Selo tom={TOM[estadoStock(db, r)]}>{ESTADOS_STOCK[estadoStock(db, r)]}</Selo>) },
  ];
}

export function StockInv() {
  const { db, filtros, setFiltros, abrir, ir } = useCtxInv();
  const f = filtros.stock, c = contadores(db);
  const lista = filtrarStock(db, f);
  const [dlg, setDlg] = useState<"add" | "mov" | null>(null);
  const pend = db.transfers.filter((t) => t.state === "pending");
  const porProduto = [...new Set(lista.map((r) => r.sku))].map((sku) => ({ sku, rs: lista.filter((r) => r.sku === sku) }));
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-end gap-3">
        <div className="flex flex-wrap gap-2"><ExportarInv nome="existencias" rotulo="linhas de stock" cabecalho={["SKU", "Produto", "Armazém", "Localização", "Quantidade", "Reservado", "Livre", "Mínimo", "Máximo", "Ponto de encomenda"]} linhas={() => lista.map((r) => [r.sku, nomeProd(db, r.sku), nomeArm(db, r.wh), r.loc, r.qty, reservadoEm(db, r.sku, r.wh), livreEm(db, r.sku, r.wh), r.min, r.max, r.rop])} /><Sec onClick={() => setDlg("mov")}>Registar movimento</Sec><Pri onClick={() => setDlg("add")}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />Adicionar stock</Pri></div>
      </div>
      <div className="kpis">
        <Kpi rotulo="Valor em stock" valor={eur(c.stockValue)} nota="custo médio ponderado" />
        <Kpi tom="bad" rotulo="Abaixo do ponto de encomenda" valor={String(c.low)} nota="stock livre < ponto de encomenda" aoClicar={() => setFiltros("stock", { state: "low" })} acaoRotulo="Filtrar por baixo" />
        <Kpi tom="warn" rotulo="Em excesso" valor={String(c.excess)} nota="acima do máximo" aoClicar={() => setFiltros("stock", { state: "high" })} acaoRotulo="Filtrar por excesso" />
        <Kpi tom="info" rotulo="Unidades reservadas" valor={N(c.reservedUnits)} nota="para Encomendas Clientes" />
      </div>
      {(c.transfers > 0 || f.transferencias) && (
        <section aria-labelledby="st-tr" className="grid gap-2 rounded-xl border border-border p-3">
          <h2 id="st-tr" className="text-base font-semibold"><button type="button" aria-expanded={f.transferencias} onClick={() => setFiltros("stock", { transferencias: !f.transferencias })} className="min-h-11 cursor-pointer text-left">{c.transfers} pedido(s) de transferência pendente(s) · {f.transferencias ? "Esconder" : "Ver"}</button></h2>
          {f.transferencias && <Transferencias lista={pend} />}
        </section>
      )}
      <Filtros />
      {lista.length === 0 ? <Vazio titulo="Sem stock com estes filtros"><Sec onClick={() => ir({ aba: "stock", f: {} })}>Limpar filtros</Sec></Vazio> : f.vista === "product"
        ? <TabelaInv titulo="Stock por produto" colunas={colunasProduto(db)} linhas={porProduto} chave={(g) => g.sku} abrir={(g) => abrir({ t: "stock", sku: g.sku })} ordemInicial={{ col: "p", dir: "asc" }} rotuloAbrir={(g) => `Abrir o stock de ${nomeProd(db, g.sku)}`} />
        : <TabelaInv titulo="Stock por armazém" colunas={colunasArmazem(db)} linhas={lista} chave={(r) => r.id} abrir={(r) => abrir({ t: "stock", sku: r.sku })} ordemInicial={{ col: "w", dir: "asc" }} rotuloAbrir={(r) => `Abrir o stock de ${nomeProd(db, r.sku)} em ${nomeArm(db, r.wh)}`} />}
      <p className="text-[15px] text-muted-foreground" aria-live="polite">{lista.length} linha{lista.length === 1 ? "" : "s"}</p>
      {dlg === "add" && <AdicionarDialogo aoFechar={() => setDlg(null)} />}
      {dlg === "mov" && <MovimentoDialogo aberto aoFechar={() => setDlg(null)} />}
    </div>
  );
}
