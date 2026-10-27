/**
 * A janela do responsável (fluxo 3): abre pelo sino e mostra os contratos a terminar da equipa dele, com «Continuar»,
 * «Não continuar» e «Por decidir». É a janela real: lê `rpc_hr_contratos_do_responsavel` e grava com
 * `rpc_hr_contrato_indicar`. O responsável só INDICA; renovar e terminar é do RH.
 */
import { ContratosDaEquipaReal } from "@/components/rh-exemplo/hooks/ContratosDaEquipaReal";
import { useCompany } from "@/components/rh-exemplo/hooks/useCompany";

export function JanelaResponsavelFimContrato({ open, onOpenChange }: { open: boolean; onOpenChange: (aberto: boolean) => void }) {
  const { activeCompany } = useCompany();
  return <ContratosDaEquipaReal open={open} onOpenChange={onOpenChange} organizationId={activeCompany.id || null} />;
}
