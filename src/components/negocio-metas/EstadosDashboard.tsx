import type { ReactNode } from "react";
import { AlertCircle, Inbox } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { FOCO } from "./estilos";
import { ALTURA, CARTAO, TRANSICAO } from "./estilosDashboard";

/** Skeletons com as mesmas alturas dos blocos reais, para o ecrã não saltar quando os dados chegam. */
export function DashboardCarregando() {
  const { t } = useTranslation();
  return (
    <div role="status" aria-busy="true" aria-label={t("businessGoals.state.loading")} className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className={cn("h-44", ALTURA.metas)} />)}
      </div>
      <Skeleton className={cn("h-72", ALTURA.comerciais)} />
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

interface MensagemProps {
  icone: ReactNode;
  titulo: string;
  acao: string;
  aoAgir?: () => void;
  alerta?: boolean;
}

function Mensagem({ icone, titulo, acao, aoAgir, alerta = false }: MensagemProps) {
  return (
    <div
      role={alerta ? "alert" : undefined}
      className={cn(CARTAO, "flex flex-col items-center gap-3 px-4 py-12 text-center")}
    >
      {icone}
      <p className="text-base font-medium text-foreground">{titulo}</p>
      <button
        type="button"
        onClick={aoAgir}
        className={cn(
          "inline-flex min-h-11 cursor-pointer items-center rounded-md border border-input bg-background px-4 text-sm font-medium text-foreground hover:bg-muted",
          TRANSICAO, FOCO,
        )}
      >
        {acao}
      </button>
    </div>
  );
}

export function DashboardVazio({ aoIrParaQuadro }: { aoIrParaQuadro?: () => void }) {
  const { t } = useTranslation();
  return (
    <Mensagem
      icone={<Inbox className="h-8 w-8 text-muted-foreground" aria-hidden="true" />}
      titulo={t("businessGoals.state.empty")}
      acao={t("businessGoals.state.emptyAction")}
      aoAgir={aoIrParaQuadro}
    />
  );
}

export function DashboardErro({ aoTentarDeNovo }: { aoTentarDeNovo?: () => void }) {
  const { t } = useTranslation();
  return (
    <Mensagem
      alerta
      icone={<AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />}
      titulo={t("businessGoals.state.error")}
      acao={t("businessGoals.state.retry")}
      aoAgir={aoTentarDeNovo}
    />
  );
}
