// O que se diz quando o questionário da organização está a carregar ou falhou: as ações do negócio ficam paradas até ele chegar (useCtxComEfeitos), por isso
// a pessoa tem de ver porquê e poder tentar outra vez. Usado na visita e nas fases seguintes.
import { useQuestionario } from "@/components/negocio-metas/QuestionarioContexto";
import { FOCO } from "@/components/negocio-metas/estilos";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

const N = "pessoasPagina.real.neg.";

export function AvisoQuestionario() {
  const { t } = useTranslation();
  const { estado, repetir } = useQuestionario();
  if (estado === "a-carregar") return <p role="status" className="text-sm text-muted-foreground">{t(`${N}visita.perguntasACarregar`)}</p>;
  if (estado !== "erro") return null;
  return (
    <div role="alert" className="space-y-2 rounded-xl border border-destructive/30 p-3 text-[15px]">
      <p className="text-destructive">{t(`${N}visita.perguntasErro`)}</p>
      <button type="button" onClick={repetir} className={cn("min-h-11 rounded-lg border border-input px-4 font-medium", FOCO)}>{t(`${N}tentar`)}</button>
    </div>
  );
}
