// O "E se…?" do novo Inventário (fatia 3; mockup: .whatif): mostra o impacto ANTES de aplicar, sem gravar nada. O botão no
// fim só leva ao ecrã clássico, que faz a ação como hoje.
//
// · Receção (a PO do botão principal "Receber PO-x"): por linha em falta, o stock da organização agora e depois, e quanto
//   fica reservado para a EC. Leituras: stocks (como o painel do produto) e rpc_preview_po_receipt — os mesmos parâmetros do
//   PoReceivePanel.tsx ({ p_purchase_order_id, p_lines: [{ purchase_order_item_id, quantity }], p_warehouse_id }), só em POs de
//   cliente e com as permissões de receção (a RPC exige-as). Aqui não se escolhe o armazém: p_warehouse_id vai vazio e a RPC
//   usa o dela; na Receção escolhe-se o armazém.
//   O que vai para a EC não entra no stock livre (rpc_receive_purchase_order_lines só cria movimento para units_to_stock):
//   depois = agora + units_to_stock. Numa PO de cliente sem a pré-visualização, não se adivinha a repartição.
// · Saída (o "Dar saída" do botão principal): as ECs prontas (rpc_client_order_list_readiness, a mesma cache da lista) e, para
//   a escolhida, rpc_get_client_order_document (a mesma do ecrã) + getProductExitGroup/confirmableQty (clientOrderExit.ts):
//   de que armazém sai cada produto (a sugestão da EC, como o "Confirmar todas" sem armazém escolhido) e o stock que fica.
import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BlockedButton } from "@/components/inventory/ui/DisabledReason";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useProductBaseUomCodes } from "@/hooks/useProductBaseUomCodes";
import { requiresIntegerQty } from "@/utils/quotes/integerQty";
import { clientOrderReadinessQueryKey, fetchClientOrderReadiness } from "@/components/client-orders/clientOrderList";
import {
  getProductExitGroup,
  isStockExitConfirmable,
  roundQty,
  type ClientOrderDocumentLine,
} from "@/components/client-orders/clientOrderExit";
import { fmtUn, type ReceivablePo } from "@/components/receiving/porReceber";
import { linkSaida } from "./anularInventario";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const toNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/* ------------------------------------------------------------------ contas puras (testáveis) */
export interface PrevisaoLinhaPo {
  purchase_order_item_id: string;
  units_to_order?: number | null;
  units_to_stock?: number | null;
  contract_order_number?: string | null;
  allocation_reason?: string | null;
}

export interface LinhaESeRececao {
  id: string;
  nome: string;
  /** O que entra, em unidades de stock (o que falta × unidades por embalagem). */
  entra: number;
  agora: number | null;
  /** null = não se sabe (PO de cliente sem a repartição). */
  depois: number | null;
  paraEc: number;
  ec: string | null;
}

/** As linhas do "E se receberes isto?": as que faltam receber, tudo o que falta. */
export function contasRececao(
  po: ReceivablePo,
  stockPorProduto: ReadonlyMap<string, number> | null,
  previsao: ReadonlyMap<string, PrevisaoLinhaPo> | null,
): LinhaESeRececao[] {
  return po.lines.filter((l) => l.open > 0).map((l) => {
    const entra = roundQty(l.open * (l.unitsPerUom || 1));
    const pv = previsao?.get(l.id) ?? null;
    const agora = stockPorProduto ? (stockPorProduto.get(l.productId) ?? 0) : null;
    const paraStock = pv ? toNum(pv.units_to_stock) : po.contractId ? null : entra;
    return {
      id: l.id,
      nome: l.name,
      entra,
      agora,
      depois: agora === null || paraStock === null ? null : roundQty(agora + paraStock),
      paraEc: pv ? toNum(pv.units_to_order) : 0,
      ec: pv?.contract_order_number ?? po.origin?.number ?? null,
    };
  });
}

export interface SaidaArmazem {
  armazem: string;
  sai: number;
  agora: number;
  depois: number;
}
export interface ProdutoESeSaida {
  productId: string;
  nome: string;
  quantidade: number;
  /** null = não sai (sem armazém que cubra, ou decimais num produto que se conta). */
  de: SaidaArmazem[] | null;
  porque?: string;
}

/** Por produto com linhas prontas a sair: a sugestão da EC (getProductExitGroup), como o "Confirmar todas" sem armazém escolhido. */
export function contasSaida(lines: readonly ClientOrderDocumentLine[], inteiro: (productId: string) => boolean): { produtos: ProdutoESeSaida[]; aEspera: string[] } {
  const docLines = lines as ClientOrderDocumentLine[];
  const ids = Array.from(new Set(docLines.filter(isStockExitConfirmable).map((l) => l.product_id as string)));
  const produtos = ids.map((pid): ProdutoESeSaida => {
    const g = getProductExitGroup(pid, docLines, inteiro);
    const nome = docLines.find((l) => l.product_id === pid)?.product_name || "Produto";
    if (!(g.quantity > 0)) return { productId: pid, nome, quantidade: g.quantity, de: null, porque: "Nada reservado para sair." };
    if (g.integer && !Number.isInteger(g.quantity)) {
      return { productId: pid, nome, quantidade: g.quantity, de: null, porque: "Conta-se em unidades inteiras: não sai assim." };
    }
    if (!g.suggested || g.suggested.length === 0) {
      return { productId: pid, nome, quantidade: g.quantity, de: null, porque: `Nenhum armazém cobre ${fmtUn(g.quantity)}: fica pendente.` };
    }
    const de = g.suggested.map((a) => {
      const wh = g.options.find((o) => o.warehouse_id === a.warehouse_id);
      const agora = toNum(wh?.quantity);
      return { armazem: wh?.warehouse_name ?? "Armazém", sai: a.quantity, agora, depois: roundQty(agora - a.quantity) };
    });
    return { productId: pid, nome, quantidade: g.quantity, de };
  });
  const aEspera = Array.from(new Set(docLines
    .filter((l) => l.item_type === "product" && (l.line_status === "a_aguardar_encomenda" || l.line_status === "sem_fornecedor"))
    .map((l) => l.product_name || "Produto")));
  return { produtos, aEspera };
}

/* ------------------------------------------------------------------ a moldura */
function Caixa({ titulo, children, rodape }: { titulo: string; children: ReactNode; rodape: ReactNode }) {
  return (
    <section aria-label={titulo} data-testid="e-se" className="space-y-2 rounded-2xl border border-primary/60 bg-primary/[0.06] px-3.5 py-3">
      <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.12em] text-primary">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />{titulo}
      </h4>
      {children}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-primary/20 pt-2">
        <p className="text-xs text-muted-foreground">Nada é gravado aqui.</p>
        {rodape}
      </div>
    </section>
  );
}

const Carregar = () => (
  <div className="space-y-1.5" aria-busy="true" aria-label="A calcular">
    <Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-4/5" />
  </div>
);

interface Ir {
  /** Motivo para não seguir (o gate do botão principal); null = pode. */
  bloqueio: string | null;
  ir: (to: string) => void;
}

/* ------------------------------------------------------------------ receção */
function ESeRececao({ po, orgId, podePrever, bloqueio, ir, to }: Ir & { po: ReceivablePo; orgId: string; podePrever: boolean; to: string }) {
  const abertas = po.lines.filter((l) => l.open > 0);
  const produtos = Array.from(new Set(abertas.map((l) => l.productId)));
  const stocks = useQuery({
    queryKey: ["inventario-novo-ese-stocks", orgId, produtos.join(",")],
    enabled: produtos.length > 0,
    staleTime: 10_000,
    queryFn: async (): Promise<Map<string, number>> => {
      const { data, error } = await db
        .from("stocks")
        .select("product_id, quantity, warehouses!inner(deleted_at)")
        .eq("organization_id", orgId)
        .in("product_id", produtos)
        .is("deleted_at", null)
        .is("warehouses.deleted_at", null);
      if (error) throw error;
      const m = new Map<string, number>();
      for (const r of (data ?? []) as Array<{ product_id: string; quantity: unknown }>) m.set(r.product_id, roundQty((m.get(r.product_id) ?? 0) + toNum(r.quantity)));
      return m;
    },
  });
  const linhasPedido = abertas.map((l) => ({ purchase_order_item_id: l.id, quantity: l.open }));
  const preve = podePrever && !!po.contractId && linhasPedido.length > 0;
  const previsao = useQuery({
    queryKey: ["inventario-novo-ese-po", po.id, linhasPedido.map((x) => `${x.purchase_order_item_id}:${x.quantity}`).join("|")],
    enabled: preve,
    staleTime: 10_000,
    retry: false,
    queryFn: async (): Promise<Map<string, PrevisaoLinhaPo>> => {
      // Os parâmetros do PoReceivePanel.tsx; p_warehouse_id vazio (a Receção é que escolhe o armazém).
      const { data, error } = await supabase.rpc("rpc_preview_po_receipt", {
        p_purchase_order_id: po.id,
        p_lines: linhasPedido,
        p_warehouse_id: undefined,
      });
      if (error) throw error;
      const r = (data ?? {}) as { lines?: PrevisaoLinhaPo[] };
      return new Map((r.lines ?? []).map((l) => [l.purchase_order_item_id, l]));
    },
  });
  const linhas = contasRececao(po, stocks.data ?? null, previsao.data ?? null);
  const para = po.origin?.clientName || po.origin?.number || null;
  return (
    <Caixa titulo="E se receberes isto?" rodape={
      <BlockedButton type="button" size="sm" className="min-h-9 rounded-xl" blockedReason={bloqueio} onClick={() => ir(to)}>Receber {po.orderNumber}</BlockedButton>
    }>
      <p className="text-sm text-muted-foreground">{po.orderNumber} · {po.supplierName}{para ? ` · para ${para}` : po.contractId ? "" : " · para stock"}</p>
      {stocks.isLoading ? <Carregar /> : (
        <ul className="space-y-1 pl-4 text-sm [list-style:disc]">
          {linhas.map((l) => (
            <li key={l.id} data-testid={`e-se-linha-${l.id}`}>
              <span className="font-medium">{l.nome}</span>:{" "}
              {l.agora !== null && l.depois !== null ? (
                <>stock {fmtUn(l.agora)} → <b>{fmtUn(l.depois)}</b></>
              ) : (
                <>entra {fmtUn(l.entra)}</>
              )}
              {l.paraEc > 0 && <span className="text-violet-700 dark:text-violet-300"> · {fmtUn(l.paraEc)} reservadas para {l.ec ?? para ?? "a EC"}</span>}
            </li>
          ))}
        </ul>
      )}
      {po.contractId && !podePrever && (
        <p className="text-xs text-muted-foreground">A repartição entre a EC e o stock vê-se na Receção (precisa das permissões de receção).</p>
      )}
      {preve && previsao.isFetching && !previsao.data && <p className="text-xs text-muted-foreground">A calcular a repartição…</p>}
      {previsao.error && <p className="text-xs text-destructive">Não foi possível calcular a repartição.</p>}
      {stocks.error && <p className="text-xs text-destructive">Não foi possível ler o stock.</p>}
    </Caixa>
  );
}

/* ------------------------------------------------------------------ saída */
function ESeSaida({ orgId, bloqueio, ir, to }: Ir & { orgId: string; to: string }) {
  const prontidao = useQuery({
    queryKey: clientOrderReadinessQueryKey(orgId),
    queryFn: () => fetchClientOrderReadiness(orgId),
    staleTime: 60 * 1000,
    retry: false,
  });
  const prontas = Object.values(prontidao.data ?? {}).filter((r) => r.is_ready).map((r) => r.contract_id);
  const [i, setI] = useState(0);
  const k = prontas.length ? Math.min(i, prontas.length - 1) : 0;
  const contrato = prontas[k] ?? null;
  const doc = useQuery({
    queryKey: ["inventario-novo-ese-ec", contrato],
    enabled: !!contrato,
    staleTime: 10_000,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("rpc_get_client_order_document", { p_contract_id: contrato as string });
      if (error) throw error;
      return data as unknown as { order_number?: string | null; contract_number?: string | null; client_name?: string | null; lines?: ClientOrderDocumentLine[] | null } | null;
    },
  });
  const lines = doc.data?.lines ?? [];
  const uom = useProductBaseUomCodes(lines.map((l) => l.product_id));
  // A mesma regra do ClientOrders.tsx (stockExitRequiresInteger).
  const inteiro = (productId: string) => requiresIntegerQty({ hasProduct: true, baseUomCode: uom.getBaseCode(productId) });
  const contas = doc.data ? contasSaida(lines, inteiro) : null;
  const numero = doc.data?.order_number || doc.data?.contract_number || "a EC";

  return (
    <Caixa titulo="E se confirmares a saída?" rodape={
      <BlockedButton type="button" size="sm" className="min-h-9 rounded-xl" blockedReason={bloqueio} onClick={() => ir(contrato ? linkSaida(contrato) : to)}>
        {contrato ? `Abrir ${numero}` : "Ver as prontas"}
      </BlockedButton>
    }>
      {prontidao.isLoading || (contrato && doc.isLoading) ? <Carregar /> : prontidao.error || doc.error ? (
        <p className="text-sm text-destructive">Não foi possível ler a encomenda.</p>
      ) : !contrato ? (
        <p className="text-sm text-muted-foreground">Nenhuma encomenda pronta a sair.</p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 text-sm text-muted-foreground">{numero}{doc.data?.client_name ? ` · ${doc.data.client_name}` : ""}</p>
            {prontas.length > 1 && (
              <div className="flex shrink-0 items-center gap-0.5 text-xs tabular-nums text-muted-foreground">
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Encomenda anterior" disabled={k === 0} onClick={() => setI(k - 1)}>
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <span aria-live="polite">{k + 1} de {prontas.length}</span>
                <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Encomenda seguinte" disabled={k >= prontas.length - 1} onClick={() => setI(k + 1)}>
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            )}
          </div>
          <ul className="space-y-1 pl-4 text-sm [list-style:disc]">
            {contas?.produtos.map((p) => (
              <li key={p.productId} data-testid={`e-se-produto-${p.productId}`}>
                <span className="font-medium">{fmtUn(p.quantidade)} {p.nome}</span>
                {p.de ? p.de.map((d, j) => (
                  <span key={j}>{j === 0 ? " sai de " : "; e de "}<b>{d.armazem}</b>{": "}{fmtUn(d.sai)} · stock {fmtUn(d.agora)} → <b>{fmtUn(d.depois)}</b></span>
                )) : <span className="text-amber-800 dark:text-amber-300"> · {p.porque}</span>}
              </li>
            ))}
            {!!contas?.aEspera.length && <li className="text-muted-foreground">Fica à espera: {contas.aEspera.join(", ")}</li>}
          </ul>
        </>
      )}
    </Caixa>
  );
}

/* ------------------------------------------------------------------ o componente */
export type AcaoESe = { tipo: "receber"; po: ReceivablePo; to: string } | { tipo: "saida"; to: string };

export interface ESeInventarioProps extends Ir {
  acao: AcaoESe;
  orgId: string | null;
  /** As permissões de receção (o gate do botão principal "Receber"): sem elas, a pré-visualização da repartição não se pede. */
  podePrever: boolean;
}

export function ESeInventario({ acao, orgId, podePrever, bloqueio, ir }: ESeInventarioProps) {
  if (!orgId) return null;
  return acao.tipo === "receber"
    ? <ESeRececao po={acao.po} orgId={orgId} podePrever={podePrever} bloqueio={bloqueio} ir={ir} to={acao.to} />
    : <ESeSaida orgId={orgId} bloqueio={bloqueio} ir={ir} to={acao.to} />;
}
