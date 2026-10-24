import { forwardRef, memo, useMemo } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import type { ContactoDaLista, PessoaDaLista } from "@/hooks/pessoas/listaPessoasTipos";
import { Table, TableBody, TableCaption, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FOCO } from "@/components/negocio-metas/estilos";
import type { IdColuna } from "@/components/pessoas/vistaLinhaPessoa";
import { BarraProgresso } from "./BarraProgresso";
import { COLUNAS_POR_OMISSAO, larguras } from "./colunasPessoas";
import { LinhaListaReal, type AoAbrirPessoa } from "./LinhaListaReal";

/** Largura mínima da tabela: 960 px, e mais quando há muitas colunas (a região rola na horizontal). */
const LARGURA_MINIMA = 960;
const LARGURA_POR_COLUNA = 120;

/** O que as leituras em lote deram, por id (da pessoa, ou do comercial); sem a entrada, ainda se não sabe. */
export interface DadosDaTabela {
  comerciais?: ReadonlyMap<string, string>;
  contactos?: ReadonlyMap<string, ContactoDaLista>;
}

interface TabelaListaRealProps {
  linhas: readonly PessoaDaLista[];
  /** As linhas são as de um filtro anterior: a tabela fica marcada como ocupada (barra fina, sem perder contraste). */
  ocupada: boolean;
  /** Abre a ficha da pessoa (o nome da linha passa a botão). Deve ser estável (useCallback): as linhas estão em memória. */
  aoAbrir?: AoAbrirPessoa;
  /** As colunas visíveis, por ordem; sem isto, as por omissão. Deve ser estável (useMemo). */
  colunas?: readonly IdColuna[];
  dados?: DadosDaTabela;
}

/**
 * A tabela da Lista real: uma região com foco (rola na horizontal e na vertical). A legenda (só para leitores
 * de ecrã) dá o nome à tabela; a região leva um rótulo curto, diferente. Em memória: só se redesenha se as linhas mudam.
 */
export const TabelaListaReal = memo(forwardRef<HTMLDivElement, TabelaListaRealProps>(function TabelaListaReal(
  { linhas, ocupada, aoAbrir, colunas = COLUNAS_POR_OMISSAO, dados },
  ref,
) {
  const { t } = useTranslation();
  const ordem = useMemo(() => ["person" as IdColuna, ...colunas.filter((c) => c !== "person")], [colunas]);
  const largura = useMemo(() => larguras(ordem), [ordem]);
  return (
    <div>
      {ocupada && <BarraProgresso />}
      <div
        ref={ref} role="region" aria-label={t("pessoasPagina.real.regionLabel")} aria-busy={ocupada} tabIndex={0}
        // scroll-pt-10 (2,5 rem) > altura do cabeçalho fixo (h-9): ao focar uma linha por teclado o cabeçalho não a tapa.
        className={cn("max-h-[max(70vh,24rem)] scroll-pt-10 overflow-auto rounded-xl border border-border/70 bg-card", FOCO)}
      >
        <Table
          className="table-fixed text-sm" containerClassName="overflow-visible"
          style={{ minWidth: Math.max(LARGURA_MINIMA, ordem.length * LARGURA_POR_COLUNA) }}
        >
          <colgroup>
            {ordem.map((c) => <col key={c} style={{ width: `${largura[c]}%` }} />)}
          </colgroup>
          <TableCaption className="sr-only">{t("pessoasPagina.real.caption")}</TableCaption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {ordem.map((c) => (
                <TableHead
                  key={c} scope="col"
                  className={cn(
                    "sticky top-0 z-10 h-9 whitespace-nowrap bg-card px-3 text-xs font-semibold text-muted-foreground shadow-[inset_0_-1px_0_hsl(var(--border))]",
                    c === "value" && "text-right",
                  )}
                >
                  {t(`pessoasPagina.real.columns.${c}`)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((pessoa) => (
              <LinhaListaReal
                key={pessoa.id} pessoa={pessoa} aoAbrir={aoAbrir} colunas={ordem}
                comercial={pessoa.responsavelId ? dados?.comerciais?.get(pessoa.responsavelId) : undefined}
                contacto={dados?.contactos?.get(pessoa.id)}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}));
