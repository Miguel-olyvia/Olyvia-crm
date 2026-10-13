import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCaption, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LinhaPessoa } from "./LinhaPessoa";
import type { ResumoPessoa } from "./pessoasTipos";

const COLUNAS = ["person", "contact", "origin", "stage", "lastContact", "rep", "deals", "health"] as const;

interface TabelaPessoasProps {
  resumos: ResumoPessoa[];
  pendentes: ReadonlySet<string>;
  hoje: string;
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

/** A tabela de pessoas, com cabeçalhos fixos ao rolar; o nome de cada uma abre a ficha. */
export function TabelaPessoas({ resumos, pendentes, hoje, aoAbrir, aoLimpar }: TabelaPessoasProps) {
  const { t } = useTranslation();
  if (resumos.length === 0) return <EstadoVazioPessoas aoLimpar={aoLimpar} />;
  return (
    <div className="rounded-xl border border-border/70 bg-card">
      <Table className="min-w-[1100px] text-sm" containerClassName="max-h-[70vh] scroll-pt-14 rounded-xl">
        <TableCaption className="sr-only">{t("pessoasPagina.caption")}</TableCaption>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {COLUNAS.map((c) => (
              <TableHead
                key={c} scope="col"
                className="sticky top-0 z-10 bg-card px-3 font-semibold text-foreground shadow-[inset_0_-1px_0_hsl(var(--border))]"
              >
                {t(`pessoasPagina.col.${c}`)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {resumos.map((r) => (
            <LinhaPessoa key={r.pessoa.id} resumo={r} hoje={hoje} voltou={pendentes.has(r.pessoa.id)} aoAbrir={aoAbrir} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
