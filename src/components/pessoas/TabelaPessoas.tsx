import { Fragment, useMemo } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LinhaPessoa } from "./LinhaPessoa";
import type { ResumoPessoa } from "./pessoasTipos";
import { idPainelNegocios, itensDaPessoa } from "./processo/itensProcesso";
import { useExtrasProcesso } from "./processo/processoNegocios";
import type { ItemProcesso } from "./processo/tiposProcesso";
import { LinhaNegociosPessoa } from "./quadro/LinhaNegociosPessoa";

/** As colunas e a largura de cada uma, em percentagem (somam 100). A última é a dos negócios (o botão à direita da linha). */
export const COLUNAS = [
  { id: "person", largura: 23 }, { id: "place", largura: 10 }, { id: "stage", largura: 12 }, { id: "form", largura: 11 },
  { id: "lastContact", largura: 11 }, { id: "next", largura: 10 }, { id: "value", largura: 9 }, { id: "deals", largura: 14 },
] as const;

const SEM_ITENS: readonly ItemProcesso[] = [];

interface TabelaPessoasProps {
  resumos: ResumoPessoa[];
  pendentes: ReadonlySet<string>;
  /** AAAA-MM-DD: o dia que as sub-linhas usam para marcar os prazos ultrapassados. */
  hoje: string;
  /** Os ids das pessoas com as sub-linhas de negócios abertas. */
  abertas: ReadonlySet<string>;
  aoAlternar: (id: string) => void;
  aoAbrir: (id: string) => void;
  aoLimpar: () => void;
}

const textoColuna = (id: (typeof COLUNAS)[number]["id"]): string => (id === "deals" ? "pessoasPagina.deals.col" : `pessoasPagina.col.${id}`);

/** A linha extra com os pedidos e negócios de uma pessoa, por baixo da linha dela (só existe aberta). */
function FilaNegocios({ resumo, itens, hoje, aoAbrir }: { resumo: ResumoPessoa; itens: readonly ItemProcesso[]; hoje: string; aoAbrir: (id: string) => void }) {
  const { pessoa } = resumo;
  return (
    <TableRow className="bg-muted/30 hover:bg-muted/30" data-negocios-de={pessoa.id}>
      <TableCell id={idPainelNegocios(pessoa.id)} colSpan={COLUNAS.length} className="px-3 py-1 pl-14">
        <LinhaNegociosPessoa pessoaId={pessoa.id} nome={pessoa.nome} itens={itens} hoje={hoje} aoAbrir={aoAbrir} />
      </TableCell>
    </TableRow>
  );
}

/** Sem pessoas com estes filtros: diz-o e dá a saída. */
function EstadoVazioPessoas({ aoLimpar }: { aoLimpar: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border p-4">
      <p className="text-sm text-foreground">{t("pessoasPagina.empty.title")}</p>
      <Button type="button" className="min-h-11" onClick={aoLimpar}>{t("pessoasPagina.empty.clear")}</Button>
    </div>
  );
}

/** A tabela de pessoas, com cabeçalhos fixos ao rolar; o nome de cada uma abre a ficha. Abaixo de lg rola na horizontal. */
export function TabelaPessoas({ resumos, pendentes, hoje, abertas, aoAlternar, aoAbrir, aoLimpar }: TabelaPessoasProps) {
  const { t } = useTranslation();
  const extras = useExtrasProcesso();
  const itens = useMemo(() => new Map(resumos.map((r) => [r.pessoa.id, itensDaPessoa(r, hoje, extras)])), [resumos, hoje, extras]);
  if (resumos.length === 0) return <EstadoVazioPessoas aoLimpar={aoLimpar} />;
  return (
    <div className="rounded-xl border border-border/70 bg-card">
      <Table className="min-w-[1100px] table-fixed text-sm" containerClassName="max-h-[70vh] scroll-pt-10 rounded-xl">
        <colgroup>
          {COLUNAS.map((c) => <col key={c.id} style={{ width: `${c.largura}%` }} />)}
        </colgroup>
        <TableCaption className="sr-only">{t("pessoasPagina.caption")}</TableCaption>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {COLUNAS.map((c) => (
              <TableHead
                key={c.id} scope="col"
                className={cn(
                  "sticky top-0 z-10 h-8 bg-card px-3 text-[11px] font-semibold text-muted-foreground shadow-[inset_0_-1px_0_hsl(var(--border))]",
                  c.id === "value" && "text-right",
                )}
              >
                {t(textoColuna(c.id))}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {resumos.map((r) => {
            const itensDaLinha = itens.get(r.pessoa.id) ?? SEM_ITENS;
            const aberta = abertas.has(r.pessoa.id) && itensDaLinha.length > 0;
            return (
              <Fragment key={r.pessoa.id}>
                <LinhaPessoa
                  resumo={r} voltou={pendentes.has(r.pessoa.id)} itens={itensDaLinha} aberta={aberta}
                  aoAlternar={aoAlternar} aoAbrir={aoAbrir}
                />
                {aberta && <FilaNegocios resumo={r} itens={itensDaLinha} hoje={hoje} aoAbrir={aoAbrir} />}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
