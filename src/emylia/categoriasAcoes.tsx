// 16/11: o que os separadores «Categorias» e «Subcategorias» da gestão do Catálogo partilham: as ações de uma linha (Subir, Descer, Renomear,
// Desativar/Reativar), o formulário de renomear com a confirmação e a lógica de gravar (criar, renomear, ativar, reordenar). Quem decide é a base
// (cat_* de 20270117700000): aqui só se grava e relê-se depois de cada ação, também em falha (useGestaoLista.correr).
import { useState, type ReactNode } from "react";
import { Box, ChevronDown, ChevronUp, Pencil, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  estadoCategoria, guardarCategoria, reordenarCategorias, type CategoriaGestao, type ResG, type SubcategoriaGestao,
} from "./categoriasMarcasGestao";
import type { FichaProdutoReal } from "./fichaProdutoDados";
import { guardarSigla } from "./skuDados";
import { FormSigla } from "./siglasGestao";
import { CampoModelo3D } from "./CampoModelo3D";
import { BotaoGlbProprio, ChipGlb } from "./GlbProprioLinha";
import { ModeloGlbDialogo } from "./ModeloGlbDialogo";
import { definirModelo3d } from "./modelo3dDados";
import { herdadoDe, rotuloDoModelo3D } from "./planta3d/modelos3dEscolha";
import { BOTAO_ICONE, BOTAO_TEXTO, ConfirmarMudanca, ENTRA, FormNome, Razao, produtos, protegido, useGestaoLista } from "./gestaoPecas";

export type Item = SubcategoriaGestao;
export type Aberto = { t: "nova"; pai: string | null } | { t: "renomear"; id: string } | { t: "sigla"; id: string } | { t: "modelo3d"; id: string } | { t: "glb"; id: string };
/** O que espera confirmação: renomear algo que produtos usam (ou de uso desconhecido). */
export interface Pendente { item: Item; pai: string | null; nome: string }
type Gestao = ReturnType<typeof useGestaoLista<CategoriaGestao[]>>;

const nomeTipo = (pai: string | null) => (pai ? "subcategoria" : "categoria");

export interface Ctx {
  org: string; podeEditar: boolean; aGravar: boolean; aberto: Aberto | null; pend: Pendente | null; msg: (onde: string) => string | null;
  abrir: (a: Aberto) => void; fechar: (focar?: string) => void;
  /** `modelo`: o «Modelo 3D» escolhido ao criar (null: herda); define-se logo a seguir a criar, com o id que a base deu. */
  onCriar: (pai: CategoriaGestao | null, nome: string, modelo?: string | null) => void; onRenomear: (item: Item, pai: string | null, nome: string) => void;
  onConfirmar: () => void; onVoltarConfirmar: () => void;
  /** 16/11: muda a sigla (SKU); só vale para os SKU futuros. */
  onSigla: (item: Item, pai: CategoriaGestao | null, sigla: string) => void;
  /** 24/11: muda o «Modelo 3D» da categoria ou subcategoria (null: volta a herdar). */
  onModelo3d: (item: Item, pai: CategoriaGestao | null, modelo: string | null) => void;
  /** 27/11: o diálogo do GLB próprio acabou (carregou, substituiu ou removeu: `mensagem` anuncia-se; falhou: null, só se relê). A lista relê antes de a promessa acabar. */
  onGlbTerminar: (item: Item, mensagem: string | null) => Promise<void>;
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

  /** Cria e, se houve modelo 3D escolhido, define-o com o id que a base devolveu. Se a categoria ficou criada mas o modelo não, conta como criada e o aviso diz o que falhou
   *  (um formulário a pedir para a criar outra vez só daria «já existe»). */
  const criarComModelo = async (pai: CategoriaGestao | null, nome: string, modelo: string | null): Promise<ResG<unknown>> => {
    const r = await guardarCategoria(org, { id: null, pai: pai?.id ?? null, nome });
    if (!r.ok || !modelo) return r;
    const criada = (r.v as { categoria?: { id?: unknown } } | null)?.categoria?.id;
    const m = typeof criada === "string" && criada ? await definirModelo3d(org, "categoria", criada, modelo) : null;
    return m && m.ok ? r : { ok: true, v: { modelo3dErro: m && m.ok === false ? m.erro : "a base não devolveu o id da categoria criada." } };
  };
  const criar = (pai: CategoriaGestao | null, nome: string, modelo: string | null = null) =>
    void g.correr(() => criarComModelo(pai, nome, modelo), (v) => {
      const base = pai ? `Subcategoria «${nome}» criada em «${pai.nome}»` : `Categoria «${nome}» criada`;
      const falha = (v as { modelo3dErro?: unknown } | null)?.modelo3dErro;
      if (typeof falha === "string") return `${base}, mas o modelo 3D não ficou: ${falha}`;
      return modelo ? `${base}. Modelo 3D: ${rotuloDoModelo3D(modelo)}.` : `${base}.`;
    }, pai ? `nova:${pai.id}` : "novo")
      .then((ok) => { if (ok) { extra.aoCriar?.(); fechar(focoCriar(pai)); } });
  const gravarModelo3d = (item: Item, _pai: CategoriaGestao | null, modelo: string | null) =>
    void g.correr(() => definirModelo3d(org, "categoria", item.id, modelo),
      modelo ? `Modelo 3D de «${item.nome}»: ${rotuloDoModelo3D(modelo)}.` : `Modelo 3D de «${item.nome}»: automático, herda do nível de cima.`, `m3d:${item.id}`)
      .then((ok) => { if (ok) fechar(`m3d-${item.id}`); });
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
  /** O diálogo do GLB próprio grava por si (carrega, liga, apaga o antigo); aqui só se relê (e o Catálogo), e se gravou, anuncia-se. Releitura também em falha: o ecrã não pode mentir. */
  const glbTerminar = async (item: Item, mensagem: string | null) => {
    if (mensagem) await g.correr(async () => ({ ok: true as const, v: null }), mensagem, `glb:${item.id}`);
    else await g.reler();
  };
  const ctx: Ctx = {
    org, onGlbTerminar: glbTerminar, podeEditar, aGravar: g.aGravar, aberto, pend, msg: g.msg, abrir, fechar, onCriar: criar, onRenomear: renomear, onConfirmar: confirmar,
    onVoltarConfirmar: voltarConfirmar, onSigla: gravarSigla, onModelo3d: gravarModelo3d, onAtivar: ativar, onMover: mover,
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
  const aModelo = g.aberto?.t === "modelo3d" && g.aberto.id === item.id;
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
      <button id={`m3d-${item.id}`} type="button" aria-label={`Mudar o modelo 3D ${pai ? "da subcategoria" : "da categoria"} ${item.nome}${suf}`} aria-expanded={aModelo} className={BOTAO_ICONE} {...protegido(grav, `rz-m3d-${item.id}`, () => g.abrir({ t: "modelo3d", id: item.id }))}>
        <Box className="h-4 w-4" aria-hidden="true" />
      </button>
      <Razao id={`rz-m3d-${item.id}`}>{grav}</Razao>
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

/* ------------------------------------------------------------------ Modelo 3D (24/11) */
/** O que um nível herda: a subcategoria herda da categoria; a categoria só tem o classificador automático. */
const herancaDe = (pai: CategoriaGestao | null) => herdadoDe({ categoria: pai ? { nome: pai.nome, modelo: pai.modelo3d } : null });

/** «Modelo 3D: Sanita de chão» ou «Modelo 3D: automático», na linha de uma categoria ou subcategoria. */
export function Modelo3DTexto({ modelo }: { modelo: string | null | undefined }) {
  return <span className={cn("rounded-md bg-muted px-2 py-0.5 text-sm", modelo ? "text-foreground/75" : "text-muted-foreground")}>{`Modelo 3D: ${modelo ? rotuloDoModelo3D(modelo) : "automático"}`}</span>;
}

/** O painel de mudar o «Modelo 3D», por baixo da linha (o mesmo sítio que o de renomear e o da sigla). */
export function EditarModelo3D({ item, pai, g }: { item: Item; pai: CategoriaGestao | null; g: Ctx }) {
  if (!g.podeEditar || g.aberto?.t !== "modelo3d" || g.aberto.id !== item.id) return null;
  return <PainelModelo3D item={item} pai={pai} g={g} />;
}
function PainelModelo3D({ item, pai, g }: { item: Item; pai: CategoriaGestao | null; g: Ctx }) {
  const [modelo, setModelo] = useState<string | null>(item.modelo3d ?? null);
  const porque = g.aGravar ? "A guardar…" : modelo === (item.modelo3d ?? null) ? "Escolha outro modelo para guardar." : null;
  return (
    <div className={cn("mt-3 grid gap-3 rounded-xl border border-border bg-card p-3", ENTRA)}>
      <CampoModelo3D valor={modelo} heranca={herancaDe(pai)} onChange={setModelo} nivel={pai ? "subcategoria" : "categoria"} ocupado={g.aGravar} erro={g.msg(`m3d:${item.id}`)} />
      <div className="flex flex-wrap gap-2">
        <Button id={`gm-${item.id}`} className="min-h-11 text-[15px] aria-disabled:cursor-not-allowed aria-disabled:opacity-50" {...protegido(porque, `rz-gm-${item.id}`, () => g.onModelo3d(item, pai, modelo))}>Guardar modelo 3D</Button>
        <Razao id={`rz-gm-${item.id}`}>{porque}</Razao>
        <Button variant="outline" className="min-h-11 text-[15px] aria-disabled:cursor-not-allowed aria-disabled:opacity-50" {...protegido(g.aGravar ? "A guardar…" : null, `rz-gm-${item.id}`, () => g.fechar(`m3d-${item.id}`))}>Cancelar</Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ GLB próprio (27/11) */
const RAZAO_SEM_PERMISSAO_GLB = "Só quem pode editar produtos muda o modelo 3D próprio.";

/** O chip («GLB · 1,2 MB» ou «Sem GLB») e o botão «Modelo 3D próprio…» de uma categoria ou subcategoria. Sempre à vista; bloqueado sem permissão, a gravar ou numa partilhada (a base recusa). */
export function GlbProprioLinha({ item, pai, g }: { item: Item; pai: CategoriaGestao | null; g: Ctx }) {
  const tipo = pai ? "subcategoria" : "categoria";
  const razao = g.aGravar ? "A guardar…" : !g.podeEditar ? RAZAO_SEM_PERMISSAO_GLB : item.global ? `Esta ${tipo} é partilhada por todas as organizações: não pode ter modelo 3D próprio.` : null;
  const aberto = g.aberto?.t === "glb" && g.aberto.id === item.id;
  return (
    <>
      <ChipGlb caminho={item.glbCaminho} bytes={item.glbBytes} />
      <BotaoGlbProprio idBotao={`glb-${item.id}`} rotulo={`Modelo 3D próprio da ${tipo} ${item.nome}${pai ? ` em ${pai.nome}` : ""}`} aberto={aberto} razao={razao} aoAbrir={() => g.abrir({ t: "glb", id: item.id })} />
    </>
  );
}

/** O diálogo do GLB próprio, aberto a partir do botão da linha. Ao fechar, o foco volta ao botão. */
export function EditarGlbProprio({ item, pai, g }: { item: Item; pai: CategoriaGestao | null; g: Ctx }) {
  if (!g.podeEditar || item.global || g.aberto?.t !== "glb" || g.aberto.id !== item.id) return null;
  return (
    <ModeloGlbDialogo org={g.org} nivel={pai ? "subcategoria" : "categoria"} id={item.id} nome={item.nome} atual={{ caminho: item.glbCaminho ?? null, bytes: item.glbBytes ?? null }} usados={item.usados}
      aoTerminar={(mensagem) => g.onGlbTerminar(item, mensagem)} aoFechar={() => g.fechar(`glb-${item.id}`)} />
  );
}

/** O formulário de criar uma categoria (pai null) ou subcategoria com o seletor do «Modelo 3D» por baixo do nome; `antes`: um campo por cima (a categoria, em Subcategorias). */
export function FormNovoRamo({ pai, eSub = !!pai, rotuloNome, botao, aGravar, erro, idGuardar, antes, exige, onEnviar, onCancelar }: {
  /** A categoria de que a nova herda (null: uma categoria de topo, ou uma subcategoria cuja categoria ainda não foi escolhida: `eSub`). */
  pai: CategoriaGestao | null; eSub?: boolean; rotuloNome: string; botao: string; aGravar: boolean; erro: string | null; idGuardar: string; antes?: ReactNode; exige?: string | null;
  onEnviar: (nome: string, modelo: string | null) => void; onCancelar: () => void;
}) {
  const [modelo, setModelo] = useState<string | null>(null);
  return (
    <FormNome rotuloNome={rotuloNome} inicial="" botao={botao} aGravar={aGravar} erro={erro} idGuardar={idGuardar} antes={antes} exige={exige}
      depois={<CampoModelo3D valor={modelo} heranca={herancaDe(pai)} onChange={setModelo} nivel={eSub ? "subcategoria" : "categoria"} ocupado={aGravar} />}
      onEnviar={(nome) => onEnviar(nome, modelo)} onCancelar={onCancelar} />
  );
}
