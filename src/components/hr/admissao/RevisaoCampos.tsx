/**
 * Os dados que a pessoa submeteu, campo a campo, com o valor da ficha ao lado quando difere (reentrada). So os campos NAO
 * sensiveis: o NISS e o IBAN estao em `RevisaoSensiveis`. A diferenca diz-se em texto («Difere da ficha»), nunca so por cor.
 */
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { rotuloDeCampoAdmissao } from "@/components/hr/rotuloCampoAdmissao";
import { useTranslation } from "@/hooks/useTranslation";
import type { CampoRevisao } from "@/lib/hr/admissaoRevisao";

function LinhaDoCampo({ campo }: { campo: CampoRevisao }) {
  const { t } = useTranslation();
  return (
    <li className="space-y-1 py-2">
      <span className="text-xs text-muted-foreground">{rotuloDeCampoAdmissao(t, campo.chave)}</span>
      {campo.visivel ? (
        <p className="break-words text-sm">{campo.submetido ?? t("rhAdm.revisao.valorVazio")}</p>
      ) : (
        <p className="text-sm italic text-muted-foreground">{t("rhAdm.revisao.campoOculto")}</p>
      )}
      {campo.visivel && campo.difere && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline" className="gap-1 border-amber-500/60 font-normal text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            {t("rhAdm.revisao.difere")}
          </Badge>
          <span className="text-muted-foreground">
            {campo.ficha ? t("rhAdm.revisao.naFicha", { valor: campo.ficha }) : t("rhAdm.revisao.naFichaVazio")}
          </span>
        </div>
      )}
    </li>
  );
}

export function RevisaoCampos({ campos }: { campos: readonly CampoRevisao[] }) {
  const { t } = useTranslation();
  if (campos.length === 0) return <p className="text-sm text-muted-foreground">{t("rhAdm.revisao.dadosVazio")}</p>;
  return (
    <ul aria-label={t("rhAdm.revisao.dados")} className="divide-y rounded-md border px-3">
      {campos.map((campo) => (
        <LinhaDoCampo key={campo.chave} campo={campo} />
      ))}
    </ul>
  );
}
