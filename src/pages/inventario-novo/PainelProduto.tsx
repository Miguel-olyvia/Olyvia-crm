// O painel do produto do novo Inventário (como o painel da direita do Estúdio da obra): no ecrã largo uma coluna à direita, abaixo
// de `sm` ocupa a área toda. Abre-se no separador Existências (ProcurarProduto) e vive no endereço (?painel=produto:<id>, painelUrl.ts).
//
// Só leituras que o Stocks.tsx já faz, para UM produto:
//  · products (nome, SKU, EAN);
//  · stocks do produto nos armazéns ativos (a mesma base do "Livre" do Stocks.tsx: stocks + warehouses!inner(deleted_at is null));
//  · rpc_get_product_stock_reservations({ p_organization_id, p_product_ids: [id] }) — a reserva é do PRODUTO ao nível da
//    organização (todos os armazéns), por isso Reservado e Livre são da organização, como na lista; Livre = stock − reservado;
//  · stock_movements (as colunas do StockMovementsHistoryDialog), só os 5 últimos.
// As ações são as mesmas da linha do Stocks.tsx: Movimento (inventory.edit, o mesmo StockMovementDialog com o produto — e o
// armazém, se for só um — pré-escolhidos) e Histórico (inventory.view → o separador Movimentos filtrado pelo produto).
//
// Sincronização com a lista de Existências (limitação conhecida): o Stocks.tsx guarda a lista em estado local, por isso as
// invalidações do react-query não a refrescam.
//  · Movimento feito AQUI → `aoMudarStock` (a moldura muda a `key` do ecrã embebido e o Stocks volta a ler tudo).
//  · Movimento feito numa linha do Stocks com o painel aberto → o Stocks não avisa ninguém; as leituras do painel voltam a
//    correr ao voltar à janela (refetchOnWindowFocus) e de 30 em 30 s enquanto o painel está aberto (REFRESCAR_MS). Até lá
//    os números do painel podem ficar atrás dos da lista.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, ListOrdered, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { inventoryTodayQueryKey } from "@/hooks/useInventoryToday";
import StockMovementDialog from "@/components/inventory/StockMovementDialog";
import { BlockedButton } from "@/components/inventory/ui/DisabledReason";
import { usePermissionGate } from "@/components/inventory/ui/RowActions";
import { clientOrdersLink, stockMovementsLink } from "@/components/inventory/ui/inventoryLinks";
import { movementTypeLabel, signedMovementQty } from "@/components/inventory/ui/movementTypes";
import { Button } from "@/components/ui/button";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { cn } from "@/lib/utils";
import { paraSeparador } from "./navegadorInventario";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

const toNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
/** O ruído de vírgula flutuante das quantidades decimais (o mesmo arredondamento do Stocks.tsx). */
const roundQty = (v: number): number => Math.round(v * 1e6) / 1e6;
const fmtQty = (v: number): string => new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 2 }).format(v);
const fmtData = (iso: string): string =>
  new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export interface LinhaStockProduto {
  id: string;
  warehouse_id: string;
  armazem: string;
  quantity: number;
  minimum_quantity: number;
  maximum_quantity: number;
  reorder_point: number;
  location: string | null;
}

export interface ReservaProduto {
  qty_reserved: number;
  qty_missing: number;
  orders_count: number;
}

export interface NumerosProduto {
  prateleira: number;
  reservado: number;
  livre: number;
  emFalta: number;
  encomendas: number;
}

/** Os números do topo, com a regra do Stocks.tsx (renderReservationCells): livre = stock da organização − reservado. */
export function numerosDoProduto(linhas: readonly LinhaStockProduto[], reserva: ReservaProduto | null): NumerosProduto {
  const prateleira = roundQty(linhas.reduce((s, l) => s + l.quantity, 0));
  const reservado = reserva?.qty_reserved ?? 0;
  return {
    prateleira,
    reservado,
    livre: roundQty(prateleira - reservado),
    emFalta: reserva?.qty_missing ?? 0,
    encomendas: reserva?.orders_count ?? 0,
  };
}

interface Movimento {
  id: string;
  movement_type: string;
  quantity: number;
  balance_after: number;
  document_number: string | null;
  warehouse_id: string | null;
  created_at: string;
}

const ULTIMOS = 5;
/** Ver o comentário do topo: o painel não sabe dos movimentos feitos nas linhas do Stocks.tsx. Só corre com o painel montado. */
const REFRESCAR_MS = 30 * 1000;
const REFRESCAR = { refetchOnWindowFocus: true, refetchInterval: REFRESCAR_MS } as const;

export const chavePainelProduto = (orgId: string | null, produtoId: string) => ["inventario-novo-produto", orgId, produtoId] as const;

function useDadosProduto(orgId: string | null, produtoId: string) {
  const base = chavePainelProduto(orgId, produtoId);
  const produto = useQuery({
    queryKey: [...base, "ficha"],
    enabled: !!orgId,
    ...REFRESCAR,
    queryFn: async () => {
      // Da organização ativa, como o Stocks.tsx e o StockMovementDialog: um id de outra empresa no endereço dá "não encontrado".
      const { data, error } = await db.from("products").select("id, name, sku, barcode").eq("id", produtoId).eq("organization_id", orgId).maybeSingle();
      if (error) throw error;
      return (data ?? null) as { id: string; name: string; sku: string | null; barcode: string | null } | null;
    },
  });
  const linhas = useQuery({
    queryKey: [...base, "stocks"],
    enabled: !!orgId,
    ...REFRESCAR,
    queryFn: async (): Promise<LinhaStockProduto[]> => {
      const { data, error } = await db
        .from("stocks")
        .select("id, warehouse_id, quantity, minimum_quantity, maximum_quantity, reorder_point, location, warehouses!inner(name, deleted_at)")
        .eq("organization_id", orgId)
        .eq("product_id", produtoId)
        .is("deleted_at", null)
        .is("warehouses.deleted_at", null)
        .order("quantity", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as Array<Record<string, unknown> & { warehouses?: { name?: string | null } | null }>).map((r) => ({
        id: String(r.id),
        warehouse_id: String(r.warehouse_id),
        armazem: r.warehouses?.name ?? "—",
        quantity: toNum(r.quantity),
        minimum_quantity: toNum(r.minimum_quantity),
        maximum_quantity: toNum(r.maximum_quantity),
        reorder_point: toNum(r.reorder_point),
        location: (r.location as string | null) ?? null,
      }));
    },
  });
  const reserva = useQuery({
    queryKey: [...base, "reserva"],
    enabled: !!orgId,
    ...REFRESCAR,
    queryFn: async (): Promise<ReservaProduto> => {
      const { data, error } = await db.rpc("rpc_get_product_stock_reservations", {
        p_organization_id: orgId,
        p_product_ids: [produtoId],
      });
      if (error) throw error;
      const r = ((data ?? []) as Array<Record<string, unknown>>).find((x) => x?.product_id === produtoId);
      return { qty_reserved: toNum(r?.qty_reserved), qty_missing: toNum(r?.qty_missing), orders_count: toNum(r?.orders_count) };
    },
  });
  const movimentos = useQuery({
    queryKey: [...base, "movimentos"],
    enabled: !!orgId,
    ...REFRESCAR,
    queryFn: async (): Promise<Movimento[]> => {
      const { data, error } = await db
        .from("stock_movements")
        .select("id, movement_type, quantity, balance_after, document_number, warehouse_id, created_at")
        .eq("organization_id", orgId)
        .eq("product_id", produtoId)
        .order("created_at", { ascending: false })
        .limit(ULTIMOS);
      if (error) throw error;
      return (data ?? []) as Movimento[];
    },
  });
  return { produto, linhas, reserva, movimentos };
}

function Numero({ rotulo, valor, tom, nota }: { rotulo: string; valor: number | null; tom?: "bad"; nota?: string }) {
  return (
    <div className="rounded-2xl bg-muted px-3 py-2.5">
      <p className="text-[12.5px] text-muted-foreground">{rotulo}</p>
      <p className={cn("text-2xl font-extrabold tabular-nums tracking-tight", tom === "bad" && "text-destructive")}
        data-testid={`numero-${rotulo}`}>
        {valor === null ? "—" : fmtQty(valor)}
      </p>
      {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
    </div>
  );
}

const Secao = ({ titulo, children }: { titulo: string; children: ReactNode }) => (
  <section className="space-y-2">
    <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">{titulo}</h3>
    {children}
  </section>
);

/** Esc fecha o painel com o foco nele, na moldura ou em lado nenhum; nunca com um diálogo aberto nem a escrever. */
export function escFechaPainel(e: Pick<KeyboardEvent, "key" | "defaultPrevented" | "target">, doc: Document = document): boolean {
  if (e.key !== "Escape" || e.defaultPrevented) return false;
  if (doc.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) return false;
  const alvo = e.target as HTMLElement | null;
  if (!alvo || typeof alvo.closest !== "function" || alvo === doc.body || alvo === doc.documentElement) return true;
  if (alvo.closest("input, textarea, select, [contenteditable=true]")) return false;
  return !!alvo.closest("[data-painel-produto], [data-moldura-inventario]");
}

const ABAIXO_DE_SM = "(max-width: 639.98px)";

/** Abaixo de `sm` o painel tapa a área toda: aí é um diálogo modal para o leitor de ecrã. */
function useAbaixoDeSm(): boolean {
  const ler = () => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(ABAIXO_DE_SM).matches;
  const [v, setV] = useState(ler);
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const m = window.matchMedia(ABAIXO_DE_SM);
    const mudou = () => setV(m.matches);
    mudou();
    m.addEventListener?.("change", mudou);
    return () => m.removeEventListener?.("change", mudou);
  }, []);
  return v;
}

/** O campo "Ver produto" (ProcurarProduto): para onde vai o foco quando quem abriu o painel já não existe. */
export const SELETOR_VER_PRODUTO = "[data-ver-produto]";

export function PainelProduto({ produtoId, fechar, aoMudarStock }: {
  produtoId: string;
  fechar: () => void;
  /** Depois de um movimento feito no painel: a moldura recarrega o ecrã clássico embebido (a lista do Stocks.tsx). */
  aoMudarStock?: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeCompany } = useCompany();
  const orgId = activeCompany?.id ?? null;
  const { hasPermission } = usePermissions();
  const gate = usePermissionGate();
  const gateMovimento = gate("inventory.edit");
  const gateHistorico = gate("inventory.view");
  const { produto, linhas, reserva, movimentos } = useDadosProduto(orgId, produtoId);
  const [movimento, setMovimento] = useState<{ armazem?: string } | null>(null);
  const asideRef = useRef<HTMLElement>(null);
  const modal = useAbaixoDeSm();

  // Quem tinha o foco ao abrir (lido no 1.º render, antes de o painel o tirar). Ao fechar, o foco volta para lá; se já não
  // existir (ex.: o resultado da pesquisa que se escolheu), vai para o campo "Ver produto". Sem isto o foco caía no body e
  // um segundo Esc saía do Inventário (escDeveSair aceita o body).
  const [origemFoco] = useState<HTMLElement | null>(() => {
    const a = typeof document !== "undefined" ? document.activeElement : null;
    return a instanceof HTMLElement && a !== document.body && !a.closest("[data-painel-produto]") ? a : null;
  });
  const devolvido = useRef(false);
  const devolverFoco = () => {
    if (devolvido.current) return;
    devolvido.current = true;
    if (origemFoco && origemFoco.isConnected) {
      origemFoco.focus({ preventScroll: true });
      if (document.activeElement === origemFoco) return;
    }
    document.querySelector<HTMLElement>(SELETOR_VER_PRODUTO)?.focus({ preventScroll: true });
  };
  const fecharRef = useRef(fechar);
  fecharRef.current = fechar;
  const fecharPainel = () => { devolverFoco(); fecharRef.current(); };

  // O foco vai para o painel ao abrir (o Esc e o leitor de ecrã ficam nele).
  useEffect(() => { asideRef.current?.focus({ preventScroll: true }); }, [produtoId]);

  // Fechado por fora (o «voltar» do browser, mudar de separador): devolve o foco se ele estava no painel ou se perdeu. Se já
  // estiver noutro sítio (ex.: outro painel que o substituiu), fica onde está.
  useEffect(() => {
    const aside = asideRef.current;
    return () => {
      const a = document.activeElement;
      if (!a || a === document.body || (aside && aside.contains(a))) devolverFoco();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Trocar de empresa com o painel aberto fecha-o (o produto é de outra organização).
  const orgInicial = useRef(orgId);
  useEffect(() => {
    if (!orgId) return;
    if (!orgInicial.current) orgInicial.current = orgId;
    else if (orgId !== orgInicial.current) fecharPainel();
  }, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Esc fecha o painel antes de a moldura o ver (captura + preventDefault: escDeveSair ignora o que já foi tratado).
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (!escFechaPainel(e)) return;
      e.preventDefault();
      fecharPainel();
    };
    window.addEventListener("keydown", tecla, true);
    return () => window.removeEventListener("keydown", tecla, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Os armazéns do diálogo: a mesma leitura do Stocks.tsx (fetchWarehouses); só com permissão para o abrir.
  const { data: armazens = [] } = useQuery({
    queryKey: ["inventario-novo-armazens", orgId],
    enabled: !!orgId && gateMovimento.allowed,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await db.from("warehouses").select("id, name, is_vehicle").eq("organization_id", orgId).is("deleted_at", null).order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const L = linhas.data ?? [];
  const n = linhas.data ? numerosDoProduto(L, reserva.data ?? null) : null;
  const reservaPronta = !!reserva.data;
  const nomeArmazem = (id: string | null) => L.find((l) => l.warehouse_id === id)?.armazem ?? armazens.find((a) => a.id === id)?.name ?? "";
  // A leitura acabou sem produto: o id não existe nesta empresa (endereço de outra organização, ou apagado).
  const naoEncontrado = produto.isSuccess && produto.data === null;
  const nome = produto.data?.name ?? (produto.isLoading ? "A carregar…" : "Produto");
  const codigos = [produto.data?.sku ? `SKU ${produto.data.sku}` : null, produto.data?.barcode ? `EAN ${produto.data.barcode}` : null].filter(Boolean).join(" · ");

  const abrirMovimento = (armazem?: string) => setMovimento({ armazem });
  const irHistorico = () => navigate(paraSeparador(stockMovementsLink({ product: produtoId })));

  return (
    <aside ref={asideRef} tabIndex={-1} data-painel-produto="" aria-labelledby="painel-produto-titulo"
      {...(modal ? { role: "dialog", "aria-modal": true } : {})}
      className="flex h-full flex-col bg-card outline-none">
      <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Produto</p>
          <h2 id="painel-produto-titulo" className="truncate text-lg font-semibold tracking-tight">{nome}</h2>
          {codigos && <p className="font-mono text-xs text-muted-foreground">{codigos}</p>}
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label="Fechar" onClick={fecharPainel}>
          <X className="h-5 w-5" aria-hidden="true" />
        </Button>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {naoEncontrado ? (
          <div role="alert" className="space-y-3 rounded-2xl border border-dashed border-border px-3 py-4 text-sm">
            <p className="font-semibold">Produto não encontrado nesta empresa</p>
            <Button type="button" variant="outline" className="min-h-11 rounded-xl" onClick={fecharPainel}>Fechar</Button>
          </div>
        ) : linhas.isLoading ? (
          <div className="flex justify-center py-10"><OlyviaLoader size={32} /></div>
        ) : linhas.isError ? (
          <p role="alert" className="rounded-2xl bg-destructive/10 px-3 py-3 text-sm text-destructive">Não foi possível carregar as existências deste produto.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Numero rotulo="Livre" valor={reservaPronta && n ? n.livre : null} tom={n && reservaPronta && n.livre < 0 ? "bad" : undefined}
                nota={n && reservaPronta && n.livre < 0 ? "reservas acima do stock" : undefined} />
              <Numero rotulo="Na prateleira" valor={n ? n.prateleira : null} />
              <Numero rotulo="Reservado" valor={reservaPronta && n ? n.reservado : null} />
            </div>
            <p className="text-xs text-muted-foreground">
              Livre e Reservado são da organização (todos os armazéns ativos), como na lista de Existências.
            </p>

            <Secao titulo="Quem está à espera · por ordem de chegada">
              {reserva.isError ? (
                <p className="text-sm text-muted-foreground">Sem dados de reservas.</p>
              ) : !reserva.data ? (
                <p className="text-sm text-muted-foreground">A carregar…</p>
              ) : reserva.data.orders_count > 0 || reserva.data.qty_missing > 0 ? (
                <div className="space-y-2 rounded-2xl bg-muted/50 px-3 py-2.5 text-sm" data-testid="fila-fifo">
                  <p className="font-semibold">
                    {reserva.data.orders_count} {reserva.data.orders_count === 1 ? "encomenda de cliente à espera" : "encomendas de cliente à espera"}
                  </p>
                  <p className="text-muted-foreground">
                    Servidas por ordem de assinatura (a mais antiga primeiro): {fmtQty(reserva.data.qty_reserved)} reservado
                    {reserva.data.qty_missing > 0 ? ` · ${fmtQty(reserva.data.qty_missing)} em falta, pedido ao fornecedor` : ""}.
                  </p>
                  {hasPermission("client_orders.view") && (
                    <Button type="button" size="sm" variant="outline" className="min-h-9 rounded-xl"
                      onClick={() => navigate(paraSeparador(clientOrdersLink()))}>
                      Ver as encomendas de clientes
                    </Button>
                  )}
                </div>
              ) : (
                <p className="rounded-2xl border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">Ninguém está à espera.</p>
              )}
            </Secao>

            <Secao titulo="Por armazém">
              {L.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">Sem existências em armazéns ativos.</p>
              ) : (
                <ul className="space-y-2">
                  {L.map((l) => (
                    <li key={l.id} className="rounded-2xl border border-border px-3 py-2.5" data-testid="linha-armazem">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{l.armazem}</p>
                          {l.location && <p className="text-xs text-muted-foreground">{l.location}</p>}
                        </div>
                        <p className="shrink-0 text-right text-sm tabular-nums">
                          <span className="font-semibold">{fmtQty(l.quantity)}</span>
                          <span className="block text-xs text-muted-foreground">na prateleira</span>
                        </p>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground tabular-nums">
                          Mín. {l.minimum_quantity ? fmtQty(l.minimum_quantity) : "—"} · Máx. {l.maximum_quantity ? fmtQty(l.maximum_quantity) : "—"} · PE {l.reorder_point ? fmtQty(l.reorder_point) : "—"}
                        </p>
                        <BlockedButton type="button" size="sm" variant="outline" className="min-h-9 rounded-xl"
                          aria-label={`Movimento em ${l.armazem}`}
                          blockedReason={gateMovimento.allowed ? null : gateMovimento.reason} onClick={() => abrirMovimento(l.warehouse_id)}>
                          <ArrowLeftRight className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />Movimento
                        </BlockedButton>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Secao>

            <Secao titulo="Últimos movimentos">
              {movimentos.isLoading ? (
                <p className="text-sm text-muted-foreground">A carregar…</p>
              ) : movimentos.isError ? (
                <p className="text-sm text-muted-foreground">Não foi possível carregar os movimentos.</p>
              ) : !movimentos.data?.length ? (
                <p className="text-sm text-muted-foreground">Sem movimentos registados ainda.</p>
              ) : (
                <ul className="divide-y divide-border rounded-2xl border border-border">
                  {movimentos.data.map((m) => {
                    const q = signedMovementQty(m.movement_type, toNum(m.quantity));
                    return (
                      <li key={m.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span className="min-w-0">
                          <span className="block font-medium">{movementTypeLabel(m.movement_type)}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {[fmtData(m.created_at), nomeArmazem(m.warehouse_id), m.document_number].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span className={cn("shrink-0 font-semibold tabular-nums", q >= 0 ? "text-success" : "text-foreground")}>
                          {q >= 0 ? "+" : "−"}{fmtQty(Math.abs(q))}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Secao>
          </>
        )}
      </div>

      {!naoEncontrado && <footer className="flex gap-2 border-t border-border bg-card px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
        <BlockedButton type="button" className="min-h-11 flex-1 rounded-xl"
          blockedReason={gateMovimento.allowed ? null : gateMovimento.reason}
          onClick={() => abrirMovimento(L.length === 1 ? L[0].warehouse_id : undefined)}>
          <ArrowLeftRight className="mr-1.5 h-4 w-4" aria-hidden="true" />Registar movimento
        </BlockedButton>
        <BlockedButton type="button" variant="outline" className="min-h-11 rounded-xl"
          blockedReason={gateHistorico.allowed ? null : gateHistorico.reason} onClick={irHistorico}>
          <ListOrdered className="mr-1.5 h-4 w-4" aria-hidden="true" />Histórico
        </BlockedButton>
      </footer>}

      {orgId && gateMovimento.allowed && movimento && (
        <StockMovementDialog
          open={!!movimento}
          onOpenChange={(o) => { if (!o) setMovimento(null); }}
          organizationId={orgId}
          warehouses={armazens}
          defaultProductId={produtoId}
          defaultWarehouseId={movimento.armazem}
          onSuccess={() => {
            // O que o Stocks.tsx refresca depois de um movimento (handleMovementSuccess) + os números deste painel.
            void queryClient.invalidateQueries({ queryKey: chavePainelProduto(orgId, produtoId) });
            void queryClient.invalidateQueries({ queryKey: inventoryTodayQueryKey(orgId) });
            // A lista do Stocks.tsx vive em estado local (não ouve o react-query): a moldura recarrega-a.
            aoMudarStock?.();
          }}
        />
      )}
    </aside>
  );
}
