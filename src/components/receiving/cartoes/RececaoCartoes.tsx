// Receção dentro da moldura do novo Inventário (V.rec do artefacto vault/inventario-redesenho-completo.html):
// .scanbox (o campo de leitura), .note.bad (guias abertas com divergências), .bar (Nova guia · Receber numa encomenda ·
// Ler artigo a artigo + pesquisa) e "Por receber" em secções (.sect + .pill) com a grelha de cartões (.grid/.card).
//
// Só apresentação. Os dados, o estado e os handlers são os de src/pages/Receiving.tsx:
// - RececaoScanbox não tem campo próprio: veste o MESMO <ReceivingReadBar> (o mesmo ref da pistola, o mesmo resolveRead
//   → rpc_receiving_lookup / guia / PO, as mesmas mensagens e a mesma câmara) com CSS com âmbito.
// - PorReceberCartoes recebe exatamente as props do <PorReceberList> (os mesmos FiltrosRec, o mesmo receiveGate e o mesmo
//   onOpenPo) e agrupa com as funções de porReceber.ts (porReceber, grupoRececao, contagensRec…). "Tabela" mostra o
//   <PorReceberList> clássico que o ecrã passa em `tabela`.
// - O aviso das guias com divergências usa o mesmo número da fila do Hoje (rpc_inventory_today,
//   purchases.delivery_notes_with_divergences — a cache que a moldura já leu) e a mesma ação (Guias › Com divergências).
// Fora da moldura (InventarioEmbebido = false) nada disto é montado.
import { cloneElement, isValidElement, useId, useState, type MouseEvent, type ReactElement, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Filter, LayoutGrid, List, Plus, ScanLine, Search, ShoppingCart, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockedButton } from "@/components/inventory/ui/DisabledReason";
import { FilterPill } from "@/components/inventory/ui/FilterPills";
import { InventoryEmptyState } from "@/components/inventory/ui/InventoryEmptyState";
import { InventoryStatusBadge } from "@/components/inventory/ui/InventoryStatusBadge";
import { clientOrdersLink } from "@/components/inventory/ui/inventoryLinks";
import { toneBadge, type InventoryTone } from "@/components/inventory/ui/tones";
import { useInventoryToday } from "@/hooks/useInventoryToday";
import { cn } from "@/lib/utils";
import { PorReceberList, SeloExpedida, SeloNova, type PorReceberListProps } from "../PorReceberList";
import {
  GRUPOS_REC,
  contagensRec,
  dataEntregaEf,
  faltaPo,
  fmtDayMonth,
  fmtUn,
  grupoRececao,
  lineUnitLabel,
  novaConfirmacao,
  opcoesClientes,
  opcoesFornecedores,
  porReceber,
  seloRececao,
  type ChipRec,
  type GrupoRec,
  type ReceivablePo,
} from "../porReceber";

// ------------------------------------------------------------------ .scanbox (veste o ReceivingReadBar)

// O ReceivingReadBar é: div[role=search] > label[for=rec-ler] + div[data-rececao-leitor] (input#rec-ler, câmara, "Ir")
// + div[role=status]. O CSS só muda o aspeto (com os tokens do tema, claro e escuro) e prende-se ao atributo estável
// data-rececao-leitor (não à posição do div); o rótulo continua para os leitores de ecrã.
const SCAN_ICON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 7V5a2 2 0 0 1 2-2h2'/%3E%3Cpath d='M17 3h2a2 2 0 0 1 2 2v2'/%3E%3Cpath d='M21 17v2a2 2 0 0 1-2 2h-2'/%3E%3Cpath d='M7 21H5a2 2 0 0 1-2-2v-2'/%3E%3Cpath d='M7 12h10'/%3E%3C/svg%3E\")";
const SCANBOX_CSS = `
[data-rec-scanbox] label[for="rec-ler"]{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
[data-rec-scanbox] [data-rececao-leitor]{display:flex;align-items:center;gap:12px;border-radius:20px;border:2px dashed hsl(var(--primary));background:hsl(var(--card));padding:8px 16px}
[data-rec-scanbox] [data-rececao-leitor]:focus-within{outline:2px solid hsl(var(--ring));outline-offset:2px}
[data-rec-scanbox] [data-rececao-leitor]::before{content:"";order:-1;flex:none;width:22px;height:22px;background:hsl(var(--primary));-webkit-mask:${SCAN_ICON} center/contain no-repeat;mask:${SCAN_ICON} center/contain no-repeat}
[data-rec-scanbox] [data-rececao-leitor]::after{content:"Enter";content:"Enter"/"";order:1;flex:none;font:12.5px ui-monospace,SFMono-Regular,Menlo,monospace;color:hsl(var(--muted-foreground))}
[data-rec-scanbox] [data-rececao-leitor]>button{order:2}
[data-rec-scanbox] #rec-ler{order:0;height:auto;min-height:52px;border:0;background:transparent;padding-left:0;padding-right:0;font-size:17px;font-weight:600;box-shadow:none}
[data-rec-scanbox] #rec-ler:focus,[data-rec-scanbox] #rec-ler:focus-visible{outline:none;box-shadow:none}
@media (max-width:480px){[data-rec-scanbox] [data-rececao-leitor]::after{display:none}}
`;

/** O campo de leitura grande (.scanbox): recebe o <ReceivingReadBar> do ecrã e só lhe muda o aspeto. */
export function RececaoScanbox({ children }: { children: ReactNode }) {
  return (
    <div data-rec-scanbox="" data-testid="rec-scanbox">
      <style>{SCANBOX_CSS}</style>
      {/* A pista à vista (o rótulo do campo fica só para os leitores de ecrã). */}
      <p className="mb-1.5 px-1 text-xs text-muted-foreground" data-testid="rec-scanbox-pista">
        Ler código ou escrever nº PO / guia / SKU
      </p>
      {children}
    </div>
  );
}

// ------------------------------------------------------------------ .note.bad + .bar

export interface RececaoBarraProps {
  /** "Nova guia": motivo do bloqueio (null = livre) e a ação do ecrã (openNewNote). */
  novaGuia: { motivo: string | null; abrir: () => void };
  /** "Receber numa encomenda": a mesma ligação do cabeçalho (purchaseOrdersLink) e o mesmo gate (purchase_orders.view). */
  receberEncomenda: { ligacao: string; motivo: string | null };
  /** "Ler artigo a artigo": switchView("leitor"). */
  aoLerArtigo: () => void;
  /** A pesquisa de "Por receber" (FiltrosRec.q). */
  pesquisa: string;
  aoPesquisar: (q: string) => void;
  /** Pode ver as guias (a mesma regra do separador Guias). */
  podeVerGuias: boolean;
  /** Abre Guias › Com divergências. */
  aoVerDivergentes: () => void;
}

const GHOST = "min-h-11 rounded-[14px] text-[14.5px] font-semibold";

/** O aviso vermelho das guias abertas com divergências (o número do Hoje). */
export function AvisoGuiasDivergentes({ podeVerGuias, aoVer }: { podeVerGuias: boolean; aoVer: () => void }) {
  const { data } = useInventoryToday({ enabled: podeVerGuias });
  const n = Number(data?.purchases?.delivery_notes_with_divergences ?? 0);
  if (!podeVerGuias || !(n > 0)) return null;
  return (
    <div
      role="status"
      data-testid="rec-aviso-divergencias"
      className="flex items-start gap-2.5 rounded-2xl bg-destructive/10 px-3.5 py-3 text-sm text-foreground dark:bg-destructive/20"
    >
      <AlertTriangle className="mt-0.5 h-[18px] w-[18px] shrink-0 text-red-700 dark:text-red-400" aria-hidden="true" />
      <div className="min-w-0">
        <b>
          {n} {n === 1 ? "guia aberta com divergências" : "guias abertas com divergências"}
        </b>{" "}
        · anunciado diferente do recebido.{" "}
        <button
          type="button"
          onClick={aoVer}
          className="min-h-6 rounded-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-violet-300"
        >
          {n === 1 ? "Abrir a guia" : "Ver as guias"}
        </button>
      </div>
    </div>
  );
}

export function RececaoBarra(p: RececaoBarraProps) {
  return (
    <div className="space-y-3">
      <AvisoGuiasDivergentes podeVerGuias={p.podeVerGuias} aoVer={p.aoVerDivergentes} />
      <div className="flex flex-wrap items-center gap-2" data-testid="rec-barra">
        <BlockedButton
          type="button"
          variant="ghost"
          className={GHOST}
          blockedReason={p.novaGuia.motivo}
          onClick={() => {
            if (!p.novaGuia.motivo) p.novaGuia.abrir();
          }}
        >
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          Nova guia
        </BlockedButton>
        {p.receberEncomenda.motivo ? (
          <BlockedButton type="button" variant="ghost" className={GHOST} blockedReason={p.receberEncomenda.motivo}>
            <ShoppingCart className="mr-2 h-4 w-4" aria-hidden="true" />
            Receber numa encomenda
          </BlockedButton>
        ) : (
          <Button asChild variant="ghost" className={GHOST}>
            <Link to={p.receberEncomenda.ligacao}>
              <ShoppingCart className="mr-2 h-4 w-4" aria-hidden="true" />
              Receber numa encomenda
            </Link>
          </Button>
        )}
        <Button type="button" variant="ghost" className={GHOST} onClick={p.aoLerArtigo}>
          <ScanLine className="mr-2 h-4 w-4" aria-hidden="true" />
          Ler artigo a artigo
        </Button>
        <label className="flex min-h-11 flex-[1_1_240px] items-center gap-2 rounded-[14px] border bg-card px-3 text-muted-foreground focus-within:ring-2 focus-within:ring-ring">
          <Search className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
          <input
            type="search"
            value={p.pesquisa}
            onChange={(e) => p.aoPesquisar(e.target.value)}
            placeholder="Pesquisar · fornecedor · cliente/obra"
            aria-label="Pesquisar encomendas por receber"
            className="min-w-0 flex-1 border-0 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ "Por receber" em secções

/** A ordem do artefacto (urgência primeiro) e a cor da pílula de cada secção. */
export const SECCOES_REC: readonly (readonly [GrupoRec, InventoryTone])[] = [
  [1, "bad"],
  [0, "ok"],
  [-1, "violet"],
  [2, "info"],
  [3, "neutral"],
  [4, "neutral"],
];

export type VistaPorReceber = "cartoes" | "tabela";

export interface PorReceberCartoesProps extends PorReceberListProps {
  /** O <PorReceberList> clássico (vista "Tabela"). */
  tabela: ReactNode;
}

// A vista (Cartões/Tabela) e o "Agrupar" da tabela ficam na sessão: sobrevivem a trocar de vista, de separador e a recarregar.
export const SESSAO_VISTA_REC = "olyvia.receiving.cartoes.vista";
export const SESSAO_AGRUPAR_REC = "olyvia.receiving.cartoes.agrupar";

function lerSessao(k: string): string | null {
  try {
    return window.sessionStorage.getItem(k);
  } catch {
    return null;
  }
}

function gravarSessao(k: string, v: string): void {
  try {
    window.sessionStorage.setItem(k, v);
  } catch {
    // Sem sessionStorage (modo privado, quota): fica só em memória.
  }
}

const SEG =
  "inline-flex min-h-9 items-center gap-1.5 rounded-[10px] px-3 text-[13.5px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const SECT = "mx-0.5 mb-2 mt-[18px] flex items-center gap-2 text-[12.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground";

const CHIPS: [Exclude<ChipRec, "todas">, string][] = [
  ["hoje", "Hoje/amanhã"],
  ["atrasadas", "Atrasadas"],
  ["clientes", "Para clientes"],
  ["stock", "Para stock"],
];

/** .pill do artefacto, com o ponto (nunca só cor: o texto diz o que é). */
export function PilulaRec({ tom, children }: { tom: InventoryTone; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12.5px] font-semibold normal-case tracking-normal",
        toneBadge[tom],
      )}
    >
      <span className="h-[7px] w-[7px] rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  );
}

/** "Para": "Cliente (EC-…)" ou "Stock" (o mesmo destino que o OrigemChipRec da tabela). */
export function paraTexto(po: ReceivablePo): string {
  if (!po.contractId) return "Stock";
  if (!po.origin) return "Encomenda de cliente";
  return po.origin.clientName ? `${po.origin.clientName} (${po.origin.number})` : po.origin.number;
}

/** Quantas linhas o cartão mostra em "Falta" (o resto fica em "+N linhas"). */
export const FALTA_MAX_LINHAS = 3;

/** A unidade da linha com a mesma regra do lineIntegerOnly: a da linha se tiver uom_id, senão a do produto. */
const unidadeLinha = (l: ReceivablePo["lines"][number]) =>
  lineUnitLabel({ uomCode: l.uomId ? l.uomCode : (l.productUomCode ?? null), unitsPerUom: l.unitsPerUom });

/** "Falta": as primeiras linhas com falta, na unidade da linha, e "+N linhas" (o total de faltaPo, o do textoFalta). */
export function faltaTexto(po: ReceivablePo, max = FALTA_MAX_LINHAS): string {
  const L = po.lines.filter((l) => l.open > 0);
  if (!L.length) return "nada";
  const txt = L.slice(0, max)
    .map((l) => `${fmtUn(l.open)} ${unidadeLinha(l)} ${l.name}`)
    .join(", ");
  const resto = faltaPo(po).linhas - Math.min(L.length, max);
  return resto > 0 ? `${txt} +${resto} ${resto === 1 ? "linha" : "linhas"}` : txt;
}

/** "Portal: {selo} · entrega {data}" no portal; fora dele "{selo} · entrega {data}". */
export function portalEntregaTexto(po: ReceivablePo): string {
  const noPortal = po.status !== "pending" && !!po.publication && po.publication.status !== "withdrawn";
  const d = dataEntregaEf(po);
  const entrega = d ? `entrega ${fmtDayMonth(d)}` : "sem data de entrega";
  // Fora do portal o selo (ex.: "Enviada por email", "Sem envio registado") continua visível: nada se perde face à tabela.
  return noPortal ? `Portal: ${seloRececao(po)[0]} · ${entrega}` : `${seloRececao(po)[0]} · ${entrega}`;
}

interface CartaoRecProps {
  po: ReceivablePo;
  today: string;
  canReceive: boolean;
  receiveReason?: string;
  onOpenPo: (id: string) => void;
  ativo: boolean;
}

function CartaoRec({ po, today, canReceive, receiveReason, onOpenPo, ativo }: CartaoRecProps) {
  // Hoje a linha só abre pelo "Dar entrada →" (com o receiveGate): o cartão faz o mesmo e, sem permissão, não abre.
  const abre = canReceive;
  const nova = novaConfirmacao(po, today);
  return (
    <article
      data-testid="rec-cartao"
      data-po={po.id}
      id={`rec-cartao-${po.id}`}
      className={cn(
        "group relative flex flex-col gap-2.5 rounded-[20px] border bg-card px-4 py-[15px] text-card-foreground shadow-sm transition-[transform,border-color] duration-150",
        abre && "hover:-translate-y-0.5 hover:border-primary focus-within:border-primary motion-reduce:hover:translate-y-0",
        ativo && "border-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.15)]",
      )}
    >
      {/* O cartão inteiro abre o painel "Dar entrada": um botão por baixo do conteúdo (as ações ficam por cima com z-10). */}
      {abre && (
        <button
          type="button"
          data-testid="rec-cartao-abrir"
          onClick={() => onOpenPo(po.id)}
          aria-label={`Abrir ${po.orderNumber} · ${po.supplierName}`}
          className="absolute inset-0 rounded-[20px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        />
      )}
      <div className="pointer-events-none relative flex items-start justify-between gap-2">
        <span className="min-w-0 text-[15.5px] font-bold leading-snug">{po.supplierName || "Sem fornecedor"}</span>
        {/* O nº seleciona-se (para copiar); um clique simples, sem seleção, continua a abrir o cartão. */}
        <span
          data-testid="rec-cartao-numero"
          className="pointer-events-auto relative z-10 shrink-0 cursor-text select-text font-mono text-[12.5px] text-muted-foreground"
          onClick={(e: MouseEvent<HTMLSpanElement>) => {
            const sel = window.getSelection();
            if (abre && (!sel || sel.isCollapsed || !e.currentTarget.contains(sel.anchorNode))) onOpenPo(po.id);
          }}
        >
          {po.orderNumber}
        </span>
      </div>
      {(po.shipped || nova) && (
        <div className="pointer-events-none relative flex flex-wrap gap-1.5">
          <SeloExpedida po={po} />
          {nova ? <SeloNova /> : null}
        </div>
      )}
      <p className="pointer-events-none relative text-[13px] text-muted-foreground" data-testid="rec-cartao-para">
        Para:{" "}
        {po.contractId ? (
          <Link
            to={clientOrdersLink({ open: po.contractId })}
            onClick={(e) => e.stopPropagation()}
            className="pointer-events-auto relative z-10 rounded-sm font-[550] text-foreground underline-offset-2 hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {paraTexto(po)}
          </Link>
        ) : (
          "Stock"
        )}{" "}
        · {portalEntregaTexto(po)}
      </p>
      <p className="pointer-events-none relative text-[13px] text-muted-foreground" data-testid="rec-cartao-falta">
        Falta: {faltaTexto(po)}
      </p>
      <div className="relative flex flex-wrap items-center justify-end gap-2">
        {!canReceive && <small className="pointer-events-none text-xs text-muted-foreground">Modo consulta</small>}
        <div className="relative z-10">
          <BlockedButton
            type="button"
            size="sm"
            className="min-h-9 rounded-[12px] px-4"
            blockedReason={canReceive ? null : (receiveReason ?? "Sem permissão")}
            aria-label={`Receber ${po.orderNumber}`}
            onClick={() => {
              if (canReceive) onOpenPo(po.id);
            }}
          >
            Receber
          </BlockedButton>
        </div>
      </div>
    </article>
  );
}

/** "Por receber" na moldura: Cartões (secções pela urgência) ou Tabela (a lista clássica). */
export function PorReceberCartoes(p: PorReceberCartoesProps) {
  const { pos, loading, error, noPermission, today, f, setF, canReceive, receiveReason, onOpenPo, activeId, onRetry, tabela } = p;
  const [vista, setVistaEstado] = useState<VistaPorReceber>(() => (lerSessao(SESSAO_VISTA_REC) === "tabela" ? "tabela" : "cartoes"));
  const setVista = (v: VistaPorReceber) => {
    setVistaEstado(v);
    gravarSessao(SESSAO_VISTA_REC, v);
  };
  const [agrupar, setAgruparEstado] = useState(() => lerSessao(SESSAO_AGRUPAR_REC) === "1");
  const aoMudarAgrupar = (v: boolean) => {
    setAgruparEstado(v);
    gravarSessao(SESSAO_AGRUPAR_REC, v ? "1" : "0");
  };
  const [filtrosAbertos, setFiltrosAbertos] = useState(() => !!(f.sup || f.cli));
  const id = useId();
  const nFiltros = [f.sup, f.cli].filter(Boolean).length + (f.chip !== "todas" ? 1 : 0);

  const alternador = (
    <div role="group" aria-label="Vista" className="ml-auto inline-flex rounded-[14px] border bg-card p-1">
      <button
        type="button"
        aria-pressed={vista === "cartoes"}
        onClick={() => setVista("cartoes")}
        className={cn(SEG, vista === "cartoes" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted")}
      >
        <LayoutGrid className="h-4 w-4" aria-hidden="true" />
        Cartões
      </button>
      <button
        type="button"
        aria-pressed={vista === "tabela"}
        onClick={() => setVista("tabela")}
        className={cn(SEG, vista === "tabela" ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted")}
      >
        <List className="h-4 w-4" aria-hidden="true" />
        Tabela
      </button>
    </div>
  );

  if (vista === "tabela") {
    return (
      <div className="space-y-3">
        <div className="flex">{alternador}</div>
        {/* O "Agrupar" vem daqui (sessão) para não se perder ao trocar de vista; outra coisa em `tabela` passa tal e qual. */}
        {isValidElement(tabela) && tabela.type === PorReceberList
          ? cloneElement(tabela as ReactElement<PorReceberListProps>, { agrupar, aoMudarAgrupar })
          : tabela}
      </div>
    );
  }

  const lista = porReceber(pos, f, today);
  const n = contagensRec(pos, f, today);

  let corpo: ReactNode;
  if (noPermission) {
    corpo = (
      <InventoryEmptyState
        title="Sem permissão para ver encomendas"
        description="Ver as encomendas por receber requer a permissão purchase_orders.view. Pode continuar a ler artigo a artigo e a consultar as guias."
      />
    );
  } else if (loading) {
    corpo = (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-2.5" aria-busy="true">
        <Skeleton className="h-36 rounded-[20px]" />
        <Skeleton className="h-36 rounded-[20px]" />
        <Skeleton className="h-36 rounded-[20px]" />
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
          f.sup || f.cli || f.q.trim() || f.chip !== "todas" || f.ids.length
            ? "Nenhuma encomenda com estes filtros."
            : "Não há encomendas a fornecedor por receber."
        }
      />
    );
  } else {
    corpo = SECCOES_REC.map(([g, tom]) => {
      const L = lista.filter((po) => grupoRececao(po, today) === g);
      if (!L.length) return null;
      return (
        <section key={g} aria-label={`${GRUPOS_REC[g]} · ${L.length}`} data-testid="rec-seccao" data-grupo={g}>
          <h3 className={SECT}>
            <PilulaRec tom={tom}>{GRUPOS_REC[g]}</PilulaRec>
            <span className="font-semibold normal-case tracking-normal">
              {L.length} {L.length === 1 ? "encomenda" : "encomendas"}
            </span>
          </h3>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-2.5">
            {L.map((po) => (
              <CartaoRec
                key={po.id}
                po={po}
                today={today}
                canReceive={canReceive}
                receiveReason={receiveReason}
                onOpenPo={onOpenPo}
                ativo={po.id === activeId}
              />
            ))}
          </div>
        </section>
      );
    });
  }

  const fornecedores = opcoesFornecedores(pos);
  const clientes = opcoesClientes(pos);

  return (
    <section aria-label={`Encomendas por receber · ${n.todas}`} className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          aria-expanded={filtrosAbertos}
          aria-controls={`${id}-filtros`}
          onClick={() => setFiltrosAbertos((v) => !v)}
          className={cn("min-h-11 rounded-[14px]", filtrosAbertos && "bg-muted")}
        >
          <SlidersHorizontal className="mr-2 h-4 w-4" aria-hidden="true" />
          Filtros
          {nFiltros > 0 && (
            <span className="ml-1.5 rounded-full bg-primary px-1.5 text-xs leading-5 text-primary-foreground">
              {nFiltros}
              <span className="sr-only"> ativos</span>
            </span>
          )}
        </Button>
        {alternador}
      </div>
      {filtrosAbertos && (
        <div id={`${id}-filtros`} role="region" aria-label="Filtros" className="mt-2 space-y-3 rounded-[20px] border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Ver">
            {CHIPS.map(([k, t]) => (
              <FilterPill
                key={k}
                pressed={f.chip === k}
                count={loading ? null : n[k]}
                onClick={() => setF({ ...f, chip: f.chip === k ? "todas" : k })}
              >
                {t}
              </FilterPill>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={`${id}-sup`}>Fornecedor</Label>
              <NativeSelect
                id={`${id}-sup`}
                value={f.sup}
                onValueChange={(v) => setF({ ...f, sup: v })}
                options={[{ value: "", label: "Todos" }, ...fornecedores.map(([v, t]) => ({ value: v, label: t }))]}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${id}-cli`}>Cliente/obra</Label>
              <NativeSelect
                id={`${id}-cli`}
                value={f.cli}
                onValueChange={(v) => setF({ ...f, cli: v })}
                options={[{ value: "", label: "Todos" }, ...clientes.map(([v, t]) => ({ value: v, label: t }))]}
              />
            </div>
          </div>
        </div>
      )}
      {f.ids.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <InventoryStatusBadge tone="info">
            <Filter className="h-3 w-3" aria-hidden="true" />
            Leitura «{f.lido}»: {f.ids.length} {f.ids.length === 1 ? "encomenda" : "encomendas"}
          </InventoryStatusBadge>
          <Button type="button" variant="outline" size="sm" onClick={() => setF({ ...f, ids: [], lido: "" })}>
            Tirar filtro
          </Button>
        </div>
      )}
      <div className={cn(noPermission || loading || error || lista.length === 0 ? "pt-3" : undefined)}>{corpo}</div>
    </section>
  );
}
