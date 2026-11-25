// Encomendas a fornecedor dentro da moldura do novo Inventário (V.enc do artefacto
// vault/inventario-redesenho-completo.html): barra (pesquisa + Filtros + ações + Cartões/Tabela),
// chips com contagem, "Valor por receber" e a grelha de cartões (.grid/.card/.trk/.pill/poS()).
//
// Só apresentação: os dados, o estado e os handlers são os de PurchaseOrders.tsx (lista filtrada,
// contagens das pílulas, ?status=, pesquisa, abrir a folha, PoRowActions e permissões). Nenhuma
// consulta nova: o valor por receber é o mesmo usePoKpis do PoKpis (que, na vista de cartões, não
// é montado). Fora da moldura (InventarioEmbebido = false) nada disto aparece.
import { useId, useState, type ComponentProps, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Info, LayoutGrid, List, Search, ShoppingCart, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { usePermissions } from "@/hooks/usePermissions";
import { DisabledReason } from "@/components/inventory/ui/DisabledReason";
import { InventoryPageHeader } from "@/components/inventory/ui/InventoryPageHeader";
import { InventoryStatusBadge } from "@/components/inventory/ui/InventoryStatusBadge";
import { toneBadge, type InventoryTone } from "@/components/inventory/ui/tones";
import type { PoStatusFilter } from "@/components/inventory/ui/inventoryLinks";
import { PO_STATUS_PILL_LABELS } from "./PoStatusPills";
import { PO_VALUE_PERMISSION, usePoKpis } from "./PoKpis";
import { formatEur } from "./poListUtils";
import { formatPoShortDate, type PoPublicationRow } from "./poSupplierPortalApi";
import { poShipmentLabel, type PoShipment } from "./poPortalShipments";

// ------------------------------------------------------------------ dados de um cartão

/** Um cartão = uma linha da lista filtrada, já com os textos resolvidos pela página. */
export interface PoCartao {
  id: string;
  numero: string;
  fornecedor: string;
  automatica: boolean;
  /** purchase_orders.status */
  estado: string;
  /** Texto do estado da página (traduções) — usado para os estados sem frase própria (ex.: cancelada). */
  rotuloEstado: string;
  eliminada: boolean;
  /** null = não está atrasada. */
  diasAtraso: number | null;
  /** 0..6 em PO_ETAPAS; -1 = nenhuma (cancelada). */
  etapa: number;
  /** null = para stock. Senão, o mesmo distintivo da coluna Origem (renderOrderOrigin). */
  origem: PoCartaoOrigem | null;
  /** Data da encomenda (order_date), já formatada (ou null). */
  dataEncomenda: string | null;
  /** Entrega prevista, já formatada (ou null). */
  entrega: string | null;
  /** O detalhe do portal / guia expedida da coluna Estado (PoShippedPill / PoPortalPill); null = nada. */
  portal: PoPortalLinha | null;
  /** O valor já com o gate de products.view_cost (precoPo da página). */
  valor: ReactNode;
  /** "30 dias · vence 12/12/2026" / "vence 12/12/2026" / "30 dias"; null = sem prazo nem vencimento. */
  pagamento: string | null;
}

/** Origem por contrato: "Nº · Cliente" (contrato, VD ou EC manual), a dica e a ligação à Encomenda Cliente. */
export interface PoCartaoOrigem {
  rotulo: string;
  dica: string;
  /** clientOrdersLink({ open }); null = a origem ainda não foi resolvida ("—"). */
  ligacao: string | null;
}

export interface PoPortalLinha {
  texto: string;
  dica?: string;
}

/**
 * O texto do distintivo da coluna Estado, com as mesmas fontes: guia expedida (activeShipment) tem prioridade;
 * senão a publicação no portal (nada se não houver ou se foi retirada). Espelha PoShippedPill / PoPortalPill.
 */
export function poPortalLinha(publication: PoPublicationRow | undefined, shipment: PoShipment | null | undefined): PoPortalLinha | null {
  if (shipment) {
    const when = formatPoShortDate(shipment.shippedAt);
    return {
      texto: poShipmentLabel(shipment),
      dica: when ? `Expedida pelo fornecedor em ${when} — receba na Receção com a guia` : "Expedida pelo fornecedor — receba na Receção com a guia",
    };
  }
  if (!publication || publication.status === "withdrawn") return null;
  if (publication.status === "confirmed") {
    const m = publication.promised_date ? /^(\d{4})-(\d{2})-(\d{2})/.exec(publication.promised_date) : null;
    const promised = m ? `${m[3]}/${m[2]}` : "";
    const when = formatPoShortDate(publication.confirmed_at);
    return { texto: `Confirmada${promised ? ` · entrega ${promised}` : ""}`, dica: when ? `Confirmada pelo fornecedor em ${when}` : undefined };
  }
  if (publication.status === "viewed") {
    const when = formatPoShortDate(publication.viewed_at);
    return { texto: `No portal · vista${when ? ` ${when}` : ""}` };
  }
  return { texto: "No portal · por ver" };
}

/** Prazo do fornecedor e/ou vencimento, como a coluna Valor ("vence dd/mm") com o prazo à frente. */
export function poPagamentoTexto(dias: number | null | undefined, vence: string | null): string | null {
  const partes = [dias != null ? `${dias} dias` : null, vence ? `vence ${vence}` : null].filter(Boolean);
  return partes.length ? partes.join(" · ") : null;
}

export const PO_ETAPAS = ["Rascunho", "Encomendada", "Vista", "Confirmada", "Expedida", "Parcial", "Recebida"] as const;

/** poAt() do artefacto, com os dados reais: estado gravado, publicação no portal e guia expedida. */
export function poEtapa(estado: string, publicacao: string | null | undefined, expedida: boolean): number {
  if (estado === "cancelled") return -1;
  if (estado === "received") return 6;
  if (estado === "partially_received") return 5;
  if (expedida) return 4;
  if (publicacao === "confirmed") return 3;
  if (publicacao === "viewed") return 2;
  if (estado === "ordered") return 1;
  return 0;
}

/** poS() do artefacto: o texto e a cor da pílula do cartão. */
export function poPilula(c: Pick<PoCartao, "estado" | "diasAtraso" | "rotuloEstado">): { texto: string; tom: InventoryTone; pulsar: boolean } {
  if (c.estado === "pending") return { texto: "Por aprovar", tom: "violet", pulsar: false };
  if (c.diasAtraso != null) {
    return { texto: `Atrasada ${c.diasAtraso} ${c.diasAtraso === 1 ? "dia" : "dias"}`, tom: "bad", pulsar: true };
  }
  if (c.estado === "received") return { texto: "Recebida", tom: "ok", pulsar: false };
  if (c.estado === "partially_received") return { texto: "Chegou uma parte", tom: "warn", pulsar: false };
  if (c.estado === "ordered") return { texto: "A caminho", tom: "info", pulsar: false };
  return { texto: c.rotuloEstado, tom: "neutral", pulsar: false };
}

// ------------------------------------------------------------------ peças

export function PoPilulaEstado({ cartao }: { cartao: Pick<PoCartao, "estado" | "diasAtraso" | "rotuloEstado"> }) {
  const p = poPilula(cartao);
  return (
    <span
      className={cn(
        "inline-flex h-[26px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12.5px] font-semibold",
        toneBadge[p.tom],
      )}
    >
      <span className="relative inline-flex h-[7px] w-[7px]" aria-hidden="true">
        {p.pulsar && <span className="absolute inset-0 animate-ping rounded-full bg-current opacity-60 motion-reduce:hidden" />}
        <span className="relative h-[7px] w-[7px] rounded-full bg-current" />
      </span>
      {p.texto}
    </span>
  );
}

/** .trk do artefacto: 7 pontos ligados; os feitos a violeta, o atual em anel. */
export function PoTrilho({ etapa }: { etapa: number }) {
  const atual = etapa >= 0 ? PO_ETAPAS[etapa] : null;
  return (
    <div className="flex items-center" role="img" aria-label={atual ? `Etapa: ${atual}` : "Sem etapa"} data-etapa={etapa}>
      {PO_ETAPAS.map((nome, k) => (
        <span key={nome} className="contents">
          {k > 0 && <i className={cn("h-[3px] flex-1", k <= etapa ? "bg-primary" : "bg-border")} />}
          <span
            title={nome}
            className={cn(
              "h-2.5 w-2.5 flex-none rounded-full",
              k < etapa && "bg-primary",
              k === etapa && "border-2 border-primary bg-card shadow-[0_0_0_3px_hsl(var(--primary)/0.15)]",
              k > etapa && "bg-border",
            )}
          />
        </span>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ barra (no lugar do cabeçalho clássico)

export type PoVistaEmbebida = "cartoes" | "tabela";

interface PoBarraProps {
  pesquisa: string;
  aoPesquisar: (valor: string) => void;
  vista: PoVistaEmbebida;
  aoMudarVista: (vista: PoVistaEmbebida) => void;
  /** Conteúdo do painel "Filtros" (PoFiltrosAvancados). */
  filtros: ReactNode;
  /** Quantos filtros avançados estão ativos (mostrado no botão). */
  filtrosAtivos: number;
  /** As ações de sempre do cabeçalho (FAQ, Exportar, Importar, Nova encomenda + a folha). */
  acoes?: ReactNode;
}

const SEG =
  "inline-flex min-h-9 items-center gap-1.5 rounded-[10px] px-3 text-[13.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function PoBarraEmbebida({ pesquisa, aoPesquisar, vista, aoMudarVista, filtros, filtrosAtivos, acoes }: PoBarraProps) {
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const painelId = useId();
  // Na vista Tabela a pesquisa e os filtros são os do cartão clássico (tal como está); a barra fica com as ações.
  const cartoes = vista === "cartoes";
  return (
    <div className="mb-3">
      <div className="flex flex-wrap items-center gap-2">
        {cartoes && (
          <label className="flex min-h-11 flex-[1_1_240px] items-center gap-2 rounded-[14px] border bg-card px-3 text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
            <Search className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            <input
              type="search"
              value={pesquisa}
              onChange={(e) => aoPesquisar(e.target.value)}
              placeholder="Nº, fornecedor ou cliente"
              aria-label="Pesquisar encomendas"
              className="min-w-0 flex-1 border-0 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
        )}
        {cartoes && (
          <Button
            type="button"
            variant="ghost"
            aria-expanded={filtrosAbertos}
            aria-controls={painelId}
            onClick={() => setFiltrosAbertos((v) => !v)}
            className={cn("min-h-11 rounded-[14px]", filtrosAbertos && "bg-muted")}
          >
            <SlidersHorizontal className="mr-2 h-4 w-4" aria-hidden="true" />
            Filtros
            {filtrosAtivos > 0 && (
              <span className="ml-1.5 rounded-full bg-primary px-1.5 text-xs leading-5 text-primary-foreground">
                {filtrosAtivos}
                <span className="sr-only"> ativos</span>
              </span>
            )}
          </Button>
        )}
        {acoes ? <div className="flex flex-wrap items-center gap-2">{acoes}</div> : null}
        <div role="group" aria-label="Vista" className="ml-auto inline-flex rounded-[14px] border bg-card p-1">
          <button
            type="button"
            aria-pressed={vista === "cartoes"}
            onClick={() => aoMudarVista("cartoes")}
            className={cn(SEG, vista === "cartoes" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted")}
          >
            <LayoutGrid className="h-4 w-4" aria-hidden="true" />
            Cartões
          </button>
          <button
            type="button"
            aria-pressed={vista === "tabela"}
            onClick={() => aoMudarVista("tabela")}
            className={cn(SEG, vista === "tabela" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted")}
          >
            <List className="h-4 w-4" aria-hidden="true" />
            Tabela
          </button>
        </div>
      </div>
      {cartoes && filtrosAbertos && (
        <div id={painelId} role="region" aria-label="Filtros" className="mt-2 rounded-[20px] border bg-card p-4 shadow-sm">
          {filtros}
        </div>
      )}
    </div>
  );
}

/**
 * No lugar do <InventoryPageHeader> da página: fora da moldura é exatamente o cabeçalho clássico; dentro, a barra
 * do artefacto com as MESMAS ações (que incluem os diálogos de importar e a folha da encomenda).
 */
export function PoCabecalho({
  embebido,
  barra,
  ...cabecalho
}: ComponentProps<typeof InventoryPageHeader> & { embebido: boolean; barra: Omit<PoBarraProps, "acoes"> }) {
  if (!embebido) return <InventoryPageHeader {...cabecalho} />;
  return <PoBarraEmbebida {...barra} acoes={cabecalho.actions} />;
}

// ------------------------------------------------------------------ filtros avançados (painel do botão "Filtros")

interface PoFiltrosAvancadosProps {
  fornecedores: { id: string; name: string }[];
  fornecedor: string;
  aoFornecedor: (id: string) => void;
  campoData: "order_date" | "actual_delivery_date";
  aoCampoData: (campo: "order_date" | "actual_delivery_date") => void;
  de: string;
  ate: string;
  aoDe: (v: string) => void;
  aoAte: (v: string) => void;
  verEliminados: boolean;
  aoVerEliminados: (v: boolean) => void;
  agrupar: boolean;
  aoAgrupar: (v: boolean) => void;
  temFiltros: boolean;
  limpar: () => void;
  rotulos: {
    fornecedor: string;
    campoData: string;
    campoDataEncomenda: string;
    campoDataEntrega: string;
    verEliminados: string;
    agrupar: string;
    limpar: string;
  };
}

/** Os mesmos controlos do cartão de filtros clássico (sem a pesquisa, que está na barra). */
export function PoFiltrosAvancados(p: PoFiltrosAvancadosProps) {
  const id = useId();
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <Select value={p.fornecedor} onValueChange={p.aoFornecedor}>
        <SelectTrigger className="w-full sm:w-[210px]" aria-label={p.rotulos.fornecedor}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os fornecedores</SelectItem>
          {p.fornecedores.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={p.campoData} onValueChange={(v) => p.aoCampoData(v as "order_date" | "actual_delivery_date")}>
        <SelectTrigger className="w-full sm:w-[200px]" aria-label={p.rotulos.campoData}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="order_date">{p.rotulos.campoDataEncomenda}</SelectItem>
          <SelectItem value="actual_delivery_date">{p.rotulos.campoDataEntrega}</SelectItem>
        </SelectContent>
      </Select>
      <Label htmlFor={`${id}-de`} className="inline-flex items-center gap-1.5 font-normal text-muted-foreground">
        De
        <Input id={`${id}-de`} type="date" className="w-[150px]" value={p.de} onChange={(e) => p.aoDe(e.target.value)} />
      </Label>
      <Label htmlFor={`${id}-ate`} className="inline-flex items-center gap-1.5 font-normal text-muted-foreground">
        Até
        <Input id={`${id}-ate`} type="date" className="w-[150px]" value={p.ate} onChange={(e) => p.aoAte(e.target.value)} />
      </Label>
      <div className="inline-flex items-center gap-2">
        <Checkbox id={`${id}-elim`} checked={p.verEliminados} onCheckedChange={(c) => p.aoVerEliminados(c === true)} />
        <Label htmlFor={`${id}-elim`} className="cursor-pointer font-normal">
          {p.rotulos.verEliminados}
        </Label>
      </div>
      <div className="inline-flex items-center gap-2">
        <Switch id={`${id}-grupo`} checked={p.agrupar} onCheckedChange={p.aoAgrupar} />
        <Label htmlFor={`${id}-grupo`} className="cursor-pointer font-normal">
          {p.rotulos.agrupar}
        </Label>
      </div>
      {p.temFiltros && (
        <Button variant="ghost" size="sm" onClick={p.limpar}>
          <X className="mr-1.5 h-4 w-4" />
          {p.rotulos.limpar}
        </Button>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ valor por receber (o mesmo do PoKpis)

/** O número do KPI "Valor por receber" — a mesma leitura (usePoKpis) e o mesmo gate de products.view_cost. */
export function PoValorPorReceber({ organizationId, reloadSignal }: { organizationId: string | null | undefined; reloadSignal: unknown }) {
  const { hasPermission, loading } = usePermissions();
  const podeVer = !loading && hasPermission(PO_VALUE_PERMISSION);
  const c = usePoKpis(organizationId, reloadSignal, podeVer);
  if (!podeVer) {
    return (
      <span className="font-normal normal-case tracking-normal text-muted-foreground">
        — <span className="text-xs">Sem permissão: requer {PO_VALUE_PERMISSION}.</span>
      </span>
    );
  }
  return <>{c?.openValue != null ? formatEur(c.openValue) : "—"}</>;
}

// ------------------------------------------------------------------ cartões

const CHIPS: PoStatusFilter[] = ["all", "pending", "late", "ordered", "partially_received", "received", "cancelled", "portal"];
const CHIP_DICA: Partial<Record<PoStatusFilter, string>> = {
  pending: "Por aprovar",
  late: "Em aberto com a entrega prevista ultrapassada",
  portal: "Publicadas no portal do fornecedor",
};

export interface PoGrupoCartoes {
  chave: string;
  nome: string;
  cartoes: PoCartao[];
}

interface PoCartoesProps {
  cartoes: PoCartao[];
  /** "Agrupar por fornecedor": secções com o nome do fornecedor (os grupos da página); null = grelha única. */
  grupos: PoGrupoCartoes[] | null;
  estado: PoStatusFilter;
  aoFiltrarEstado: (estado: PoStatusFilter) => void;
  contagens: Record<PoStatusFilter, number>;
  /** null = o cartão não abre (eliminadas, ou sem purchase_orders.view/create) — como a linha da tabela. */
  abrir: ((id: string) => void) | null;
  /** PoRowActions da linha (botão principal + ⋯), com os mesmos handlers e gates. */
  acoes: (id: string) => ReactNode;
  valorPorReceber: ReactNode;
  /** A nota "Recebida nunca se escolhe à mão…". */
  nota: ReactNode;
  temFiltros: boolean;
  limpar: () => void;
  textos: { semResultados: string; semEncomendas: string; limpar: string };
}

function Cartao({ c, abrir, acoes }: { c: PoCartao; abrir: PoCartoesProps["abrir"]; acoes: PoCartoesProps["acoes"] }) {
  return (
    <article
      data-testid="po-cartao"
      className={cn(
        "group relative flex flex-col gap-2.5 rounded-[20px] border bg-card px-4 py-[15px] text-card-foreground shadow-sm transition-[transform,border-color] duration-150",
        abrir && "hover:-translate-y-0.5 hover:border-primary focus-within:border-primary motion-reduce:hover:translate-y-0",
      )}
    >
      {/* O cartão inteiro abre a folha: um botão por baixo do conteúdo (os controlos ficam por cima com z-10). */}
      {abrir && (
        <button
          type="button"
          onClick={() => abrir(c.id)}
          aria-label={`Abrir ${c.numero} · ${c.fornecedor}`}
          className="absolute inset-0 rounded-[20px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        />
      )}
      <div className="pointer-events-none relative flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[15.5px] font-bold leading-snug">{c.fornecedor}</div>
          <div className="font-mono text-[12.5px] text-muted-foreground">
            {c.numero}
            {c.automatica ? " · Automática" : ""}
            {c.eliminada && <InventoryStatusBadge className="ml-1.5 font-sans">Eliminada</InventoryStatusBadge>}
          </div>
        </div>
        <PoPilulaEstado cartao={c} />
      </div>
      <div className="pointer-events-none relative">
        <PoTrilho etapa={c.etapa} />
      </div>
      {c.portal && (
        <div className="pointer-events-none relative -mt-1 text-xs text-muted-foreground" data-testid="po-cartao-portal" title={c.portal.dica}>
          {c.portal.texto.startsWith("No portal") ? c.portal.texto : `Portal: ${c.portal.texto}`}
        </div>
      )}
      <div className="pointer-events-none relative min-w-0 text-[13px] text-muted-foreground">
        Para{" "}
        {!c.origem ? (
          "stock"
        ) : c.origem.ligacao ? (
          <Link
            to={c.origem.ligacao}
            title={c.origem.dica}
            onClick={(e) => e.stopPropagation()}
            className="pointer-events-auto relative z-10 rounded-sm font-[550] text-foreground underline-offset-2 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {c.origem.rotulo}
          </Link>
        ) : (
          c.origem.rotulo
        )}
      </div>
      <div className="relative flex flex-wrap items-center justify-between gap-2">
        <span className="pointer-events-none text-[13px] text-muted-foreground">
          {[c.dataEncomenda ? `Encomenda ${c.dataEncomenda}` : null, c.entrega ? `entrega ${c.entrega}` : null]
            .filter(Boolean)
            .join(" · ") || "Sem datas"}
        </span>
        <span className="relative z-10 font-bold tabular-nums">{c.valor}</span>
      </div>
      <div className="relative flex flex-wrap items-center justify-between gap-2">
        <span className="pointer-events-none text-[13px] text-muted-foreground">
          Pagamento: {c.pagamento ?? "Sem prazo definido no fornecedor"}
        </span>
        <div className="relative z-10">{acoes(c.id)}</div>
      </div>
    </article>
  );
}

function Grelha({ cartoes, abrir, acoes }: Pick<PoCartoesProps, "cartoes" | "abrir" | "acoes">) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-2.5">
      {cartoes.map((c) => (
        <Cartao key={c.id} c={c} abrir={abrir} acoes={acoes} />
      ))}
    </div>
  );
}

const SECT = "mx-0.5 mb-2 mt-[18px] flex items-center gap-2 text-[12.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground";

export function PoCartoes(p: PoCartoesProps) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <div role="group" aria-label="Estado" className="flex flex-wrap gap-1.5">
          {CHIPS.map((k) => {
            const on = p.estado === k;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                title={CHIP_DICA[k]}
                onClick={() => p.aoFiltrarEstado(k)}
                className={cn(
                  "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[13.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  on ? "border-foreground bg-foreground text-background" : "bg-card text-muted-foreground hover:bg-muted",
                )}
              >
                {PO_STATUS_PILL_LABELS[k]} <b className={on ? "text-background" : "text-foreground"}>{p.contagens[k]}</b>
              </button>
            );
          })}
        </div>
        <DisabledReason reason={p.nota}>
          <button
            type="button"
            aria-label="Sobre os estados"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Info className="h-4 w-4" aria-hidden="true" />
          </button>
        </DisabledReason>
      </div>

      <div className={SECT}>
        Valor por receber ·{" "}
        <span className="tabular-nums normal-case tracking-normal text-foreground" data-testid="po-valor-por-receber">
          {p.valorPorReceber}
        </span>
      </div>

      {p.cartoes.length === 0 ? (
        <div className="space-y-4 rounded-[20px] border bg-card p-8 text-center">
          <ShoppingCart className="mx-auto h-12 w-12 text-muted-foreground" aria-hidden="true" />
          <p className="text-muted-foreground">{p.temFiltros ? p.textos.semResultados : p.textos.semEncomendas}</p>
          {p.temFiltros && (
            <Button variant="outline" size="sm" onClick={p.limpar}>
              <X className="mr-1.5 h-4 w-4" />
              {p.textos.limpar}
            </Button>
          )}
        </div>
      ) : p.grupos ? (
        p.grupos.map((g) => (
          <section key={g.chave} aria-label={g.nome}>
            <h3 className={SECT}>
              {g.nome}
              <span className="rounded-full bg-muted px-2 text-xs normal-case tracking-normal">{g.cartoes.length}</span>
            </h3>
            <Grelha cartoes={g.cartoes} abrir={p.abrir} acoes={p.acoes} />
          </section>
        ))
      ) : (
        <Grelha cartoes={p.cartoes} abrir={p.abrir} acoes={p.acoes} />
      )}
      {p.cartoes.length > 0 && <p className="mt-3 px-1 text-xs text-muted-foreground">{p.cartoes.length} encomenda(s)</p>}
    </div>
  );
}
