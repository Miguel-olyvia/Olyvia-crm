// Catálogo e custos (Emylia, Fase 1 da migração): o Catálogo da Emylia (CatalogoV1) ligado às tabelas da organização ativa.
// Ao abrir lê da base (cat_ler_catalogo) e monta os objetos que os ecrãs da Emylia usam (real/catalogoReal.ts). O que se muda
// nos ecrãs grava-se sozinho, entidade a entidade, pelas funções cat_* (real/gravarCatalogo.ts), e a página volta a ler da base.
// Substitui os Produtos e os Serviços antigos no menu (as páginas antigas ficam até à limpeza).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { toast } from "@/hooks/use-toast";
import type { FichaProdutoReal } from "@/emylia/fichaProdutoDados";
import { seed, type Estado } from "@/emylia/motor";
import { lerCustos, useCustos } from "@/emylia/v2/custosStore";
import { lerCatalogo as lerCatalogoStore, useCatalogo } from "@/emylia/v2/catalogoStore";
import { CatalogoV1 } from "@/emylia/CatalogoV1";
import { usaLeituraLeve, type RotaCatalogo } from "@/emylia/catalogoRotas";
import type { Ctx } from "@/emylia/pecas";
import { LeituraAtrasada, carregarCatalogo, type CatalogoCarregado } from "@/emylia/real/carregarCatalogo";
import { aoRegistarProduto, limparCatalogoLido, linhaDeProduto } from "@/emylia/real/catalogoLeve";
import { diferencasCatalogo, executarCatalogo, fotografar, type Rpc } from "@/emylia/real/gravarCatalogo";
import { AVISO_LENTO_MS, ERRO_DEMOROU, ErroLeituraCatalogo, LIMITE_LEITURA_MS, LeituraCatalogo } from "@/emylia/LeituraCatalogo";
import { usePaginaInteira } from "@/hooks/usePaginaInteira";
import "@/emylia/prototipo.css";
import "@/emylia/blocosPagina.css";
import { ProvedorPermissoesCatalogo, permissoesCatalogo } from "@/emylia/permissoesCatalogo";

type Gravacao = { k: "parado" } | { k: "a-gravar"; n: number } | { k: "gravado"; n: number; avisos: string[] } | { k: "erro"; t: string };

const rpc: Rpc = async (fn, args) => {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  return { data, error };
};

type Base = CatalogoCarregado;

/** rota (17/11): vem das páginas /catalogo/… (CatalogoRota); sem ela, a página abre como antes. */
export default function CatalogoCustos({ rota }: { rota?: RotaCatalogo } = {}) {
  usePaginaInteira();
  const { activeCompany, isLoading } = useCompany();
  const org = activeCompany?.id ?? null;
  const S = useMemo<Estado>(() => { const s = seed(); s.deals = []; return s; }, []);
  const [, setTique] = useState(0);
  const [erroLer, setErroLer] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);
  const [gravacao, setGravacao] = useState<Gravacao>({ k: "parado" });
  const base = useRef<Base | null>(null);
  const aGravar = useRef(false);
  const queryClient = useQueryClient();

  // 17/11: nas páginas de Serviços lê-se o Catálogo LEVE (cat_ler_catalogo_servicos: só os produtos dos consumos, 145 na Mudelar em vez de 29 785; a leitura inteira
  // dava statement timeout). Os produtos e as Ligações precisam da lista toda: ficam com a leitura inteira. Sem rota (endereço antigo): inteira.
  const leve = usaLeituraLeve(rota?.seccao);
  // 18/11: Serviços só lê o que é de Serviços: sem atributos nem modelos (são dos Produtos). Mesmas secções que a leitura leve.
  const soServicos = leve;
  // 17/11: um contador de pedidos: uma leitura que acaba depois de outra mais nova (ex.: a leve de Serviços depois da inteira de Ligações) não se aplica por cima
  const pedido = useRef(0);
  const carregar = useCallback(async (o: string) => {
    const eu = ++pedido.current;
    try {
      base.current = await carregarCatalogo(supabase, o, S, { leve, soServicos, descartar: () => eu !== pedido.current });
    } catch (e) {
      if (e instanceof LeituraAtrasada) return;
      throw e;
    }
    setTique((t) => t + 1);
  }, [S, leve, soServicos]);
  // ao sair, a página esquece o estado parcial e a organização (o protótipo e as outras organizações não os herdam)
  useEffect(() => () => { pedido.current++; limparCatalogoLido(); }, []);

  // 18/11: aos 10 s a leitura avisa que demora; aos 30 s é um erro. Uma resposta que chegue depois não se aplica (o pedido avança e a leitura fica «descartada»).
  const [lento, setLento] = useState(false);
  const [tentativa, setTentativa] = useState(0);
  const tentarDeNovo = useCallback(() => setTentativa((t) => t + 1), []);
  useEffect(() => {
    if (!org) return;
    let vivo = true;
    setPronto(false); setErroLer(null); setLento(false);
    const aviso = window.setTimeout(() => { if (vivo) setLento(true); }, AVISO_LENTO_MS);
    const limite = window.setTimeout(() => {
      if (!vivo) return;
      vivo = false; pedido.current++;
      setLento(false); setErroLer(ERRO_DEMOROU);
    }, LIMITE_LEITURA_MS);
    const acabou = () => { window.clearTimeout(aviso); window.clearTimeout(limite); };
    carregar(org).then(() => { if (vivo) { acabou(); setPronto(true); } }).catch((e: Error) => { if (vivo) { acabou(); setErroLer(e.message); } });
    return () => { vivo = false; acabou(); };
  }, [org, carregar, tentativa]);

  // 17/11: um produto escolhido de uma pesquisa no servidor entra no Catálogo em memória (catalogoLeve.registarProdutoLido). Para o autosave não o gravar como NOVO (duplicado),
  // entra primeiro no «antes» e na base: assim a ligação ao serviço grava-se pelo id dele.
  useEffect(() => aoRegistarProduto((p) => {
    const b = base.current;
    if (!b || b.produtos.some((x) => x.id === p.id)) return;
    b.foto.K.produtos.push(p);
    b.produtos.push(linhaDeProduto(p));
  }), []);

  // o que os ecrãs mudam: as stores (useCustos/useCatalogo) e S.svc (pelo run)
  const C = useCustos();
  const K = useCatalogo();
  const [mexido, setMexido] = useState(0);
  const run = useCallback((fn: () => void) => { fn(); setMexido((m) => m + 1); setTique((t) => t + 1); }, []);
  const go = useCallback((fn: () => void) => () => run(fn), [run]);

  // 17/11: a gravação pendente (o que mudou há menos de 900 ms) também corre ao sair da página, senão ir para uma página de Gestão perdia-a
  const gravarPendente = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => {
    const b = base.current;
    if (!pronto || !b || aGravar.current) { gravarPendente.current = null; return undefined; }
    const gravar = async () => {
      if (aGravar.current) return;
      const depois = fotografar({ C: lerCustos(), K: lerCatalogoStore(), svc: S.svc, margens: { min: S.cfg.min, alvo: S.cfg.alvo } });
      const chamadas = diferencasCatalogo(b.org, b.foto, depois, { ids: b.M.ids, produtos: b.produtos });
      if (!chamadas.length) return;
      aGravar.current = true;
      setGravacao({ k: "a-gravar", n: chamadas.length });
      const r = await executarCatalogo(chamadas, rpc);
      // 17/11: um perfil (ofício) criado, mudado ou retirado: os ofícios em cache dos Cargos do RH (useOficiosObra) leem-se de novo
      if (chamadas.some((c) => c.rpc === "cat_guardar_perfil" || c.rpc === "cat_retirar_perfil"))
        void queryClient.invalidateQueries({ queryKey: ["rh-oficios-obra"] });
      try { await carregar(b.org); } catch { /* fica o que está; o erro da gravação diz o resto */ }
      aGravar.current = false;
      setGravacao(r.erro ? { k: "erro", t: r.erro } : { k: "gravado", n: r.feitas, avisos: r.avisos });
      // 17/11: eliminar um ofício que a base recusa (em uso em cargos, pessoas, obras…): o motivo também num aviso; o ofício já voltou (recarregou)
      const recusa = r.erro ? chamadas.find((c) => c.rpc === "cat_retirar_perfil" && r.erro!.startsWith(`${c.nota}: `)) : undefined;
      if (recusa && r.erro) toast({ variant: "destructive", title: "O ofício não foi eliminado", description: r.erro.slice(recusa.nota.length + 2) });
    };
    gravarPendente.current = gravar;
    const t = window.setTimeout(() => { gravarPendente.current = null; void gravar(); }, 900);
    return () => window.clearTimeout(t);
  }, [C, K, mexido, pronto, S, carregar, queryClient]);
  useEffect(() => () => { const g = gravarPendente.current; gravarPendente.current = null; if (g) void g(); }, []);

  const ctx = { S, A: {} as Ctx["A"], run, go, q: "" } as Ctx;
  // 29/10: a ficha do produto lê os fornecedores ligados e liga a artigos do portal; mexer exige products.edit (o can_link de Compras); a estrela também products.manage_prices
  const { hasPermission } = usePermissions();
  const podeEditar = hasPermission("products.edit"), podeMudarPrecos = hasPermission("products.manage_prices");
  // 29/10: marcar armazéns em lote (Produtos/Consumíveis) só com inventory.edit, como cat_definir_armazem_produtos
  const podeStock = hasPermission("inventory.edit");
  // 03/11: o que cada parte do Catálogo deixa mudar (services.edit, services.manage_prices, products.edit, products.manage_prices).
  const perms = useMemo(() => permissoesCatalogo(hasPermission), [hasPermission]);
  // 05/11: o custo de compra dos produtos e consumíveis (e a margem, e o preço dos fornecedores) só com products.view_cost
  const podeVerCusto = hasPermission("products.view_cost");
  const real = useMemo<FichaProdutoReal | undefined>(() => (org ? { org, podeEditar, podeMudarPrecos, podeStock, podeVerCusto, recarregar: () => carregar(org) } : undefined), [org, podeEditar, podeMudarPrecos, podeStock, podeVerCusto, carregar]);

  if (isLoading || (!org && !erroLer)) return <div className="p-6 text-muted-foreground">A carregar…</div>;
  if (!org) return <div className="p-6">Escolha uma organização para ver o Catálogo e custos.</div>;
  return (
    <div className="pn calma pg-root min-h-full bg-background">
      <div className="flex min-h-10 items-center justify-end gap-2 px-4 pt-2 text-[15px]" role="status" aria-live="polite">
        {gravacao.k === "a-gravar" && <span className="text-muted-foreground">A gravar {gravacao.n === 1 ? "1 mudança" : `${gravacao.n} mudanças`}…</span>}
        {gravacao.k === "gravado" && <span className="text-muted-foreground">Gravado</span>}
        {/* 16/11: o produto ficou criado mas a referência (SKU) ficou por gerar: diz-se porquê, sem anular nada */}
        {gravacao.k === "gravado" && gravacao.avisos.map((a, i) => <span key={`${i}:${a}`} className="text-amber-800 dark:text-amber-300">{a}</span>)}
        {gravacao.k === "erro" && <span className="text-destructive">Não gravou: {gravacao.t}</span>}
      </div>
      {erroLer ? <ErroLeituraCatalogo erro={erroLer} onRepetir={tentarDeNovo} />
        : !pronto ? <LeituraCatalogo lento={lento} onRepetir={tentarDeNovo} foco={tentativa} />
        : <ProvedorPermissoesCatalogo valor={perms}><CatalogoV1 {...ctx} real={real} rota={rota} /></ProvedorPermissoesCatalogo>}
    </div>
  );
}
