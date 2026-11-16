// 13/11: o separador «Categorias» da gestão do Catálogo: a árvore categoria → subcategorias dos produtos. Criar, renomear, ativar/desativar e
// ordenar (Subir/Descer). Só com products.edit (sem ela, leitura). As partilhadas (de todas as organizações) só se leem. Quem decide é a base
// (cat_* de 20270117700000, categoriasMarcasGestao.ts): aqui só se mostra o que ela devolve e relê-se depois de cada gravação, também em falha.
// «Como no outro» (ProductCategories/ProductSubcategories da aplicação): nome, ordem, ativo/inativo, subcategoria dentro de categoria.
// 16/11: as ações de uma linha e a lógica de gravar passaram para categoriasAcoes.tsx (partilhadas com o separador «Subcategorias»).
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { NOTA } from "./pecasForm";
import type { FichaProdutoReal } from "./fichaProdutoDados";
import { lerCategoriasGestao, type CategoriaGestao, type SubcategoriaGestao } from "./categoriasMarcasGestao";
import { Acoes, Renomear, useAcoesCategorias, type Ctx } from "./categoriasAcoes";
import { BOTAO_TEXTO, CARTAO, EstadoLeitura, FormNome, Razao, Selo, produtos, protegido, useGestaoLista } from "./gestaoPecas";

type Item = SubcategoriaGestao;

export function GestaoCategorias({ real, anunciar }: { real: FichaProdutoReal; anunciar: (msg: string) => void }) {
  const { podeEditar } = real;
  const g = useGestaoLista(real, lerCategoriasGestao, anunciar, "Não tem permissão para ver as categorias.");
  const { ctx, aberto, fechar } = useAcoesCategorias(real, g, (pai) => (pai ? `nova-${pai.id}` : "novo-categoria"));
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
                <button id="novo-categoria" type="button" aria-expanded={aberto?.t === "nova" && aberto.pai === null} onClick={() => ctx.abrir({ t: "nova", pai: null })} className={BOTAO_TEXTO}>
                  <Plus className="h-4 w-4" aria-hidden="true" />Nova categoria
                </button>
              </div>
              {aberto?.t === "nova" && aberto.pai === null && (
                <FormNome rotuloNome="Nome da categoria" inicial="" botao="Criar categoria" aGravar={g.aGravar} erro={g.msg("novo")} idGuardar="gc-novo" onEnviar={(n) => ctx.onCriar(null, n)} onCancelar={() => fechar("novo-categoria")} />
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
      {g.msg(`est:${c.id}`) && <p className="mt-2 text-[15px] text-red-700 dark:text-red-400" role="alert">{g.msg(`est:${c.id}`)}</p>}
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
                {g.msg(`est:${s.id}`) && <p className="mt-2 text-[15px] text-red-700 dark:text-red-400" role="alert">{g.msg(`est:${s.id}`)}</p>}
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
