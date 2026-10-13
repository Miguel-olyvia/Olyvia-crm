import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCaption, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LinhaPessoa } from "./LinhaPessoa";
import type { ResumoPessoa } from "./pessoasTipos";

/** As colunas e a largura de cada uma, em percentagem (somam 100). */
export const COLUNAS = [
  { id: "person", largura: 26 }, { id: "place", largura: 11 }, { id: "stage", largura: 13 }, { id: "form", largura: 12 },
  { id: "lastContact", largura: 16 }, { id: "next", largura: 12 }, { id: "value", largura: 10 },
] as const;

interface TabelaPessoasProps {
  resumos: ResumoPessoa[];
  pendentes: ReadonlySet<string>;
  aoAbrir: (id: string) => void;
  aoLimpar: () => void;
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
export function TabelaPessoas({ resumos, pendentes, aoAbrir, aoLimpar }: TabelaPessoasProps) {
  const { t } = useTranslation();
  if (resumos.length === 0) return <EstadoVazioPessoas aoLimpar={aoLimpar} />;
  return (
    <div className="rounded-xl border border-border/70 bg-card">
      <Table className="min-w-[1000px] table-fixed text-sm" containerClassName="max-h-[70vh] scroll-pt-14 rounded-xl">
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
                  "sticky top-0 z-10 bg-card px-3 font-semibold text-foreground shadow-[inset_0_-1px_0_hsl(var(--border))]",
                  c.id === "value" && "text-right",
                )}
              >
                {t(`pessoasPagina.col.${c.id}`)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {resumos.map((r) => (
            <LinhaPessoa key={r.pessoa.id} resumo={r} voltou={pendentes.has(r.pessoa.id)} aoAbrir={aoAbrir} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
