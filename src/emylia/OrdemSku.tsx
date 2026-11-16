// 16/11: o separador «Referência (SKU)» da Gestão do Catálogo: a composição da referência, em blocos por ordem. SKU = SIGLA_CAT-SIGLA_SUB-NNNN-
// <atributos por esta ordem>-<medida>, com NNNN = o número do MODELO do produto (SORTY 0001, STONE PLUS 0002…). A Categoria, a Subcategoria e o Modelo
// vêm sempre primeiro e estão PRESOS (fixos: sem mover nem desligar);
// depois vêm os atributos configuráveis, cuja ORDEM e quais entram se escolhem aqui (a Medida é um atributo como os outros). Os atributos que um
// produto não tem não entram. Mexe-se no ecrã (Subir/Descer, interruptor) e só se grava em «Guardar» (cat_guardar_sku_config, com TODOS os
// atributos pela ordem). Só com products.edit (sem ela, só se vê). Não reescreve nenhum SKU já gerado.
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NOTA } from "./pecasForm";
import type { AtributoGestao } from "./atributosGestao";
import { exemploSku, type ItemSku } from "./skuDados";
import { numeroSku } from "./modelosDados";
import { ANEL, BOTAO_ICONE, BOTAO_TEXTO, CARTAO, ENTRA, Razao, protegido } from "./gestaoPecas";

/** A base da referência (o que está preso): a categoria, a subcategoria e o modelo escolhidos para o exemplo (o número do modelo é o NNNN). */
export interface BaseSku {
  categoria: { nome: string; sigla: string | null } | null;
  subcategoria: { nome: string; sigla: string | null } | null;
  modelo: { nome: string; numero: number } | null;
  /** O atalho para editar a sigla. */
  irPara: (separador: "categorias" | "subcategorias") => void;
}

/** A ordem que a base usa: posição no SKU (as sem posição no fim), depois a ordem do atributo e o nome. */
function ordemDaBase(L: readonly AtributoGestao[]): ItemSku[] {
  return [...L].sort((a, b) => (a.skuOrdem ?? Infinity) - (b.skuOrdem ?? Infinity) || a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt"))
    .map((a) => ({ atributo: a.id, entra: a.skuEntra }));
}
const igual = (a: readonly ItemSku[], b: readonly ItemSku[]) => a.length === b.length && a.every((x, i) => x.atributo === b[i].atributo && x.entra === b[i].entra);

const FIXO = "Fixo: a referência base";
const LINHA_FIXA = "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-dashed border-foreground/30 bg-muted/30 p-2 pl-3";

/** Um bloco preso: sem Subir/Descer nem interruptor; o cadeado e o texto dizem porquê. */
function BlocoFixo({ n, nome, children }: { n: number; nome: string; children?: ReactNode }) {
  return (
    <li className={LINHA_FIXA}>
      <span className="w-6 text-sm text-muted-foreground tabular-nums" aria-hidden="true">{n}.</span>
      <span className="min-w-0 break-words text-[15px] font-medium">{nome}</span>
      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground"><Lock className="h-3.5 w-3.5" aria-hidden="true" />{FIXO}</span>
      {children && <span className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px]">{children}</span>}
    </li>
  );
}

/** A sigla de uma categoria ou subcategoria escolhida (ou o aviso de que falta) e o atalho para a editar. */
function Sigla({ de, rotulo, irPara }: { de: { sigla: string | null } | null; rotulo: string; irPara: () => void }) {
  if (!de) return <span className={NOTA}>Escolha em cima para ver a sigla.</span>;
  return (
    <>
      {de.sigla ? <span className="font-mono tabular-nums">Sigla: {de.sigla}</span> : <span className="text-red-700 dark:text-red-400">Falta a sigla</span>}
      <button type="button" aria-label={`Editar a sigla da ${rotulo}`} onClick={irPara} className={cn(BOTAO_TEXTO, "text-sm")}>Editar a sigla</button>
    </>
  );
}

export function OrdemSku({ atributos, podeEditar, aGravar, erro, onGuardar, anunciar, base, escolha }: {
  atributos: readonly AtributoGestao[]; podeEditar: boolean; aGravar: boolean; erro: string | null;
  onGuardar: (itens: ItemSku[]) => Promise<boolean>; anunciar: (msg: string) => void;
  base: BaseSku; escolha?: ReactNode;
}) {
  const tit = useId(), razaoGuardar = useId();
  const [local, setLocal] = useState<ItemSku[] | null>(null);
  const [foco, setFoco] = useState<string | null>(null);
  const servidor = useMemo(() => ordemDaBase(atributos), [atributos]);
  // o que se mexeu no ecrã, ajustado ao que a base tem agora (um atributo criado entretanto entra no fim; um que desapareceu sai)
  const itens = useMemo(() => {
    if (!local) return servidor;
    const vivos = new Set(servidor.map((x) => x.atributo));
    const mantidos = local.filter((x) => vivos.has(x.atributo));
    const tem = new Set(mantidos.map((x) => x.atributo));
    return [...mantidos, ...servidor.filter((x) => !tem.has(x.atributo))];
  }, [local, servidor]);
  const mudou = !igual(itens, servidor);
  const porId = useMemo(() => new Map(atributos.map((a) => [a.id, a])), [atributos]);
  const { categoria, subcategoria, modelo, irPara } = base;
  // sem escolha, o exemplo de sempre (BC-TO-0001); com escolha, as siglas reais («??» onde falta) e o número do modelo
  const parteBase = `${categoria ? categoria.sigla ?? "??" : "BC"}-${subcategoria ? subcategoria.sigla ?? "??" : categoria ? "XX" : "TO"}-${modelo ? numeroSku(modelo.numero) : "0001"}`;
  const exemplo = exemploSku(itens.map((i) => {
    const a = porId.get(i.atributo)!;
    return { tipo: a.tipo, entra: i.entra, siglas: a.opcoes.map((o) => o.sigla).filter((s): s is string => !!s) };
  }), parteBase);

  // depois de mover, o foco fica no botão que se carregou ou, se este deixou de valer (chegou ao extremo), no outro da mesma linha
  useEffect(() => {
    if (!foco) return;
    const el = foco.split("|").map((i) => document.getElementById(i)).find((x) => x && x.getAttribute("aria-disabled") !== "true");
    (el as HTMLElement | null)?.focus();
    setFoco(null);
  }, [foco, itens]);

  const mover = (i: number, d: -1 | 1) => {
    const nova = [...itens];
    [nova[i], nova[i + d]] = [nova[i + d], nova[i]];
    setLocal(nova);
    const nome = porId.get(itens[i].atributo)!.nome;
    anunciar(`«${nome}» passou para a posição ${i + d + 1} de ${itens.length}.`);
    const id = itens[i].atributo;
    setFoco(d === 1 ? `sku-desc-${id}|sku-sub-${id}` : `sku-sub-${id}|sku-desc-${id}`);
  };
  const alternar = (i: number) => { if (!aGravar) setLocal(itens.map((x, k) => (k === i ? { ...x, entra: !x.entra } : x))); };
  const guardar = async () => {
    if (!(await onGuardar(itens))) return;
    setLocal(null);
    setFoco("sku-guardar");
  };
  const porque = aGravar ? "A guardar…" : !mudou ? "Sem alterações para guardar." : null;
  const FIXOS = 3; // categoria, subcategoria e número

  return (
    <section aria-labelledby={tit} className={cn(CARTAO, "grid gap-3", ENTRA)}>
      <h2 id={tit} className="text-lg font-semibold">Referência (SKU)</h2>
      <p className={NOTA}>A referência de um produto junta a sigla da categoria e da subcategoria (sempre as duas, presas), o número de 4 dígitos do modelo (cada modelo tem o seu: SORTY 0001, STONE PLUS 0002…; a marca não conta) e depois as siglas dos atributos pela ordem de baixo (a medida escreve-se com x: 60X30). Os atributos que um produto não tem simplesmente não entram na referência. A ordem só vale para as referências novas.</p>
      {escolha}
      <p data-testid="exemplo-sku" className="text-[15px]">Exemplo: <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm tabular-nums">{exemplo}</code></p>
      <ol className="grid gap-2" aria-label="Composição da referência">
        <BlocoFixo n={1} nome="Categoria"><Sigla de={categoria} rotulo="categoria" irPara={() => irPara("categorias")} /></BlocoFixo>
        <BlocoFixo n={2} nome="Subcategoria"><Sigla de={subcategoria} rotulo="subcategoria" irPara={() => irPara("subcategorias")} /></BlocoFixo>
        <BlocoFixo n={3} nome="Modelo (4 dígitos)">
          {modelo
            ? <span className={NOTA}>Modelo escolhido: {modelo.nome} → <span className="font-mono tabular-nums">{numeroSku(modelo.numero)}</span></span>
            : <span className={NOTA}>O número vem do modelo do produto (SORTY 0001, STONE PLUS 0002…).</span>}
        </BlocoFixo>
        {itens.map((it, i) => {
          const a = porId.get(it.atributo)!;
          const rSubir = aGravar ? "A guardar…" : i === 0 ? "Já é o primeiro." : null;
          const rDescer = aGravar ? "A guardar…" : i === itens.length - 1 ? "Já é o último." : null;
          const pos = `, posição ${i + 1} de ${itens.length}`;
          return (
            <li key={it.atributo} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-muted/50 p-2 pl-3">
              <span className="w-6 text-sm text-muted-foreground tabular-nums" aria-hidden="true">{FIXOS + i + 1}.</span>
              <span className={cn("min-w-0 break-words text-[15px] font-medium", !it.entra && "text-muted-foreground")}>{a.nome}</span>
              {!podeEditar && <span className={NOTA}>{it.entra ? "entra no SKU" : "não entra no SKU"}</span>}
              {podeEditar && (
                <span className="ml-auto flex flex-wrap items-center gap-1">
                  <label className="flex min-h-11 cursor-pointer items-center gap-2 pr-2 text-[15px]">
                    <input type="checkbox" role="switch" checked={it.entra} aria-label={`Entra no SKU: ${a.nome}`} aria-disabled={aGravar || undefined} onChange={() => alternar(i)}
                      className={cn("h-5 w-5 accent-primary", ANEL)} />
                    Entra no SKU
                  </label>
                  <button id={`sku-sub-${it.atributo}`} type="button" aria-label={`Subir ${a.nome}${pos}`} className={BOTAO_ICONE} {...protegido(rSubir, `rz-sku-sub-${it.atributo}`, () => mover(i, -1))}>
                    <ChevronUp className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <Razao id={`rz-sku-sub-${it.atributo}`}>{rSubir}</Razao>
                  <button id={`sku-desc-${it.atributo}`} type="button" aria-label={`Descer ${a.nome}${pos}`} className={BOTAO_ICONE} {...protegido(rDescer, `rz-sku-desc-${it.atributo}`, () => mover(i, 1))}>
                    <ChevronDown className="h-5 w-5" aria-hidden="true" />
                  </button>
                  <Razao id={`rz-sku-desc-${it.atributo}`}>{rDescer}</Razao>
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {!itens.length && <p className={NOTA}>Ainda não há atributos: a referência é só a base.</p>}
      {erro && <p className="text-[15px] text-red-700 dark:text-red-400" role="alert">{erro}</p>}
      {podeEditar && (
        <div className="flex flex-wrap items-center gap-3">
          <Button id="sku-guardar" className="min-h-11 text-[15px] aria-disabled:cursor-not-allowed aria-disabled:opacity-50" {...protegido(porque, razaoGuardar, () => { void guardar(); })}>
            {aGravar && <Loader2 className="mr-1 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}Guardar a ordem da referência
          </Button>
          {porque && <p id={razaoGuardar} className={aGravar ? "sr-only" : NOTA}>{porque}</p>}
        </div>
      )}
    </section>
  );
}
