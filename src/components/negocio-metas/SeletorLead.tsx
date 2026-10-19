// A escolha da lead a que um negócio corresponde, quando a pessoa tem mais de uma aberta (ao criar um negócio e ao dá-lo como ganho).
// A mais recente vem escolhida. Uma abordagem encerrada diz-se em texto na opção (não só pela cor).
import { useId } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { LeadAbertaCostura } from "./costuraNegocio";
import { FOCO } from "./estilos";

const L = "pessoasPagina.neg.lead.";

/** A lead mais recente (a última em caso de empate); `null` sem leads. */
export function leadMaisRecente(leads: readonly LeadAbertaCostura[]): LeadAbertaCostura | null {
  return leads.reduce<LeadAbertaCostura | null>((melhor, l) => (melhor === null || l.criadaEm >= melhor.criadaEm ? l : melhor), null);
}

interface SeletorLeadProps {
  leads: readonly LeadAbertaCostura[];
  valor: string;
  /** O rótulo do campo (diz para que serve a escolha). */
  rotulo: string;
  aoMudar: (leadId: string) => void;
  className?: string;
}

export function SeletorLead({ leads, valor, rotulo, aoMudar, className }: SeletorLeadProps) {
  const { t } = useTranslation();
  const id = useId();
  const opcoes = leads.map((l) => ({
    value: l.id, label: t(l.encerrada ? `${L}option.closed` : `${L}option`, { date: l.criadaEm }),
  }));
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id}>{rotulo}</Label>
      <NativeSelect id={id} value={valor} options={opcoes} className={cn("h-11", FOCO)} onValueChange={aoMudar} />
    </div>
  );
}
