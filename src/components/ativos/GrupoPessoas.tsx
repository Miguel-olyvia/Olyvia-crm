/**
 * O separador «Pessoas»: a lista dos ativos do grupo (que chega por `children`, com os seus estados vazios) e, abaixo,
 * «Atribuídos no RH sem ativo registado» (cartões empilhados, sem tabela: sem scroll horizontal no telemóvel) com a ligação
 * «Ver em Custos». Sem `hr.pessoas.retribuicao.view` (`rhOculto`) não há nomes nem a secção de baixo: só o aviso «Sem permissão para
 * ver a quem estão atribuídos».
 */
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
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

function Dado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 sm:block">
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm tabular-nums">{children}</dd>
    </div>
  );
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
            <ul aria-labelledby="ativos-sem-ativo" className="space-y-2">
              {semAtivo.map((a) => (
                <li key={a.id} className="space-y-2 rounded-lg border bg-card p-4">
                  <p className="font-medium">{a.pessoaNome ?? "—"}</p>
                  <p className="text-sm text-muted-foreground">{a.descricao ?? "—"}</p>
                  <dl className="grid gap-2 sm:grid-cols-3">
                    <Dado rotulo={t("ativos.semAtivo.col.valor")}>{euros(a.valor, "—")}</Dado>
                    <Dado rotulo={t("ativos.semAtivo.col.entrega")}>{a.entrega ? dataPt(a.entrega) : "—"}</Dado>
                    <Dado rotulo={t("ativos.semAtivo.col.estado")}>{a.estado && ESTADOS_CONHECIDOS.includes(a.estado) ? t(`ativos.semAtivo.estado.${a.estado}`) : "—"}</Dado>
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
