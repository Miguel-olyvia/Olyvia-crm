// Famílias (interface): o assistente de 3 passos (1 Escolher produtos, 2 Atributos dos produtos, 3 Resumo e pré-visualização). Guarda o estado (os produtos escolhidos como objetos,
// os eixos escolhidos) e DERIVA tudo o resto com o núcleo; nada se escreve à mão e nada vai à base. A família só se entrega a quem usa o assistente (`onGuardar`), em memória.
// O passo 1 fica montado (escondido) nos outros passos: ao recuar conserva a pesquisa, os filtros e a página. O foco nunca se perde: vai ao título do passo ao abrir e ao mudar de
// passo, e ao vizinho (ou ao título) depois de excluir, remover ou limpar.
// 20/11: «Guardar» grava na base por quem usa o assistente (`onGuardar` devolve o erro, ou null): enquanto grava fica aria-busy e não aceita outro clique; um erro
// aparece em alerta no passo 3 e o assistente fica aberto com tudo o que se escolheu. A marca «já está noutra família» e os nomes das outras famílias vêm da base.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Catalogo, Produto } from "../v2/catalogoModelo";
import { PassoAtributosFamilia } from "./PassoAtributosFamilia";
import { PassoEscolherFamilia } from "./PassoEscolherFamilia";
import { PassoResumoFamilia } from "./PassoResumoFamilia";
import { categoriaDoNo, derivarFamilia, itensDosEscolhidos, problemasDoPasso, type FamiliaGuardada } from "./derivarFamilia";
import { BTN_DESATIVAVEL, geram, plural } from "./estilosFamilias";
import { useTranslation } from "@/hooks/useTranslation";
import type { EixosCfg } from "./nucleo";
import { alternarEscolha, juntarEscolha } from "./selecao";
import { useAtributosEscolhidos, type CacheAtributos } from "./usarAtributosEscolhidos";

const TITULOS = ["Escolher produtos", "Atributos dos produtos", "Resumo e pré-visualização"] as const;
const TOTAL = TITULOS.length;

export interface AssistenteProps {
  org: string; K: Catalogo;
  /** os identificadores do núcleo (`fam:` + nome) das OUTRAS famílias da organização: um nome repetido é um erro antes de ir à base */
  outrosIds: readonly string[];
  /** a família que se edita, lida da base (null: uma nova) */
  editar: FamiliaAberta | null;
  cacheAtributos: CacheAtributos;
  /** grava; devolve o texto do erro (o assistente fica aberto e mostra-o) ou null */
  onGuardar: (f: FamiliaGuardada) => Promise<string | null>; onCancelar: () => void;
}

/** Uma família gravada, aberta para editar: o id e a versão da base, os produtos (vivos) e os eixos já convertidos para os nomes do núcleo. */
export interface FamiliaAberta { id: string; versao: string; nome: string; produtos: Produto[]; eixos: EixosCfg }

/** O vizinho de um produto numa lista (o seguinte; senão o anterior): para onde vai o foco quando ele sai. */
const vizinhoDe = (lista: readonly Produto[], id: string): Produto | undefined => { const i = lista.findIndex((p) => p.id === id); return lista[i + 1] ?? lista[i - 1]; };

export function AssistenteFamilia({ org, K, outrosIds, editar, cacheAtributos, onGuardar, onCancelar }: AssistenteProps) {
  const { t } = useTranslation();
  const [passo, setPasso] = useState(1);
  const [escolhidos, setEscolhidos] = useState<Produto[]>(() => editar?.produtos ?? []);
  const [escolhaEixos, setEscolhaEixos] = useState<EixosCfg | null>(() => editar?.eixos ?? null);
  const [aGravar, setAGravar] = useState(false), [erroGravar, setErroGravar] = useState<string | null>(null);
  /** trava o duplo clique já no mesmo instante (o estado só muda no próximo desenho) e não mexe no estado depois de desmontar */
  const gravando = useRef(false), vivo = useRef(true);
  useEffect(() => () => { vivo.current = false; }, []);
  const idMotivo = useId();
  const tituloRef = useRef<HTMLHeadingElement>(null), escolhidosRef = useRef(escolhidos);
  escolhidosRef.current = escolhidos;
  /** o id do elemento que recebe o foco depois do próximo desenho (null: o título; undefined: nada a fazer) */
  const alvoFoco = useRef<string | null | undefined>(undefined);
  useEffect(() => { tituloRef.current?.focus(); }, [passo]);
  useEffect(() => {
    if (alvoFoco.current === undefined) return;
    const id = alvoFoco.current;
    alvoFoco.current = undefined;
    ((id ? document.getElementById(id) : null) ?? tituloRef.current)?.focus();
  });

  const ids = useMemo(() => escolhidos.map((p) => p.id), [escolhidos]);
  const { estados, tentar } = useAtributosEscolhidos(org, ids, passo >= 2, cacheAtributos);
  const idOriginal = editar?.id ?? null;
  const noPasso1 = passo < 2;
  // o que se deriva dos atributos só se calcula a partir do passo 2 e só quando algo muda
  const itens = useMemo(() => {
    if (noPasso1) return [];
    const lidos = new Map([...estados].flatMap(([id, e]) => (e.k === "ok" ? [[id, e.attrs] as const] : [])));
    return itensDosEscolhidos(escolhidos, lidos, K.atributos, (no) => categoriaDoNo(K, no));
  }, [noPasso1, estados, escolhidos, K]);
  const d = useMemo(() => (noPasso1 ? null : derivarFamilia(itens, escolhaEixos, outrosIds)), [noPasso1, itens, escolhaEixos, outrosIds]);
  const naoLidos = escolhidos.filter((p) => estados.get(p.id)?.k !== "ok");

  const erroPasso2 = d ? problemasDoPasso(d.problemas, 2).find((x) => x.gravidade === "erro")?.msg : undefined;
  const erros = d ? d.problemas.filter((x) => x.gravidade === "erro").map((x) => x.msg) : [];
  const motivo = motivoDoPasso(passo, escolhidos.length, naoLidos.map((p) => ({ n: p.n, erro: estados.get(p.id)?.k === "erro" })), erros, erroPasso2);

  const alternar = useCallback((p: Produto) => setEscolhidos((l) => alternarEscolha(l, p).lista), []);
  const selecionarPagina = useCallback((ps: Produto[]) => setEscolhidos((l) => juntarEscolha(l, ps).lista), []);
  const limpar = useCallback(() => { alvoFoco.current = null; setEscolhidos([]); }, []);
  const remover = useCallback((p: Produto) => {
    const v = vizinhoDe(escolhidosRef.current, p.id);
    alvoFoco.current = v ? `remover-${v.id}` : null;
    setEscolhidos((l) => l.filter((x) => x.id !== p.id));
  }, []);
  const excluir = (id: string) => {
    const v = vizinhoDe(escolhidos, id);
    alvoFoco.current = v ? `excluir-${v.id}` : null;
    const resto = escolhidos.filter((p) => p.id !== id);
    setEscolhidos(resto);
    if (resto.length === 0) setPasso(1);
  };
  const guardar = async () => {
    if (motivo || !d || gravando.current) return;
    gravando.current = true;
    setAGravar(true); setErroGravar(null);
    const erro = await onGuardar({ familia: d.familia, produtos: escolhidos });
    gravando.current = false;
    if (!vivo.current) return;
    setAGravar(false);
    if (erro) setErroGravar(erro);
  };
  const recuar = () => { if (passo > 1) setPasso(passo - 1); };
  const avancar = () => { if (!motivo) setPasso((p) => Math.min(TOTAL, p + 1)); };

  return (
    <section aria-label="Configurador de famílias" className="grid gap-4">
      <div className="grid gap-2">
        <p role="status" aria-label="Passo atual" className="text-[15px] font-medium text-muted-foreground">Passo {passo} de {TOTAL} · {TITULOS[passo - 1]}</p>
        <ol aria-label="Passos do configurador" className="flex gap-1.5">
          {TITULOS.map((t, i) => {
            const n = i + 1, atual = n === passo;
            return (
              <li key={t} aria-current={atual ? "step" : undefined}
                className={cn("flex h-8 min-w-0 flex-1 items-center justify-center rounded-full border px-2 text-sm", atual ? "border-primary bg-primary font-semibold text-primary-foreground" : n < passo ? "border-primary/40 bg-primary/10" : "border-border bg-muted text-muted-foreground")}>
                <span className="sr-only">Passo {n}: {t}{n < passo ? " (feito)" : atual ? " (atual)" : ""}</span>
                <span aria-hidden="true">{n < passo ? "✓" : n}</span>
              </li>
            );
          })}
        </ol>
      </div>
      <div className="grid gap-4 rounded-2xl border border-border bg-card p-4">
        <h3 ref={tituloRef} tabIndex={-1} className="rounded-sm text-lg font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{TITULOS[passo - 1]}</h3>
        <div hidden={passo !== 1}>
          <PassoEscolherFamilia org={org} K={K} escolhidos={escolhidos} familiaAtual={idOriginal} onAlternar={alternar} onRemover={remover} onSelecionarPagina={selecionarPagina} onLimpar={limpar} />
        </div>
        {passo === 2 && d && (
          <PassoAtributosFamilia produtos={escolhidos} estados={estados} itens={itens} nomes={d.nomes} eixos={d.eixos} onEixos={setEscolhaEixos} onExcluir={excluir} onTentar={tentar}
            problemas={d.problemas} resumo={geram(escolhidos.length, d.familia.variantes.length)} />
        )}
        {passo === TOTAL && d && <PassoResumoFamilia familia={d.familia} problemas={d.problemas} />}
        {passo === TOTAL && erroGravar && <p role="alert" className="text-[15px] text-destructive">{t("catFamilias.erroGuardar", { erro: erroGravar })}</p>}
        {passo === TOTAL && aGravar && <p role="status" className="text-[15px] text-muted-foreground">{t("catFamilias.aGuardar")}</p>}
      </div>
      <div role="group" aria-label="Navegação do configurador" className="flex flex-wrap items-center gap-2">
        <p id={idMotivo} role="status" aria-label="Motivo" className="w-full text-[15px] text-muted-foreground">{motivo}</p>
        <Button type="button" variant="outline" className={BTN_DESATIVAVEL} aria-disabled={passo === 1 || undefined} onClick={recuar}>Anterior</Button>
        {passo < TOTAL
          ? <Button type="button" className={BTN_DESATIVAVEL} aria-disabled={!!motivo || undefined} aria-describedby={idMotivo} onClick={avancar}>Seguinte</Button>
          : <Button type="button" className={BTN_DESATIVAVEL} aria-disabled={!!motivo || aGravar || undefined} aria-busy={aGravar || undefined} aria-describedby={idMotivo} onClick={() => { void guardar(); }}>{t("catFamilias.guardar")}</Button>}
        <Button type="button" variant="outline" className={BTN_DESATIVAVEL} onClick={onCancelar}>Cancelar</Button>
      </div>
    </section>
  );
}

/** Porque o «Seguinte» (ou o «Guardar») não avança; vazio se pode. */
function motivoDoPasso(passo: number, nEscolhidos: number, naoLidos: readonly { n: string; erro: boolean }[], erros: readonly string[], erroDoPasso2: string | undefined): string {
  if (passo === 1) return nEscolhidos === 0 ? "Para continuar: escolha pelo menos um produto do catálogo." : "";
  const comErro = naoLidos.find((x) => x.erro);
  if (comErro) return `Para continuar: não foi possível ler os atributos de «${comErro.n}»: tente de novo ou exclua o produto.`;
  if (naoLidos.length > 0) return `A ler os atributos de ${plural(naoLidos.length, "produto", "produtos")}: aguarde para continuar.`;
  if (passo === 2) return erroDoPasso2 ? `Para continuar: ${erroDoPasso2}` : "";
  return erros.length > 0 ? `Para guardar: ${erros[0]}` : "";
}
