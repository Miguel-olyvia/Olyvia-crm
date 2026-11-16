// 16/11: o separador «Subcategorias» da gestão do Catálogo: a lista plana das subcategorias dos produtos (como ProductSubcategories da aplicação), com
// pesquisa, filtro por categoria e por estado. Criar (categoria + nome), renomear, ativar/desativar e reordenar dentro da mesma categoria. Mudar uma
// subcategoria de categoria não existe (a base recusa). Só com products.edit (sem ela, leitura); as partilhadas só se leem. Lê a mesma função das
// Categorias (cat_ler_categorias_gestao) e grava pelas mesmas (categoriasAcoes.tsx): relê-se depois de cada gravação, também em falha.
import { useCallback, useId, useMemo, useRef, useState } from "react";
import { Check, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { CAMPO, CHIP, NOTA, Campo } from "./pecasForm";
import type { FichaProdutoReal } from "./fichaProdutoDados";
import { lerCategoriasGestao, type CategoriaGestao, type SubcategoriaGestao } from "./categoriasMarcasGestao";
import { Acoes, EditarSigla, Renomear, useAcoesCategorias, type Ctx } from "./categoriasAcoes";
import { SiglaTexto } from "./siglasGestao";
import { ComboPesquisa, semAcentos, type ItemCombo } from "./ComboPesquisa";
import { BOTAO_TEXTO, CARTAO, EstadoLeitura, FormNome, Razao, Selo, produtos, protegido, useGestaoLista } from "./gestaoPecas";

type Estado = "todas" | "ativas" | "desativadas";
const ESTADOS: readonly (readonly [Estado, string])[] = [["todas", "Todas"], ["ativas", "Ativas"], ["desativadas", "Desativadas"]];
interface Linha { s: SubcategoriaGestao; c: CategoriaGestao }
const ID_TITULO = "tit-subcategorias";
const BORDA = "border-foreground/40";
const SEM_ORDEM = "Limpe a pesquisa e os filtros para reordenar.";
const RAZAO_BLOQUEADA = "Reative primeiro a categoria na aba Categorias.";

export function GestaoSubcategorias({ real, anunciar }: { real: FichaProdutoReal; anunciar: (msg: string) => void }) {
  const { podeEditar } = real;
  const g = useGestaoLista(real, lerCategoriasGestao, anunciar, "Não tem permissão para ver as subcategorias.");
  const [q, setQ] = useState("");
  const [catId, setCatId] = useState<string | null>(null);
  const [estado, setEstado] = useState<Estado>("todas");
  const nomeEstado = useId();
  const vistasRef = useRef<Linha[]>([]);
  /** Se a linha desaparece por causa do filtro (desativar com «Ativas»), o foco vai para a editável mais próxima, e por fim para o título. */
  const focoApos = (item: SubcategoriaGestao) => {
    const v = vistasRef.current, i = v.findIndex((x) => x.s.id === item.id);
    const vizinhas = [...v.slice(i + 1), ...v.slice(0, Math.max(i, 0)).reverse()].filter((x) => !x.s.global);
    return [...vizinhas.map((x) => `act-${x.s.id}`), ID_TITULO].join("|");
  };
  const limparFiltros = () => { setQ(""); setCatId(null); setEstado("todas"); };
  const { ctx: ctxBase, aberto, fechar } = useAcoesCategorias(real, g, () => "novo-subcategoria", { focoApos, aoCriar: limparFiltros });
  const lista = g.lista;

  const itensFiltro = useMemo<ItemCombo[]>(() => (lista ?? []).map((c) => ({ id: c.id, nome: c.ativo ? c.nome : `${c.nome} (desativada)` })), [lista]);
  const catAtual = itensFiltro.find((i) => i.id === catId) ?? null; // o rótulo vem da lista de agora, não do que se escolheu
  const linhas = useMemo<Linha[]>(() => (lista ?? []).flatMap((c) => c.subcategorias.map((s) => ({ s, c }))), [lista]);
  const vistas = useMemo(() => {
    const t = semAcentos(q.trim());
    return linhas.filter(({ s, c }) =>
      (!t || semAcentos(s.nome).includes(t)) && (!catAtual || c.id === catAtual.id) && (estado === "todas" || (estado === "ativas") === s.ativo));
  }, [linhas, q, catAtual, estado]);
  vistasRef.current = vistas;
  const grupos = useMemo(() => vistas.reduce<{ c: CategoriaGestao; filas: Linha[] }[]>((acc, l) => {
    const ultimo = acc[acc.length - 1];
    if (ultimo && ultimo.c.id === l.c.id) ultimo.filas.push(l); else acc.push({ c: l.c, filas: [l] });
    return acc;
  }, []), [vistas]);
  const filtra = !!q.trim() || !!catAtual || estado !== "todas";
  const ctx: Ctx = { ...ctxBase, semOrdem: filtra ? SEM_ORDEM : null, razaoBloqueada: RAZAO_BLOQUEADA };
  const elegiveis = useMemo(() => (lista ?? []).filter((c) => c.ativo && !c.global), [lista]);
  const aCriar = aberto?.t === "nova" && aberto.pai === null;
  const razaoNova = g.aGravar ? "A guardar…" : !elegiveis.length ? "Não há categorias ativas: crie ou reative uma categoria primeiro." : null;

  return (
    <div className="grid gap-5">
      <h2 id={ID_TITULO} tabIndex={-1} className="text-xl font-semibold outline-none">Subcategorias</h2>
      <p className={NOTA}>Cada subcategoria pertence a uma categoria e não muda de categoria: crie-a na categoria certa. Desativar esconde-a dos produtos novos; os que já a têm mantêm-na.</p>
      {lista && !podeEditar && <p role="note" className={cn(NOTA, "rounded-xl bg-muted/50 p-3")}>Só de leitura: para mudar as subcategorias precisa da permissão de editar produtos.</p>}
      <EstadoLeitura o={g} lido={!!lista} nomes="as subcategorias" />
      {lista && (
        <>
          {podeEditar && (
            <div className="grid gap-3">
              <div>
                <button id="novo-subcategoria" type="button" aria-expanded={aCriar} className={BOTAO_TEXTO} {...protegido(razaoNova, "rz-novo-subcategoria", () => ctx.abrir({ t: "nova", pai: null }))}>
                  <Plus className="h-4 w-4" aria-hidden="true" />Nova subcategoria
                </button>
                <Razao id="rz-novo-subcategoria">{razaoNova}</Razao>
              </div>
              {!elegiveis.length && !g.aGravar && <p className={NOTA} aria-hidden="true">{razaoNova}</p>}
              {aCriar && <NovaSubcategoria elegiveis={elegiveis} g={ctx} aGravar={g.aGravar} msg={g.msg} onFechar={() => fechar("novo-subcategoria")} />}
            </div>
          )}
          {!linhas.length && <p className={NOTA}>Ainda não há subcategorias.</p>}
          {linhas.length > 0 && (
            <section aria-label="Subcategorias" className={CARTAO}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <input type="search" aria-label="Procurar subcategoria" placeholder="Procurar subcategoria" value={q} onChange={(e) => setQ(e.target.value)} className={cn(CAMPO, "pl-9", BORDA)} />
                </div>
                <ComboPesquisa rotulo="Filtrar por categoria" itens={itensFiltro} atual={catAtual} semValor="Todas as categorias" semValorComoValor classeCampo={BORDA}
                  onEscolher={(i) => setCatId(i.id || null)} />
              </div>
              <fieldset className="mt-3 min-w-0 border-0 p-0">
                <legend className={cn(NOTA, "mb-2 p-0")}>Estado</legend>
                <div className="flex flex-wrap gap-2">
                  {ESTADOS.map(([v, rot]) => (
                    <label key={v} className={cn(CHIP(estado === v), estado !== v && BORDA, "cursor-pointer outline outline-2 outline-transparent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background")}>
                      <input type="radio" name={nomeEstado} value={v} checked={estado === v} onChange={() => setEstado(v)} className="sr-only" />
                      {estado === v && <Check className="h-4 w-4" aria-hidden="true" />}{rot}
                    </label>
                  ))}
                </div>
              </fieldset>
              {/* a região de estado está sempre montada: quem pesquisa ou filtra ouve quantas ficam */}
              <p role="status" className="sr-only">{vistas.length === 0 ? "Nenhuma subcategoria encontrada" : vistas.length === 1 ? "1 subcategoria" : `${vistas.length} subcategorias`}</p>
              {vistas.length > 0 ? (
                <div className="mt-4 grid gap-4">
                  {grupos.map(({ c, filas }) => (
                    <div key={c.id}>
                      <h3 id={`gs-${c.id}`} className="text-[15px] font-semibold">{c.nome}{!c.ativo && " (desativada)"}</h3>
                      <ul aria-labelledby={`gs-${c.id}`} className="mt-2 grid gap-2">
                        {filas.map(({ s }) => <LinhaSub key={s.id} s={s} c={c} g={ctx} />)}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : <p className={cn(NOTA, "mt-3")}>Nenhuma subcategoria encontrada.</p>}
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** Criar: escolhe-se a categoria (só as ativas e da organização) e escreve-se o nome. O foco começa na categoria, que vem primeiro e é obrigatória. */
function NovaSubcategoria({ elegiveis, g, aGravar, msg, onFechar }: { elegiveis: CategoriaGestao[]; g: Ctx; aGravar: boolean; msg: (onde: string) => string | null; onFechar: () => void }) {
  const [cat, setCat] = useState<ItemCombo | null>(null);
  const itens = useMemo<ItemCombo[]>(() => elegiveis.map((c) => ({ id: c.id, nome: c.nome })), [elegiveis]);
  const focar = useCallback((el: HTMLInputElement | null) => { el?.focus(); }, []);
  const escolhida = elegiveis.find((c) => c.id === cat?.id) ?? null;
  const exige = escolhida ? null : cat ? "Essa categoria já não está disponível: escolha outra." : "Escolha a categoria.";
  return (
    // o erro da gravação fica visível mesmo que a categoria deixe de ser elegível entretanto
    <FormNome rotuloNome="Nome da subcategoria" inicial="" botao="Criar subcategoria" aGravar={aGravar} erro={cat ? msg(`nova:${cat.id}`) : null} idGuardar="gc-novo-sub" exige={exige}
      antes={<Campo rot="Categoria">{(id) => <ComboPesquisa id={id} rotulo="Categoria" itens={itens} atual={cat} placeholder="Escolher a categoria" obrigatorio classeCampo={BORDA} registar={focar} onEscolher={(i) => setCat(i.id ? i : null)} />}</Campo>}
      onEnviar={(nome) => { if (escolhida) g.onCriar(escolhida, nome); }} onCancelar={onFechar} />
  );
}

/** Uma subcategoria: nome, categoria pai, estado em texto, produtos e as ações (só quem edita, e não as partilhadas). */
function LinhaSub({ s, c, g }: { s: SubcategoriaGestao; c: CategoriaGestao; g: Ctx }) {
  const irmas = c.subcategorias.filter((x) => !x.global);
  const bloqueada = !s.ativo && !c.ativo;
  return (
    <li className="rounded-xl bg-muted/50 p-2 pl-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={cn("min-w-0 break-words text-[15px] font-medium", !s.ativo && "text-muted-foreground")}>{s.nome}</span>
        {!s.ativo && <Selo>desativada</Selo>}
        {s.global && <Selo>Partilhada</Selo>}
        <SiglaTexto sigla={s.sigla} />
        <span className="text-sm text-muted-foreground">Categoria: {c.nome}{!c.ativo && " (desativada)"}</span>
        {s.usados != null && <span className="text-sm text-muted-foreground">{produtos(s.usados)}</span>}
        <Acoes item={s} pai={c} irmas={irmas} g={g} tipo="a subcategoria" />
      </div>
      {g.podeEditar && !s.global && bloqueada && <p className="mt-1 text-sm text-muted-foreground" aria-hidden="true">{g.razaoBloqueada}</p>}
      {g.msg(`est:${s.id}`) && <p className="mt-2 text-[15px] text-red-700 dark:text-red-400" role="alert">{g.msg(`est:${s.id}`)}</p>}
      <Renomear item={s} pai={c} g={g} />
      <EditarSigla item={s} pai={c} g={g} />
    </li>
  );
}
