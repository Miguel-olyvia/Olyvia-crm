// 16/11: o separador Produtos do Catálogo REAL, por páginas do servidor. Com 14 328 produtos (Mudelar) ler tudo de uma vez dava timeout («o catálogo tem de ser
// separado em páginas»): a lista vem de cat_ler_produtos_pagina, 50 por página, com os filtros no servidor; a navegação por categorias e o resumo vêm de
// cat_ler_produtos_contagens. Fase 1: K.produtos continua a existir (receitas, ligações e autosave); aqui só serve para o «Traz:», a ilustração e a ficha.
// O protótipo (sem «real») continua em memória (função Produtos de CatalogoV1.tsx).
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { eur } from "./motor";
import type { SvcId } from "./motor";
import type { Catalogo, Produto } from "./v2/catalogoModelo";
import { ENTRADA, NavCategorias, PainelProdutos } from "./PainelCatalogo";
import { LISTA, NOTA, VALORES, REALCE, Novo, Procurar, Vazio } from "./pecasListaCatalogo";
import { ComboPesquisa, type ItemCombo } from "./ComboPesquisa";
import { Campo } from "./pecasForm";
import { FotoOuIlustracao } from "./ilustracoes";
import { BarraSelecao, CaixaLinha, useSelecao } from "./MarcarArmazens";
import { precoProduto } from "./fichaServico";
import { rotuloModelo } from "./modelosDados";
import { PROVISORIA } from "./ReferenciaFicha";
import type { FichaProdutoReal, Res } from "./fichaProdutoDados";
import {
  SEM_CATEGORIA_PRODUTO, SEM_FILTRO_PRODUTOS, categoriasDeProdutos, filtrarProdutosCatalogo, haProdutosSemCategoria, modelosDeProdutos, normalizarMarca, subcategoriasDeProdutos,
  type FiltroProdutos,
} from "./filtroProdutosCatalogo";
import {
  lerProdutosContagens, lerProdutosPagina, type ContagensProdutos, type FiltroServidor, type LinhaPaginaProduto, type PaginaProdutos,
} from "./real/produtosPaginados";

const ESPERA_PESQUISA = 300;
const ID_RAZAO_ANT = "prod-pag-razao-ant", ID_RAZAO_SEG = "prod-pag-razao-seg";

/* ------------------------------------------------------------------ leituras */
interface Leitura<T> { dados: T | null; erro: string | null; aLer: boolean; tentar: () => void }
/** Uma leitura ao servidor que se repete quando `deps` mudam. Mantém os dados anteriores enquanto lê (a lista não pisca); `ativa` false não lê. */
function useLeitura<T>(ler: () => Promise<Res<T>>, deps: readonly unknown[], ativa = true): Leitura<T> {
  const [e, setE] = useState<{ dados: T | null; erro: string | null; aLer: boolean }>({ dados: null, erro: null, aLer: ativa });
  const [n, setN] = useState(0);
  const lerRef = useRef(ler);
  lerRef.current = ler;
  useEffect(() => {
    if (!ativa) return undefined;
    let vivo = true;
    setE((x) => ({ ...x, erro: null, aLer: true }));
    lerRef.current().then(
      (r) => { if (vivo) setE((x) => (r.ok ? { dados: r.v, erro: null, aLer: false } : { ...x, erro: r.erro, aLer: false })); },
      (err: unknown) => { if (vivo) setE((x) => ({ ...x, erro: err instanceof Error && err.message ? err.message : "Não foi possível ler.", aLer: false })); },
    );
    return () => { vivo = false; };
  }, [...deps, n, ativa]); // eslint-disable-line react-hooks/exhaustive-deps
  const tentar = useCallback(() => setN((x) => x + 1), []);
  return { ...e, tentar };
}

/** Uma linha de erro curta, com «Tentar de novo». */
function ErroLeitura({ texto, erro, tentar }: { texto: string; erro: string; tentar: () => void }) {
  return (
    <p role="alert" className="mt-3 flex flex-wrap items-center gap-x-3 text-[15px] text-destructive">
      {texto}: {erro}
      <Button variant="outline" className="min-h-11 text-[15px]" onClick={tentar}>Tentar de novo</Button>
    </p>
  );
}

/* ------------------------------------------------------------------ as ligações entre os ids do ecrã e os da base */
/** Os filtros do ecrã usam os nós da árvore do Catálogo (o ofício dos serviços com o mesmo nome é o mesmo nó); a base recebe e devolve os ids de product_categories. */
function useIdsBase(K: Catalogo) {
  return useMemo(() => {
    const paraBase = new Map((K.categoriasProduto ?? []).map((c) => [c.id, c.origem ?? c.id]));
    return { baseDe: (no: string) => paraBase.get(no) ?? no };
  }, [K.categoriasProduto]);
}

const produtoDaLinha = (l: LinhaPaginaProduto): Produto => ({
  id: l.id, n: l.nome, custo: l.custo ?? 0, un: l.unidade || "un", marca: l.marca ?? "", fornecedor: l.fornecedor ?? "", data: "", no: null,
  ...(l.sku ? { sku: l.sku } : {}), ...(l.pvp != null && l.pvp > 0 ? { pvp: l.pvp } : {}), ...(l.imagem ? { fotos: [l.imagem] } : {}),
});

/* ------------------------------------------------------------------ o separador */
interface Props {
  K: Catalogo; real: FichaProdutoReal; nomeServico: (sid: SvcId) => string; onAbrir: (sid: SvcId) => void; onAbrirProduto: (id: string) => void;
  margem: number; novo?: string; anunciar: (msg: string) => void; extra?: ReactNode;
  /** O que a página trouxe (o CatalogoV1 guarda o modelo de cada produto para a ficha). */
  onLinhas?: (linhas: readonly LinhaPaginaProduto[]) => void;
}

export function ProdutosPagina({ K, real, nomeServico, onAbrir, onAbrirProduto, margem, novo, anunciar, extra, onLinhas }: Props) {
  const sl = useSelecao();
  const tocar = (id: string) => (sl.sel ? sl.alternar(id) : onAbrirProduto(id));
  const { baseDe } = useIdsBase(K);
  const [q, setQ] = useState(""), [qDeb, setQDeb] = useState("");
  const [f, setF] = useState<FiltroProdutos>(SEM_FILTRO_PRODUTOS);
  const [pagina, setPagina] = useState(1);
  const topo = useRef<HTMLParagraphElement>(null), focarAoChegar = useRef(false);

  // a pesquisa só vai ao servidor ~300 ms depois da última tecla, e volta à página 1
  useEffect(() => {
    if (q === qDeb) return undefined;
    const t = window.setTimeout(() => { setQDeb(q); setPagina(1); }, ESPERA_PESQUISA);
    return () => window.clearTimeout(t);
  }, [q, qDeb]);

  // os filtros que o ecrã oferece (a árvore e as marcas continuam a vir do arranque)
  const [contagensG, contagensF] = [useContagens(real.org, "", "", K, true), useContagens(real.org, qDeb, f.marca, K, !!(qDeb.trim() || f.marca.trim()))];
  const ctg = (qDeb.trim() || f.marca.trim() ? contagensF : contagensG).dados, ctgG = contagensG.dados;
  const semCat = ctgG ? ctgG.semCategoria > 0 : haProdutosSemCategoria(K);
  const nomeRamo = (x: { n: string; inativa?: true }) => (x.inativa ? `${x.n} (desativada)` : x.n);
  const cats = useMemo(() => [...categoriasDeProdutos(K).map((x): ItemCombo => ({ id: x.id, nome: nomeRamo(x) })), ...(semCat ? [{ id: SEM_CATEGORIA_PRODUTO, nome: "Sem categoria de produto" }] : [])], [K.arvore, K.produtos, K.categoriasProduto, semCat]); // eslint-disable-line react-hooks/exhaustive-deps
  const marcas = useMemo(() => { const vistas = new Set<string>(); return K.marcas.map((m) => m.trim()).filter((m) => { const k = normalizarMarca(m); if (!k || vistas.has(k)) return false; vistas.add(k); return true; }).map((m): ItemCombo => ({ id: m, nome: m })); }, [K.marcas]);
  const cat = !f.cat || cats.some((x) => x.id === f.cat) ? f.cat : "";
  const subs = useMemo(() => subcategoriasDeProdutos(K, cat).map((x): ItemCombo => ({ id: x.id, nome: nomeRamo(x) })), [K.arvore, K.produtos, K.categoriasProduto, cat]); // eslint-disable-line react-hooks/exhaustive-deps
  const sub = cat && subs.some((x) => x.id === f.sub) ? f.sub : "";
  const usados = useMemo(() => new Set(Object.keys(ctgG?.porModelo ?? {})), [ctgG]);
  const modelosFiltro = useMemo(() => modelosDeProdutos(K, sub, usados).map((x): ItemCombo => ({ id: x.id, nome: x.inativa ? `${x.n} (desativado)` : x.n })), [K.modelos, sub, usados]); // eslint-disable-line react-hooks/exhaustive-deps
  const modelo = modelosFiltro.some((x) => x.id === f.modelo) ? f.modelo ?? "" : "";
  const fe: FiltroProdutos = { cat, sub, marca: marcas.some((x) => normalizarMarca(x.nome) === normalizarMarca(f.marca)) ? f.marca : "", modelo };
  useEffect(() => { if (fe.cat !== f.cat || fe.sub !== f.sub || fe.marca !== f.marca || modelo !== (f.modelo ?? "")) setF(fe); }, [fe.cat, fe.sub, fe.marca, modelo]); // eslint-disable-line react-hooks/exhaustive-deps
  const mudar = (p: Partial<FiltroProdutos>) => { setF((a) => ({ ...a, ...p })); setPagina(1); };
  const atual = (itens: readonly ItemCombo[], id: string): ItemCombo | null => (id ? itens.find((x) => normalizarMarca(x.id) === normalizarMarca(id)) ?? null : null);

  // a lista: o que o servidor devolve para a pesquisa e os filtros
  const semCategoria = fe.cat === SEM_CATEGORIA_PRODUTO;
  const filtro: FiltroServidor = { q: qDeb, categoria: cat && !semCategoria ? baseDe(cat) : "", subcategoria: sub ? baseDe(sub) : "", modelo, marca: fe.marca, semCategoria };
  const pag = useLeitura<PaginaProdutos>(() => lerProdutosPagina(real.org, filtro, pagina), [real.org, qDeb, filtro.categoria, filtro.subcategoria, modelo, fe.marca, semCategoria, pagina, K]);
  const dados = pag.dados;
  useEffect(() => { if (dados && dados.paginas > 0 && pagina > dados.paginas) setPagina(dados.paginas); }, [dados, pagina]);
  useEffect(() => { if (dados) onLinhas?.(dados.produtos); }, [dados]); // eslint-disable-line react-hooks/exhaustive-deps
  // depois de mudar de página o foco vai ao topo da lista, que anuncia «Página X de Y» (aria-live)
  useEffect(() => { if (focarAoChegar.current && dados && !pag.aLer) { focarAoChegar.current = false; topo.current?.focus(); } }, [dados, pag.aLer]);
  const irPara = (p: number) => { focarAoChegar.current = true; setPagina(p); };

  const porId = useMemo(() => new Map(K.produtos.map((p) => [p.id, p])), [K.produtos]);
  const nav = useMemo(() => {
    const grupo = (id: string) => (ctg ? ctg.porCategoria[baseDe(id)] ?? 0 : filtrarProdutosCatalogo(K, K.produtos, { cat: id, sub: "", marca: "" }).length);
    return { total: ctg ? ctg.total : K.produtos.length, grupos: cats.map((c) => ({ id: c.id, nome: c.nome, n: c.id === SEM_CATEGORIA_PRODUTO ? (ctg?.semCategoria ?? grupo(c.id)) : grupo(c.id) })) };
  }, [K, cats, ctg, baseDe]);
  const resumo = useMemo(() => ({
    total: ctgG ? ctgG.total : K.produtos.length,
    semReferencia: ctgG ? ctgG.semReferencia : K.produtos.filter((p) => !p.sku || PROVISORIA.test(p.sku)).length,
    semCategoria: ctgG ? ctgG.semCategoria : filtrarProdutosCatalogo(K, K.produtos, { cat: SEM_CATEGORIA_PRODUTO, sub: "", marca: "" }).length,
    semMarca: ctgG ? ctgG.semMarca : K.produtos.filter((p) => !p.marca?.trim()).length,
  }), [K, ctgG]);

  const linhas = dados?.produtos ?? [];
  const total = dados?.total ?? 0;
  const estado = !dados ? (pag.aLer ? "A ler os produtos…" : "") : total === 0 ? "0 produtos" : `Página ${dados.pagina} de ${Math.max(dados.paginas, 1)} · ${total === 1 ? "1 produto" : `${total} produtos`}`;
  const erroContagens = (qDeb.trim() || f.marca.trim() ? contagensF : contagensG);
  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[13rem_minmax(0,1fr)_20rem]">
      <div className="min-w-0 xl:col-start-2 xl:row-start-1">
        <div className="flex flex-wrap items-end gap-3">
          <Procurar v={q} onChange={setQ} rotulo="Procurar produto" ph="Nome, marca, referência ou subcategoria" />
          <Campo rot="Categoria" className="w-full sm:w-56">{(id) => (
            <ComboPesquisa id={id} rotulo="Categoria" itens={cats} atual={atual(cats, fe.cat)} semValor="Todas as categorias" semValorComoValor placeholder="Todas as categorias" vazio="Nenhuma categoria encontrada"
              onEscolher={(i) => mudar({ cat: i.id, sub: "", modelo: "" })} />
          )}</Campo>
          <Campo rot="Subcategoria" dica={!fe.cat ? "Escolha primeiro a categoria." : fe.cat === SEM_CATEGORIA_PRODUTO ? "«Sem categoria de produto» não tem subcategorias." : undefined} className="w-full sm:w-56">{(id) => (
            <ComboPesquisa id={id} rotulo="Subcategoria" itens={subs} atual={atual(subs, fe.sub)} desativado={!fe.cat || fe.cat === SEM_CATEGORIA_PRODUTO} semValor="Todas as subcategorias" semValorComoValor placeholder="Todas as subcategorias" vazio="Nenhuma subcategoria encontrada"
              onEscolher={(i) => mudar({ sub: i.id, modelo: "" })} />
          )}</Campo>
          {K.modelos && (
            <Campo rot="Modelo" dica={!sub ? "Escolha primeiro a subcategoria." : undefined} className="w-full sm:w-56">{(id) => (
              <ComboPesquisa id={id} rotulo="Modelo" itens={modelosFiltro} atual={atual(modelosFiltro, modelo)} desativado={!sub} semValor="Todos os modelos" semValorComoValor placeholder="Todos os modelos" vazio="Esta subcategoria não tem modelos"
                onEscolher={(i) => mudar({ modelo: i.id })} />
            )}</Campo>
          )}
          <Campo rot="Marca" className="w-full sm:w-56">{(id) => (
            <ComboPesquisa id={id} rotulo="Marca" itens={marcas} atual={atual(marcas, fe.marca)} semValor="Todas as marcas" semValorComoValor placeholder="Todas as marcas" vazio="Nenhuma marca encontrada"
              onEscolher={(i) => mudar({ marca: i.id })} />
          )}</Campo>
          {!sl.sel && <BarraSelecao s={sl} filtrados={linhas} real={real} anunciar={anunciar} tipo="produtos" />}
        </div>
        {sl.sel && <BarraSelecao s={sl} filtrados={linhas} real={real} anunciar={anunciar} tipo="produtos" />}
        <p ref={topo} tabIndex={-1} className={cn(NOTA, "mt-4 outline-none")} aria-live="polite">{estado}</p>
        {pag.erro && <ErroLeitura texto="Não foi possível ler os produtos" erro={pag.erro} tentar={pag.tentar} />}
        {erroContagens.erro && <ErroLeitura texto="Não foi possível ler as contagens" erro={erroContagens.erro} tentar={erroContagens.tentar} />}
        <ul className={cn(LISTA, "mt-2", pag.aLer && dados && "opacity-60")} aria-busy={pag.aLer}>
          {linhas.map((l) => <LinhaProduto key={l.id} l={l} K={porId.get(l.id)} margem={margem} novo={novo} tocar={tocar} sl={sl} onAbrir={onAbrir} nomeServico={nomeServico} />)}
          {dados && !linhas.length && <Vazio>Nenhum produto com esse nome ou filtro.</Vazio>}
        </ul>
        {dados && dados.paginas > 0 && <NavegacaoPaginas pagina={dados.pagina} paginas={Math.max(dados.paginas, 1)} aLer={pag.aLer} irPara={irPara} />}
        {extra}
      </div>
      <div className="xl:col-start-1 xl:row-start-1">
        <NavCategorias grupos={nav.grupos} total={nav.total} sel={fe.cat} onSel={(id) => mudar({ cat: id, sub: "", modelo: "" })} />
      </div>
      <div className="hidden lg:col-start-2 lg:row-start-1 lg:block xl:col-start-3">
        <div className="lg:sticky lg:top-6">
          <PainelProdutos {...resumo} onSemCategoria={semCat ? () => { setQ(""); setQDeb(""); mudar({ cat: SEM_CATEGORIA_PRODUTO, sub: "", marca: "", modelo: "" }); } : undefined} />
        </div>
      </div>
    </div>
  );
}

/** As contagens (cat_ler_produtos_contagens): a pesquisa e a marca valem para a navegação; o resumo é sobre o Catálogo todo (sem pesquisa nem marca). */
function useContagens(org: string, q: string, marca: string, K: Catalogo, ativa: boolean) {
  return useLeitura<ContagensProdutos>(() => lerProdutosContagens(org, q, marca), [org, q, marca, K], ativa);
}

/* ------------------------------------------------------------------ a linha e a navegação */
function LinhaProduto({ l, K, margem, novo, tocar, sl, onAbrir, nomeServico }: {
  l: LinhaPaginaProduto; K: Produto | undefined; margem: number; novo?: string; tocar: (id: string) => void; sl: ReturnType<typeof useSelecao>;
  onAbrir: (sid: SvcId) => void; nomeServico: (sid: SvcId) => string;
}) {
  const p = produtoDaLinha(l);
  const semPreco = l.pvp == null && l.custo == null;
  const detalhe = [l.marca, l.modelo ? rotuloModelo({ numero: l.modelo_numero ?? 0, nome: l.modelo }) : "", l.sku ? `ref. ${l.sku}` : ""].filter(Boolean).join(" · ");
  return (
    <li onClick={() => tocar(l.id)} className={cn("group flex min-h-[4.5rem] cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 py-3 sm:flex-nowrap sm:gap-4", l.id === novo && REALCE)}>
      <CaixaLinha id={l.id} nome={l.nome} s={sl} />
      <FotoOuIlustracao fotos={p.fotos} nome={l.nome} k={K?.img ?? "generico"} />
      <span className="min-w-0 flex-1">
        <button id={`prod-${l.id}`} type="button" onClick={(e) => { e.stopPropagation(); tocar(l.id); }} className="block text-left text-[15px] font-medium group-hover:underline">{l.nome}{l.id === novo && <Novo />}</button>
        {detalhe && <span className={cn(NOTA, "block")}>{detalhe}</span>}
        {l.atributos_resumo && <span className={cn(NOTA, "block")}>{l.atributos_resumo}</span>}
        {K?.servico && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onAbrir(K.servico!); }} className="mt-0.5 inline-flex min-h-11 items-center text-left text-[15px] font-medium text-primary underline-offset-4 hover:underline sm:min-h-0">
            Traz: {nomeServico(K.servico)}
          </button>
        )}
      </span>
      <span className={cn(VALORES, "pl-[4.75rem] sm:pl-0")}>
        <span className="block text-[15px] font-medium tabular-nums">{semPreco ? "—" : <>{eur(precoProduto(p, margem))} €/{p.un}</>}</span>
      </span>
    </li>
  );
}

function NavegacaoPaginas({ pagina, paginas, aLer, irPara }: { pagina: number; paginas: number; aLer: boolean; irPara: (p: number) => void }) {
  const primeira = pagina <= 1, ultima = pagina >= paginas;
  const botao = (rotulo: string, desativado: boolean, razao: string, idRazao: string, alvo: number) => (
    <>
      <Button variant="outline" className="min-h-11 text-[15px]" disabled={desativado} aria-describedby={desativado ? idRazao : undefined} title={desativado ? razao : undefined} onClick={() => irPara(alvo)}>{rotulo}</Button>
      {desativado && <span id={idRazao} className="sr-only">{razao}</span>}
    </>
  );
  return (
    <nav aria-label="Páginas de produtos" aria-busy={aLer} className={cn("mt-4 flex flex-wrap items-center gap-3", ENTRADA)}>
      {botao("Anterior", primeira, "Já está na primeira página.", ID_RAZAO_ANT, pagina - 1)}
      {botao("Seguinte", ultima, "Já está na última página.", ID_RAZAO_SEG, pagina + 1)}
    </nav>
  );
}
