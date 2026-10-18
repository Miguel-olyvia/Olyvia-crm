import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { COR_FASE } from "@/components/negocio-metas/estilos";
import { formatarMeta } from "@/components/negocio-metas/formatoMetas";
import type { ChipPessoa } from "../pessoasTipos";
import type { ItemProcesso } from "../processo/tiposProcesso";
import { CartaoPessoaQuadro } from "./CartaoPessoaQuadro";
import { COLUNAS_QUADRO, type CartaoQuadro, type ColunaQuadro, type DefColuna, type ParteDaColuna } from "./cartoesQuadroPessoas";

interface QuadroPessoasProps {
  /** Os cartões já filtrados e ordenados (ver `cartoesDoQuadro`); dentro de cada coluna a ordem é esta. */
  cartoes: readonly CartaoQuadro[];
  hoje: string;
  /** O chip activo: com "Perdidas" um quadro vazio explica que as perdidas não têm cartão. */
  chip: ChipPessoa;
  aoAbrir: (pessoaId: string) => void;
  /** Limpa os filtros (a mesma saída da tabela vazia). */
  aoLimpar: () => void;
  /** Os itens do processo dos cartões, pelo id do cartão (ver `itensDaPessoa`): com eles os botões dos passos executam-nos. */
  itens?: ReadonlyMap<string, ItemProcesso>;
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

/** As duas partes do quadro, pela ordem: a abordagem (um cartão por pessoa) e os negócios (um cartão por negócio). */
const PARTES: readonly ParteDaColuna[] = ["abordagem", "negocio"];

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

/** Uma coluna: faixa de cor, título (h4, a contagem em texto só para o leitor), a soma do valor nas de negócio e os cartões. */
function Coluna({ def, cartoes, hoje, itens, aoAbrir }: { def: DefColuna; cartoes: readonly CartaoQuadro[]; hoje: string; itens?: ReadonlyMap<string, ItemProcesso>; aoAbrir: (pessoaId: string) => void }) {
  const { t } = useTranslation();
  const soma = cartoes.reduce((s, c) => s + (c.valor ?? 0), 0);
  const total = formatarMeta("euro", soma);
  return (
    <section
      aria-labelledby={`quadro-pessoas-${def.id}`} className="flex flex-col overflow-hidden rounded-lg border border-border bg-muted/30 lg:min-w-[240px] lg:flex-1"
    >
      <div aria-hidden="true" className={cn("h-1", COR_COLUNA[def.id])} />
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <h4 id={`quadro-pessoas-${def.id}`} className="break-words text-sm font-semibold">
            {t(`pessoasPagina.board.col.${def.id}`)}
            <span className="sr-only">{t("pessoasPagina.board.count.sep")}{cartoes.length === 1 ? t("pessoasPagina.board.count.one") : t("pessoasPagina.board.count.many", { count: cartoes.length })}</span>
          </h4>
          <Badge variant="secondary" className="h-5 px-1.5 text-xs" aria-hidden="true">{cartoes.length}</Badge>
        </div>
        {def.negocio && (
          <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
            <span aria-hidden="true">{total}</span>
            <span className="sr-only">{t("pessoasPagina.board.total", { value: total })}</span>
          </span>
        )}
      </div>
      <ul role="list" className="min-h-[120px] flex-1 space-y-2 p-2">
        {cartoes.map((c) => <CartaoPessoaQuadro key={c.id} cartao={c} hoje={hoje} item={itens?.get(c.id)} aoAbrir={aoAbrir} />)}
        {cartoes.length === 0 && <ColunaVazia />}
      </ul>
    </section>
  );
}

/**
 * O quadro em duas partes: a Parte 1 (abordagem) tem um cartão por pessoa em Por contactar, Contactado ou Visita; a Parte 2 (negócios) tem um
 * cartão por negócio em Levantamento, Orçamento, Proposta ou Contrato. Em ecrã largo as colunas de cada parte rolam na horizontal; em ecrã
 * estreito empilham. Cada parte é uma secção com h3 (o h2 é o do separador, na página), cada coluna com h4 e os cartões são uma lista de botões.
 */
export function QuadroPessoas({ cartoes, hoje, chip, aoAbrir, aoLimpar, itens }: QuadroPessoasProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      {cartoes.length === 0 && <AvisoQuadroVazio chip={chip} aoLimpar={aoLimpar} />}
      <div role="group" aria-label={t("pessoasPagina.board.label")} className="space-y-5">
        {PARTES.map((parte) => {
          const chave = parte === "abordagem" ? "approach" : "deals";
          return (
            <section key={parte} aria-labelledby={`quadro-parte-${parte}`} className="space-y-2">
              <div className="space-y-0.5">
                <h3 id={`quadro-parte-${parte}`} className="text-base font-semibold text-foreground">{t(`pessoasPagina.board.part.${chave}`)}</h3>
                <p className="text-sm text-muted-foreground">{t(`pessoasPagina.board.part.${chave}Hint`)}</p>
              </div>
              <div className="flex flex-col gap-3 lg:flex-row lg:overflow-x-auto lg:pb-2">
                {COLUNAS_QUADRO.filter((c) => c.parte === parte).map((def) => (
                  <Coluna key={def.id} def={def} cartoes={cartoes.filter((c) => c.coluna === def.id)} hoje={hoje} itens={itens} aoAbrir={aoAbrir} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
