// Registar a assinatura de um contrato (no guia do negócio): é o que a página de contratos faz em «Confirmar assinatura» (`finalize_contract` da
// automação do pipeline, que marca o contrato como assinado e converte o contacto em cliente). A automação diz ela própria o erro (aviso) e devolve
// `null` quando falha; aqui isso é `false`. Sem sessão lança. A base só entra por `@/hooks/pessoas`.
import { useCallback } from "react";
import { usePipelineAutomation } from "@/hooks/usePipelineAutomation";
import { supabase } from "@/integrations/supabase/client";
import { exigirPermissao } from "@/lib/exigirPermissao";

/** `permissoes`: as da sessão; sem `client_contracts.edit` (a que a página de contratos exige) recusa-se, e sem lista conhecida (`undefined`) também. */
export function useAssinarContrato(): (contratoId: string, permissoes: readonly string[] | undefined) => Promise<boolean> {
  const { finalizeContract } = usePipelineAutomation();
  return useCallback(async (contratoId: string, permissoes: readonly string[] | undefined): Promise<boolean> => {
    exigirPermissao(permissoes, "client_contracts.edit", "assinar o contrato");
    const { data: { user }, error: erroSessao } = await supabase.auth.getUser();
    if (erroSessao) throw erroSessao;
    if (!user) throw new Error("Not authenticated");
    const resultado = await finalizeContract({ contract_id: contratoId, user_id: user.id });
    return resultado !== null && resultado !== undefined;
  }, [finalizeContract]);
}
