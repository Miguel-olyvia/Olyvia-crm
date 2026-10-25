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
import { COLUNAS_ABORDAGEM, COLUNAS_NEGOCIO, type CartaoQuadro, type ColunaQuadro, type DefColuna } from "./cartoesQuadroPessoas";
import { RodapeColuna } from "./RodapeColuna";

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

/** A contagem em texto, só para o leitor de ecrã (vai dentro do título). */
function TextoContagem({ contagem }: { contagem: number }) {
  const { t } = useTranslation();
  return <span className="sr-only">{t("pessoasPagina.board.count.sep")}{contagem === 1 ? t("pessoasPagina.board.count.one") : t("pessoasPagina.board.count.many", { count: contagem })}</span>;
}

/** O valor de uma fase ou do grupo: visível por símbolo, e por texto para o leitor. */
function ValorColuna({ valor }: { valor: number }) {
  const { t } = useTranslation();
  const total = formatarMeta("euro", valor);
  return (
    <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
      <span aria-hidden="true">{total}</span>
      <span className="sr-only">{t("pessoasPagina.board.total", { value: total })}</span>
    </span>
  );
}

/** Os dados de uma fase (coluna ou sub-fase): cartões, totais, rótulo e estado do «Carregar mais». */
interface FaseProps extends Pick<QuadroPessoasProps, "hoje" | "itens" | "aoAbrir" | "aoCarregarMais"> {
  desativado: boolean;
  def: DefColuna;
  cartoes: readonly CartaoQuadro[];
  totais?: TotaisColuna;
  rotulo?: string;
  aCarregar: boolean;
  comErro: boolean;
}

/** O que cada fase tem por dentro: a lista de cartões, o «Nada nesta fase», o rodapé «Carregar mais» e o foco no primeiro cartão novo. */
function CorpoFase({ def, cartoes, hoje, itens, aoAbrir, totais, rotulo, aCarregar, comErro, desativado, aoCarregarMais }: FaseProps) {
  const { t } = useTranslation();
  const corpo = useRef<HTMLDivElement>(null);
  // Quantos cartões havia quando se pediu mais: se o botão desaparecer (já não falta nada), o foco vai para o primeiro cartão novo.
  const pediuComCartoes = useRef<number | null>(null);
  const { haMais } = totais ?? { haMais: false };
  useEffect(() => {
    if (pediuComCartoes.current === null || aCarregar) return;
    const antes = pediuComCartoes.current;
    pediuComCartoes.current = null;
    const raiz = corpo.current;
    if (!raiz || raiz.contains(document.activeElement)) return;
    raiz.querySelectorAll<HTMLElement>(`[${LINHA_PESSOA}]`)[antes]?.focus();
  }, [cartoes.length, haMais, aCarregar, comErro]);
  return (
    <div ref={corpo} className="flex flex-1 flex-col">
      <ul role="list" className="min-h-[120px] flex-1 space-y-2 p-2">
        {cartoes.map((c) => <CartaoPessoaQuadro key={c.id} cartao={c} hoje={hoje} item={itens?.get(c.id)} aoAbrir={aoAbrir} />)}
        {cartoes.length === 0 && <ColunaVazia />}
      </ul>
      {totais && aoCarregarMais && (
        <RodapeColuna
          coluna={rotulo ?? t(`pessoasPagina.board.col.${def.id}`)} carregados={cartoes.length} total={totais.total}
          aCarregar={aCarregar} comErro={comErro} desativado={desativado}
          // Só se espera pelos cartões novos (e se lhes dá o foco) se o pedido saiu: sem cursor ou sem nada a pedir, nada chega e a marca ficava a roubar
          // o foco ao primeiro refetch.
          aoCarregarMais={() => { pediuComCartoes.current = aoCarregarMais(def.id) === false ? null : cartoes.length; }}
        />
      )}
    </div>
  );
}

/** Uma coluna da abordagem: faixa de cor, título (h3, a contagem em texto só para o leitor) e os cartões. */
function Coluna(props: FaseProps) {
  const { t } = useTranslation();
  const { def, cartoes, totais, rotulo } = props;
  const contagem = totais ? totais.total : cartoes.length;
  return (
    <section
      aria-labelledby={`quadro-pessoas-${def.id}`} className="flex flex-col overflow-hidden rounded-lg border border-border bg-muted/30 lg:min-w-[240px] lg:flex-1"
    >
      <div aria-hidden="true" className={cn("h-1", COR_COLUNA[def.id])} />
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <h3 id={`quadro-pessoas-${def.id}`} className="break-words text-sm font-semibold">
            {rotulo ?? t(`pessoasPagina.board.col.${def.id}`)}
            <TextoContagem contagem={contagem} />
          </h3>
          <Badge variant="secondary" className="h-5 px-1.5 text-xs" aria-hidden="true">{contagem}</Badge>
        </div>
      </div>
      <CorpoFase {...props} />
    </section>
  );
}

/** O valor de uma sub-fase: o da base, ou a soma dos cartões carregados. O Levantamento nunca tem valor (ainda não há orçamento). */
const valorDaFase = (def: DefColuna, cartoes: readonly CartaoQuadro[], totais?: TotaisColuna): number | null =>
  def.id === "levantamento" ? null : totais ? totais.valor : cartoes.reduce((s, c) => s + (c.valor ?? 0), 0);

/** Uma sub-fase dentro da coluna «Negócios»: ponto da cor da fase, nome (h4), contagem, valor, os cartões e o seu próprio «Carregar mais». */
function SubFase(props: FaseProps) {
  const { t } = useTranslation();
  const { def, cartoes, totais, rotulo } = props;
  const contagem = totais ? totais.total : cartoes.length;
  const valor = valorDaFase(def, cartoes, totais);
  return (
    <section aria-labelledby={`quadro-pessoas-${def.id}`} className="flex flex-col rounded-md border border-border bg-background/60">
      <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
        <span aria-hidden="true" className={cn("h-2.5 w-2.5 shrink-0 rounded-full", COR_COLUNA[def.id])} />
        <h4 id={`quadro-pessoas-${def.id}`} className="min-w-0 break-words text-xs font-semibold">
          {rotulo ?? t(`pessoasPagina.board.col.${def.id}`)}
          <TextoContagem contagem={contagem} />
        </h4>
        <Badge variant="secondary" className="h-4 px-1 text-[10px]" aria-hidden="true">{contagem}</Badge>
        {valor !== null && <span className="ml-auto"><ValorColuna valor={valor} /></span>}
      </div>
      <CorpoFase {...props} />
    </section>
  );
}

/** A coluna «Negócios»: faixa com as cores das fases, contagem e valor agregados, e uma sub-fase por fase. Só apresentação: a paginação e os totais são por fase. */
interface GrupoProps extends Pick<QuadroPessoasProps, "hoje" | "itens" | "aoAbrir" | "aoCarregarMais" | "aCarregarMais" | "carregarMaisDesativado" | "colunasComErro" | "rotulosColuna"> {
  cartoes: readonly CartaoQuadro[];
  totais?: Partial<Record<ColunaQuadro, TotaisColuna>>;
}

function ColunaNegocios({ cartoes, totais, rotulosColuna, aCarregarMais, carregarMaisDesativado, colunasComErro, ...resto }: GrupoProps) {
  const { t } = useTranslation();
  const fases = COLUNAS_NEGOCIO.map((def) => {
    const doGrupo = cartoes.filter((c) => c.coluna === def.id);
    const dosTotais = totais ? (totais[def.id] ?? { total: 0, valor: 0, haMais: false }) : undefined;
    return { def, cartoes: doGrupo, totais: dosTotais };
  });
  const contagem = fases.reduce((s, f) => s + (f.totais ? f.totais.total : f.cartoes.length), 0);
  const valor = fases.reduce((s, f) => s + (valorDaFase(f.def, f.cartoes, f.totais) ?? 0), 0);
  return (
    <section
      aria-labelledby="quadro-pessoas-negocios" className="flex flex-col overflow-hidden rounded-lg border border-border bg-muted/30 lg:min-w-[300px] lg:flex-[1.5]"
    >
      <div aria-hidden="true" className="flex h-1">
        {COLUNAS_NEGOCIO.map((def) => <div key={def.id} className={cn("flex-1", COR_COLUNA[def.id])} />)}
      </div>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <h3 id="quadro-pessoas-negocios" className="break-words text-sm font-semibold">
            {t("pessoasPagina.board.col.negocios")}
            <TextoContagem contagem={contagem} />
          </h3>
          <Badge variant="secondary" className="h-5 px-1.5 text-xs" aria-hidden="true">{contagem}</Badge>
        </div>
        <ValorColuna valor={valor} />
      </div>
      <div className="space-y-2 p-2">
        {fases.map((f) => (
          <SubFase
            key={f.def.id} {...resto} def={f.def} cartoes={f.cartoes} totais={f.totais} rotulo={rotulosColuna?.[f.def.id]}
            aCarregar={aCarregarMais?.has(f.def.id) ?? false} desativado={carregarMaisDesativado ?? false} comErro={colunasComErro?.has(f.def.id) ?? false}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * Um só quadro, uma só linha de colunas: Por contactar, Contactado e Visita (um cartão por pessoa em abordagem) e a coluna Negócios, que agrupa
 * Levantamento, Orçamento, Proposta e Contrato (um cartão por negócio) em sub-fases. Em ecrã largo as colunas rolam na horizontal; em ecrã estreito
 * empilham. Cada coluna tem um h3 (o h2 é o do separador, na página), cada sub-fase um h4, e os cartões são uma lista de botões.
 */
export function QuadroPessoas({
  cartoes, hoje, chip, aoAbrir, aoLimpar, itens, totais, aoCarregarMais, aCarregarMais, carregarMaisDesativado, colunasComErro, rotulosColuna,
  semAvisoVazio,
}: QuadroPessoasProps) {
  const { t } = useTranslation();
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
        <ColunaNegocios
          cartoes={cartoes} hoje={hoje} itens={itens} aoAbrir={aoAbrir} totais={totais} rotulosColuna={rotulosColuna} aoCarregarMais={aoCarregarMais}
          aCarregarMais={aCarregarMais} carregarMaisDesativado={carregarMaisDesativado} colunasComErro={colunasComErro}
        />
      </div>
    </div>
  );
}
