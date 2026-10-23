/**
 * O sino do fim de contrato: abre a janela do responsável. O número é de contratos da equipa ainda sem indicação;
 * quando há, não é só a cor que o diz (o número e o nome do botão também).
 */
import { useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { useContratosATerminar } from "@/components/rh-exemplo/hooks/useContratosATerminar";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { JanelaResponsavelFimContrato } from "./JanelaResponsavelFimContrato";

export function SinoFimContrato() {
  const { t } = useTranslation();
  const [aberto, setAberto] = useState(false);
  const { contratos } = useContratosATerminar(undefined, null);
  const porIndicar = contratos.filter((c) => c.resposta === null).length;

  return (
    <>
      <Button
        type="button" variant="outline" onClick={() => setAberto(true)} className={cn("min-h-11 min-w-11 gap-2", FOCO)}
        aria-label={t("rhA.fimContrato.sinoNome", { n: porIndicar })}
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        <span className="tabular-nums" aria-hidden="true">{porIndicar}</span>
      </Button>
      <JanelaResponsavelFimContrato open={aberto} onOpenChange={setAberto} />
    </>
  );
}
