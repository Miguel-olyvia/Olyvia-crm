// 16/11: o que os separadores «Categorias» e «Subcategorias» da gestão do Catálogo partilham: as ações de uma linha (Subir, Descer, Renomear,
// Desativar/Reativar), o formulário de renomear com a confirmação e a lógica de gravar (criar, renomear, ativar, reordenar). Quem decide é a base
// (cat_* de 20270117700000): aqui só se grava e relê-se depois de cada ação, também em falha (useGestaoLista.correr).
import { useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  estadoCategoria, guardarCategoria, reordenarCategorias, type CategoriaGestao, type SubcategoriaGestao,
} from "./categoriasMarcasGestao";
import type { FichaProdutoReal } from "./fichaProdutoDados";
import { guardarSigla } from "./skuDados";
import { FormSigla } from "./siglasGestao";
import { BOTAO_ICONE, BOTAO_TEXTO, ConfirmarMudanca, FormNome, Razao, produtos, protegido, useGestaoLista } from "./gestaoPecas";

export type Item = SubcategoriaGestao;
export type Aberto = { t: "nova"; pai: string | null } | { t: "renomear"; id: string } | { t: "sigla"; id: string };
/** O que espera confirmação: renomear algo que produtos usam (ou de uso desconhecido). */
export interface Pendente { item: Item; pai: string | null; nome: string }
type Gestao = ReturnType<typeof useGestaoLista<CategoriaGestao[]>>;

const nomeTipo = (pai: string | null) => (pai ? "subcategoria" : "categoria");

export interface Ctx {
  podeEditar: boolean; aGravar: boolean; aberto: Aberto | null; pend: Pendente | null; msg: (onde: string) => string | null;
  abrir: (a: Aberto) => void; fechar: (focar?: string) => void;
  onCriar: (pai: CategoriaGestao | null, nome: string) => void; onRenomear: (item: Item, pai: string | null, nome: string) => void;
  onConfirmar: () => void; onVoltarConfirmar: () => void;
  /** 16/11: muda a sigla (SKU); só vale para os SKU futuros. */
  onSigla: (item: Item, pai: CategoriaGestao | null, sigla: string) => void;
  onAtivar: (item: Item, pai: CategoriaGestao | null) => void; onMover: (pai: CategoriaGestao | null, irmas: Item[], i: number, d: -1 | 1) => void;
  /** Uma razão para não reordenar (por exemplo, a lista está filtrada); sem ela, a ordem depende só da posição. */
  semOrdem?: string | null;
  /** O que se diz quando reativar está bloqueado porque a categoria está desativada. */
  razaoBloqueada?: string;
}

/** A lógica de gravar dos dois separadores. `focoCriar`: o id do botão que recebe o foco depois de criar. */
export function useAcoesCategorias(real: FichaProdutoReal, g: Gestao, focoCriar: (pai: CategoriaGestao | null) => string,
  extra: { focoApos?: (item: Item) => string; aoCriar?: () => void } = {}) {
  const { org, podeEditar } = real;
  const [aberto, setAberto] = useState<Aberto | null>(null);
  const [pend, setPend] = useState<Pendente | null>(null);
  const abrir = (a: Aberto) => { setAberto(a); g.setErro(null); setPend(null); };
  const fechar = (focar?: string) => { setAberto(null); g.setErro(null); setPend(null); if (focar) g.setFoco(focar); };

  const criar = (pai: CategoriaGestao | null, nome: string) =>
    void g.correr(() => guardarCategoria(org, { id: null, pai: pai?.id ?? null, nome }), pai ? `Subcategoria «${nome}» criada em «${pai.nome}».` : `Categoria «${nome}» criada.`, pai ? `nova:${pai.id}` : "novo")
      .then((ok) => { if (ok) { extra.aoCriar?.(); fechar(focoCriar(pai)); } });
  const gravarNome = (item: Item, pai: string | null, nome: string) =>
    g.correr(() => guardarCategoria(org, { id: item.id, pai, nome }), `${pai ? "Subcategoria" : "Categoria"} «${nome}» guardada.`, `ren:${item.id}`).then((ok) => { if (ok) fechar(`ren-${item.id}`); });
  /** Renomear uma usada por produtos (ou de uso desconhecido) pede confirmação; sem produtos grava logo. */
  const renomear = (item: Item, pai: string | null, nome: string) => {
    if (item.usados === 0) { void gravarNome(item, pai, nome); return; }
    g.setErro(null); setPend({ item, pai, nome });
  };
  const confirmar = () => { if (pend) void gravarNome(pend.item, pend.pai, pend.nome); };
  const gravarSigla = (item: Item, pai: CategoriaGestao | null, sigla: string) =>
    void g.correr(() => guardarSigla(org, item.id, sigla), `Sigla de «${item.nome}» guardada: ${sigla}.`, `sig:${item.id}`).then((ok) => { if (ok) fechar(`sig-${item.id}`); });
  const voltarConfirmar = () => { if (!pend) return; g.setFoco(`gn-${pend.item.id}`); setPend(null); };
  const ativar = (item: Item, pai: CategoriaGestao | null) => {
    const ativo = !item.ativo, tipo = pai ? "Subcategoria" : "Categoria";
    void g.correr(() => estadoCategoria(org, item.id, ativo), (v) => {
      const n = (v as { subcategorias_desativadas?: unknown } | null)?.subcategorias_desativadas;
      return `${tipo} «${item.nome}» ${ativo ? "reativada" : "desativada"}${typeof n === "number" && n > 0 ? `, e ${n} subcategoria${n === 1 ? "" : "s"} com ela` : ""}.`;
    }, `est:${item.id}`).then(() => g.setFoco(extra.focoApos ? `act-${item.id}|${extra.focoApos(item)}` : `act-${item.id}`));
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
    onVoltarConfirmar: voltarConfirmar, onSigla: gravarSigla, onAtivar: ativar, onMover: mover,
  };
  return { ctx, aberto, abrir, fechar };
}

/* ------------------------------------------------------------------ as ações de uma linha */
export function Acoes({ item, pai, irmas, g, tipo }: { item: Item; pai: CategoriaGestao | null; irmas: Item[]; g: Ctx; tipo: "a categoria" | "a subcategoria" }) {
  if (!g.podeEditar || item.global) return null;
  const suf = pai ? ` em ${pai.nome}` : "";
  const k = irmas.findIndex((x) => x.id === item.id);
  const aRenomear = g.aberto?.t === "renomear" && g.aberto.id === item.id;
  const aSigla = g.aberto?.t === "sigla" && g.aberto.id === item.id;
  const bloqueada = !item.ativo && !!pai && !pai.ativo; // uma subcategoria não se reativa com a categoria desativada
  // nada de disabled: o botão perderia o foco enquanto se grava; aria-disabled, razão ligada e clique sem efeito
  const grav = g.aGravar ? "A guardar…" : null;
  const rSubir = grav ?? g.semOrdem ?? (k <= 0 ? "Já é a primeira." : null), rDescer = grav ?? g.semOrdem ?? (k < 0 || k === irmas.length - 1 ? "Já é a última." : null);
  const rAtivar = grav ?? (bloqueada ? (g.razaoBloqueada ?? "Reative primeiro a categoria.") : null);
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
      <button id={`sig-${item.id}`} type="button" aria-label={`Mudar a sigla de ${item.nome}${suf}`} aria-expanded={aSigla} className={BOTAO_ICONE} {...protegido(grav, `rz-sig-${item.id}`, () => g.abrir({ t: "sigla", id: item.id }))}>
        <Tag className="h-4 w-4" aria-hidden="true" />
      </button>
      <Razao id={`rz-sig-${item.id}`}>{grav}</Razao>
      <button id={`act-${item.id}`} type="button" aria-label={`${item.ativo ? "Desativar" : "Reativar"} ${item.nome}${suf}`} className={cn(BOTAO_TEXTO, "border-transparent")} {...protegido(rAtivar, `rz-act-${item.id}`, () => g.onAtivar(item, pai))}>
        {item.ativo ? "Desativar" : "Reativar"}
      </button>
      <Razao id={`rz-act-${item.id}`}>{rAtivar}</Razao>
    </span>
  );
}

/** O formulário de renomear e a confirmação, por baixo da linha. */
export function Renomear({ item, pai, g }: { item: Item; pai: CategoriaGestao | null; g: Ctx }) {
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

/** O formulário de editar a sigla, por baixo da linha (o mesmo sítio que o de renomear). */
export function EditarSigla({ item, pai, g }: { item: Item; pai: CategoriaGestao | null; g: Ctx }) {
  if (!g.podeEditar || g.aberto?.t !== "sigla" || g.aberto.id !== item.id) return null;
  return (
    <div className="mt-3">
      <FormSigla rotulo={`Sigla da ${nomeTipo(pai?.id ?? null)}`} inicial={item.sigla} exigeLetra aGravar={g.aGravar} erro={g.msg(`sig:${item.id}`)} idGuardar={`gs-${item.id}`}
        onEnviar={(s) => g.onSigla(item, pai, s)} onCancelar={() => g.fechar(`sig-${item.id}`)} />
    </div>
  );
}
