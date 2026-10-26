// Receção › "Por receber" (protótipo EncomendasPorReceber.tsx, dados reais de useReceivablePos): uma linha por encomenda
// a fornecedor, por ordem de chegada, com cabeçalhos de grupo (Chega hoje / amanhã · Atrasadas · Confirmadas pelo
// fornecedor · À espera do fornecedor · Por enviar ao fornecedor). Chips Hoje/amanhã · Atrasadas · Para clientes · Para
// stock (carregar outra vez no ativo volta a todas); "Filtros ▾" (pesquisa, fornecedor, cliente/obra — a PO não tem
// armazém); "Agrupar: Não/Fornecedor". "Dar entrada →" fica sempre à vista (coluna fixa à direita; no telemóvel cada
// encomenda é um cartão com o botão na largura toda). Sem receção (modo consulta) o botão fica desativado com o motivo.
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, ChevronDown, Clock, Filter, Info, Send, Sparkles, XCircle, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilterPill, InventoryEmptyState, InventoryStatusBadge, clientOrdersLink, type InventoryTone } from "@/components/inventory/ui";
import { cn } from "@/lib/utils";
import {
  GRUPOS_REC,
  atrasadaRec,
  blocosRec,
  contagensRec,
  dataEntregaEf,
  fmtDayMonth,
  fmtUn,
  grupoRececao,
  novaConfirmacao,
  opcoesClientes,
  opcoesFornecedores,
  porReceber,
  rotuloCliente,
  seloRececao,
  textoFalta,
  type AgruparRec,
  type ChipRec,
  type FiltrosRec,
  type ReceivablePo,
  type RecTone,
} from "./porReceber";

const ICONE_TOM: Record<RecTone, LucideIcon> = { ok: CheckCircle2, info: Info, warn: Send, bad: XCircle, violet: Info, neutral: Clock };

/** O selo do portal na Receção, com ícone e texto (nunca só cor). */
export function SeloRec({ po }: { po: ReceivablePo }) {
  const [t, tom] = seloRececao(po);
  const I = ICONE_TOM[tom];
  return (
    <InventoryStatusBadge tone={tom as InventoryTone}>
      <I className="h-3 w-3" aria-hidden="true" />
      {t}
    </InventoryStatusBadge>
  );
}

/** "NOVA": confirmada pelo fornecedor desde ontem. */
export function SeloNova() {
  return (
    <InventoryStatusBadge tone="violet">
      <Sparkles className="h-3 w-3" aria-hidden="true" />
      NOVA
    </InventoryStatusBadge>
  );
}

const CHIP_CLASS = "inline-flex max-w-[260px] items-center truncate rounded-md border bg-muted px-[7px] py-px text-xs font-[550] text-foreground";

/** "Para": "CT-… · Cliente" (abre a Encomenda Cliente) ou "Stock". */
export function OrigemChipRec({ po }: { po: ReceivablePo }) {
  if (!po.contractId) return <span className={CHIP_CLASS}>Stock</span>;
  const label = rotuloCliente(po);
  return (
    <Link
      to={clientOrdersLink({ open: po.contractId })}
      className={cn(CHIP_CLASS, "hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}
      title={label}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="truncate">{label}</span>
    </Link>
  );
}

/** A entrega: a data efetiva, com "Atrasada" (ícone e texto) se já passou. */
export function EntregaRec({ po, today }: { po: ReceivablePo; today: string }) {
  const d = dataEntregaEf(po);
  if (atrasadaRec(po, today)) {
    return (
      <InventoryStatusBadge tone="bad">
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
        Atrasada · {fmtDayMonth(d)}
      </InventoryStatusBadge>
    );
  }
  return <small className="text-muted-foreground">{d ? `entrega ${fmtDayMonth(d)}` : "sem data de entrega"}</small>;
}

const CHIPS: [Exclude<ChipRec, "todas">, string][] = [
  ["hoje", "Hoje/amanhã"],
  ["atrasadas", "Atrasadas"],
  ["clientes", "Para clientes"],
  ["stock", "Para stock"],
];

const GRUPO_ROW: Record<number, string> = {
  0: "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
  1: "bg-destructive/10 text-red-700 dark:text-red-400",
  2: "bg-sky-500/10 text-sky-800 dark:text-sky-300",
  3: "bg-muted text-muted-foreground",
  4: "bg-amber-500/10 text-amber-800 dark:text-amber-300",
};

export interface PorReceberListProps {
  pos: readonly ReceivablePo[];
  loading: boolean;
  error: string | null;
  /** Sem purchase_orders.view: a RLS esconderia tudo — diz-se isso, não "nada por receber". */
  noPermission: boolean;
  today: string;
  f: FiltrosRec;
  setF: (f: FiltrosRec) => void;
  /** Pode dar entrada (receiving.receive + purchase_orders.receive + inventory.edit). */
  canReceive: boolean;
  receiveReason?: string;
  onOpenPo: (id: string) => void;
  /** PO com o painel aberto (destaque). */
  activeId?: string | null;
  onRetry?: () => void;
}

export function PorReceberList({
  pos,
  loading,
  error,
  noPermission,
  today,
  f,
  setF,
  canReceive,
  receiveReason,
  onOpenPo,
  activeId,
  onRetry,
}: PorReceberListProps) {
  const [agrupar, setAgrupar] = useState<AgruparRec>("nao");
  const [filtrosAbertos, setFiltrosAbertos] = useState(() => !!(f.sup || f.cli || f.q));
  const lista = porReceber(pos, f, today);
  const n = contagensRec(pos, f, today);
  const nFiltros = [f.sup, f.cli, f.q.trim()].filter(Boolean).length;

  if (noPermission) {
    return (
      <InventoryEmptyState
        title="Sem permissão para ver encomendas"
        description="Ver as encomendas por receber requer a permissão purchase_orders.view. Pode continuar a ler artigo a artigo e a consultar as guias."
      />
    );
  }

  const dar = (po: ReceivablePo, wide = false) => (
    <Button
      type="button"
      size="sm"
      className={cn("whitespace-nowrap", wide && "h-11 w-full", !canReceive && "cursor-not-allowed opacity-50")}
      aria-disabled={!canReceive || undefined}
      title={canReceive ? undefined : receiveReason}
      aria-label={`Dar entrada ${po.orderNumber}`}
      onClick={() => {
        if (canReceive) onOpenPo(po.id);
      }}
    >
      Dar entrada →
    </Button>
  );

  const linhaDesktop = (po: ReceivablePo) => (
    <TableRow key={po.id} id={`rec-${po.id}`} className={cn("group", po.id === activeId && "bg-primary/5")}>
      <TableCell className="whitespace-nowrap">
        <b className="font-mono">{po.orderNumber}</b>
        {novaConfirmacao(po, today) ? (
          <>
            {" "}
            <SeloNova />
          </>
        ) : null}
      </TableCell>
      <TableCell>{po.supplierName}</TableCell>
      <TableCell>
        <OrigemChipRec po={po} />
      </TableCell>
      <TableCell>
        <span className="flex flex-wrap items-center gap-1.5">
          <SeloRec po={po} /> <EntregaRec po={po} today={today} />
        </span>
      </TableCell>
      <TableCell className="whitespace-nowrap text-right tabular-nums">{textoFalta(po)}</TableCell>
      <TableCell className="sticky right-0 z-10 whitespace-nowrap bg-card text-right shadow-[inset_1px_0_0_hsl(var(--border))]">
        {canReceive ? (
          dar(po)
        ) : (
          <span className="inline-flex flex-col items-end gap-0.5">
            {dar(po)}
            <small className="text-xs text-muted-foreground">Modo consulta</small>
          </span>
        )}
      </TableCell>
    </TableRow>
  );

  const cabGrupo = (L: ReceivablePo[], po: ReceivablePo, i: number): ReactNode => {
    const g = grupoRececao(po, today);
    if (i > 0 && grupoRececao(L[i - 1], today) === g) return null;
    const k = L.filter((x) => grupoRececao(x, today) === g).length;
    return (
      <TableRow key={`g-${g}`} className="hover:bg-transparent">
        <th colSpan={6} scope="colgroup" className={cn("px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide", GRUPO_ROW[g])}>
          {GRUPOS_REC[g]} <span className="font-normal">· {k}</span>
        </th>
      </TableRow>
    );
  };

  const tabela = (L: ReceivablePo[], titulo: string, grupos: boolean) => (
    <>
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <Table aria-label={titulo}>
          <TableHeader>
            <TableRow>
              <TableHead>Nº</TableHead>
              <TableHead>Fornecedor</TableHead>
              <TableHead>Para</TableHead>
              <TableHead>Portal · entrega</TableHead>
              <TableHead className="text-right">Falta</TableHead>
              <TableHead className="sticky right-0 bg-card text-right">
                <span className="sr-only">Ações</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>{L.flatMap((po, i) => [grupos ? cabGrupo(L, po, i) : null, linhaDesktop(po)])}</TableBody>
        </Table>
      </div>
      <ul className="space-y-2 md:hidden" aria-label={titulo}>
        {L.map((po, i) => {
          const g = grupoRececao(po, today);
          const head = grupos && (i === 0 || grupoRececao(L[i - 1], today) !== g);
          return (
            <li key={po.id} className="space-y-2">
              {head && (
                <p className={cn("rounded px-2 py-1 text-xs font-semibold uppercase tracking-wide", GRUPO_ROW[g])}>{GRUPOS_REC[g]}</p>
              )}
              <div className={cn("space-y-2 rounded-lg border bg-card p-3 text-sm", po.id === activeId && "border-primary")}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono font-semibold">
                      {po.orderNumber} {novaConfirmacao(po, today) ? <SeloNova /> : null}
                    </p>
                    <p className="truncate text-muted-foreground">{po.supplierName}</p>
                  </div>
                  <OrigemChipRec po={po} />
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <SeloRec po={po} /> <EntregaRec po={po} today={today} />
                  <span className="text-muted-foreground">· falta {textoFalta(po)}</span>
                </div>
                {dar(po, true)}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );

  let corpo: ReactNode;
  if (loading) {
    corpo = (
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  } else if (error) {
    corpo = (
      <InventoryEmptyState icon={AlertTriangle} title="Não foi possível carregar as encomendas" description={error}>
        {onRetry ? (
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Tentar de novo
          </Button>
        ) : null}
      </InventoryEmptyState>
    );
  } else if (lista.length === 0) {
    corpo = (
      <InventoryEmptyState
        title="Nada por receber"
        description={
          nFiltros || f.chip !== "todas" || f.ids.length
            ? "Nenhuma encomenda com estes filtros."
            : "Não há encomendas a fornecedor por receber."
        }
      />
    );
  } else if (agrupar === "nao") {
    corpo = tabela(lista, "Encomendas por receber, por ordem de chegada", true);
  } else {
    corpo = blocosRec(lista, today).map((b) => (
      <section key={b.chave || "sem"} aria-label={b.titulo} className="space-y-2 rounded-lg border p-3">
        <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          {b.titulo} — falta {fmtUn(b.falta)} un · {b.pos.length} {b.pos.length === 1 ? "encomenda" : "encomendas"}
          {b.atrasada ? (
            <InventoryStatusBadge tone="bad">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              Atrasada
            </InventoryStatusBadge>
          ) : null}
        </h3>
        {tabela(b.pos, `Encomendas por receber · ${b.titulo}`, false)}
      </section>
    ));
  }

  const fornecedores = opcoesFornecedores(pos);
  const clientes = opcoesClientes(pos);

  return (
    <section aria-label={`Encomendas por receber · ${n.todas}`} className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Ver">
          {CHIPS.map(([k, t]) => (
            <FilterPill key={k} pressed={f.chip === k} count={loading ? null : n[k]} onClick={() => setF({ ...f, chip: f.chip === k ? "todas" : k })}>
              {t}
            </FilterPill>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={filtrosAbertos}
          aria-controls="rec-filtros"
          onClick={() => setFiltrosAbertos((v) => !v)}
        >
          <Filter className="mr-1 h-4 w-4" aria-hidden="true" />
          Filtros{nFiltros ? ` (${nFiltros})` : ""}
          <ChevronDown className="ml-1 h-4 w-4" aria-hidden="true" />
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Label htmlFor="rec-agrupar" className="text-sm">
            Agrupar
          </Label>
          <div className="w-36">
            <NativeSelect
              id="rec-agrupar"
              className="h-9"
              value={agrupar}
              onValueChange={(v) => setAgrupar(v as AgruparRec)}
              options={[
                { value: "nao", label: "Não" },
                { value: "forn", label: "Fornecedor" },
              ]}
            />
          </div>
        </div>
      </div>
      {filtrosAbertos && (
        <div id="rec-filtros" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="rec-q">Pesquisar</Label>
            <Input
              id="rec-q"
              type="search"
              value={f.q}
              placeholder="Nº da PO, fornecedor, cliente ou contrato"
              onChange={(e) => setF({ ...f, q: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rec-sup">Fornecedor</Label>
            <NativeSelect
              id="rec-sup"
              value={f.sup}
              onValueChange={(v) => setF({ ...f, sup: v })}
              options={[{ value: "", label: "Todos" }, ...fornecedores.map(([v, t]) => ({ value: v, label: t }))]}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rec-cli">Cliente/obra</Label>
            <NativeSelect
              id="rec-cli"
              value={f.cli}
              onValueChange={(v) => setF({ ...f, cli: v })}
              options={[{ value: "", label: "Todos" }, ...clientes.map(([v, t]) => ({ value: v, label: t }))]}
            />
          </div>
        </div>
      )}
      {f.ids.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <InventoryStatusBadge tone="info">
            <Filter className="h-3 w-3" aria-hidden="true" />
            Leitura «{f.lido}»: {f.ids.length} {f.ids.length === 1 ? "encomenda" : "encomendas"}
          </InventoryStatusBadge>
          <Button type="button" variant="outline" size="sm" onClick={() => setF({ ...f, ids: [], lido: "" })}>
            Tirar filtro
          </Button>
        </div>
      )}
      {corpo}
    </section>
  );
}
