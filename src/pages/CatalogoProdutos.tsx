// 17/11: a página de Produtos do Catálogo (/catalogo/produtos, as fichas /catalogo/produtos/:id e o Criar ?criar=produto), LEVE: já não passa por
// carregarCatalogo (cat_ler_catalogo, 30 MB, ~6 s, nem cat_ler_produtos_tabelas, 8,6 MB). A Lista usa as referências (cat_ler_referencias_produtos), as margens
// (cat_ler_parametros_catalogo) e a página do servidor (cat_ler_produtos_pagina); a ficha lê só o produto (cat_ler_produto); criar grava só o produto novo,
// pelas mesmas funções cat_* de sempre (diferencasCatalogo/executarCatalogo), sem reler nem regravar o Catálogo. Os Serviços continuam em CatalogoCustos.
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermissions";
import { usePaginaInteira } from "@/hooks/usePaginaInteira";
import { Button } from "@/components/ui/button";
import { seed, type Estado } from "@/emylia/motor";
import type { Catalogo } from "@/emylia/v2/catalogoModelo";
import { lerCatalogo as lerCatalogoStore, marcarCatalogoDesatualizado, porCatalogo } from "@/emylia/v2/catalogoStore";
import { lerCustos } from "@/emylia/v2/custosStore";
import type { FichaProdutoReal } from "@/emylia/fichaProdutoDados";
import { CriarNoCatalogo } from "@/emylia/CriarNoCatalogo";
import { FichaProdutoLeve } from "@/emylia/FichaProdutoLeve";
import { ProdutosPagina } from "@/emylia/ProdutosPagina";
import { SeparadoresCatalogo } from "@/emylia/SeparadoresCatalogo";
import { CAMINHO_SECCAO, caminhoProduto, caminhoServico, idSeparadorCatalogo } from "@/emylia/catalogoRotas";
import { ProvedorPermissoesCatalogo, permissoesCatalogo } from "@/emylia/permissoesCatalogo";
import { diferencasProdutoNovo, executarCatalogo, type Rpc } from "@/emylia/real/gravarCatalogo";
import { lerCatalogoLeve, procurarDuplicado, type CatalogoLeve } from "@/emylia/real/produtosLeves";
import { lerServicosDaOrganizacao, opcoesServicos, type ServicoEscolha } from "@/emylia/real/servicosDoProduto";
import type { TipoCriar } from "@/emylia/criarCatalogo";
import "@/emylia/prototipo.css";
import "@/emylia/blocosPagina.css";

const ID_PAINEL = "painel-produtos";
type Gravacao = { k: "parado" } | { k: "a-gravar"; n: number } | { k: "gravado"; n: number; avisos: string[] } | { k: "erro"; t: string };
type Margens = CatalogoLeve["margens"];

const rpc: Rpc = async (fn, args) => {
  const { data, error } = await supabase.rpc(fn as never, args as never);
  return { data, error };
};
const SEM_NOME_SERVICO = "o serviço ligado";

export default function CatalogoProdutos() {
  usePaginaInteira();
  const navigate = useNavigate();
  const { id } = useParams();
  const [pesquisa, setPesquisa] = useSearchParams();
  const { activeCompany, isLoading } = useCompany();
  const org = activeCompany?.id ?? null;
  const { hasPermission } = usePermissions();
  const podeEditar = hasPermission("products.edit"), podeMudarPrecos = hasPermission("products.manage_prices");
  const podeStock = hasPermission("inventory.edit"), podeVerCusto = hasPermission("products.view_cost");
  const perms = useMemo(() => permissoesCatalogo(hasPermission), [hasPermission]);

  const [leve, setLeve] = useState<CatalogoLeve | null>(null), [erroLer, setErroLer] = useState<string | null>(null), [tentativa, setTentativa] = useState(0);
  const [aviso, setAviso] = useState<{ msg: string; n: number } | null>(null);
  const [gravacao, setGravacao] = useState<Gravacao>({ k: "parado" });
  const anunciar = useCallback((msg: string) => setAviso((a) => ({ msg, n: (a?.n ?? 0) + 1 })), []);
  // 23/11: os serviços da organização (id, nome, referência): o «O serviço que traz» do Criar e da ficha, e o nome no «Traz:». Sem eles (sem services.view,
  // ou a leitura falhou) o Criar fica sem a secção e a ficha mostra «o serviço ligado»; nada disto impede criar ou abrir produtos.
  const [servicos, setServicos] = useState<ServicoEscolha[] | null>(null);
  useEffect(() => {
    if (!org) return undefined;
    let vivoLeitura = true;
    setServicos(null);
    lerServicosDaOrganizacao(org).then((r) => { if (vivoLeitura) setServicos(r.ok ? r.v : []); }, () => { if (vivoLeitura) setServicos([]); });
    return () => { vivoLeitura = false; };
  }, [org]);
  const nomesServicos = useMemo(() => new Map((servicos ?? []).map((x) => [x.id, x.nome])), [servicos]);
  const nomeServico = useCallback((sid: string): string => nomesServicos.get(sid) ?? SEM_NOME_SERVICO, [nomesServicos]);

  // a página ainda está montada (uma gravação que acaba depois de sair não relê nem navega) e qual é a organização de agora
  const vivo = useRef(true);
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);
  const orgAtual = useRef(org);
  orgAtual.current = org;
  // uma gravação que acabou de correr deixa a linha «Gravado» à vista ao voltar à lista; mudar de página por outro caminho limpa-a
  const manterGravacao = useRef(false);
  const criar = pesquisa.get("criar");
  useEffect(() => {
    if (manterGravacao.current) { manterGravacao.current = false; return; }
    setGravacao({ k: "parado" });
  }, [id, criar]);

  useEffect(() => {
    if (!org) return undefined;
    let vivoLeitura = true;
    setErroLer(null); setLeve(null);
    lerCatalogoLeve(org).then(
      (r) => { if (!vivoLeitura) return; if (r.ok) setLeve(r.v); else setErroLer(r.erro); },
      (e: unknown) => { if (vivoLeitura) setErroLer(e instanceof Error && e.message ? e.message : "Não foi possível ler o Catálogo."); },
    );
    return () => { vivoLeitura = false; };
  }, [org, tentativa]);
  /** Relê as referências e as margens (a ficha e o Criar podem ter acrescentado categorias, marcas ou modelos). Sobe o erro; ignora o que chega depois de mudar de organização. */
  const relerReferencias = useCallback(async () => {
    if (!org) return;
    const r = await lerCatalogoLeve(org);
    if (!r.ok) throw new Error(r.erro);
    if (vivo.current && orgAtual.current === org) setLeve(r.v);
  }, [org]);

  const real = useMemo<FichaProdutoReal | undefined>(
    () => (org ? { org, podeEditar, podeMudarPrecos, podeStock, podeVerCusto, recarregar: async () => { marcarCatalogoDesatualizado(); try { await relerReferencias(); } catch { /* a lista fica com o que tem */ } } } : undefined),
    [org, podeEditar, podeMudarPrecos, podeStock, podeVerCusto, relerReferencias],
  );

  if (isLoading || (!org && !erroLer)) return <div className="p-6 text-muted-foreground">A carregar…</div>;
  if (!org || !real) return <div className="p-6">Escolha uma organização para ver o Catálogo e custos.</div>;

  const K = leve?.K ?? null, margens = leve?.margens ?? null;
  const irLista = () => navigate(CAMINHO_SECCAO.produtos);
  const separadores = (
    <div className="mb-6"><SeparadoresCatalogo grupo="produtos" ativo="lista" ir={(c) => navigate(c)} painelId={ID_PAINEL} /></div>
  );
  const painel = (filhos: ReactNode) => <div id={ID_PAINEL} role="tabpanel" aria-labelledby={idSeparadorCatalogo("lista")}>{filhos}</div>;
  const tentarDeNovo = <Button variant="outline" className="mt-3 min-h-11 text-[15px]" onClick={() => setTentativa((n) => n + 1)}>Tentar de novo</Button>;

  let corpo: ReactNode;
  if (erroLer) {
    corpo = <div className="mx-auto w-full max-w-3xl px-4 pt-8 sm:px-8"><p role="alert" className="text-[15px] text-destructive">{erroLer}</p>{tentarDeNovo}</div>;
  } else if (!K || !margens) {
    corpo = <p className="p-6 text-muted-foreground">A ler o Catálogo…</p>;
  } else if (criar === "produto") {
    corpo = (
      <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-8 sm:pt-10">
        {!perms.produtos ? (
          <div><p role="note" className="text-[15px] text-muted-foreground">Sem permissão para criar produtos (products.edit).</p>
            <Button variant="outline" className="mt-3 min-h-11 text-[15px]" onClick={() => setPesquisa({}, { replace: true })}>Voltar ao Catálogo</Button></div>
        ) : leve?.erroAtributos ? (
          <div>
            <p role="alert" className="text-[15px] text-destructive">Não foi possível ler os atributos: {leve.erroAtributos}. Sem eles não se cria o produto (podia ficar sem os atributos que a categoria exige).</p>
            {tentarDeNovo}
          </div>
        ) : (
          <CriarProduto org={org} K={K} margens={margens} real={real} vivo={vivo} servicos={servicos} voltar={() => setPesquisa({}, { replace: true })}
            outroTipo={(t: TipoCriar) => navigate(`${CAMINHO_SECCAO.servicos}?criar=${t}`, { replace: true })} gravar={setGravacao} anunciar={anunciar}
            depoisDeGravar={async (navegar) => {
              if (navegar) manterGravacao.current = true;
              try { await relerReferencias(); } catch { anunciar("O produto ficou criado, mas não foi possível reler as referências."); }
              if (vivo.current && navegar) setPesquisa({}, { replace: true });
            }} />
        )}
      </div>
    );
  } else if (id) {
    corpo = (
      <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-6 sm:px-8 sm:pt-10">
        {separadores}
        {painel(<FichaProdutoLeve id={id} K={K} real={real} min={margens.min} alvo={margens.alvo} voltar={irLista} anunciar={anunciar} nomeServico={nomeServico} servicos={servicos}
          relerReferencias={relerReferencias} onAbrirServico={(sid) => navigate(caminhoServico(sid))} />)}
      </div>
    );
  } else {
    corpo = (
      <div className="mx-auto w-full max-w-[90rem] px-4 pb-24 pt-8 sm:px-8 sm:pt-12">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="min-w-0 flex-1 text-3xl font-semibold tracking-tight">Catálogo e custos</h1>
          {perms.produtos && (
            <Button className="h-11 shrink-0 text-[15px] shadow-sm transition-transform hover:-translate-y-0.5" onClick={() => setPesquisa({ criar: "produto" })}>
              <Plus className="mr-1 h-5 w-5" aria-hidden="true" />Criar
            </Button>
          )}
        </div>
        <div className="mt-6">{separadores}</div>
        {painel(<ProdutosPagina K={K} real={real} nomeServico={nomeServico} onAbrir={(sid) => navigate(caminhoServico(sid))} onAbrirProduto={(pid) => navigate(caminhoProduto(pid))}
          margem={margens.alvo} anunciar={anunciar} />)}
      </div>
    );
  }

  return (
    <div className="pn calma pg-root min-h-full bg-background">
      <ProvedorPermissoesCatalogo valor={perms}>{corpo}</ProvedorPermissoesCatalogo>
      {/* a única região viva da página: o estado da gravação e os avisos das fichas */}
      <div aria-live="polite" role="status" aria-label="Avisos" className="pointer-events-none sticky bottom-4 z-10 mt-6 flex flex-col items-center gap-2 px-4">
        {gravacao.k === "a-gravar" && <p className="rounded-xl border border-border bg-card px-4 py-2 text-[15px] text-muted-foreground">A gravar {gravacao.n === 1 ? "1 mudança" : `${gravacao.n} mudanças`}…</p>}
        {gravacao.k === "gravado" && <p className="rounded-xl border border-border bg-card px-4 py-2 text-[15px] text-muted-foreground">Gravado</p>}
        {gravacao.k === "gravado" && gravacao.avisos.map((a, i) => <p key={`${i}:${a}`} className="rounded-xl border border-border bg-card px-4 py-2 text-[15px] text-amber-800 dark:text-amber-300">{a}</p>)}
        {gravacao.k === "erro" && <p className="pointer-events-auto rounded-xl border border-border bg-card px-4 py-2 text-[15px] text-destructive">Não gravou: {gravacao.t}</p>}
        {aviso && <p key={aviso.n} className="pointer-events-auto rounded-xl border border-border bg-card px-4 py-2 text-[15px] shadow-[var(--shadow-sm)]">{aviso.msg}</p>}
      </div>
    </div>
  );
}

/** O formulário de criar produto. O formulário escreve no Catálogo partilhado (catalogoStore); enquanto está aberto a store leva o Catálogo leve, e ao sair volta ao que tinha. */
function CriarProduto({ org, K, margens, real, vivo, servicos, voltar, outroTipo, gravar, depoisDeGravar, anunciar }: {
  org: string; K: Catalogo; margens: Margens; real: FichaProdutoReal; vivo: MutableRefObject<boolean>; voltar: () => void; outroTipo: (t: TipoCriar) => void;
  /** 23/11: os serviços da organização (null: ainda a ler; vazio: sem eles, o formulário fica sem «O serviço que traz»). */
  servicos: readonly ServicoEscolha[] | null;
  gravar: (g: Gravacao) => void; depoisDeGravar: (navegar: boolean) => Promise<void>; anunciar: (msg: string) => void;
}) {
  const guardado = useRef(lerCatalogoStore());
  const S = useMemo<Estado>(() => { const s = seed(); s.deals = []; s.svc = {}; s.cfg.min = margens.min; s.cfg.alvo = margens.alvo; return s; }, [margens.min, margens.alvo]);
  useEffect(() => {
    const original = guardado.current;
    porCatalogo(K);
    return () => porCatalogo(original);
  }, [K]);
  const opcoesSvc = useMemo(() => opcoesServicos(servicos ?? []), [servicos]);
  const gravando = useRef(false), montado = useRef(true);
  const [aGravar, setAGravar] = useState(false);
  useEffect(() => { montado.current = true; return () => { montado.current = false; }; }, []);

  const criado = (t: TipoCriar, _id: string, nome: string) => {
    if (gravando.current) return;
    gravando.current = true;
    setAGravar(true);
    // o que o formulário acrescentou ao Catálogo partilhado, comparado com o leve: SÓ o produto novo (23/11: sem receitas nem serviços, que esta página não lê;
    // antes cada receita da store parecia um serviço novo e a gravação partia em «duplicate key services_organization_id_sku_key» depois de criar o produto)
    const chamadas = diferencasProdutoNovo(org, K, lerCatalogoStore(), lerCustos(), margens);
    porCatalogo(K); // um segundo toque (ou uma nova tentativa, se falhar) não encontra o produto já criado
    void (async () => {
      gravar({ k: "a-gravar", n: chamadas.length });
      const r = await executarCatalogo(chamadas, rpc);
      gravando.current = false;
      // o que se gravou também está no Catálogo partilhado (useCatalogo): fica marcado como desatualizado, como na Gestão
      marcarCatalogoDesatualizado();
      if (!vivo.current) return; // a página já saiu: nada de reler, navegar nem mexer no estado
      if (r.erro) { gravar({ k: "erro", t: r.erro }); if (montado.current) setAGravar(false); return; }
      gravar({ k: "gravado", n: r.feitas, avisos: r.avisos });
      anunciar(`${t === "produto" ? "Produto" : "Item"} «${nome}» criado.`);
      await depoisDeGravar(montado.current);
      if (montado.current) setAGravar(false);
    })();
  };
  return (
    <CriarNoCatalogo S={S} C={lerCustos()} K={K} run={(fn) => fn()} tipo="produto" setTipo={(t) => (t === "produto" ? undefined : outroTipo(t))} voltar={voltar} onCriado={criado} real={real}
      produto={{ duplicado: (o) => procurarDuplicado(org, o), semServico: !servicos?.length, servicos: opcoesSvc, ocupado: aGravar ? "A gravar…" : undefined }} />
  );
}
