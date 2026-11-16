// 16/11: o bloco «Referência (SKU)» do separador Atributos: a ORDEM dos atributos na referência e quais entram. SKU = SIGLA_CAT-SIGLA_SUB-NNNN-
// <atributos por esta ordem>-<medida>; a Medida é um atributo como os outros (vai para qualquer posição). Os atributos que um produto não tem
// não entram. Mexe-se no ecrã (Subir/Descer, interruptor) e só se grava em «Guardar» (cat_guardar_sku_config, com TODOS os atributos pela ordem).
// Só com products.edit (sem ela, só se vê). Não reescreve nenhum SKU já gerado.
import { useEffect, useId, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ChevronUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NOTA } from "./pecasForm";
import type { AtributoGestao } from "./atributosGestao";
import { exemploSku, type ItemSku } from "./skuDados";
import { ANEL, BOTAO_ICONE, CARTAO, ENTRA, Razao, protegido } from "./gestaoPecas";

/** A ordem que a base usa: posição no SKU (as sem posição no fim), depois a ordem do atributo e o nome. */
function ordemDaBase(L: readonly AtributoGestao[]): ItemSku[] {
  return [...L].sort((a, b) => (a.skuOrdem ?? Infinity) - (b.skuOrdem ?? Infinity) || a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt"))
    .map((a) => ({ atributo: a.id, entra: a.skuEntra }));
}
const igual = (a: readonly ItemSku[], b: readonly ItemSku[]) => a.length === b.length && a.every((x, i) => x.atributo === b[i].atributo && x.entra === b[i].entra);

export function OrdemSku({ atributos, podeEditar, aGravar, erro, onGuardar, anunciar }: {
  atributos: readonly AtributoGestao[]; podeEditar: boolean; aGravar: boolean; erro: string | null;
  onGuardar: (itens: ItemSku[]) => Promise<boolean>; anunciar: (msg: string) => void;
}) {
  const painel = useId(), tit = useId(), razaoGuardar = useId();
  const [aberto, setAberto] = useState(false);
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
  const exemplo = exemploSku(itens.map((i) => {
    const a = porId.get(i.atributo)!;
    return { tipo: a.tipo, entra: i.entra, siglas: a.opcoes.map((o) => o.sigla).filter((s): s is string => !!s) };
  }));

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

  return (
    <section aria-labelledby={tit} className={CARTAO}>
      <h2 className="text-lg font-semibold">
        <button id="sku-abrir" type="button" aria-expanded={aberto} aria-controls={painel} onClick={() => setAberto((v) => !v)}
          className={cn("flex min-h-11 w-full items-center gap-2 rounded-lg px-1 text-left outline-none transition-colors hover:bg-muted/60", ANEL)}>
          <ChevronRight className={cn("h-5 w-5 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", aberto && "rotate-90")} aria-hidden="true" />
          <span id={tit}>Referência (SKU)</span>
        </button>
      </h2>
      <div id={painel}>
        {aberto && (
          <div className={cn("mt-3 grid gap-3", ENTRA)}>
            <p className={NOTA}>A referência de um produto junta a sigla da categoria e da subcategoria, um número de 4 dígitos e depois as siglas dos atributos pela ordem de baixo (a medida escreve-se com x: 60X30). Os atributos que um produto não tem simplesmente não entram na referência. A ordem só vale para as referências novas.</p>
            <p data-testid="exemplo-sku" className="text-[15px]">Exemplo: <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm tabular-nums">{exemplo}</code></p>
            <ol className="grid gap-2" aria-label="Ordem dos atributos na referência">
              {itens.map((it, i) => {
                const a = porId.get(it.atributo)!;
                const rSubir = aGravar ? "A guardar…" : i === 0 ? "Já é o primeiro." : null;
                const rDescer = aGravar ? "A guardar…" : i === itens.length - 1 ? "Já é o último." : null;
                const pos = `, posição ${i + 1} de ${itens.length}`;
                return (
                  <li key={it.atributo} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-muted/50 p-2 pl-3">
                    <span className="w-6 text-sm text-muted-foreground tabular-nums" aria-hidden="true">{i + 1}.</span>
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
            {erro && <p className="text-[15px] text-red-700 dark:text-red-400" role="alert">{erro}</p>}
            {podeEditar && (
              <div className="flex flex-wrap items-center gap-3">
                <Button id="sku-guardar" className="min-h-11 text-[15px] aria-disabled:cursor-not-allowed aria-disabled:opacity-50" {...protegido(porque, razaoGuardar, () => { void guardar(); })}>
                  {aGravar && <Loader2 className="mr-1 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}Guardar a ordem da referência
                </Button>
                {porque && <p id={razaoGuardar} className={aGravar ? "sr-only" : NOTA}>{porque}</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
