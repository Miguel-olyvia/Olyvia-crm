/**
 * «Ver como a pessoa vê»: o índice dos oito estados da página pública do convite de admissão. Cada cartão diz o nome do
 * estado, a pessoa de exemplo que o ilustra, o que ela vê numa frase e leva (no mesmo separador) à página pública do
 * token de demonstração. Só dados de exemplo: não lê nem escreve nada.
 */
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { SeloExemplo } from "@/components/rh-exemplo/SeloExemplo";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { ESTADOS_CONVITE, caminhoDoConvite } from "@/components/rh-exemplo/convite/estadosConvite";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

function CabecalhoPagina() {
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      <h1 className="flex flex-wrap items-center gap-3 text-2xl font-bold">
        {t("rhAdmIdx.titulo")}
        <SeloExemplo />
      </h1>
      <p className="text-muted-foreground">{t("rhAdmIdx.sub")}</p>
    </div>
  );
}

export default function RhAdmissaoIndice() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6 p-6">
      <CabecalhoPagina />
      <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label={t("rhAdmIdx.lista")}>
        {ESTADOS_CONVITE.map((estado, i) => {
          const nome = t(`rhAdmIdx.e.${estado.chave}.nome`);
          return (
            <li key={estado.token} data-testid={`estado-${estado.token}`} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
              <div className="space-y-1">
                <p className="text-xs tabular-nums text-muted-foreground">{t("rhAdmIdx.passo", { n: i + 1, total: ESTADOS_CONVITE.length })}</p>
                <h2 className="text-base font-semibold">{nome}</h2>
                <p className="text-sm text-muted-foreground">{t("rhAdmIdx.pessoa", { nome: estado.pessoa })}</p>
              </div>
              <p className="flex-1 text-sm">{t(`rhAdmIdx.e.${estado.chave}.ve`)}</p>
              <Link
                to={caminhoDoConvite(estado.token)}
                aria-label={t("rhAdmIdx.abrirAria", { estado: nome })}
                className={cn(buttonVariants({ variant: "outline" }), "min-h-11 gap-2 self-start", FOCO)}
              >
                {t("rhAdmIdx.abrir")}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
