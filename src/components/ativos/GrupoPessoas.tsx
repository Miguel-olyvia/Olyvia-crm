/**
 * O separador «Pessoas»: a lista dos ativos do grupo (que chega por `children`, com os seus estados vazios) e, abaixo,
 * «Atribuídos no RH sem ativo registado» com a ligação «Ver em Custos». Sem `hr.pessoas.retribuicao.view` (`rhOculto`) não há
 * nomes nem a secção de baixo: só o aviso «Sem permissão para ver a quem estão atribuídos».
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { dataPt, euros } from "@/components/rh-exemplo/custo/formato";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import type { AtribuicaoSemAtivo } from "./lib/tipos";

/** Onde se vê o custo de cada pessoa (a rota do RH; este ecrã não a altera). */
export const ROTA_CUSTOS_RH = "/rh-exemplo/custos";
const ESTADOS_CONHECIDOS = ["atribuido", "devolvido"];

interface Props {
  rhOculto: boolean;
  semAtivo: readonly AtribuicaoSemAtivo[] | null;
  children: ReactNode;
}

export function GrupoPessoas({ rhOculto, semAtivo, children }: Props) {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      {rhOculto && <p className="text-sm text-muted-foreground">{t("ativos.pessoa.rhOcultoAviso")}</p>}
      {children}
      {!rhOculto && semAtivo !== null && (
        <section aria-labelledby="ativos-sem-ativo" className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="space-y-1">
              <h2 id="ativos-sem-ativo" className="text-lg font-semibold">{t("ativos.semAtivo.titulo")}</h2>
              <p className="text-sm text-muted-foreground">{t("ativos.semAtivo.ajuda")}</p>
            </div>
            <Link to={ROTA_CUSTOS_RH} className={cn("inline-flex min-h-11 items-center rounded-md px-2 text-sm font-medium text-primary underline-offset-4 hover:underline", FOCO)}>
              {t("ativos.semAtivo.verEmCustos")}
            </Link>
          </div>
          {semAtivo.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("ativos.semAtivo.vazio")}</p>
          ) : (
            <Table containerClassName="rounded-md border" className="min-w-[36rem]" aria-labelledby="ativos-sem-ativo">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col" className="px-3">{t("ativos.semAtivo.col.pessoa")}</TableHead>
                  <TableHead scope="col" className="px-3">{t("ativos.semAtivo.col.descricao")}</TableHead>
                  <TableHead scope="col" className="px-3 text-right">{t("ativos.semAtivo.col.valor")}</TableHead>
                  <TableHead scope="col" className="px-3">{t("ativos.semAtivo.col.entrega")}</TableHead>
                  <TableHead scope="col" className="px-3">{t("ativos.semAtivo.col.estado")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {semAtivo.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="px-3 py-2 text-sm font-medium">{a.pessoaNome ?? "—"}</TableCell>
                    <TableCell className="px-3 py-2 text-sm">{a.descricao ?? "—"}</TableCell>
                    <TableCell className="px-3 py-2 text-right text-sm tabular-nums">{euros(a.valor, "—")}</TableCell>
                    <TableCell className="px-3 py-2 text-sm">{a.entrega ? dataPt(a.entrega) : "—"}</TableCell>
                    <TableCell className="px-3 py-2 text-sm">{a.estado && ESTADOS_CONHECIDOS.includes(a.estado) ? t(`ativos.semAtivo.estado.${a.estado}`) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </section>
      )}
    </div>
  );
}
