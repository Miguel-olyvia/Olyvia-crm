// 16/11: o separador «Modelos» da gestão do Catálogo (Categoria › Subcategoria › Modelo). O modelo define o NNNN do SKU («0001 · SORTY»); a marca só
// identifica e filtra. Lista agrupada por categoria › subcategoria, com os produtos que cada modelo usa e o estado; pesquisa e filtros por categoria
// e subcategoria; criar (subcategoria + nome, número automático ou fixado), renomear e ativar/desativar. A subcategoria e o número não mudam depois
// de criado (a base recusa). Só com products.edit (sem ela, leitura). Lê cat_ler_modelos_gestao e grava por modelosDados.ts: relê-se depois de cada
// gravação, também em falha (useGestaoLista.correr). As subcategorias onde se pode criar vêm de cat_ler_categorias_gestao.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Plus, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { CAMPO, NOTA, Campo } from "./pecasForm";
import type { FichaProdutoReal } from "./fichaProdutoDados";
import { lerCategoriasGestao, type CategoriaGestao } from "./categoriasMarcasGestao";
import { estadoModelo, guardarModelo, lerModelosGestao, numeroSku, rotuloModelo, type ModeloGestao } from "./modelosDados";
import { ComboPesquisa, semAcentos, type ItemCombo } from "./ComboPesquisa";
import { BOTAO_ICONE, BOTAO_TEXTO, CARTAO, ConfirmarMudanca, EstadoLeitura, FormNome, Razao, Selo, produtos, protegido, useGestaoLista } from "./gestaoPecas";

const ID_TITULO = "tit-modelos";
const BORDA = "border-foreground/40";
const RAZAO_SUB_DESATIVADA = "Reative primeiro a subcategoria na aba Subcategorias.";
type Aberto = { t: "nova" } | { t: "renomear"; id: string };
interface Grupo { chave: string; categoria: string; subcategoria: string; modelos: ModeloGestao[] }

const numeroDe = (t: string): number | null => (/^\d{1,4}$/.test(t.trim()) ? Number(t.trim()) : null);

export function GestaoModelos({ real, anunciar }: { real: FichaProdutoReal; anunciar: (msg: string) => void }) {
  const { org, podeEditar } = real;
  const g = useGestaoLista(real, lerModelosGestao, anunciar, "Não tem permissão para ver os modelos.");
  const lista = g.lista;
  const [q, setQ] = useState("");
  const [catId, setCatId] = useState<string | null>(null);
  const [subId, setSubId] = useState<string | null>(null);
  const [aberto, setAberto] = useState<Aberto | null>(null);
  const [pend, setPend] = useState<{ id: string; nome: string } | null>(null);

  // as subcategorias onde se pode criar (ativas e da organização); lê-se à parte: uma subcategoria sem modelos não está na lista dos modelos
  const [cats, setCats] = useState<CategoriaGestao[] | null>(null);
  const [erroCats, setErroCats] = useState<string | null>(null);
  const orgAtual = useRef(org);
  orgAtual.current = org;
  useEffect(() => {
    setCats(null); setErroCats(null);
    const deste = org;
    void lerCategoriasGestao(org).then((r) => {
      if (orgAtual.current !== deste) return;
      if (r.ok) setCats(r.v); else setErroCats(r.codigo === "CT001" ? "Não tem permissão para ver as subcategorias." : r.erro);
    });
  }, [org]);

  const abrir = (a: Aberto) => { setAberto(a); g.setErro(null); setPend(null); };
  const fechar = (focar?: string) => { setAberto(null); g.setErro(null); setPend(null); if (focar) g.setFoco(focar); };
  const limparFiltros = () => { setQ(""); setCatId(null); setSubId(null); };

  const modelos = useMemo(() => lista ?? [], [lista]);
  const itensCat = useMemo<ItemCombo[]>(() => {
    const m = new Map<string, string>();
    for (const x of modelos) if (x.categoria) m.set(x.categoria.id, x.categoria.nome);
    return [...m].map(([id, nome]) => ({ id, nome }));
  }, [modelos]);
  const catAtual = itensCat.find((i) => i.id === catId) ?? null;
  const itensSub = useMemo<ItemCombo[]>(() => {
    const m = new Map<string, string>();
    for (const x of modelos) if (catAtual && x.categoria?.id === catAtual.id) m.set(x.subcategoria.id, x.subcategoria.nome);
    return [...m].map(([id, nome]) => ({ id, nome }));
  }, [modelos, catAtual]);
  const subAtual = itensSub.find((i) => i.id === subId) ?? null;

  const vistos = useMemo(() => {
    const t = semAcentos(q.trim());
    return modelos.filter((m) => (!t || semAcentos(m.nome).includes(t) || numeroSku(m.numero).includes(t)) && (!catAtual || m.categoria?.id === catAtual.id) && (!subAtual || m.subcategoria.id === subAtual.id));
  }, [modelos, q, catAtual, subAtual]);
  const grupos = useMemo(() => vistos.reduce<Grupo[]>((acc, m) => {
    const u = acc[acc.length - 1];
    if (u && u.chave === m.subcategoria.id) u.modelos.push(m);
    else acc.push({ chave: m.subcategoria.id, categoria: m.categoria?.nome ?? "", subcategoria: m.subcategoria.nome, modelos: [m] });
    return acc;
  }, []), [vistos]);

  const elegiveis = useMemo(() => (cats ?? []).filter((c) => !c.global).flatMap((c) => c.subcategorias.filter((s) => s.ativo && !s.global && c.ativo).map((s) => ({ id: s.id, nome: s.nome, cat: c.nome }))), [cats]);
  const aCriar = aberto?.t === "nova";
  const razaoNovo = g.aGravar ? "A guardar…" : !cats ? (erroCats ?? "A ler as subcategorias…") : !elegiveis.length ? "Não há subcategorias ativas: crie ou reative uma subcategoria primeiro." : null;

  const criar = (sub: { id: string; nome: string }, nome: string, numero: number | null) =>
    void g.correr(() => guardarModelo(org, { id: null, subcategoria: sub.id, nome, numero }), (v) => {
      const n = (v as { modelo?: { numero?: unknown } } | null)?.modelo?.numero;
      return `Modelo «${nome}» criado em «${sub.nome}»${typeof n === "number" ? ` com o número ${numeroSku(n)}` : ""}.`;
    }, `nova:${sub.id}`).then((ok) => { if (ok) { limparFiltros(); fechar("novo-modelo"); } });
  const gravarNome = (m: ModeloGestao, nome: string) =>
    g.correr(() => guardarModelo(org, { id: m.id, subcategoria: null, nome, numero: null }), `Modelo «${nome}» guardado.`, `ren:${m.id}`).then((ok) => { if (ok) fechar(`ren-mod-${m.id}`); });
  const renomear = (m: ModeloGestao, nome: string) => { if (m.usados === 0) { void gravarNome(m, nome); return; } g.setErro(null); setPend({ id: m.id, nome }); };
  const ativar = (m: ModeloGestao) => {
    const ativo = !m.ativo;
    void g.correr(() => estadoModelo(org, m.id, ativo), `Modelo «${m.nome}» ${ativo ? "reativado" : "desativado"}.`, `est:${m.id}`).then(() => g.setFoco(`act-mod-${m.id}`));
  };

  return (
    <div className="grid gap-5">
      <h2 id={ID_TITULO} tabIndex={-1} className="text-xl font-semibold outline-none">Modelos</h2>
      <p className={NOTA}>Cada modelo fica debaixo de uma subcategoria e define o número de 4 dígitos da referência (SORTY 0001, STONE PLUS 0002…): todos os produtos do modelo partilham-no. A marca não conta para o número. O número e a subcategoria não mudam depois de criado. Desativar esconde o modelo dos produtos novos; os que já o têm mantêm-no.</p>
      {lista && !podeEditar && <p role="note" className={cn(NOTA, "rounded-xl bg-muted/50 p-3")}>Só de leitura: para mudar os modelos precisa da permissão de editar produtos.</p>}
      <EstadoLeitura o={g} lido={!!lista} nomes="os modelos" />
      {lista && (
        <>
          {podeEditar && (
            <div className="grid gap-3">
              <div>
                <button id="novo-modelo" type="button" aria-expanded={aCriar} className={BOTAO_TEXTO} {...protegido(razaoNovo, "rz-novo-modelo", () => abrir({ t: "nova" }))}>
                  <Plus className="h-4 w-4" aria-hidden="true" />Novo modelo
                </button>
                <Razao id="rz-novo-modelo">{razaoNovo}</Razao>
              </div>
              {razaoNovo && !g.aGravar && <p className={NOTA} aria-hidden="true">{razaoNovo}</p>}
              {aCriar && <NovoModelo elegiveis={elegiveis} modelos={modelos} g={g} onCriar={criar} onFechar={() => fechar("novo-modelo")} />}
            </div>
          )}
          {!modelos.length && <p className={NOTA}>Ainda não há modelos.</p>}
          {modelos.length > 0 && (
            <section aria-label="Modelos" className={CARTAO}>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <input type="search" aria-label="Procurar modelo" placeholder="Procurar modelo" value={q} onChange={(e) => setQ(e.target.value)} className={cn(CAMPO, "pl-9", BORDA)} />
                </div>
                <ComboPesquisa rotulo="Filtrar por categoria" itens={itensCat} atual={catAtual} semValor="Todas as categorias" semValorComoValor classeCampo={BORDA}
                  onEscolher={(i) => { setCatId(i.id || null); setSubId(null); }} />
                <div>
                  <ComboPesquisa rotulo="Filtrar por subcategoria" itens={itensSub} atual={subAtual} semValor="Todas as subcategorias" semValorComoValor classeCampo={BORDA}
                    desativado={!catAtual} onEscolher={(i) => setSubId(i.id || null)} />
                  {!catAtual && <p className={cn(NOTA, "mt-1")}>Escolha primeiro a categoria.</p>}
                </div>
              </div>
              <p role="status" className="sr-only">{vistos.length === 0 ? "Nenhum modelo encontrado" : vistos.length === 1 ? "1 modelo" : `${vistos.length} modelos`}</p>
              {vistos.length > 0 ? (
                <div className="mt-4 grid gap-4">
                  {grupos.map((gr) => (
                    <div key={gr.chave}>
                      <h3 id={`gm-${gr.chave}`} className="text-[15px] font-semibold">{gr.categoria ? `${gr.categoria} › ${gr.subcategoria}` : gr.subcategoria}</h3>
                      <ul aria-labelledby={`gm-${gr.chave}`} className="mt-2 grid gap-2">
                        {gr.modelos.map((m) => (
                          <LinhaModelo key={m.id} m={m} podeEditar={podeEditar} g={g} aberto={aberto} pend={pend?.id === m.id ? pend : null}
                            onAbrir={() => abrir({ t: "renomear", id: m.id })} onFechar={() => fechar(`ren-mod-${m.id}`)} onRenomear={(nome) => renomear(m, nome)}
                            onConfirmar={() => { if (pend) void gravarNome(m, pend.nome); }} onVoltar={() => { g.setFoco(`gn-mod-${m.id}`); setPend(null); }} onAtivar={() => ativar(m)} />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : <p className={cn(NOTA, "mt-3")}>Nenhum modelo encontrado.</p>}
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** Criar: escolhe-se a subcategoria (ativas e da organização), opcionalmente fixa-se o número e escreve-se o nome. O foco começa na subcategoria. */
function NovoModelo({ elegiveis, modelos, g, onCriar, onFechar }: {
  elegiveis: { id: string; nome: string; cat: string }[]; modelos: readonly ModeloGestao[];
  g: { aGravar: boolean; msg: (onde: string) => string | null }; onCriar: (sub: { id: string; nome: string }, nome: string, numero: number | null) => void; onFechar: () => void;
}) {
  const [sub, setSub] = useState<ItemCombo | null>(null);
  const [numTxt, setNumTxt] = useState("");
  const itens = useMemo<ItemCombo[]>(() => elegiveis.map((s) => ({ id: s.id, nome: `${s.cat} › ${s.nome}` })), [elegiveis]);
  const focar = useCallback((el: HTMLButtonElement | null) => { el?.focus(); }, []);
  const escolhida = elegiveis.find((s) => s.id === sub?.id) ?? null;
  // o número que a base daria (o seguinte ao maior que se vê); confirma-se ao guardar
  const proximo = escolhida ? Math.max(0, ...modelos.filter((m) => m.subcategoria.id === escolhida.id).map((m) => m.numero)) + 1 : null;
  const numero = numTxt.trim() ? numeroDe(numTxt) : null;
  const numeroMau = !!numTxt.trim() && (numero == null || numero < 1);
  const exige = !escolhida ? (sub ? "Essa subcategoria já não está disponível: escolha outra." : "Escolha a subcategoria.") : numeroMau ? "O número vai de 1 a 9999." : null;
  return (
    <FormNome rotuloNome="Nome do modelo" inicial="" botao="Criar modelo" aGravar={g.aGravar} erro={sub ? g.msg(`nova:${sub.id}`) : null} idGuardar="gm-novo" exige={exige}
      antes={(
        <>
          <Campo rot="Subcategoria">{(id) => <ComboPesquisa id={id} rotulo="Subcategoria" itens={itens} atual={sub} placeholder="Escolher a subcategoria" obrigatorio classeCampo={BORDA} registar={focar} onEscolher={(i) => setSub(i.id ? i : null)} />}</Campo>
          <Campo rot="Número (opcional)" dica={proximo ? `Deixe vazio para o seguinte: ${numeroSku(proximo)}. Confirma-se ao guardar e não muda depois.` : "Deixe vazio para o seguinte da subcategoria. Não muda depois de criado."}>{(id) => (
            <input id={id} value={numTxt} inputMode="numeric" maxLength={4} aria-invalid={numeroMau} onChange={(e) => setNumTxt(e.target.value)} className={cn(CAMPO, BORDA, "sm:w-40")} />
          )}</Campo>
        </>
      )}
      onEnviar={(nome) => { if (escolhida) onCriar(escolhida, nome, numero); }} onCancelar={onFechar} />
  );
}

/** Um modelo: «0001 · SORTY», estado em texto, produtos e as ações (só quem edita). */
function LinhaModelo({ m, podeEditar, g, aberto, pend, onAbrir, onFechar, onRenomear, onConfirmar, onVoltar, onAtivar }: {
  m: ModeloGestao; podeEditar: boolean;
  g: { aGravar: boolean; msg: (onde: string) => string | null }; aberto: Aberto | null; pend: { id: string; nome: string } | null;
  onAbrir: () => void; onFechar: () => void; onRenomear: (nome: string) => void; onConfirmar: () => void; onVoltar: () => void; onAtivar: () => void;
}) {
  const aRenomear = aberto?.t === "renomear" && aberto.id === m.id;
  const grav = g.aGravar ? "A guardar…" : null;
  const bloqueado = !m.ativo && !m.subcategoria.ativo;
  const rAtivar = grav ?? (bloqueado ? RAZAO_SUB_DESATIVADA : null);
  return (
    <li className="rounded-xl bg-muted/50 p-2 pl-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={cn("min-w-0 break-words text-[15px] font-medium", !m.ativo && "text-muted-foreground")}>{rotuloModelo(m)}</span>
        {!m.ativo && <Selo>desativado</Selo>}
        <span className="text-sm text-muted-foreground">{produtos(m.usados)}</span>
        {podeEditar && (
          <span className="ml-auto flex flex-wrap items-center gap-1">
            <button id={`ren-mod-${m.id}`} type="button" aria-label={`Renomear o modelo ${m.nome}`} aria-expanded={aRenomear} className={BOTAO_ICONE} {...protegido(grav, `rz-ren-mod-${m.id}`, onAbrir)}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </button>
            <Razao id={`rz-ren-mod-${m.id}`}>{grav}</Razao>
            <button id={`act-mod-${m.id}`} type="button" aria-label={`${m.ativo ? "Desativar" : "Reativar"} o modelo ${m.nome}`} className={cn(BOTAO_TEXTO, "border-transparent")} {...protegido(rAtivar, `rz-act-mod-${m.id}`, onAtivar)}>
              {m.ativo ? "Desativar" : "Reativar"}
            </button>
            <Razao id={`rz-act-mod-${m.id}`}>{rAtivar}</Razao>
          </span>
        )}
      </div>
      {podeEditar && bloqueado && <p className="mt-1 text-sm text-muted-foreground" aria-hidden="true">{RAZAO_SUB_DESATIVADA}</p>}
      {g.msg(`est:${m.id}`) && <p className="mt-2 text-[15px] text-red-700 dark:text-red-400" role="alert">{g.msg(`est:${m.id}`)}</p>}
      {podeEditar && aRenomear && (
        <div className="mt-3 grid gap-3">
          <FormNome rotuloNome="Nome do modelo" inicial={m.nome} botao="Guardar nome" aGravar={g.aGravar} bloqueado={!!pend} erro={pend ? null : g.msg(`ren:${m.id}`)} idGuardar={`gn-mod-${m.id}`}
            onEnviar={(nome) => onRenomear(nome)} onCancelar={onFechar} />
          {pend && (
            <ConfirmarMudanca titulo={`Mudar o nome de «${m.nome}» para «${pend.nome}»?`} aGravar={g.aGravar} erro={g.msg(`ren:${m.id}`)} onConfirmar={onConfirmar} onVoltar={onVoltar}
              texto={`Este modelo é usado por ${produtos(m.usados)}: o novo nome aparece em ${m.usados === 1 ? "esse produto" : `esses ${m.usados} produtos`}. O número ${numeroSku(m.numero)} não muda.`} />
          )}
        </div>
      )}
    </li>
  );
}
