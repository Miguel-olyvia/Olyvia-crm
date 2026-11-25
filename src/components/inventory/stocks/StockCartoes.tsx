// Existências dentro do novo Inventário (InventarioEmbebido = true): a apresentação do artefacto aprovado
// (vault/inventario-redesenho-completo.html, V.exi — .bar, .chips, .sect, .grid, .card, .big, .lim, .pill).
//
// Só apresentação: os dados, o estado, as consultas, os handlers e as permissões são os do Stocks.tsx, que os passa por
// props. Fora da moldura nada disto é usado (o Stocks.tsx fica exatamente como era).
//
//   <StockBarraEmbebida …/>  — pesquisa + Filtros (vista, armazém, categoria, eliminados) + Cartões/Tabela + Exportar,
//                              Importar, Registar movimento, "+ Adicionar stock"; chips com contagem; linha de resumo.
//   <StockCartoes …/>        — a grelha de cartões (um por produto na vista "Por produto", um por linha produto+armazém
//                              na vista "Por armazém", com o .sect da categoria como a tabela).
import { useId, type ReactNode } from "react";
import { Download, Filter, LayoutGrid, Plus, Search, Table2, Upload, ArrowLeftRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PermissionGate } from "@/components/PermissionGate";
import CategorySubcategoryFilter from "@/components/inventory/CategorySubcategoryFilter";
import { BlockedButton } from "@/components/inventory/ui/DisabledReason";
import { RowActions, type RowActionEntry, type RowPrimaryAction } from "@/components/inventory/ui/RowActions";
import { toneBadge, toneText, type InventoryTone } from "@/components/inventory/ui/tones";

export type EstadoStock = "low" | "overstock" | "normal";
export type VistaStock = "product" | "warehouse";
export type ModoExistencias = "cartoes" | "tabela";
export type FiltroEstado = "all" | EstadoStock;

/** Os campos de uma linha de stock que os cartões usam (o Stock do Stocks.tsx tem-nos todos). */
export interface LinhaStock {
  id: string;
  product_id: string;
  warehouse_id: string;
  quantity: number;
  minimum_quantity: number;
  maximum_quantity: number;
  reorder_point: number;
  location: string | null;
  deleted_at: string | null;
  products?: { name: string; sku?: string | null; barcode?: string | null };
  warehouses?: { name: string };
}

/** O ProductGroup do Stocks.tsx (vista "Por produto"). */
export interface GrupoProdutoStock<L extends LinhaStock> {
  productId: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  rows: L[];
  quantity: number;
  maxSum: number;
  status: EstadoStock;
}

export interface ReservaProduto {
  qty_reserved: number;
  qty_missing: number;
  orders_count: number;
}

export interface AcoesCartao {
  primary: RowPrimaryAction | null;
  items: RowActionEntry[];
  menuLabel: string;
}

const toNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Junta " · <armazém>" ao texto das ações (no cartão de um produto com vários armazéns). */
export function comSufixo(items: RowActionEntry[], sufixo: string): RowActionEntry[] {
  if (!sufixo) return items;
  return items.map((it) => (it === "separator" ? it : { ...it, label: `${it.label}${sufixo}` }));
}

/* ------------------------------------------------------------------------------------------------ peças pequenas */

/** O .pill do artefacto (bolinha + texto), nos tons do tema. */
function Pilula({ tom, children }: { tom: InventoryTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-[26px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12.5px] font-semibold",
        toneBadge[tom],
      )}
    >
      <span className="h-[7px] w-[7px] rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  );
}

/** O .chip do artefacto: pressionado fica invertido (fundo = texto). */
function Chip({ pressionado, contagem, dica, onClick, children }: {
  pressionado: boolean;
  contagem: number | string | null;
  dica?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressionado}
      title={dica}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13.5px] font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        pressionado ? "border-foreground bg-foreground text-background" : "border-border bg-card text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
      {contagem != null ? " " : null}
      {contagem != null ? <b className={cn("tabular-nums", pressionado ? "text-background" : "text-foreground")}>{contagem}</b> : null}
    </button>
  );
}

/* ------------------------------------------------------------------------------------------------ a barra */

interface StockBarraEmbebidaProps {
  pesquisa: string;
  aoPesquisar: (v: string) => void;
  /* Filtros (o cartão de filtros da página clássica, agora no botão "Filtros") */
  vista: VistaStock;
  aoMudarVista: (v: VistaStock) => void;
  armazem: string;
  armazens: { id: string; name: string }[];
  aoMudarArmazem: (v: string) => void;
  categoria: string;
  subcategoria: string;
  aoMudarCategoria: (v: { categoryId: string; subcategoryId: string }) => void;
  mostrarEliminados: boolean;
  aoMudarEliminados: (v: boolean) => void;
  /** Há filtros ativos (mostra "Limpar filtros", como na página clássica). */
  filtrosAtivos: boolean;
  aoLimpar: () => void;
  /* Estado (chips) */
  estado: FiltroEstado;
  aoMudarEstado: (v: FiltroEstado) => void;
  contagens: { all: number | string | null; low: number | null; normal: number | null; overstock: number | null };
  /* Linha de resumo (null = sem o valor, ex.: sem permissão de custos) */
  valorEmStock: string | null;
  unidadesReservadas: string | null;
  /* Cartões / Tabela */
  modo: ModoExistencias;
  aoMudarModo: (m: ModoExistencias) => void;
  /* Ações */
  aoExportar: () => void;
  aoImportar: () => void;
  aoMovimento: () => void;
  bloqueioMovimento: string | null;
  aoAdicionar: () => void;
  bloqueioAdicionar: string | null;
}

export function StockBarraEmbebida(p: StockBarraEmbebidaProps) {
  const idEliminados = useId();
  // O que o Stocks.tsx conta em filtrosAtivos e repõe em aoLimpar (categoria e subcategoria são um só filtro).
  const nFiltros = (p.vista !== "product" ? 1 : 0) + (p.armazem !== "all" ? 1 : 0)
    + (p.categoria !== "all" || p.subcategoria !== "all" ? 1 : 0) + (p.mostrarEliminados ? 1 : 0);
  const resumo = [
    p.valorEmStock != null ? (
      <span key="v">
        Valor em stock{" "}
        <span className="tabular-nums normal-case tracking-normal text-foreground">{p.valorEmStock}</span>
      </span>
    ) : null,
    p.unidadesReservadas != null ? (
      <span key="r">
        <span className="tabular-nums tracking-normal text-foreground">{p.unidadesReservadas}</span> unidades reservadas para ECs
      </span>
    ) : null,
  ].filter(Boolean);

  return (
    <div className="space-y-3" data-testid="existencias-barra">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-h-11 flex-[1_1_240px] items-center gap-2 rounded-[14px] border border-border bg-card px-3 text-muted-foreground focus-within:ring-2 focus-within:ring-primary">
          <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
          <Input
            type="search"
            placeholder="Nome, SKU ou EAN"
            aria-label="Pesquisar stock por nome, SKU ou EAN"
            value={p.pesquisa}
            onChange={(e) => p.aoPesquisar(e.target.value)}
            className="h-10 min-w-0 flex-1 border-0 bg-transparent px-0 text-foreground shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </label>

        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" className="min-h-11 rounded-[14px] font-semibold">
              <Filter className="mr-2 h-4 w-4" aria-hidden="true" /> Filtros
              {nFiltros > 0 ? <span className="ml-1.5 rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{nFiltros}</span> : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[min(22rem,calc(100vw-1.5rem))] space-y-4">
            <fieldset className="space-y-1.5">
              <legend className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Vista</legend>
              <div role="group" aria-label="Vista" className="flex gap-1.5">
                {([["product", "Por produto"], ["warehouse", "Por armazém"]] as const).map(([v, l]) => (
                  <Chip key={v} pressionado={p.vista === v} contagem={null} onClick={() => p.aoMudarVista(v)}>{l}</Chip>
                ))}
              </div>
            </fieldset>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Armazém</Label>
              <Select value={p.armazem} onValueChange={p.aoMudarArmazem}>
                <SelectTrigger aria-label="Armazém">
                  <SelectValue placeholder="Armazém" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os armazéns</SelectItem>
                  {p.armazens.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                  {p.armazem !== "all" && !p.armazens.some((w) => w.id === p.armazem) ? (
                    <SelectItem value={p.armazem}>Armazém selecionado</SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <span className="block text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">Categoria</span>
              <CategorySubcategoryFilter
                categoryId={p.categoria}
                subcategoryId={p.subcategoria}
                onChange={p.aoMudarCategoria}
                includeUncategorized
              />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id={idEliminados} checked={p.mostrarEliminados} onCheckedChange={(v) => p.aoMudarEliminados(v === true)} />
              <Label htmlFor={idEliminados} className="cursor-pointer text-sm font-normal">Ver eliminados</Label>
            </div>
            {p.filtrosAtivos ? (
              <Button type="button" variant="ghost" size="sm" onClick={p.aoLimpar}>Limpar filtros</Button>
            ) : null}
          </PopoverContent>
        </Popover>

        <div role="group" aria-label="Mostrar como" className="inline-flex min-h-11 items-center rounded-[14px] border border-border bg-card p-1">
          {([["cartoes", "Cartões", LayoutGrid], ["tabela", "Tabela", Table2]] as const).map(([m, l, Icone]) => (
            <button
              key={m}
              type="button"
              aria-pressed={p.modo === m}
              onClick={() => p.aoMudarModo(m)}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-[10px] px-3 text-[13.5px] font-semibold transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                p.modo === m ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted",
              )}
            >
              <Icone className="h-4 w-4" aria-hidden="true" /> {l}
            </button>
          ))}
        </div>

        <PermissionGate permission="inventory.export">
          <Button type="button" variant="ghost" className="min-h-11 rounded-[14px] font-semibold" onClick={p.aoExportar}>
            <Download className="mr-2 h-4 w-4" aria-hidden="true" /> Exportar
          </Button>
        </PermissionGate>
        <PermissionGate permission="inventory.import">
          <Button type="button" variant="ghost" className="min-h-11 rounded-[14px] font-semibold" onClick={p.aoImportar}>
            <Upload className="mr-2 h-4 w-4" aria-hidden="true" /> Importar
          </Button>
        </PermissionGate>
        <BlockedButton
          type="button"
          variant="ghost"
          className="min-h-11 rounded-[14px] font-semibold"
          blockedReason={p.bloqueioMovimento}
          onClick={p.aoMovimento}
        >
          <ArrowLeftRight className="mr-2 h-4 w-4" aria-hidden="true" /> Registar movimento
        </BlockedButton>
        <BlockedButton
          type="button"
          className="min-h-11 rounded-[14px] font-semibold shadow-[0_6px_18px_-6px_hsl(var(--primary)/0.55)]"
          blockedReason={p.bloqueioAdicionar}
          onClick={p.aoAdicionar}
        >
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" /> Adicionar stock
        </BlockedButton>
      </div>

      <div role="group" aria-label="Estado do stock" className="flex flex-wrap gap-1.5">
        <Chip pressionado={p.estado === "all"} contagem={p.contagens.all} onClick={() => p.aoMudarEstado("all")}>Todos</Chip>
        <Chip
          pressionado={p.estado === "low"}
          contagem={p.contagens.low}
          dica="Abaixo do ponto de encomenda (quantidade ≤ ponto de encomenda)"
          onClick={() => p.aoMudarEstado(p.estado === "low" ? "all" : "low")}
        >
          Stock Baixo
        </Chip>
        <Chip pressionado={p.estado === "normal"} contagem={p.contagens.normal} onClick={() => p.aoMudarEstado(p.estado === "normal" ? "all" : "normal")}>
          Normal
        </Chip>
        <Chip
          pressionado={p.estado === "overstock"}
          contagem={p.contagens.overstock}
          dica="Em excesso (quantidade ≥ máximo)"
          onClick={() => p.aoMudarEstado(p.estado === "overstock" ? "all" : "overstock")}
        >
          Excesso de Stock
        </Chip>
      </div>

      {resumo.length > 0 ? (
        <p className="mx-0.5 mt-[18px] flex flex-wrap items-center gap-x-1.5 text-[12.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground" data-testid="existencias-resumo">
          {resumo.map((r, i) => (
            <span key={i} className="inline-flex items-center gap-1.5">
              {i > 0 ? <span aria-hidden="true">·</span> : null}
              {r}
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ os cartões */

interface DadosCartao<L extends LinhaStock> {
  chave: string;
  productId: string;
  nome: string;
  sku: string | null;
  barcode: string | null;
  linhas: L[];
  quantidade: number;
  /** "em <armazém> · <localização>" ou "em N armazéns". */
  onde: string;
  min: number;
  pe: number;
  max: number;
  carrinha: boolean;
  /** Vários armazéns: os limites são a soma das linhas. */
  somados: boolean;
  /** Vários armazéns e algum é carrinha: a soma não tem sentido (a tabela mostra "—" na linha do produto). */
  comCarrinha: boolean;
  estado: EstadoStock;
  eliminado: boolean;
}

interface StockCartoesProps<L extends LinhaStock> {
  vista: VistaStock;
  grupos: GrupoProdutoStock<L>[];
  porCategoria: [string, L[]][];
  reservas: Record<string, ReservaProduto>;
  stockOrg: Record<string, { total: number; warehouses: number }>;
  mostrarEliminados: boolean;
  /** Filtro de estado ativo: na vista por produto o total é só das linhas filtradas (como diz a tabela). */
  filtroEstadoAtivo: boolean;
  estadoDe: (l: L) => EstadoStock;
  eCarrinha: (warehouseId: string | null | undefined) => boolean;
  formatQty: (n: number) => string;
  acoes: (linhas: L[], productId: string) => AcoesCartao;
  aoAbrir: (productId: string) => void;
  /** Produto aberto no painel (realça o cartão). */
  selecionado?: string | null;
}

function ondeDaLinha(l: LinhaStock): string {
  return [l.warehouses?.name ?? "—", l.location || null].filter(Boolean).join(" · ");
}

function cartaoDaLinha<L extends LinhaStock>(l: L, estado: EstadoStock, carrinha: boolean): DadosCartao<L> {
  return {
    chave: l.id,
    productId: l.product_id,
    nome: l.products?.name ?? "—",
    sku: l.products?.sku ?? null,
    barcode: l.products?.barcode ?? null,
    linhas: [l],
    quantidade: toNum(l.quantity),
    onde: ondeDaLinha(l),
    min: toNum(l.minimum_quantity),
    pe: toNum(l.reorder_point),
    max: toNum(l.maximum_quantity),
    carrinha,
    somados: false,
    comCarrinha: false,
    estado,
    eliminado: !!l.deleted_at,
  };
}

function cartaoDoGrupo<L extends LinhaStock>(g: GrupoProdutoStock<L>, eCarrinha: (id: string) => boolean): DadosCartao<L> {
  const uma = g.rows.length === 1 ? g.rows[0] : null;
  return {
    chave: g.productId,
    productId: g.productId,
    nome: g.name,
    sku: g.sku,
    barcode: g.barcode,
    linhas: g.rows,
    quantidade: g.quantity,
    onde: uma ? ondeDaLinha(uma) : `${g.rows.length} armazéns`,
    // Vários armazéns: os limites somados (o Máx. é o maxSum da tabela).
    min: g.rows.reduce((a, r) => a + toNum(r.minimum_quantity), 0),
    pe: g.rows.reduce((a, r) => a + toNum(r.reorder_point), 0),
    max: g.maxSum,
    carrinha: !!uma && eCarrinha(uma.warehouse_id),
    somados: !uma,
    comCarrinha: !uma && g.rows.some((r) => eCarrinha(r.warehouse_id)),
    estado: g.status,
    eliminado: g.rows.every((r) => !!r.deleted_at),
  };
}

function Limites({ c, formatQty }: { c: DadosCartao<LinhaStock>; formatQty: (n: number) => string }) {
  if (c.carrinha) {
    return <span className="text-[13px] text-muted-foreground">Mín. carrinha {formatQty(c.min)} · sem ponto de encomenda</span>;
  }
  if (c.comCarrinha) {
    return <span className="text-[13px] text-muted-foreground">Mín. / PE / Máx.: — (inclui carrinha; ver cada armazém)</span>;
  }
  if (c.min === 0 && c.pe === 0 && c.max === 0) {
    return <span className="text-[13px] text-muted-foreground">Mín. / Máx. / PE: — / — / —</span>;
  }
  const escala = Math.max(c.max, c.quantidade, c.pe, 1);
  const largura = Math.min(100, Math.max(0, (c.quantidade / escala) * 100));
  const cor = c.estado === "low" ? "bg-warning" : c.estado === "overstock" ? "bg-info" : "bg-success";
  return (
    <>
      <span
        role="img"
        aria-label={`${formatQty(c.quantidade)} de ${c.max ? formatQty(c.max) : "sem máximo"}; ponto de encomenda ${formatQty(c.pe)}`}
        data-testid="barra-limites"
        className="relative block h-2 rounded-full bg-muted"
      >
        <i className={cn("absolute inset-y-0 left-0 rounded-full", cor)} style={{ width: `${largura}%` }} data-testid="barra-limites-qtd" />
        {c.pe > 0 ? (
          <em
            className="absolute -bottom-1 -top-1 w-0.5 rounded-sm bg-foreground opacity-50"
            style={{ left: `${Math.min(100, (c.pe / escala) * 100)}%` }}
            data-testid="barra-limites-pe"
          />
        ) : null}
      </span>
      <span className="text-[13px] text-muted-foreground tabular-nums">
        Mín. {formatQty(c.min)} · PE {formatQty(c.pe)} · Máx. {formatQty(c.max)}{c.somados ? " (somados)" : ""}
      </span>
    </>
  );
}

function Cartao<L extends LinhaStock>({ c, props }: { c: DadosCartao<L>; props: StockCartoesProps<L> }) {
  const { reservas, stockOrg, mostrarEliminados, formatQty } = props;
  const res = reservas[c.productId];
  const org = stockOrg[c.productId];
  // A mesma regra da coluna Livre do Stocks: por produto, ao nível da organização; sem reserva/total (ou a ver
  // eliminados) não há número.
  const temReserva = !mostrarEliminados && !!res && !!org;
  const livre = temReserva ? Math.round((org.total - res.qty_reserved) * 1e6) / 1e6 : null;
  const codigos = [c.sku, c.barcode ? `EAN ${c.barcode}` : null].filter(Boolean).join(" · ");
  const acoes = props.acoes(c.linhas, c.productId);
  const sel = props.selecionado === c.productId;
  const parcial = props.vista === "product" && props.filtroEstadoAtivo;
  // Reservado e Livre são do produto na organização (como os cabeçalhos da tabela); com mais de um armazém diz-se.
  const daOrg = temReserva && org.warehouses > 1 ? " (organização)" : "";

  return (
    <article
      aria-label={c.nome}
      data-testid="cartao-stock"
      className={cn(
        "relative flex flex-col gap-2.5 rounded-[20px] border bg-card px-4 py-[15px] shadow-sm",
        "transition-[transform,border-color] duration-150 hover:-translate-y-0.5 hover:border-primary focus-within:border-primary",
        "motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        sel ? "border-primary ring-[3px] ring-primary/20" : "border-border",
        c.eliminado && "opacity-60",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {/* O nome é o botão do cartão: o ::after cobre o cartão inteiro (clicar em qualquer sítio abre). */}
          <button
            type="button"
            onClick={() => props.aoAbrir(c.productId)}
            aria-current={sel || undefined}
            className="rounded-sm text-left text-[15.5px] font-bold leading-[1.3] text-foreground after:absolute after:inset-0 after:rounded-[20px] after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-primary focus-visible:after:ring-offset-2"
          >
            {c.nome}
          </button>
          {codigos ? <div className="font-mono text-xs text-muted-foreground">{codigos}</div> : null}
        </div>
        {c.eliminado ? (
          <Pilula tom="neutral">Eliminado</Pilula>
        ) : c.estado === "low" ? (
          <Pilula tom="warn">A acabar</Pilula>
        ) : c.estado === "overstock" ? (
          <Pilula tom="info">Excesso</Pilula>
        ) : null}
      </div>

      <div
        className={cn("text-3xl font-extrabold leading-none tracking-[-0.03em] tabular-nums", livre != null && livre < 0 ? toneText.bad : "text-foreground")}
        data-testid="cartao-livre"
      >
        {livre != null ? formatQty(livre) : "—"}
        <small className="ml-1 text-[13px] font-semibold tracking-normal text-muted-foreground">
          un livres{daOrg}
        </small>
      </div>

      <span className="text-[13px] text-muted-foreground" data-testid="cartao-linha">
        {formatQty(c.quantidade)}&nbsp;un{parcial ? " (das linhas filtradas)" : ""} em {c.onde} ·{" "}
        <span>
          {temReserva ? formatQty(res.qty_reserved) : "—"} reservados{daOrg}
          {temReserva && res.qty_reserved > 0
            ? ` · ${res.orders_count} EC${res.qty_missing > 0 ? ` · faltam ${formatQty(res.qty_missing)}` : ""}`
            : ""}
        </span>
        {livre != null && livre < 0 ? <span className={cn("ml-1", toneText.bad)}>· reservas acima do stock</span> : null}
      </span>

      <Limites c={c as unknown as DadosCartao<LinhaStock>} formatQty={formatQty} />

      {/* Por cima do botão do cartão (z-10): as ações não abrem o painel (o RowActions já pára a propagação). */}
      <div className="relative z-10 flex items-center justify-end gap-1">
        <RowActions primary={acoes.primary} items={acoes.items} menuLabel={acoes.menuLabel} modal={false} />
      </div>
    </article>
  );
}

const GRELHA = "grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-2.5";

export function StockCartoes<L extends LinhaStock>(props: StockCartoesProps<L>) {
  if (props.vista === "product") {
    return (
      <div className={GRELHA} data-testid="existencias-cartoes">
        {props.grupos.map((g) => (
          <Cartao key={g.productId} c={cartaoDoGrupo(g, (id) => props.eCarrinha(id))} props={props} />
        ))}
      </div>
    );
  }
  return (
    <div data-testid="existencias-cartoes">
      {props.porCategoria.map(([categoria, linhas]) => (
        <section key={categoria} aria-label={categoria} className="mt-[18px] first:mt-0">
          <h3 className="mx-0.5 mb-2 flex items-center gap-2 text-[12.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            {categoria} <span className="font-normal tabular-nums">({linhas.length})</span>
          </h3>
          <div className={GRELHA}>
            {linhas.map((l) => (
              <Cartao key={l.id} c={cartaoDaLinha(l, props.estadoDe(l), props.eCarrinha(l.warehouse_id))} props={props} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
