import { useId, useMemo } from "react";
import { Check } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { FOCO } from "./estilos";
import { faseDoNegocio, type NegocioMes } from "./negocioMetas";
import { traduzir } from "./workflowNegocio";
import type { EstadoResultante, EventoWorkflow, Simulacao } from "./workflowSimulacao";

interface SimuladorWorkflowProps {
  /** Os dois eventos do passo atual do negócio escolhido, com o resultado de cada um (calculado por quem usa o simulador). */
  eventos: readonly { evento: EventoWorkflow; simulacao: Simulacao }[];
  negocios: readonly NegocioMes[];
  negocioId: string;
  aoMudarNegocio: (id: string) => void;
  evento: EventoWorkflow | null;
  aoSimular: (evento: EventoWorkflow) => void;
}

/** O estado em que o negócio fica, dito por texto. */
function textoEstado(t: (chave: string, params?: Record<string, string | number>) => string, estado: EstadoResultante): string {
  const base = "businessGoals.workflow.sim.state.";
  if (estado.tipo === "curso") return t(`${base}curso`, { fase: t(`businessGoals.workflow.no.${estado.fase}`) });
  return t(base + estado.tipo);
}

/** O resultado: o que acontece, o estado em que o negócio fica, a nota do simulador e, se perde, que pede um motivo. */
function Resultado({ simulacao }: { simulacao: Simulacao | null }) {
  const { t } = useTranslation();
  if (simulacao === null) return <p className="text-sm text-muted-foreground">{t("businessGoals.workflow.sim.empty")}</p>;
  if (simulacao.tipo === "nao-aplicavel") {
    return <p className="text-sm text-foreground">{t("businessGoals.workflow.sim.unavailable", { motivo: traduzir(t, simulacao.motivo) })}</p>;
  }
  return (
    <div className="space-y-1 text-sm text-foreground">
      <p className="font-medium">{traduzir(t, simulacao.resultado)}</p>
      <p>{t("businessGoals.workflow.sim.state", { estado: textoEstado(t, simulacao.estado) })}</p>
      {simulacao.pedeMotivo && <p>{t("businessGoals.workflow.sim.askReason")}</p>}
      {simulacao.nota && <p className="text-muted-foreground">{traduzir(t, simulacao.nota)}</p>}
      {simulacao.ganhoSemContrato && <p className="text-muted-foreground">{t("businessGoals.workflow.sim.goalsNote")}</p>}
    </div>
  );
}

/** O simulador: escolhe-se um negócio de exemplo e vê-se o que aconteceria ao ganhar ou perder o seu passo atual. Só calcula; não grava nada. */
export function SimuladorWorkflow({ eventos, negocios, negocioId, aoMudarNegocio, evento, aoSimular }: SimuladorWorkflowProps) {
  const { t } = useTranslation();
  const id = useId();
  const negocio: NegocioMes | undefined = negocios.find((n) => n.id === negocioId) ?? negocios[0];
  const opcoes = useMemo(
    () => negocios.map((n) => ({
      value: n.id,
      label: t("businessGoals.workflow.sim.dealOption", {
        pessoa: n.pessoa, servico: n.servico || "—", fase: t(`businessGoals.phase.${faseDoNegocio(n)}`),
      }),
    })),
    [negocios, t],
  );
  const simulacao = eventos.find((e) => e.evento === evento)?.simulacao ?? null;
  if (!negocio) return null; // sem negócios de exemplo não há o que simular
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
        {eventos.map(({ evento: e, simulacao: s }) => {
          const motivo = s.tipo === "nao-aplicavel" ? s.motivo : null;
          return (
            <div key={e} className="max-w-xs space-y-1">
              <Button
                type="button" variant={evento === e ? "default" : "outline"}
                aria-pressed={evento === e} aria-disabled={motivo !== null ? "true" : undefined}
                aria-describedby={motivo ? `${id}-${e}` : undefined} onClick={() => { if (!motivo) aoSimular(e); }}
                className={`min-h-11 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 ${FOCO}`}
              >
                {evento === e && <Check aria-hidden="true" />}
                {t(`businessGoals.workflow.sim.btn.${e}`)}
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
