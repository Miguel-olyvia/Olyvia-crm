import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { COR_FASE } from "@/components/negocio-metas/estilos";
import { formatarMeta } from "@/components/negocio-metas/formatoMetas";
import type { ChipPessoa } from "../pessoasTipos";
import { CartaoPessoaQuadro } from "./CartaoPessoaQuadro";
import { COLUNAS_QUADRO, type CartaoQuadro, type ColunaQuadro } from "./cartoesQuadroPessoas";

interface QuadroPessoasProps {
  /** Os cartões já filtrados e ordenados (ver `cartoesDoQuadro`); dentro de cada coluna a ordem é esta. */
  cartoes: readonly CartaoQuadro[];
  hoje: string;
  /** O chip activo: com "Perdidas" um quadro vazio explica que as perdidas não têm cartão. */
  chip: ChipPessoa;
  aoAbrir: (pessoaId: string) => void;
  /** Limpa os filtros (a mesma saída da tabela vazia). */
  aoLimpar: () => void;
}

/** A faixa de cada coluna: as de negócio usam a cor da fase; as de pedido, tons do texto secundário (a fase diz-se sempre por texto). */
const COR_COLUNA: Record<ColunaQuadro, string> = {
  porContactar: "bg-muted-foreground/40",
  contactado: "bg-muted-foreground/60",
  visita: "bg-muted-foreground/80",
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

/**
 * O quadro por 6 fases. Em ecrã largo as colunas rolam na horizontal; em ecrã estreito empilham numa só coluna.
 * Cada coluna é uma secção com h3 (o h2 é o do separador, na página) e os cartões são uma lista de botões.
 */
export function QuadroPessoas({ cartoes, hoje, chip, aoAbrir, aoLimpar }: QuadroPessoasProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-3">
    {cartoes.length === 0 && <AvisoQuadroVazio chip={chip} aoLimpar={aoLimpar} />}
    <div role="group" aria-label={t("pessoasPagina.board.label")} className="flex flex-col gap-3 lg:flex-row lg:overflow-x-auto lg:pb-4">
      {COLUNAS_QUADRO.map(({ id, negocio }) => {
        const daColuna = cartoes.filter((c) => c.coluna === id);
        const soma = daColuna.reduce((s, c) => s + (c.valor ?? 0), 0);
        const total = formatarMeta("euro", soma);
        return (
          <section
            key={id} aria-labelledby={`quadro-pessoas-${id}`}
            className="flex flex-col overflow-hidden rounded-lg border border-border bg-muted/30 lg:min-w-[260px] lg:flex-1"
          >
            <div aria-hidden="true" className={cn("h-1", COR_COLUNA[id])} />
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <h3 id={`quadro-pessoas-${id}`} className="break-words text-sm font-semibold">
                  {t(`pessoasPagina.board.col.${id}`)}
                  <span className="sr-only">{t("pessoasPagina.board.count.sep")}{daColuna.length === 1 ? t("pessoasPagina.board.count.one") : t("pessoasPagina.board.count.many", { count: daColuna.length })}</span>
                </h3>
                <Badge variant="secondary" className="h-5 px-1.5 text-xs" aria-hidden="true">{daColuna.length}</Badge>
              </div>
              {negocio && (
                <span className="shrink-0 text-xs font-medium tabular-nums text-muted-foreground">
                  <span aria-hidden="true">{total}</span>
                  <span className="sr-only">{t("pessoasPagina.board.total", { value: total })}</span>
                </span>
              )}
            </div>
            <ul role="list" className="min-h-[120px] flex-1 space-y-2 p-2">
              {daColuna.map((c) => <CartaoPessoaQuadro key={c.id} cartao={c} hoje={hoje} aoAbrir={aoAbrir} />)}
              {daColuna.length === 0 && <ColunaVazia />}
            </ul>
          </section>
        );
      })}
    </div>
    </div>
  );
}
