/**
 * Quantas admissões esperam a decisão do RH (estado «submetida»), para a pastilha do separador do pipeline.
 *
 * Sai de `contadores` da lista real (`rpc_hr_admissao_listar`), que não depende do filtro nem da página. A lista exige
 * `hr.pessoas.convite.enviar` ou `hr.onboarding.approve`: sem uma delas devolve 0 (a base recusaria). Enquanto carrega ou se
 * a leitura falhou também devolve 0: não se inventa um número.
 */
import { useAdmissoesPipeline } from "@/hooks/useAdmissoesPipeline";
import { usePermissions } from "@/hooks/usePermissions";

const SO_SUBMETIDAS = ["submetida"] as const;

export function useAdmissoesPorAprovar(): number {
  const { hasPermission } = usePermissions();
  const pode = hasPermission("hr.pessoas.convite.enviar") || hasPermission("hr.onboarding.approve");
  const { contadores, carregando, erro } = useAdmissoesPipeline({ estados: [...SO_SUBMETIDAS] });
  if (!pode || carregando || erro) return 0;
  return contadores.submetida ?? 0;
}
