import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { hojeLisboa } from "@/hooks/pessoas/adaptarResumoPessoa";
import type { QuadroPessoasEstado } from "@/hooks/pessoas/useQuadroPessoas";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";
import { ATRIBUTO_NEGOCIO, COLUNAS_QUADRO, type ColunaQuadro } from "@/components/pessoas/quadro/cartoesQuadroPessoas";
import { QuadroPessoas, type TotaisColuna } from "@/components/pessoas/quadro/QuadroPessoas";
import { QuadroPosContrato } from "@/components/pessoas/quadro/QuadroPosContrato";
import type { QuadroPosContratoEstado } from "@/hooks/pessoas/useQuadroPosContrato";
import { useAtalhosPessoas } from "@/components/pessoas/useAtalhosPessoas";

const R = "pessoasPagina.real.";

interface QuadroRealProps {
  quadro: QuadroPessoasEstado;
  /** Há pesquisa ou tipo escolhidos: um quadro vazio diz que nada corresponde e oferece limpar. */
  temFiltros: boolean;
  /** Abre a ficha da pessoa JÁ no negócio do cartão: o quadro só tem negócios, por isso o negócio vai sempre. */
  aoAbrir: (pessoaId: string, negocioId: string) => void;
  aoLimpar: () => void;
  /** Só no Pipeline: as colunas Financeiro e Obra (depois do contrato). Sem isto o quadro tem as 4 colunas de sempre. */
  posContrato?: QuadroPosContratoEstado;
}

/** O texto de estado que o contentor live da PÁGINA anuncia (uma região só, por ordem de importância). */
export function textoEstadoQuadro(t: ReturnType<typeof useTranslation>["t"], q: QuadroPessoasEstado): string {
  if (q.aMostrarAnterior) return t(`${R}board.updating`);
  if (q.isLoading) return t(`${R}board.loading`);
  if (q.isError && !q.erroSemDados) return t(`${R}board.refreshWarn`);
  return "";
}

function BotaoRepetir({ aoRepetir }: { aoRepetir: () => void }) {
  const { t } = useTranslation();
  return <Button type="button" variant="outline" className={`min-h-11 ${FOCO}`} onClick={aoRepetir}>{t(`${R}board.retry`)}</Button>;
}

/**
 * As mensagens do «Carregar mais» por coluna (a região live é só do Quadro): «a carregar mais em X», o erro, e, quando chegam, quantos e
 * quantos se mostram. O que chega no arranque ou ao mudar de filtro não se anuncia aqui (é da região da página).
 */
function useAnuncioCarregarMais(quadro: QuadroPessoasEstado, nomeDe: (c: ColunaQuadro) => string): string {
  const { t } = useTranslation();
  const [chegou, setChegou] = useState("");
  const emCurso = useRef(new Map<ColunaQuadro, number>());
  const { aCarregarMais, colunas } = quadro;
  useEffect(() => {
    let mensagem: string | null = null;
    for (const def of COLUNAS_QUADRO) {
      const agora = colunas[def.id].cartoes.length;
      const inicio = emCurso.current.get(def.id);
      if (aCarregarMais.has(def.id)) {
        if (inicio === undefined) emCurso.current.set(def.id, agora);
      } else if (inicio !== undefined) {
        emCurso.current.delete(def.id);
        if (agora > inicio) {
          mensagem = t(`${R}board.loadedMore`, { n: agora - inicio, column: nomeDe(def.id), shown: agora, total: colunas[def.id].total });
        }
      }
    }
    if (mensagem !== null) setChegou(mensagem);
    // `t` e `nomeDe` só mudam com a língua; o anúncio depende do que chega.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aCarregarMais, colunas]);
  const aPedir = COLUNAS_QUADRO.find((d) => aCarregarMais.has(d.id));
  if (Object.keys(quadro.errosAoCarregarMais).length > 0) return t(`${R}board.loadMoreError`);
  if (aPedir) return t(`${R}board.loadingMore`, { column: nomeDe(aPedir.id) });
  return chegou;
}

/**
 * O Quadro real das Pessoas: 7 colunas por etapa com os cartões (todos de negócio), a contagem e o valor de cada coluna, «Carregar mais» por coluna e os
 * estados de carregamento, vazio e erro. Não se arrastam cartões (a coluna deriva dos documentos do negócio); o nome e o botão do passo
 * abrem a ficha. Atalhos j/k/setas, `o` e `/` como na Lista do exemplo. Os dados vêm de `useQuadroPessoas`.
 */
export function QuadroReal({ quadro, temFiltros, aoAbrir, aoLimpar, posContrato }: QuadroRealProps) {
  const { t } = useTranslation();
  const raiz = useRef<HTMLDivElement>(null);
  const nomeDe = (c: ColunaQuadro): string => t(c === "porContactar" ? `${R}board.colNew` : `pessoasPagina.board.col.${c}`);
  const anuncio = useAnuncioCarregarMais(quadro, nomeDe);
  // Sem negócio não se abre nada: o ecrã guiado trabalha sempre sobre um negócio, nunca só sobre a pessoa.
  const abrirNegocio = (pessoaId: string, negocioId?: string): void => {
    if (negocioId) aoAbrir(pessoaId, negocioId);
  };
  const aoTeclar = useAtalhosPessoas(raiz, {
    pesquisa: () => document.querySelector<HTMLInputElement>('input[type="search"]')?.focus(),
    ajuda: () => undefined,
    abrir: (id) => abrirNegocio(id, document.activeElement?.getAttribute(ATRIBUTO_NEGOCIO) ?? undefined),
  });
  const semNome = t(`${R}noName`);
  const cartoes = useMemo(() => quadro.cartoes.map((c) => (c.nome ? c : { ...c, nome: semNome })), [quadro.cartoes, semNome]);
  const totais = useMemo(() => {
    const fora: Partial<Record<ColunaQuadro, TotaisColuna>> = {};
    for (const def of COLUNAS_QUADRO) {
      const { total, valor, haMais } = quadro.colunas[def.id];
      fora[def.id] = { total, valor, haMais };
    }
    return fora;
  }, [quadro.colunas]);
  const comErro = useMemo(() => new Set(Object.keys(quadro.errosAoCarregarMais) as ColunaQuadro[]), [quadro.errosAoCarregarMais]);
  const rotulos = useMemo(() => ({ porContactar: t(`${R}board.colNew`) }), [t]);
  const regiaoViva = <div role="status" aria-live="polite" className="sr-only">{anuncio}</div>;

  if (quadro.erroSemDados) {
    return (
      <>
        {regiaoViva}
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm">
          <p>{t(quadro.erro?.chave ?? `${R}board.error`)}</p>
          <BotaoRepetir aoRepetir={quadro.recarregar} />
        </div>
      </>
    );
  }
  if (quadro.isLoading) return <>{regiaoViva}<p className="p-4 text-sm text-muted-foreground">{t(`${R}board.loading`)}</p></>;
  // Financeiro e Obra ainda a carregar ou em erro: não se diz «vazio» (podem ter cartões que ainda não se sabe).
  const posIncompleto = posContrato !== undefined && (posContrato.isLoading || posContrato.isError);
  const vazio = cartoes.length === 0 && (posContrato?.cartoes.length ?? 0) === 0 && !posIncompleto && !quadro.aMostrarAnterior;
  return (
    <div ref={raiz} onKeyDown={aoTeclar} className="space-y-3">
      {regiaoViva}
      {quadro.isError && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
          <p>{t(`${R}board.refreshWarn`)}</p>
          <BotaoRepetir aoRepetir={quadro.recarregar} />
        </div>
      )}
      {vazio && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border p-4 text-sm">
          <p>{t(temFiltros ? `${R}board.emptyFiltered` : `${R}board.emptyAll`)}</p>
          {temFiltros && <Button type="button" variant="outline" className={`min-h-11 ${FOCO}`} onClick={aoLimpar}>{t(`${R}clearFilters`)}</Button>}
        </div>
      )}
      <QuadroPessoas
        cartoes={cartoes} hoje={hojeLisboa()} chip="todas" aoAbrir={abrirNegocio} aoLimpar={aoLimpar} semAvisoVazio
        totais={totais} aoCarregarMais={quadro.carregarMais} aCarregarMais={quadro.aCarregarMais} carregarMaisDesativado={quadro.aMostrarAnterior}
        colunasComErro={comErro} rotulosColuna={rotulos}
        colunasExtra={posContrato ? <QuadroPosContrato estado={posContrato} aoAbrir={abrirNegocio} /> : undefined}
      />
    </div>
  );
}
