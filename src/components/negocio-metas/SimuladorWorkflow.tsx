import { useId, useMemo } from "react";
import { Check } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { FOCO } from "./estilos";
import { faseDoNegocio, type NegocioMes } from "./negocioMetas";
import { traduzir, type EventoAceite, type Simulacao } from "./workflowNegocio";

interface SimuladorWorkflowProps {
  /** O resultado de cada simulação para o negócio escolhido, calculado uma só vez por quem usa o simulador. */
  simulacoes: Record<EventoAceite, Simulacao>;
  negocios: readonly NegocioMes[];
  negocioId: string;
  aoMudarNegocio: (id: string) => void;
  evento: EventoAceite | null;
  aoSimular: (evento: EventoAceite) => void;
}

const BOTOES: readonly { evento: EventoAceite; rotulo: string }[] = [
  { evento: "aceitarOrcamento", rotulo: "businessGoals.workflow.sim.btnOrcamento" },
  { evento: "aceitarProposta", rotulo: "businessGoals.workflow.sim.btnProposta" },
];

/** O texto do resultado: o que acontece, o passo seguinte e, se fecha sem contrato, o aviso das metas. */
function Resultado({ simulacao }: { simulacao: Simulacao | null }) {
  const { t } = useTranslation();
  if (simulacao === null) return <p className="text-sm text-muted-foreground">{t("businessGoals.workflow.sim.empty")}</p>;
  if (simulacao.tipo === "nao-aplicavel") {
    return <p className="text-sm text-foreground">{t("businessGoals.workflow.sim.unavailable", { motivo: traduzir(t, simulacao.motivo) })}</p>;
  }
  return (
    <div className="space-y-1 text-sm text-foreground">
      <p className="font-medium">{traduzir(t, simulacao.resultado)}</p>
      <p>
        {simulacao.proximo
          ? t("businessGoals.workflow.sim.next", { no: t(`businessGoals.workflow.no.${simulacao.proximo}`) })
          : t("businessGoals.workflow.sim.noNext")}
      </p>
      {simulacao.ganhoSemContrato && <p className="text-muted-foreground">{t("businessGoals.workflow.sim.goalsNote")}</p>}
    </div>
  );
}

/** O simulador: escolhe-se um negócio de exemplo e vê-se o que aconteceria ao aceitar. Só calcula; não grava nada. */
export function SimuladorWorkflow({ simulacoes, negocios, negocioId, aoMudarNegocio, evento, aoSimular }: SimuladorWorkflowProps) {
  const { t } = useTranslation();
  const id = useId();
  const negocio = negocios.find((n) => n.id === negocioId) ?? negocios[0];
  const opcoes = useMemo(
    () => negocios.map((n) => ({
      value: n.id,
      label: t("businessGoals.workflow.sim.dealOption", {
        pessoa: n.pessoa, servico: n.servico, fase: t(`businessGoals.phase.${faseDoNegocio(n)}`),
      }),
    })),
    [negocios, t],
  );
  const simulacao = evento ? simulacoes[evento] : null;
  return (
    <section aria-labelledby={`${id}-titulo`} className="space-y-4 rounded-lg border border-border bg-card p-4 sm:p-5">
      <div className="space-y-1">
        <h3 id={`${id}-titulo`} className="text-base font-semibold text-foreground">{t("businessGoals.workflow.sim.title")}</h3>
        <p className="text-sm text-muted-foreground">{t("businessGoals.workflow.sim.help")}</p>
      </div>
      <div className="max-w-md space-y-1.5">
        <Label htmlFor={`${id}-negocio`}>{t("businessGoals.workflow.sim.deal")}</Label>
        <NativeSelect id={`${id}-negocio`} options={opcoes} value={negocio.id} onValueChange={aoMudarNegocio} className="h-11" />
      </div>
      <div className="flex flex-wrap items-start gap-4">
        {BOTOES.map(({ evento: e, rotulo }) => {
          const pendente = simulacoes[e];
          const motivo = pendente.tipo === "nao-aplicavel" ? pendente.motivo : null;
          return (
            <div key={e} className="max-w-xs space-y-1">
              <Button
                type="button" variant={evento === e ? "default" : "outline"}
                aria-pressed={evento === e} aria-disabled={motivo !== null ? "true" : undefined}
                aria-describedby={motivo ? `${id}-${e}` : undefined} onClick={() => { if (!motivo) aoSimular(e); }}
                className={`min-h-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 ${FOCO}`}
              >
                {evento === e && <Check aria-hidden="true" />}
                {t(rotulo)}
              </Button>
              {motivo && <p id={`${id}-${e}`} className="text-xs text-muted-foreground">{t("businessGoals.workflow.sim.unavailable", { motivo: traduzir(t, motivo) })}</p>}
            </div>
          );
        })}
      </div>
      <div role="status" aria-label={t("businessGoals.workflow.sim.result")} className="rounded-md border border-border bg-muted/40 p-3">
        <Resultado simulacao={simulacao} />
      </div>
    </section>
  );
}
