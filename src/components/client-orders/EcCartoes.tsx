// "Saídas para clientes" dentro da moldura do novo Inventário (/inventory/novo/saidas), com o visual do artefacto
// aprovado (vault/inventario-redesenho-completo.html: V.sai, ecSt, .bar, .chips, .sect, .grid, .card, .pill, .prog).
// Só apresentação: a lista, a prontidão, os filtros, as contagens, os handlers e as permissões vêm todos de
// ClientOrders.tsx — sem consultas novas. Fora da moldura nada disto se mostra (o ecrã clássico fica igual).
import type { ReactNode } from "react";
import { Download, Filter, LayoutGrid, Loader2, Plus, Search, Table2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PermissionGate } from "@/components/PermissionGate";
import { DisabledReasonInfo, type ClientOrderOriginFilter, type ClientOrderStatusFilter, type InventoryTone } from "@/components/inventory/ui";
import { toneBadge } from "@/components/inventory/ui/tones";
import { cn } from "@/lib/utils";
import { clientOrderProgressParts, clientOrderUnitParts, type ClientOrderProgressCounts } from "./ClientOrderProgress";
import { CLIENT_ORDER_ORIGIN_FILTER_LABELS, type ClientOrderListEntry, type ClientOrderOrigin } from "./clientOrderFilters";
import type { ClientOrderReadiness, ClientOrderReadinessMap } from "./clientOrderList";

// ── Pílula (.pill do artefacto) ────────────────────────────────────────────

export function EcPilula({ tone = "neutral", children, title, className }: { tone?: InventoryTone; children: ReactNode; title?: string; className?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-[26px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12.5px] font-semibold",
        toneBadge[tone],
        className,
      )}
    >
      <span className="h-[7px] w-[7px] rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  );
}

// ── Secções por urgência (ORD de V.sai) ────────────────────────────────────

export type EcSeccao = "sem_fornecedor" | "parcialmente_pendente" | "ready" | "a_aguardar_encomenda" | "totalmente_servido";

/** A ordem de urgência das secções: o que precisa de alguém primeiro. */
export const EC_SECCOES: ReadonlyArray<{ key: EcSeccao; tone: InventoryTone }> = [
  { key: "sem_fornecedor", tone: "bad" },
  { key: "parcialmente_pendente", tone: "warn" },
  { key: "ready", tone: "ok" },
  { key: "a_aguardar_encomenda", tone: "info" },
  { key: "totalmente_servido", tone: "neutral" },
];

const ESTADOS_LISTA = new Set<string>(["sem_fornecedor", "parcialmente_pendente", "a_aguardar_encomenda", "totalmente_servido"]);

/** O que interessa de uma linha da lista (rpc_list_client_order_documents). */
export interface EcLinhaLista extends ClientOrderProgressCounts {
  contract_id: string;
  contract_number: string;
  order_number?: string | null;
  client_name: string | null;
  signature_date: string | null;
  overall_status: string;
  delivery_address?: string | null;
}

export interface EcLinhaEliminada {
  contract_id: string;
  contract_number: string;
  order_number: string | null;
  client_name: string | null;
  signature_date: string | null;
  delivery_address: string | null;
}

/**
 * Em que secção fica a encomenda. Pronta a expedir (is_ready da prontidão — EC por armazém) passa à frente do
 * estado geral; senão vale o overall_status da RPC da lista. Com um filtro de estado/prontas ligado, a secção é a do
 * filtro (o servidor já disse que é desse estado), para o chip e a secção baterem certo.
 */
export function ecSeccaoDe(
  row: Pick<EcLinhaLista, "overall_status">,
  readiness: Pick<ClientOrderReadiness, "is_ready"> | null | undefined,
  filtro?: { statusFilter: string; readyActive: boolean },
): EcSeccao {
  if (filtro?.readyActive) return "ready";
  if (filtro && filtro.statusFilter !== "all" && ESTADOS_LISTA.has(filtro.statusFilter)) return filtro.statusFilter as EcSeccao;
  if (readiness?.is_ready) return "ready";
  if (ESTADOS_LISTA.has(row.overall_status)) return row.overall_status as EcSeccao;
  return "parcialmente_pendente";
}

/** A pílula do cartão (ecSt().t/.c do artefacto), pela secção própria da encomenda. */
export function ecPilulaDe(seccao: EcSeccao, readiness: Pick<ClientOrderReadiness, "lines_ready"> | null | undefined): { texto: string; tone: InventoryTone } {
  switch (seccao) {
    case "sem_fornecedor":
      return { texto: "Falta fornecedor", tone: "bad" };
    case "ready":
      return { texto: "Pronta a sair", tone: "ok" };
    case "a_aguardar_encomenda":
      return { texto: "À espera do fornecedor", tone: "info" };
    case "totalmente_servido":
      return { texto: "Entregue", tone: "ok" };
    default: {
      const prontas = readiness?.lines_ready ?? 0;
      return { texto: prontas > 0 ? `${prontas} pronta(s) a sair` : "Parcialmente pendente", tone: "warn" };
    }
  }
}

/** O plano de armazém da EC (ec_plan da prontidão). A lista não traz o nome do armazém, só o plano. */
export function ecPlanoTexto(readiness: Pick<ClientOrderReadiness, "ec_plan"> | null | undefined): string | null {
  switch (readiness?.ec_plan) {
    case "single":
      return "Tudo de um só armazém";
    case "split":
      return "Repartida por armazéns";
    case "partial":
      return "Com falta de stock";
    case "none":
      return "Nada pendente";
    default:
      return null;
  }
}

/** Fração servida (0–1): em unidades com a prontidão, senão por linha (como ClientOrderProgress). */
export function ecServido(row: ClientOrderProgressCounts, readiness: ClientOrderReadiness | null | undefined): number {
  if (readiness) {
    const { served, total } = clientOrderUnitParts(readiness);
    if (total > 0) return served / total;
  }
  const { served, total } = clientOrderProgressParts(row);
  return total > 0 ? served / total : 0;
}

// ── Barra: pesquisa, Filtros, Exportar, Nova, Cartões/Tabela e chips ───────

export type EcVista = "cartoes" | "tabela";

export interface EcBarraProps {
  pesquisa: string;
  onPesquisa: (v: string) => void;
  /** Rótulo de cada estado geral (getOverallStatusLabel da página). */
  rotuloEstado: (status: string) => string;
  contagens: { total: number | null; byStatus: Record<string, number> | null; truncated?: boolean; ready: number | null };
  statusFilter: string;
  readyActive: boolean;
  onEstado: (status: ClientOrderStatusFilter) => void;
  onProntas: (ligar: boolean) => void;
  origem: ClientOrderOriginFilter;
  onOrigem: (o: ClientOrderOriginFilter) => void;
  datas: { de: string; ate: string; onDe: (v: string) => void; onAte: (v: string) => void; rotuloDe: string; rotuloAte: string };
  eliminadas: { ver: boolean; pode: boolean; motivo: string; onVer: (v: boolean) => void };
  /** Há algum filtro ligado (mostra "Limpar filtros", como no ecrã clássico). */
  filtrosAtivos: boolean;
  onLimpar: () => void;
  rotuloLimpar: string;
  exportar: { onClick: () => void; busy: boolean };
  onNova: () => void;
  vista: EcVista;
  onVista: (v: EcVista) => void;
  /** Por baixo dos chips (a legenda da tabela, só na vista Tabela). */
  children?: ReactNode;
}

const CHIP =
  "inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[13.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background";

function Chip({ label, count, pressed, onClick, title }: { label: string; count: number | null; pressed: boolean; onClick: () => void; title?: string }) {
  return (
    <button type="button" className={CHIP} aria-pressed={pressed} onClick={onClick} title={title}>
      {label}
      {count !== null ? <b className={cn("tabular-nums", pressed ? "text-background" : "text-foreground")}>{count}</b> : null}
    </button>
  );
}

const ORIGENS: ReadonlyArray<ClientOrderOriginFilter> = ["all", "contract", "direct_sale", "manual"];

export function EcBarra(p: EcBarraProps) {
  const n = (v: number | null | undefined): number | null => (v === null || v === undefined ? null : v);
  const activeCount = (p.datas.de ? 1 : 0) + (p.datas.ate ? 1 : 0) + (p.eliminadas.ver && p.eliminadas.pode ? 1 : 0) + (p.origem !== "all" ? 1 : 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex min-h-11 flex-[1_1_240px] items-center gap-2 rounded-[14px] border border-border bg-card px-3 text-muted-foreground focus-within:ring-2 focus-within:ring-primary">
          <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
          <input
            type="search"
            placeholder="Nº EC, contrato, VD ou cliente"
            aria-label="Pesquisar encomendas clientes"
            value={p.pesquisa}
            onChange={(e) => p.onPesquisa(e.target.value)}
            className="min-w-0 flex-1 border-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" className="min-h-11 gap-1.5 rounded-[14px]" aria-label={activeCount > 0 ? `Filtros (${activeCount} ligados)` : "Filtros"}>
              <Filter className="h-4 w-4" aria-hidden="true" />
              Filtros
              {activeCount > 0 ? (
                <span className="rounded-full bg-primary px-1.5 text-[11px] font-bold leading-[18px] text-primary-foreground">{activeCount}</span>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[300px] rounded-2xl p-4">
            <div className="flex flex-col gap-3 text-[13px]">
              <label className="flex items-center justify-between gap-2">
                De
                <Input type="date" value={p.datas.de} onChange={(e) => p.datas.onDe(e.target.value)} className="w-[170px]" title={p.datas.rotuloDe} aria-label={p.datas.rotuloDe} />
              </label>
              <label className="flex items-center justify-between gap-2">
                Até
                <Input type="date" value={p.datas.ate} onChange={(e) => p.datas.onAte(e.target.value)} className="w-[170px]" title={p.datas.rotuloAte} aria-label={p.datas.rotuloAte} />
              </label>
              <div className="flex items-center gap-2" title={p.eliminadas.pode ? undefined : p.eliminadas.motivo}>
                <Checkbox
                  id="ec-cartoes-ver-eliminadas"
                  checked={p.eliminadas.ver && p.eliminadas.pode}
                  disabled={!p.eliminadas.pode}
                  onCheckedChange={(c) => p.eliminadas.onVer(c === true)}
                />
                <Label htmlFor="ec-cartoes-ver-eliminadas" className="cursor-pointer font-normal">Ver eliminadas</Label>
                {p.eliminadas.pode ? null : <DisabledReasonInfo label="Ver eliminadas" reason={p.eliminadas.motivo} />}
              </div>
              <fieldset className="flex flex-col gap-1.5">
                <legend className="mb-1 text-[12px] font-semibold uppercase tracking-[.08em] text-muted-foreground">Origem</legend>
                <div className="flex flex-wrap gap-1.5">
                  {ORIGENS.map((o) => (
                    <button
                      key={o}
                      type="button"
                      aria-pressed={p.origem === o}
                      onClick={() => p.onOrigem(o)}
                      className={cn(CHIP, "min-h-8 px-2.5 text-[12.5px]")}
                    >
                      {o === "all" ? "Todas" : CLIENT_ORDER_ORIGIN_FILTER_LABELS[o as ClientOrderOrigin]}
                    </button>
                  ))}
                </div>
              </fieldset>
              {p.filtrosAtivos ? (
                <Button variant="outline" size="sm" onClick={p.onLimpar}>
                  {p.rotuloLimpar}
                </Button>
              ) : null}
            </div>
          </PopoverContent>
        </Popover>
        {/* Os mesmos portões do cabeçalho clássico: Exportar = client_orders.view; Nova = client_orders.create. */}
        <PermissionGate permission="client_orders.view">
          <Button variant="ghost" className="min-h-11 rounded-[14px]" onClick={p.exportar.onClick} disabled={p.exportar.busy}>
            {p.exportar.busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="mr-2 h-4 w-4" aria-hidden="true" />}
            Exportar
          </Button>
        </PermissionGate>
        <PermissionGate permission="client_orders.create">
          <Button className="min-h-11 rounded-[14px]" onClick={p.onNova}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Nova encomenda manual
          </Button>
        </PermissionGate>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 flex-wrap gap-1.5" role="group" aria-label="Estado">
          <Chip
            label="Todas"
            count={n(p.contagens.total)}
            pressed={!p.readyActive && p.statusFilter === "all"}
            onClick={() => p.onEstado("all")}
          />
          {EC_SECCOES.map((s) =>
            s.key === "ready" ? (
              <Chip
                key={s.key}
                label="Prontas a expedir"
                count={n(p.contagens.ready)}
                pressed={p.readyActive}
                onClick={() => p.onProntas(!p.readyActive)}
                title="Com linhas com stock reservado, prontas a sair do armazém."
              />
            ) : (
              <Chip
                key={s.key}
                label={p.rotuloEstado(s.key)}
                count={p.contagens.byStatus ? n(p.contagens.byStatus[s.key]) : null}
                pressed={!p.readyActive && p.statusFilter === s.key}
                onClick={() => p.onEstado(s.key as ClientOrderStatusFilter)}
              />
            ),
          )}
          {p.origem !== "all" ? (
            <button type="button" className={CHIP} aria-pressed onClick={() => p.onOrigem("all")} title="Carregar limpa o filtro de origem">
              Origem: {CLIENT_ORDER_ORIGIN_FILTER_LABELS[p.origem as ClientOrderOrigin]}
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <div className="inline-flex rounded-full bg-muted p-1" role="group" aria-label="Vista">
          {([
            ["cartoes", "Cartões", LayoutGrid],
            ["tabela", "Tabela", Table2],
          ] as const).map(([v, label, Icon]) => (
            <button
              key={v}
              type="button"
              aria-pressed={p.vista === v}
              onClick={() => p.onVista(v)}
              className="inline-flex min-h-[34px] items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-sm"
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      </div>
      {p.children}
    </div>
  );
}

// ── Grelha de cartões por secção ───────────────────────────────────────────

export interface EcCartoesProps<A extends EcLinhaLista, D extends EcLinhaEliminada> {
  entradas: ReadonlyArray<ClientOrderListEntry<A, D>>;
  readiness: ClientOrderReadinessMap | null;
  loading: boolean;
  textoCarregar: string;
  textoVazio: string;
  statusFilter: string;
  readyActive: boolean;
  rotuloEstado: (status: string) => string;
  origemDe: (row: A) => { label: string } | null;
  origemEliminadaDe: (row: D) => { label: string };
  onAbrir: (row: A) => void;
  onAbrirEliminada: (row: D) => void;
  /** O ⋯ da linha (as mesmas ações e permissões da tabela, em modo compacto: sem "Ver" nem "PDF" diretos). */
  acoes: (row: A) => ReactNode;
}

// O cartão é um <div>; abrir é o botão do nome do cliente, esticado por cima do cartão inteiro (after:inset-0) —
// assim o ⋯ (outro botão) não fica dentro de um botão e o cartão todo continua a abrir a folha ao clique.
const CARTAO =
  "relative flex w-full flex-col gap-2.5 rounded-[20px] border border-border bg-card px-4 py-[15px] text-left shadow-sm transition-[transform,border-color] duration-150 hover:-translate-y-0.5 hover:border-primary focus-within:border-primary motion-reduce:transition-none motion-reduce:hover:translate-y-0";
const ABRIR =
  "block text-left text-[15.5px] font-bold leading-[1.3] text-foreground after:absolute after:inset-0 after:rounded-[20px] after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-primary focus-visible:after:ring-offset-2";

function Seccao({ titulo, tone, n, nota, children }: { titulo: string; tone: InventoryTone; n: number; nota?: string | null; children: ReactNode }) {
  return (
    <section aria-label={`${titulo} (${n})`}>
      <h3 className="mx-0.5 mb-2 mt-[18px] flex flex-wrap items-center gap-2 text-[12.5px] font-bold uppercase tracking-[.12em] text-muted-foreground">
        <EcPilula tone={tone} className="normal-case tracking-normal">{titulo}</EcPilula>
        <span className="tabular-nums">{n}</span>
        {nota ? <span className="text-[12px] font-normal normal-case tracking-normal" data-testid="ec-seccao-nota">{nota}</span> : null}
      </h3>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-2.5">{children}</div>
    </section>
  );
}

export function EcCartoes<A extends EcLinhaLista, D extends EcLinhaEliminada>(p: EcCartoesProps<A, D>) {
  if (p.loading) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{p.textoCarregar}</p>;
  }
  if (p.entradas.length === 0) {
    return (
      <p className="rounded-[20px] border border-border bg-card py-8 text-center text-sm text-muted-foreground">{p.textoVazio}</p>
    );
  }

  const filtro = { statusFilter: p.statusFilter, readyActive: p.readyActive };
  const porSeccao = new Map<EcSeccao, A[]>();
  const eliminadas: D[] = [];
  // Para as contagens baterem com os chips: as prontas a expedir que ficam noutra secção (com um filtro de estado ligado)
  // e, sem filtro, as de cada estado geral que passaram para "Prontas a expedir".
  const prontasAqui = new Map<EcSeccao, number>();
  const passaramAProntas = new Map<string, number>();
  for (const e of p.entradas) {
    if (e.kind === "deleted") {
      eliminadas.push(e.row);
      continue;
    }
    const rd = p.readiness?.[e.row.contract_id];
    const s = ecSeccaoDe(e.row, rd, filtro);
    const lista = porSeccao.get(s) ?? [];
    lista.push(e.row);
    porSeccao.set(s, lista);
    if (s !== "ready" && rd?.is_ready) prontasAqui.set(s, (prontasAqui.get(s) ?? 0) + 1);
    if (s === "ready" && !p.readyActive && e.row.overall_status !== "ready") {
      passaramAProntas.set(e.row.overall_status, (passaramAProntas.get(e.row.overall_status) ?? 0) + 1);
    }
  }
  const notaDe = (key: EcSeccao): string | null => {
    const partes: string[] = [];
    const aqui = prontasAqui.get(key) ?? 0;
    if (aqui > 0) partes.push(`${aqui} ${aqui === 1 ? "pronta" : "prontas"} a expedir`);
    const foram = passaramAProntas.get(key) ?? 0;
    if (foram > 0) partes.push(`mais ${foram} em Prontas a expedir`);
    return partes.length > 0 ? `· ${partes.join(" · ")}` : null;
  };

  return (
    <div>
      {EC_SECCOES.map(({ key, tone }) => {
        const lista = porSeccao.get(key);
        if (!lista || lista.length === 0) return null;
        const titulo = key === "ready" ? "Prontas a expedir" : p.rotuloEstado(key);
        return (
          <Seccao key={key} titulo={titulo} tone={tone} n={lista.length} nota={notaDe(key)}>
            {lista.map((row) => {
              const rd = p.readiness?.[row.contract_id] ?? null;
              const numero = row.order_number || row.contract_number;
              const origem = p.origemDe(row);
              const propria = ecSeccaoDe(row, rd);
              const pilula = ecPilulaDe(propria, rd);
              // O estado geral real, quando a pílula não o diz (ex.: pronta a expedir, ou parcial com linhas prontas).
              const estadoGeral = propria !== row.overall_status || (propria === "parcialmente_pendente" && pilula.texto !== "Parcialmente pendente")
                ? p.rotuloEstado(row.overall_status)
                : null;
              const plano = ecPlanoTexto(rd);
              const servido = Math.round(ecServido(row, rd) * 100);
              const servidas = clientOrderProgressParts(row).served;
              return (
                <div key={row.contract_id} data-testid="ec-cartao" className={CARTAO}>
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <button
                        type="button"
                        className={ABRIR}
                        onClick={() => p.onAbrir(row)}
                        aria-label={`Abrir ${numero} · ${row.client_name || "sem cliente"}`}
                      >
                        {row.client_name || "—"}
                      </button>
                      <span className="block font-mono text-[12.5px] text-muted-foreground">
                        {numero}
                        {origem ? ` · ${origem.label}` : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-0.5">
                      <EcPilula tone={pilula.tone}>{pilula.texto}</EcPilula>
                      {/* Só o ⋯ (por cima do botão esticado): "Ver" é o próprio cartão e "PDF" está no menu (acoes compactas). */}
                      <span className="relative z-10">{p.acoes(row)}</span>
                    </span>
                  </span>
                  {estadoGeral ? (
                    <span className="text-[12.5px] text-muted-foreground" data-testid="ec-cartao-estado-geral">Estado geral: {estadoGeral}</span>
                  ) : null}
                  <span className="text-[13px] text-muted-foreground">{row.delivery_address?.trim() || "Sem morada"}</span>
                  {plano ? <span className="text-[13px] text-muted-foreground">{plano}</span> : null}
                  <span
                    className="block h-2 overflow-hidden rounded-full bg-muted"
                    role="progressbar"
                    aria-label={`Servido ${numero}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={servido}
                  >
                    <span className="block h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${servido}%` }} />
                  </span>
                  <span className="text-[13px] text-muted-foreground">
                    {rd?.lines_ready ?? 0} prontos · {servidas} servidos · {row.total_lines} linhas
                  </span>
                </div>
              );
            })}
          </Seccao>
        );
      })}
      {eliminadas.length > 0 ? (
        <Seccao titulo="Eliminadas" tone="neutral" n={eliminadas.length}>
          {eliminadas.map((row) => {
            const numero = row.order_number || row.contract_number;
            return (
              <div key={`deleted:${row.contract_id}`} data-testid="ec-cartao-eliminada" className={cn(CARTAO, "opacity-70")}>
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0">
                    <button type="button" className={ABRIR} onClick={() => p.onAbrirEliminada(row)} aria-label={`Ver ${numero} (eliminada)`}>
                      {row.client_name || "—"}
                    </button>
                    <span className="block font-mono text-[12.5px] text-muted-foreground">
                      {numero} · {p.origemEliminadaDe(row).label}
                    </span>
                  </span>
                  <EcPilula tone="neutral">Eliminada</EcPilula>
                </span>
                <span className="text-[13px] text-muted-foreground">{row.delivery_address || "Sem morada"}</span>
              </div>
            );
          })}
        </Seccao>
      ) : null}
    </div>
  );
}
