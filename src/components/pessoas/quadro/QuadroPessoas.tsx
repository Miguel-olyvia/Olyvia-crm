import { useEffect, useRef } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { COR_FASE } from "@/components/negocio-metas/estilos";
import { formatarMeta } from "@/components/negocio-metas/formatoMetas";
import type { ChipPessoa } from "../pessoasTipos";
import type { ItemProcesso } from "../processo/tiposProcesso";
import { LINHA_PESSOA } from "../useAtalhosPessoas";
import { CartaoPessoaQuadro } from "./CartaoPessoaQuadro";
import { COLUNAS_QUADRO, type CartaoQuadro, type ColunaQuadro, type DefColuna } from "./cartoesQuadroPessoas";
import { RodapeColuna } from "./RodapeColuna";

/** As colunas de abordagem (renderizam-se individualmente) e as de negócio (agrupam-se numa só). */
const COLUNAS_ABORDAGEM = COLUNAS_QUADRO.filter((d) => d.parte === "abordagem");
const COLUNAS_NEGOCIO = COLUNAS_QUADRO.filter((d) => d.parte === "negocio");

/** Os totais de uma coluna segundo a base (a coluna inteira, não só os cartões carregados). */
export interface TotaisColuna {
  total: number;
  /** Já com NULL como 0. */
  valor: number;
  haMais: boolean;
}

interface QuadroPessoasProps {
  /** Os cartões já filtrados e ordenados (ver `cartoesDoQuadro`); dentro de cada coluna a ordem é esta. */
  cartoes: readonly CartaoQuadro[];
  hoje: string;
  /** O chip activo: com "Perdidas" um quadro vazio explica que as perdidas não têm cartão. */
  chip: ChipPessoa;
  aoAbrir: (pessoaId: string, negocioId?: string) => void;
  /** Limpa os filtros (a mesma saída da tabela vazia). */
  aoLimpar: () => void;
  /** Os itens do processo dos cartões, pelo id do cartão (ver `itensDaPessoa`): com eles os botões dos passos executam-nos. */
  itens?: ReadonlyMap<string, ItemProcesso>;
  /** Só no Quadro real: os totais de cada coluna segundo a base. Sem isto contam-se os cartões recebidos (o exemplo). */
  totais?: Partial<Record<ColunaQuadro, TotaisColuna>>;
  /** Só no Quadro real: pede mais cartões de UMA coluna. Sem isto não há «Carregar mais». */
  aoCarregarMais?: (coluna: ColunaQuadro) => boolean | void;
  /** As colunas a que se está a pedir mais cartões. */
  aCarregarMais?: ReadonlySet<ColunaQuadro>;
  /** Os cartões são de um filtro anterior: «Carregar mais» espera pelos novos. */
  carregarMaisDesativado?: boolean;
  /** As colunas cujo último «Carregar mais» falhou. */
  colunasComErro?: ReadonlySet<ColunaQuadro>;
  /** Troca o título de colunas (no modo real, «Novo» em vez de «Por contactar»). */
  rotulosColuna?: Partial<Record<ColunaQuadro, string>>;
  /** O aviso de quadro vazio é de quem usa o quadro (o real tem os seus textos). */
  semAvisoVazio?: boolean;
}

/** A faixa de cada coluna: as de negócio usam a cor da fase; as da abordagem, tons do texto secundário (a fase diz-se sempre por texto). */
const COR_COLUNA: Record<ColunaQuadro, string> = {
  porContactar: "bg-muted-foreground/40",
  contactado: "bg-muted-foreground/60",
  visita: "bg-muted-foreground/80",
  levantamento: "bg-muted-foreground",
  orcamento: COR_FASE.orcamento,
  proposta: COR_FASE.proposta,
  contrato: COR_FASE.contrato,
};

/** A cor do ponto de cada sub-fase dentro da coluna agrupada de Negócios. */
const COR_PONTO_FASE: Partial<Record<ColunaQuadro, string>> = {
  levantamento: "bg-muted-foreground",
  orcamento: COR_FASE.orcamento,
  proposta: COR_FASE.proposta,
  contrato: COR_FASE.contrato,
};

/** Uma coluna sem cartões diz-o em vez de ficar em branco. */
function ColunaVazia() {
  const { t } = useTranslation();
  return (
    <li className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">{t("pessoasPagina.board.empty")}</li>
  );
}

/** Sem nenhum cartão: diz porquê (filtros, ou o chip Perdidas, que nunca tem cartão) e dá a saída. */
function AvisoQuadroVazio({ chip, aoLimpar }: Pick<QuadroPessoasProps, "chip" | "aoLimpar">) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border p-4">
      <p className="text-sm text-foreground">{t(chip === "perdidas" ? "pessoasPagina.board.lostHint" : "pessoasPagina.empty.title")}</p>
      <Button type="button" className="min-h-11" onClick={aoLimpar}>{t("pessoasPagina.empty.clear")}</Button>
    </div>
  );
}

/** Uma coluna de abordagem: faixa de cor, título (h3, a contagem em texto só para o leitor) e os cartões. */
interface ColunaProps extends Pick<QuadroPessoasProps, "hoje" | "itens" | "aoAbrir" | "aoCarregarMais"> {
  desativado: boolean;
  def: DefColuna;
  cartoes: readonly CartaoQuadro[];
  totais?: TotaisColuna;
  rotulo?: string;
  aCarregar: boolean;
  comErro: boolean;
}

function Coluna({ def, cartoes, hoje, itens, aoAbrir, totais, rotulo, aCarregar, comErro, desativado, aoCarregarMais }: ColunaProps) {
  const { t } = useTranslation();
  const secao = useRef<HTMLElement>(null);
  const pediuComCartoes = useRef<number | null>(null);
  const { haMais } = totais ?? { haMais: false };
  useEffect(() => {
    if (pediuComCartoes.current === null || aCarregar) return;
    const antes = pediuComCartoes.current;
    pediuComCartoes.current = null;
    const raiz = secao.current;
    if (!raiz || raiz.contains(document.activeElement)) return;
    raiz.querySelectorAll<HTMLElement>(`[${LINHA_PESSOA}]`)[antes]?.focus();
  }, [cartoes.length, haMais, aCarregar, comErro]);
  const contagem = totais ? totais.total : cartoes.length;
  return (
    <section
      ref={secao} aria-labelledby={`quadro-pessoas-${def.id}`} className="flex flex-col overflow-hidden rounded-lg border border-border bg-muted/30 lg:min-w-[240px] lg:flex-1"
    >
      <div aria-hidden="true" className={cn("h-1", COR_COLUNA[def.id])} />
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <h3 id={`quadro-pessoas-${def.id}`} className="break-words text-sm font-semibold">
            {rotulo ?? t(`pessoasPagina.board.col.${def.id}`)}
            <span className="sr-only">{t("pessoasPagina.board.count.sep")}{contagem === 1 ? t("pessoasPagina.board.count.one") : t("pessoasPagina.board.count.many", { count: contagem })}</span>
          </h3>
          <Badge variant="secondary" className="h-5 px-1.5 text-xs" aria-hidden="true">{contagem}</Badge>
        </div>
      </div>
      <ul role="list" className="min-h-[120px] flex-1 space-y-2 p-2">
        {cartoes.map((c) => <CartaoPessoaQuadro key={c.id} cartao={c} hoje={hoje} item={itens?.get(c.id)} aoAbrir={aoAbrir} />)}
        {cartoes.length === 0 && <ColunaVazia />}
      </ul>
      {totais && aoCarregarMais && (
        <RodapeColuna
          coluna={rotulo ?? t(`pessoasPagina.board.col.${def.id}`)} carregados={cartoes.length} total={totais.total}
          aCarregar={aCarregar} comErro={comErro} desativado={desativado}
          aoCarregarMais={() => { pediuComCartoes.current = aoCarregarMais(def.id) === false ? null : cartoes.length; }}
        />
      )}
    </section>
  );
}

/** Cabeçalho de uma sub-fase dentro da coluna agrupada de Negócios (Levantamento, Orçamento, Proposta, Contrato). */
function CabecalhoSubFase({ def, contagem, valor, t }: { def: DefColuna; contagem: number; valor: number; t: ReturnType<typeof useTranslation>["t"] }) {
  const mostraSoma = def.id !== "levantamento";
  const total = formatarMeta("euro", valor);
  return (
    <div className="flex items-center gap-2 px-1 py-1.5">
      <span aria-hidden="true" className={cn("h-2.5 w-2.5 shrink-0 rounded-full", COR_PONTO_FASE[def.id])} />
      <span className="text-xs font-semibold">{t(`pessoasPagina.board.col.${def.id}`)}</span>
      <Badge variant="secondary" className="h-4 px-1 text-[10px]" aria-hidden="true">{contagem}</Badge>
      {mostraSoma && valor > 0 && (
        <span className="ml-auto shrink-0 text-[10px] font-medium tabular-nums text-muted-foreground">{total}</span>
      )}
    </div>
  );
}

/** A coluna agrupada «Negócios»: uma única coluna com sub-secções por fase (Levantamento, Orçamento, Proposta, Contrato). */
interface ColunaNegociosProps extends Pick<QuadroPessoasProps, "hoje" | "itens" | "aoAbrir" | "aoCarregarMais" | "aCarregarMais" | "carregarMaisDesativado" | "colunasComErro"> {
  cartoes: readonly CartaoQuadro[];
  totais?: Partial<Record<ColunaQuadro, TotaisColuna>>;
}

function ColunaNegociosAgrupada({ cartoes, hoje, itens, aoAbrir, totais, aoCarregarMais, aCarregarMais, carregarMaisDesativado, colunasComErro }: ColunaNegociosProps) {
  const { t } = useTranslation();
  // Totais globais da coluna agrupada.
  const contagemTotal = COLUNAS_NEGOCIO.reduce((s, d) => s + (totais?.[d.id]?.total ?? cartoes.filter((c) => c.coluna === d.id).length), 0);
  const valorTotal = COLUNAS_NEGOCIO.reduce((s, d) => {
    if (d.id === "levantamento") return s;
    return s + (totais?.[d.id]?.valor ?? cartoes.filter((c) => c.coluna === d.id).reduce((a, c) => a + (c.valor ?? 0), 0));
  }, 0);
  const totalFormatado = formatarMeta("euro", valorTotal);
  return (
    <section
      aria-labelledby="quadro-pessoas-negocios" className="flex flex-col overflow-hidden rounded-lg border border-border bg-muted/30 lg:min-w-[300px] lg:flex-[1.5]"
    >
      {/* Faixa gradiente com as cores das 4 fases. */}
      <div aria-hidden="true" className="flex h-1">
        <div className={cn("flex-1", COR_COLUNA.levantamento)} />
        <div className={cn("flex-1", COR_COLUNA.orcamento)} />
        <div className={cn("flex-1", COR_COLUNA.proposta)} />
        <div className={cn("flex-1", COR_COLUNA.contrato)} />
      </div>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <h3 id="quadro-pessoas-negocios" className="break-words text-sm font-semibold">
            {t("pessoasPagina.board.col.negocios")}
            <span className="sr-only">{t("pessoasPagina.board.count.sep")}{contagemTotal === 1 ? t("pessoasPagina.board.count.one") : t("pessoasPagina.board.count.many", { count: contagemTotal })}</span>
          </h3>
          <Badge variant="secondary" className="h-5 px-1.5 text-xs" aria-hidden="true">{contagemTotal}</Badge>
        </div>
        {valorTotal > 0 && (
          <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
            <span aria-hidden="true">{totalFormatado}</span>
            <span className="sr-only">{t("pessoasPagina.board.total", { value: totalFormatado })}</span>
          </span>
        )}
      </div>
      <div className="min-h-[120px] flex-1 space-y-1 p-2">
        {COLUNAS_NEGOCIO.map((def) => {
          const daFase = cartoes.filter((c) => c.coluna === def.id);
          const faseTotais = totais?.[def.id];
          const contagem = faseTotais ? faseTotais.total : daFase.length;
          const valor = faseTotais ? faseTotais.valor : daFase.reduce((s, c) => s + (c.valor ?? 0), 0);
          if (contagem === 0 && daFase.length === 0) return null;
          return (
            <div key={def.id}>
              <CabecalhoSubFase def={def} contagem={contagem} valor={valor} t={t} />
              <ul role="list" className="space-y-2 pb-2">
                {daFase.map((c) => <CartaoPessoaQuadro key={c.id} cartao={c} hoje={hoje} item={itens?.get(c.id)} aoAbrir={aoAbrir} />)}
              </ul>
              {faseTotais && aoCarregarMais && (faseTotais.haMais || colunasComErro?.has(def.id)) && (
                <RodapeColuna
                  coluna={t(`pessoasPagina.board.col.${def.id}`)} carregados={daFase.length} total={faseTotais.total}
                  aCarregar={aCarregarMais?.has(def.id) ?? false} comErro={colunasComErro?.has(def.id) ?? false} desativado={carregarMaisDesativado ?? false}
                  aoCarregarMais={() => aoCarregarMais(def.id)}
                />
              )}
            </div>
          );
        })}
        {contagemTotal === 0 && <ColunaVazia />}
      </div>
    </section>
  );
}

/**
 * Um só quadro, uma só linha de colunas: Por contactar, Contactado e Visita (um cartão por pessoa em abordagem), depois uma coluna agrupada
 * «Negócios» com sub-secções Levantamento, Orçamento, Proposta e Contrato. Em ecrã largo as colunas rolam na horizontal; em ecrã estreito empilham.
 */
export function QuadroPessoas({
  cartoes, hoje, chip, aoAbrir, aoLimpar, itens, totais, aoCarregarMais, aCarregarMais, carregarMaisDesativado, colunasComErro, rotulosColuna,
  semAvisoVazio,
}: QuadroPessoasProps) {
  const { t } = useTranslation();
  const cartoesNegocio = cartoes.filter((c) => COLUNAS_NEGOCIO.some((d) => d.id === c.coluna));
  return (
    <div className="space-y-5">
      {cartoes.length === 0 && !semAvisoVazio && <AvisoQuadroVazio chip={chip} aoLimpar={aoLimpar} />}
      <div role="group" aria-label={t("pessoasPagina.board.label")} className="flex flex-col gap-3 lg:flex-row lg:overflow-x-auto lg:pb-2">
        {COLUNAS_ABORDAGEM.map((def) => (
          <Coluna
            key={def.id} def={def} cartoes={cartoes.filter((c) => c.coluna === def.id)} hoje={hoje} itens={itens} aoAbrir={aoAbrir}
            totais={totais?.[def.id] ?? (totais ? { total: 0, valor: 0, haMais: false } : undefined)} rotulo={rotulosColuna?.[def.id]}
            aCarregar={aCarregarMais?.has(def.id) ?? false} desativado={carregarMaisDesativado ?? false} comErro={colunasComErro?.has(def.id) ?? false} aoCarregarMais={aoCarregarMais}
          />
        ))}
        <ColunaNegociosAgrupada
          cartoes={cartoesNegocio} hoje={hoje} itens={itens} aoAbrir={aoAbrir} totais={totais}
          aoCarregarMais={aoCarregarMais} aCarregarMais={aCarregarMais} carregarMaisDesativado={carregarMaisDesativado} colunasComErro={colunasComErro}
        />
      </div>
    </div>
  );
}
