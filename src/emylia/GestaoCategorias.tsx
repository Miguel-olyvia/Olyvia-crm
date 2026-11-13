// 13/11: o separador «Categorias» da gestão do Catálogo: a árvore categoria → subcategorias dos produtos. Criar, renomear, ativar/desativar e
// ordenar (Subir/Descer). Só com products.edit (sem ela, leitura). As partilhadas (de todas as organizações) só se leem. Quem decide é a base
// (cat_* de 20270117700000, categoriasMarcasGestao.ts): aqui só se mostra o que ela devolve e relê-se depois de cada gravação, também em falha.
// «Como no outro» (ProductCategories/ProductSubcategories da aplicação): nome, ordem, ativo/inativo, subcategoria dentro de categoria.
import { useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { NOTA } from "./pecasForm";
import type { FichaProdutoReal } from "./fichaProdutoDados";
import {
  estadoCategoria, guardarCategoria, lerCategoriasGestao, reordenarCategorias, type CategoriaGestao, type SubcategoriaGestao,
} from "./categoriasMarcasGestao";
import { BOTAO_ICONE, BOTAO_TEXTO, CARTAO, ConfirmarMudanca, EstadoLeitura, FormNome, Razao, Selo, produtos, protegido, useGestaoLista } from "./gestaoPecas";

type Item = SubcategoriaGestao;
type Aberto = { t: "nova"; pai: string | null } | { t: "renomear"; id: string };
/** O que espera confirmação: renomear algo que produtos usam (ou de uso desconhecido). */
interface Pendente { item: Item; pai: string | null; nome: string }

const nomeTipo = (pai: string | null) => (pai ? "subcategoria" : "categoria");

interface Ctx {
  podeEditar: boolean; aGravar: boolean; aberto: Aberto | null; pend: Pendente | null; msg: (onde: string) => string | null;
  abrir: (a: Aberto) => void; fechar: (focar?: string) => void;
  onCriar: (pai: CategoriaGestao | null, nome: string) => void; onRenomear: (item: Item, pai: string | null, nome: string) => void;
  onConfirmar: () => void; onVoltarConfirmar: () => void;
  onAtivar: (item: Item, pai: CategoriaGestao | null) => void; onMover: (pai: CategoriaGestao | null, irmas: Item[], i: number, d: -1 | 1) => void;
}

export function GestaoCategorias({ real, anunciar }: { real: FichaProdutoReal; anunciar: (msg: string) => void }) {
  const { org, podeEditar } = real;
  const g = useGestaoLista(real, lerCategoriasGestao, anunciar, "Não tem permissão para ver as categorias.");
  const [aberto, setAberto] = useState<Aberto | null>(null);
  const [pend, setPend] = useState<Pendente | null>(null);
  const abrir = (a: Aberto) => { setAberto(a); g.setErro(null); setPend(null); };
  const fechar = (focar?: string) => { setAberto(null); g.setErro(null); setPend(null); if (focar) g.setFoco(focar); };

  const criar = (pai: CategoriaGestao | null, nome: string) =>
    void g.correr(() => guardarCategoria(org, { id: null, pai: pai?.id ?? null, nome }), pai ? `Subcategoria «${nome}» criada em «${pai.nome}».` : `Categoria «${nome}» criada.`, pai ? `nova:${pai.id}` : "novo")
      .then((ok) => { if (ok) fechar(pai ? `nova-${pai.id}` : "novo-categoria"); });
  const gravarNome = (item: Item, pai: string | null, nome: string) =>
    g.correr(() => guardarCategoria(org, { id: item.id, pai, nome }), `${pai ? "Subcategoria" : "Categoria"} «${nome}» guardada.`, `ren:${item.id}`).then((ok) => { if (ok) fechar(`ren-${item.id}`); });
  /** Renomear uma usada por produtos (ou de uso desconhecido) pede confirmação; sem produtos grava logo. */
  const renomear = (item: Item, pai: string | null, nome: string) => {
    if (item.usados === 0) { void gravarNome(item, pai, nome); return; }
    g.setErro(null); setPend({ item, pai, nome });
  };
  const confirmar = () => { if (pend) void gravarNome(pend.item, pend.pai, pend.nome); };
  const voltarConfirmar = () => { if (!pend) return; g.setFoco(`gn-${pend.item.id}`); setPend(null); };
  const ativar = (item: Item, pai: CategoriaGestao | null) => {
    const ativo = !item.ativo, tipo = pai ? "Subcategoria" : "Categoria";
    void g.correr(() => estadoCategoria(org, item.id, ativo), (v) => {
      const n = (v as { subcategorias_desativadas?: unknown } | null)?.subcategorias_desativadas;
      return `${tipo} «${item.nome}» ${ativo ? "reativada" : "desativada"}${typeof n === "number" && n > 0 ? `, e ${n} subcategoria${n === 1 ? "" : "s"} com ela` : ""}.`;
    }, `est:${item.id}`).then(() => g.setFoco(`act-${item.id}`));
  };
  /** `irmas` são só as editáveis (as partilhadas não entram na ordem); manda-se TODAS, na ordem nova. */
  const mover = (pai: CategoriaGestao | null, irmas: Item[], i: number, d: -1 | 1) => {
    const ids = irmas.map((x) => x.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    const id = irmas[i].id;
    void g.correr(() => reordenarCategorias(org, pai?.id ?? null, ids), `«${irmas[i].nome}» passou para a posição ${i + d + 1} de ${irmas.length}.`, `est:${id}`).then(() => g.setFoco(d === 1 ? `desc-${id}|sub-${id}` : `sub-${id}|desc-${id}`));
  };
  const ctx: Ctx = {
    podeEditar, aGravar: g.aGravar, aberto, pend, msg: g.msg, abrir, fechar, onCriar: criar, onRenomear: renomear, onConfirmar: confirmar,
    onVoltarConfirmar: voltarConfirmar, onAtivar: ativar, onMover: mover,
  };
  const lista = g.lista;
  return (
    <div className="grid gap-5">
      <p className={NOTA}>Cada produto fica numa categoria e, se quiser, numa subcategoria dela. Desativar esconde-a dos produtos novos; os que já a têm mantêm-na.</p>
      {lista && !podeEditar && <p role="note" className={cn(NOTA, "rounded-xl bg-muted/50 p-3")}>Só de leitura: para mudar as categorias precisa da permissão de editar produtos.</p>}
      <EstadoLeitura o={g} lido={!!lista} nomes="as categorias" />
      {lista && (
        <>
          {podeEditar && (
            <div className="grid gap-3">
              <div>
                <button id="novo-categoria" type="button" aria-expanded={aberto?.t === "nova" && aberto.pai === null} onClick={() => abrir({ t: "nova", pai: null })} className={BOTAO_TEXTO}>
                  <Plus className="h-4 w-4" aria-hidden="true" />Nova categoria
                </button>
              </div>
              {aberto?.t === "nova" && aberto.pai === null && (
                <FormNome rotuloNome="Nome da categoria" inicial="" botao="Criar categoria" aGravar={g.aGravar} erro={g.msg("novo")} idGuardar="gc-novo" onEnviar={(n) => criar(null, n)} onCancelar={() => fechar("novo-categoria")} />
              )}
            </div>
          )}
          {!lista.length && <p className={NOTA}>Ainda não há categorias.</p>}
          {lista.map((c) => <Categoria key={c.id} c={c} irmas={lista.filter((x) => !x.global)} g={ctx} />)}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ as ações de uma linha */
function Acoes({ item, pai, irmas, g, tipo }: { item: Item; pai: CategoriaGestao | null; irmas: Item[]; g: Ctx; tipo: "a categoria" | "a subcategoria" }) {
  if (!g.podeEditar || item.global) return null;
  const suf = pai ? ` em ${pai.nome}` : "";
  const k = irmas.findIndex((x) => x.id === item.id);
  const aRenomear = g.aberto?.t === "renomear" && g.aberto.id === item.id;
  const bloqueada = !item.ativo && !!pai && !pai.ativo; // uma subcategoria não se reativa com a categoria desativada
  // nada de disabled: o botão perderia o foco enquanto se grava; aria-disabled, razão ligada e clique sem efeito
  const grav = g.aGravar ? "A guardar…" : null;
  const rSubir = grav ?? (k <= 0 ? "Já é a primeira." : null), rDescer = grav ?? (k < 0 || k === irmas.length - 1 ? "Já é a última." : null);
  const rAtivar = grav ?? (bloqueada ? "Reative primeiro a categoria." : null);
  const pos = `, posição ${k + 1} de ${irmas.length}`;
  return (
    <span className="ml-auto flex flex-wrap items-center gap-1">
      <button id={`sub-${item.id}`} type="button" aria-label={`Subir ${item.nome}${suf}${pos}`} className={BOTAO_ICONE} {...protegido(rSubir, `rz-sub-${item.id}`, () => g.onMover(pai, irmas, k, -1))}>
        <ChevronUp className="h-5 w-5" aria-hidden="true" />
      </button>
      <Razao id={`rz-sub-${item.id}`}>{rSubir}</Razao>
      <button id={`desc-${item.id}`} type="button" aria-label={`Descer ${item.nome}${suf}${pos}`} className={BOTAO_ICONE} {...protegido(rDescer, `rz-desc-${item.id}`, () => g.onMover(pai, irmas, k, 1))}>
        <ChevronDown className="h-5 w-5" aria-hidden="true" />
      </button>
      <Razao id={`rz-desc-${item.id}`}>{rDescer}</Razao>
      <button id={`ren-${item.id}`} type="button" aria-label={`Renomear ${tipo} ${item.nome}${suf}`} aria-expanded={aRenomear} className={BOTAO_ICONE} {...protegido(grav, `rz-ren-${item.id}`, () => g.abrir({ t: "renomear", id: item.id }))}>
        <Pencil className="h-4 w-4" aria-hidden="true" />
      </button>
      <Razao id={`rz-ren-${item.id}`}>{grav}</Razao>
      <button id={`act-${item.id}`} type="button" aria-label={`${item.ativo ? "Desativar" : "Reativar"} ${item.nome}${suf}`} className={cn(BOTAO_TEXTO, "border-transparent")} {...protegido(rAtivar, `rz-act-${item.id}`, () => g.onAtivar(item, pai))}>
        {item.ativo ? "Desativar" : "Reativar"}
      </button>
      <Razao id={`rz-act-${item.id}`}>{rAtivar}</Razao>
    </span>
  );
}

/** O formulário de renomear e a confirmação, por baixo da linha. */
function Renomear({ item, pai, g }: { item: Item; pai: CategoriaGestao | null; g: Ctx }) {
  if (!g.podeEditar || g.aberto?.t !== "renomear" || g.aberto.id !== item.id) return null;
  const tipo = nomeTipo(pai?.id ?? null);
  const p = g.pend?.item.id === item.id ? g.pend : null;
  const n = item.usados;
  return (
    <div className="mt-3 grid gap-3">
      <FormNome rotuloNome={`Nome da ${tipo}`} inicial={item.nome} botao="Guardar nome" aGravar={g.aGravar} bloqueado={!!p} erro={p ? null : g.msg(`ren:${item.id}`)} idGuardar={`gn-${item.id}`}
        onEnviar={(nome) => g.onRenomear(item, pai?.id ?? null, nome)} onCancelar={() => g.fechar(`ren-${item.id}`)} />
      {p && (
        <ConfirmarMudanca titulo={`Mudar o nome de «${item.nome}» para «${p.nome}»?`} aGravar={g.aGravar} erro={g.msg(`ren:${item.id}`)} onConfirmar={g.onConfirmar} onVoltar={g.onVoltarConfirmar}
          texto={n == null ? `Esta ${tipo} pode estar a ser usada por produtos: o novo nome aparece em todos.` : `Esta ${tipo} é usada por ${produtos(n)}: o novo nome aparece em ${n === 1 ? "esse produto" : `esses ${n} produtos`}.`} />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ uma categoria e as suas subcategorias */
function Categoria({ c, irmas, g }: { c: CategoriaGestao; irmas: Item[]; g: Ctx }) {
  const edita = g.podeEditar && !c.global;
  const aCriar = g.aberto?.t === "nova" && g.aberto.pai === c.id;
  const subsEditaveis = c.subcategorias.filter((x) => !x.global);
  const tit = `cat-${c.id}`;
  return (
    <article aria-labelledby={tit} className={CARTAO}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 id={tit} className="min-w-0 break-words text-lg font-semibold">{c.nome}</h2>
        {c.global && <Selo>Partilhada</Selo>}
        {!c.ativo && <Selo>desativada</Selo>}
        {c.usados != null && <span className={NOTA}>{`Usada em ${produtos(c.usados)}`}</span>}
        <Acoes item={c} pai={null} irmas={irmas} g={g} tipo="a categoria" />
      </div>
      {g.msg(`est:${c.id}`) && <p className="mt-2 text-[15px] text-destructive" role="alert">{g.msg(`est:${c.id}`)}</p>}
      <Renomear item={c} pai={null} g={g} />
      {edita && !c.ativo && c.subcategorias.length > 0 && <p className={cn(NOTA, "mt-2")}>Ao reativar, as subcategorias reativam-se uma a uma.</p>}

      {c.subcategorias.length > 0 ? (
        <ul className="mt-3 grid gap-2">
          {c.subcategorias.map((s) => {
            const bloqueada = !s.ativo && !c.ativo;
            return (
              <li key={s.id} className="rounded-xl bg-muted/50 p-2 pl-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className={cn("min-w-0 break-words text-[15px] font-medium", !s.ativo && "text-muted-foreground")}>{s.nome}{!s.ativo && " (desativada)"}</span>
                  {s.global && <Selo>Partilhada</Selo>}
                  {s.usados != null && <span className="text-sm text-muted-foreground">{produtos(s.usados)}</span>}
                  <Acoes item={s} pai={c} irmas={subsEditaveis} g={g} tipo="a subcategoria" />
                </div>
                {g.podeEditar && !s.global && bloqueada && <p className="mt-1 text-sm text-muted-foreground" aria-hidden="true">Reative primeiro a categoria.</p>}
                {g.msg(`est:${s.id}`) && <p className="mt-2 text-[15px] text-destructive" role="alert">{g.msg(`est:${s.id}`)}</p>}
                <Renomear item={s} pai={c} g={g} />
              </li>
            );
          })}
        </ul>
      ) : <p className={cn(NOTA, "mt-3")}>Ainda não tem subcategorias.</p>}

      {edita && (
        <div className="mt-3 grid gap-3">
          <div>
            <button id={`nova-${c.id}`} type="button" aria-label={`Nova subcategoria em ${c.nome}`} aria-expanded={aCriar} className={cn(BOTAO_TEXTO, "border-dashed")}
              {...protegido(!c.ativo ? "Reative a categoria para criar subcategorias." : g.aGravar ? "A guardar…" : null, !c.ativo ? `rz-nova-${c.id}` : `rz-novag-${c.id}`, () => g.abrir({ t: "nova", pai: c.id }))}>
              <Plus className="h-4 w-4" aria-hidden="true" />Nova subcategoria…
            </button>
            {c.ativo && <Razao id={`rz-novag-${c.id}`}>{g.aGravar ? "A guardar…" : null}</Razao>}
          </div>
          {!c.ativo && <p id={`rz-nova-${c.id}`} className={NOTA}>Reative a categoria para criar subcategorias.</p>}
          {aCriar && <FormNome rotuloNome="Nome da subcategoria" inicial="" botao="Criar subcategoria" aGravar={g.aGravar} erro={g.msg(`nova:${c.id}`)} idGuardar={`gc-${c.id}`} onEnviar={(n) => g.onCriar(c, n)} onCancelar={() => g.fechar(`nova-${c.id}`)} />}
        </div>
      )}
    </article>
  );
}
