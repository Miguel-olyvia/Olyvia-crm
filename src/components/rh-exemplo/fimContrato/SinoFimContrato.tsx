/**
 * O sino do fim de contrato: abre a janela do responsável. O número é de contratos da equipa do utilizador ainda sem
 * indicação (da base). Com a janela aberta o contador pára e volta a ler ao fechar, para reflectir o que se indicou.
 * Se a leitura falhar o sino diz-o em vez de mostrar um zero que enganaria; quando há contratos por indicar, não é só
 * a cor que o diz (o número e o nome do botão também).
 */
import { useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { useCompany } from "@/components/rh-exemplo/hooks/useCompany";
import { useContratosDoResponsavel } from "@/components/rh-exemplo/hooks/useContratosDoResponsavel";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { JanelaResponsavelFimContrato } from "./JanelaResponsavelFimContrato";

export function SinoFimContrato() {
  const { t } = useTranslation();
  const [aberto, setAberto] = useState(false);
  const { activeCompany } = useCompany();
  const { contratos, loading, erroLeitura } = useContratosDoResponsavel(activeCompany.id || null, !aberto);
  const porIndicar = contratos.filter((c) => c.resposta === null).length;
  const mostraNumero = !aberto && !loading && !erroLeitura;

  return (
    <>
      <Button
        type="button" variant="outline" onClick={() => setAberto(true)} className={cn("min-h-11 min-w-11 gap-2", FOCO)}
        aria-label={erroLeitura ? t("hr.fimContrato.equipa.erro") : t("rhA.fimContrato.sinoNome", { n: porIndicar })}
        title={erroLeitura ? t("hr.fimContrato.equipa.erro") : undefined}
      >
        <Bell className="h-4 w-4" aria-hidden="true" />
        {erroLeitura && <span aria-hidden="true">!</span>}
        {mostraNumero && <span className="tabular-nums" aria-hidden="true">{porIndicar}</span>}
      </Button>
      <JanelaResponsavelFimContrato open={aberto} onOpenChange={setAberto} />
    </>
  );
}
