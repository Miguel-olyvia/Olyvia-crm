/**
 * O que a lista «por devolver» de UMA pessoa pede para a base a dar: o acesso completo (`hr.pessoas.vinculos.view` e
 * `hr.pessoas.retribuicao.view`). Sem ele a base responde 42501, por isso nem se pede (um 42501 por ficha aberta enchia o registo de
 * erros). Só esconde um pedido inútil: quem decide é a base, e o «Terminar» continua a ser recusado por ela (HRV14).
 */
import { usePermissions } from "@/components/rh-exemplo/hooks/usePermissions";

export const PERMISSAO_VER_VINCULOS = "hr.pessoas.vinculos.view";
export const PERMISSAO_VER_RETRIBUICAO = "hr.pessoas.retribuicao.view";
export const PERMISSAO_VER_ATIVOS = "ativos.view";
export const PERMISSAO_VER_FROTA = "fleet.view";

export function usePermissoesPorDevolver(): { acessoCompleto: boolean; ligacaoFrota: boolean; ligacaoAtivos: boolean } {
  const { hasPermission } = usePermissions();
  return {
    acessoCompleto: hasPermission(PERMISSAO_VER_VINCULOS) && hasPermission(PERMISSAO_VER_RETRIBUICAO),
    ligacaoFrota: hasPermission(PERMISSAO_VER_FROTA),
    ligacaoAtivos: hasPermission(PERMISSAO_VER_ATIVOS),
  };
}
