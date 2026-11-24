// O novo Inventário (/inventory/novo/:aba?): uma moldura como o Estúdio da obra (EstudioObra.tsx) — ecrã inteiro por cima
// da app (NaFrente), cabeçalho com o sobretítulo violeta, a pílula de saúde e UM botão principal, separadores em pílula
// fixos no topo — com os 9 ecrãs clássicos do Inventário embebidos TAL COMO ESTÃO, um por separador. No Hoje, o Pulso e o
// Comando ficam por cima do Hoje clássico. Só a UI muda: os ecrãs, as permissões e as consultas são as de sempre.
//
// · Só o separador ativo fica montado (o lazy do ecrã clássico, o mesmo chunk de App.tsx).
// · Um separador sem a permissão da rota clássica não aparece; pedido no endereço, mostra "Sem acesso" (como a rota).
// · As ligações dos ecrãs embebidos ficam cá dentro (NavegadorDoInventario); "Voltar ao clássico" e Esc saem para /inventory.
// · Esc com uma folha ou diálogo aberto ([role=dialog][data-state=open]) não faz nada: fecha-se a folha primeiro.
// · Fatia 2: o painel do produto à direita (Existências → "Ver produto", ?painel=produto:<id>) e, no telemóvel, a barra do
//   polegar em baixo (BarraPolegar) com o botão principal, que no cabeçalho só aparece a partir de `sm`.
// · Fatia 3: o "E se…?" (ESeInventario, só leitura) do botão principal — no cabeçalho ("E se…?" ao lado de "Receber PO-x" /
//   "Dar saída") e no Hoje, por cima do Comando —; e o ↶ Anular / ↷ Refazer (BotoesAnular) ligado ao livro desta sessão
//   (useLivroDaSessao: os movimentos que este utilizador fez desde que abriu o novo Inventário) e às reversões que já existem.
import { Suspense, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, ArrowLeftRight, Check, ChevronDown, ShieldAlert, Sparkles, Truck, PackageCheck, ShoppingCart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { getReceivingSummary, INVENTORY_TODAY_PERMISSIONS, inventoryTodayQueryKey, useInventoryToday } from "@/hooks/useInventoryToday";
import { useReceivablePos, receivablePosQueryKey } from "@/components/receiving/useReceivablePos";
import { todayIsoLocal } from "@/components/purchase-orders/poListUtils";
import StockMovementDialog from "@/components/inventory/StockMovementDialog";
import { BlockedButton } from "@/components/inventory/ui/DisabledReason";
import { usePermissionGate } from "@/components/inventory/ui/RowActions";
import { useInventoryCounters } from "@/components/inventory/ui/useInventoryCounters";
import { InventarioEmbebido } from "@/components/inventory/ui/embebido";
import { receivingLink } from "@/components/inventory/ui/inventoryLinks";
import { permissionReason } from "@/components/inventory/ui/permissionReason";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { NaFrente } from "@/emylia/NaFrente";
import { MOLA, useReduzir } from "@/emylia/movimento";
import { cn } from "@/lib/utils";
import { NavegadorDoInventario, paraSeparador } from "./navegadorInventario";
import { PulsoInventario } from "./PulsoInventario";
import { ComandoInventario } from "./ComandoInventario";
import { botaoPrincipal, poAtrasada, precisaDeTi, saudeDoInventario } from "./contasComando";
import { PainelProduto } from "./PainelProduto";
import { ProcurarProduto } from "./ProcurarProduto";
import { BarraPolegar } from "./BarraPolegar";
import { usePainelProduto } from "./painelUrl";
import { ESeInventario, type AcaoESe } from "./ESeInventario";
import { BotoesAnular } from "./BotoesAnular";
import { MARGEM_RELOGIO_MS, useLivroDaSessao } from "./useLivroDaSessao";
import { caminhoSeparador, eChaveSeparador, separadorDe, separadoresVisiveis, type ChaveSeparador } from "./separadores";

const CLASSICO = "/inventory";

/** "Terça-feira, 24 de novembro". */
function dataDeHoje(): string {
  const s = new Intl.DateTimeFormat("pt-PT", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Esc só sai da moldura com o foco nela própria (cabeçalho/separadores) ou em lado nenhum (body):
 *  dentro de um ecrã clássico o Esc continua a fazer só o que fazia (revisão: o leitor da Receção também usa o Esc).
 *  Nunca com uma folha/diálogo Radix aberto nem a escrever numa caixa de texto. */
export function escDeveSair(e: Pick<KeyboardEvent, "key" | "defaultPrevented" | "target">, doc: Document = document): boolean {
  if (e.key !== "Escape" || e.defaultPrevented) return false;
  if (doc.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) return false;
  const alvo = e.target as HTMLElement | null;
  // Sem elemento focado (window/document/body): o Esc é da moldura.
  if (!alvo || typeof alvo.closest !== "function" || alvo === doc.body || alvo === doc.documentElement) return true;
  if (alvo.closest("input, textarea, select, [contenteditable=true]")) return false;
  return !!alvo.closest("[data-moldura-inventario]");
}

/** Um separador em pílula, com o indicador que desliza (layoutId) e o contador do menu. */
function Aba({ on, rotulo, n, onClick }: { on: boolean; rotulo: string; n: number | null; onClick: () => void }) {
  const reduzir = useReduzir();
  return (
    <button type="button" role="tab" aria-selected={on} onClick={onClick}
      className={cn("relative inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-sm font-semibold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        on ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
      {on && <motion.span layoutId="aba-inventario" aria-hidden="true" className="absolute inset-0 rounded-full bg-card shadow-sm" transition={reduzir ? { duration: 0 } : MOLA} />}
      <span className="relative">{rotulo}</span>
      {n !== null && <span className="relative rounded-full bg-amber-100 px-1.5 text-xs tabular-nums text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">{n}</span>}
    </button>
  );
}

function PilulaSaude({ tom, texto }: { tom: "bad" | "warn" | "ok"; texto: string }) {
  return (
    <span role="status" className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium",
      tom === "ok" ? "bg-success/10 text-success" : tom === "bad" ? "bg-destructive/10 text-destructive" : "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200")}>
      {tom === "ok" ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}{texto}
    </span>
  );
}

const ICONE_PRINCIPAL = { receber: Truck, saida: PackageCheck, aprovar: ShoppingCart, movimento: ArrowLeftRight } as const;

/** O "E se…?" do botão principal no Hoje (por cima do Comando): fechado, não lê nada; aberto, mostra o impacto sem gravar. */
function ESeNoHoje({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  const id = useId();
  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" className="min-h-11 rounded-2xl" aria-expanded={aberto} aria-controls={id} onClick={() => setAberto((x) => !x)}>
        <Sparkles className="mr-1.5 h-4 w-4 text-primary" aria-hidden="true" />E se… {rotulo}?
        <ChevronDown className={cn("ml-1.5 h-4 w-4 transition-transform", aberto && "rotate-180")} aria-hidden="true" />
      </Button>
      <div id={id}>{aberto && children}</div>
    </div>
  );
}

export default function InventarioNovo() {
  const { aba } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const reduzir = useReduzir();
  const { activeCompany } = useCompany();
  const orgId = activeCompany?.id ?? null;
  const { hasPermission, loading } = usePermissions();
  const gate = usePermissionGate();
  const counterFor = useInventoryCounters(true);
  // Os números só se pedem com as permissões que o menu exige para os pedir (INVENTORY_TODAY_PERMISSIONS).
  const { data: today } = useInventoryToday({ enabled: !loading && INVENTORY_TODAY_PERMISSIONS.some((p) => hasPermission(p)) });
  const [movimentoAberto, setMovimentoAberto] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const comandoRef = useRef<HTMLElement>(null);

  const visiveis = loading ? [] : separadoresVisiveis(hasPermission);
  const pedido: ChaveSeparador | null = eChaveSeparador(aba) ? aba : null;
  const ativo = pedido && visiveis.some((s) => s.chave === pedido) ? separadorDe(pedido) : null;

  // Sem separador (ou um desconhecido) no endereço: o Hoje, ou o primeiro que se pode abrir.
  const alvoInicial = visiveis.some((s) => s.chave === "hoje") ? "hoje" : (visiveis[0]?.chave ?? null);
  useEffect(() => {
    if (loading || pedido || !alvoInicial) return;
    navigate(caminhoSeparador(alvoInicial) + location.search + location.hash, { replace: true });
  }, [loading, pedido, alvoInicial]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trocar de separador começa no topo.
  useEffect(() => { mainRef.current?.scrollTo?.({ top: 0 }); }, [pedido]);

  const voltar = () => navigate(CLASSICO);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => { if (escDeveSair(e)) navigate(CLASSICO); };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [navigate]);

  // O botão principal: as POs da Receção (a mesma query e a mesma regra do Hoje clássico).
  const canReceivable = hasPermission("purchase_orders.view") && hasPermission("receiving.view");
  const receivable = useReceivablePos(orgId, canReceivable);
  const principal = botaoPrincipal(today, canReceivable ? (receivable.data ?? null) : null, todayIsoLocal(), hasPermission);
  const gatePrincipal = gate(principal.permissoes, true);
  const IconePrincipal = ICONE_PRINCIPAL[principal.tipo];
  const saude = saudeDoInventario(today, hasPermission);
  // O "Precisa de ti" da barra do polegar: o mesmo número da coluna do Comando (precisaDeTi).
  const posRecebiveis = canReceivable ? (receivable.data ?? null) : null;
  const nPedidos = today || posRecebiveis
    ? precisaDeTi(today, posRecebiveis ? getReceivingSummary(posRecebiveis, todayIsoLocal()) : null, hasPermission).length
    : null;

  // O painel do produto (só no separador Existências).
  const [produtoAberto, abrirProduto, fecharProduto] = usePainelProduto();
  const painelVisivel = ativo?.chave === "existencias" && !!produtoAberto;
  // A lista do Stocks.tsx vive em estado local e não ouve as invalidações do react-query: depois de um movimento feito no
  // painel, mudar a `key` do ecrã embebido volta a montá-lo e ele relê tudo (os filtros ficam, estão no endereço).
  // O sentido inverso (movimento numa linha do Stocks) está no comentário do topo do PainelProduto.tsx.
  const [versao, setVersao] = useState(0);
  const aoMudarStock = () => setVersao((v) => v + 1);

  // "Precisa de ti" (barra do polegar): o Hoje, até ao Comando. Noutro separador, primeiro troca e depois rola.
  const [irAoComando, setIrAoComando] = useState(false);
  const rolarAoComando = () => comandoRef.current?.scrollIntoView?.({ behavior: reduzir ? "auto" : "smooth", block: "start" });
  useEffect(() => {
    if (!irAoComando || ativo?.chave !== "hoje") return;
    setIrAoComando(false);
    rolarAoComando();
  }, [irAoComando, ativo?.chave]); // eslint-disable-line react-hooks/exhaustive-deps
  const irPrecisaDeTi = () => {
    if (ativo?.chave === "hoje") rolarAoComando();
    else { setIrAoComando(true); navigate(caminhoSeparador("hoje")); }
  };
  const irLerCodigo = () => navigate(paraSeparador(receivingLink({ vista: "leitor" })));
  const podeSeparador = (chave: ChaveSeparador) => visiveis.some((s) => s.chave === chave);

  // Armazéns para o diálogo de movimento: a mesma leitura (e a mesma cache) do Hoje clássico; só com o diálogo em vista.
  const { data: armazens = [] } = useQuery({
    queryKey: ["inventory-today-warehouses", orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name")
        .eq("organization_id", orgId as string)
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return (data || []) as { id: string; name: string }[];
    },
    enabled: !!orgId && principal.tipo === "movimento" && gatePrincipal.allowed,
    staleTime: 5 * 60 * 1000,
  });

  // Fatia 3: o "E se…?" do botão principal (só receber e dar saída) e o livro da sessão para o Anular/Refazer.
  const poPrincipal = principal.tipo === "receber" ? poAtrasada(posRecebiveis, todayIsoLocal()) : null;
  const acaoESe: AcaoESe | null = principal.tipo === "receber" && poPrincipal ? { tipo: "receber", po: poPrincipal, to: principal.to }
    : principal.tipo === "saida" ? { tipo: "saida", to: principal.to } : null;
  const [eSeAberto, setESeAberto] = useState(false);
  const eSe = (fechar?: () => void) => acaoESe && (
    <ESeInventario acao={acaoESe} orgId={orgId} podePrever={gatePrincipal.allowed}
      bloqueio={gatePrincipal.allowed ? null : (gatePrincipal.reason ?? null)} ir={(to) => { fechar?.(); navigate(to); }} />
  );
  // A abertura vem do relógio do cliente, que pode estar adiantado em relação ao servidor (created_at é do servidor): tira-se
  // uma margem de 2 minutos para não perder os primeiros movimentos. Os que foram feitos ANTES de abrir e caem nessa margem
  // entram no livro, mas só os do próprio utilizador (lerLivro filtra created_by = current_business_user_id()) — aceitável.
  const [aberturaSessao] = useState(() => new Date(Date.now() - MARGEM_RELOGIO_MS).toISOString());
  const livro = useLivroDaSessao(orgId, aberturaSessao, ativo?.chave ?? "", !loading);

  const carregarPrincipal = () => {
    if (principal.tipo === "movimento") setMovimentoAberto(true);
    else navigate(principal.to);
  };

  const Componente = ativo?.Componente;

  return (
    <NaFrente>
      <motion.div className="fixed inset-0 flex flex-col overflow-hidden bg-background" role="dialog" aria-modal="true" aria-labelledby="inventario-novo-titulo"
        initial={reduzir ? false : { opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: "easeOut" }}>
        {/* ---------------------------------------------------------------- o cabeçalho */}
        <header data-moldura-inventario="" className="border-b border-border bg-card/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Button type="button" variant="outline" className="min-h-11 shrink-0" onClick={voltar} aria-label="Voltar ao clássico">
                <ArrowLeft className="h-4 w-4 sm:mr-1.5" aria-hidden="true" /><span className="hidden sm:inline">Voltar ao clássico</span>
              </Button>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Inventário</p>
                <h1 id="inventario-novo-titulo" className="truncate text-xl font-semibold tracking-tight">
                  {activeCompany?.name ?? "Inventário"} · {dataDeHoje()}
                </h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {!loading && <BotoesAnular orgId={orgId} movimentos={livro.movimentos} recarregar={livro.recarregar} aoMudarStock={aoMudarStock} />}
              {saude && <PilulaSaude tom={saude.tom} texto={saude.texto} />}
              {!loading && visiveis.length > 0 && acaoESe && (
                <Popover open={eSeAberto} onOpenChange={setESeAberto}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="outline" className="hidden min-h-11 sm:inline-flex">
                      <Sparkles className="mr-1.5 h-4 w-4 text-primary" aria-hidden="true" />E se…?
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-[min(30rem,92vw)] rounded-2xl p-2">{eSe(() => setESeAberto(false))}</PopoverContent>
                </Popover>
              )}
              {!loading && visiveis.length > 0 && (
                <BlockedButton type="button" className="hidden min-h-11 sm:inline-flex" blockedReason={gatePrincipal.allowed ? null : gatePrincipal.reason} side="bottom" onClick={carregarPrincipal}>
                  <IconePrincipal className="mr-1.5 h-4 w-4" aria-hidden="true" />{principal.rotulo}
                </BlockedButton>
              )}
            </div>
          </div>
        </header>

        {/* ---------------------------------------------------------------- a barra do polegar (só no telemóvel) */}
        {!loading && visiveis.length > 0 && !painelVisivel && (
          <BarraPolegar
            pedidos={nPedidos}
            bloqueioHoje={podeSeparador("hoje") ? null : permissionReason(["inventory.view"])}
            bloqueioRececao={podeSeparador("rececao") ? null : permissionReason(["receiving.view"])}
            irPrecisaDeTi={irPrecisaDeTi}
            irLerCodigo={irLerCodigo}
            principal={{ rotulo: principal.rotulo, Icone: IconePrincipal, bloqueio: gatePrincipal.allowed ? null : (gatePrincipal.reason ?? null), carregar: carregarPrincipal }}
          />
        )}

        {/* ---------------------------------------------------------------- os separadores, fixos no topo:
            fora do <main> (que é o que rola), para nenhum "sticky" dos ecrãs embebidos (ex.: o leitor da Receção) os tapar. */}
        <div data-moldura-inventario="" className="shrink-0 border-b border-border/60 bg-background/95 px-4 pb-2 pt-3 backdrop-blur sm:px-6">
            <div role="tablist" aria-label="Inventário" className="mx-auto flex max-w-[1500px] gap-1 overflow-x-auto rounded-full bg-muted p-1 shadow-sm [scrollbar-width:none]">
              {visiveis.map((s) => (
                <Aba key={s.chave} on={ativo?.chave === s.chave} rotulo={s.rotulo} n={counterFor(s.counterKey)}
                  onClick={() => { if (ativo?.chave !== s.chave) navigate(caminhoSeparador(s.chave)); }} />
              ))}
            </div>
        </div>

        <div className="relative flex min-h-0 flex-1">
        <main ref={mainRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          {/* pb: no telemóvel, a barra do polegar (≈ 4 rem + a zona segura) não tapa o fim do ecrã */}
          <div className="mx-auto max-w-[1500px] px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-24">
            {loading ? (
              <div className="flex items-center justify-center py-24"><OlyviaLoader size={40} /></div>
            ) : !ativo ? (
              pedido || visiveis.length === 0 ? (
                <div className="mx-auto max-w-md space-y-3 py-16 text-center" role="alert">
                  <ShieldAlert className="mx-auto h-10 w-10 text-destructive" aria-hidden="true" />
                  <h2 className="text-xl font-semibold">Sem acesso</h2>
                  <p className="text-muted-foreground">Não tens permissão para ver este separador.</p>
                </div>
              ) : null
            ) : (
              <div role="tabpanel" aria-label={ativo.rotulo} className="space-y-6">
                {ativo.chave === "hoje" && (
                  <>
                    <PulsoInventario verFila={() => comandoRef.current?.scrollIntoView?.({ behavior: reduzir ? "auto" : "smooth", block: "start" })} />
                    {acaoESe && <ESeNoHoje rotulo={principal.rotulo}>{eSe()}</ESeNoHoje>}
                    <ComandoInventario ref={comandoRef} />
                  </>
                )}
                {ativo.chave === "existencias" && <ProcurarProduto aoEscolher={abrirProduto} />}
                <InventarioEmbebido.Provider value={true}>
                  <NavegadorDoInventario>
                    <Suspense fallback={<div className="flex items-center justify-center py-24"><OlyviaLoader size={40} /></div>}>
                      {Componente && <Componente key={ativo.chave + ":" + versao} />}
                    </Suspense>
                  </NavegadorDoInventario>
                </InventarioEmbebido.Provider>
              </div>
            )}
          </div>
        </main>

        {/* ---------------------------------------------------------------- o painel da direita (como o do Estúdio) */}
        <AnimatePresence>
          {painelVisivel && produtoAberto && (
            <motion.div key={produtoAberto}
              className="absolute inset-0 z-30 w-full border-l border-border bg-card shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:max-w-md lg:relative lg:z-auto lg:w-[420px] lg:max-w-none lg:shrink-0 lg:shadow-none"
              initial={reduzir ? false : { x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ duration: 0.2 }}>
              <PainelProduto produtoId={produtoAberto} fechar={fecharProduto} aoMudarStock={aoMudarStock} />
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </motion.div>

      {orgId && principal.tipo === "movimento" && gatePrincipal.allowed && (
        <StockMovementDialog
          open={movimentoAberto}
          onOpenChange={setMovimentoAberto}
          organizationId={orgId}
          warehouses={armazens}
          onSuccess={() => {
            // O que o Hoje clássico refresca depois de um movimento.
            void queryClient.invalidateQueries({ queryKey: ["inventory-today-recent-movements", orgId] });
            void queryClient.invalidateQueries({ queryKey: inventoryTodayQueryKey(orgId) });
            if (canReceivable) void queryClient.invalidateQueries({ queryKey: receivablePosQueryKey(orgId) });
            livro.recarregar();
          }}
        />
      )}
    </NaFrente>
  );
}
