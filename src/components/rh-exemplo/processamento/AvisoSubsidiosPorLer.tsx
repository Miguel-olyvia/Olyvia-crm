/**
 * Num periodo ABERTO, quando a configuracao dos subsidios de ferias e de Natal (ou os contratos de que ela precisa) foi recusada ou
 * falhou, diz-o em vez de mostrar o total sem os subsidios em silencio. O fecho fica bloqueado pela mesma leitura. «A carregar» e
 * «indisponivel» (a base ainda nao a tem: desligada) nao avisam.
 */
import { TriangleAlert } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import type { EstadoLeitura } from "@/components/rh-exemplo/hooks/useProcessamentoResultados";

export function AvisoSubsidiosPorLer({ estado }: { estado: EstadoLeitura }) {
  const { t } = useTranslation();
  if (estado !== "erro" && estado !== "recusado") return null;
  return (
    <p
      role={estado === "erro" ? "alert" : "status"}
      className="flex items-start gap-2 rounded-md border border-amber-800/40 p-3 text-sm text-amber-800 dark:border-amber-300/40 dark:text-amber-300"
    >
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      {t(estado === "erro" ? "rhSubs.aviso.configNaoLida" : "rhSubs.aviso.configRecusada")}
    </p>
  );
}
