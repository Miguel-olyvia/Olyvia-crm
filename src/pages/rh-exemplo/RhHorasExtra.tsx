/**
 * Horas extra (fluxo 6): a lista de trabalho do RH. Em memória, sem base.
 * Pipeline: tempo a mais por tipo de horário, mínimo de 15 min, marca «pode fazer horas extra» (ficha, aba Laborais),
 * limites com alerta a 80 %, e o RH confirma ou rejeita. Só as confirmadas pagam (ver Processamento salarial).
 */
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OlyviaLoader } from "@/components/ui/olyvia-loader";
import { NoOrganizationState } from "@/components/NoOrganizationState";
import { SeloExemplo } from "@/components/rh-exemplo/SeloExemplo";
import { useCompany } from "@/components/rh-exemplo/hooks/useCompany";
import { HorasExtraLista } from "@/components/rh-exemplo/fluxosC/HorasExtraLista";
import { LimitesHorasExtraCard } from "@/components/rh-exemplo/fluxosC/LimitesHorasExtraCard";
import { PagamentoHorasExtraCard } from "@/components/rh-exemplo/fluxosC/PagamentoHorasExtraCard";
import { RegistarTempoAMaisDialog } from "@/components/rh-exemplo/fluxosC/RegistarTempoAMaisDialog";
import { useTranslation } from "@/hooks/useTranslation";

export default function RhHorasExtra() {
  const { t } = useTranslation();
  const { activeCompany, isLoading } = useCompany();
  const [registarAberto, setRegistarAberto] = useState(false);

  if (isLoading) return <OlyviaLoader />;
  if (!activeCompany) return <NoOrganizationState />;

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            {t("rhFluxosC.he.titulo")} <SeloExemplo />
          </h1>
          <p className="text-muted-foreground">{t("rhFluxosC.he.subtitulo")}</p>
        </div>
        <Button type="button" className="min-h-11" onClick={() => setRegistarAberto(true)}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          {t("rhFluxosC.he.registar.abrir")}
        </Button>
      </header>
      <HorasExtraLista />
      <PagamentoHorasExtraCard />
      <LimitesHorasExtraCard />
      <RegistarTempoAMaisDialog aberto={registarAberto} aoFechar={() => setRegistarAberto(false)} />
    </div>
  );
}
