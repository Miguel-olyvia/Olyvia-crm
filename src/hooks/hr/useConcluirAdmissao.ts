/**
 * Concluir uma admissao: `rpc_hr_admissao_concluir(p_convite_id, p_organization_id)`, com o JWT do RH. A permissao
 * (`hr.onboarding.approve`), a organizacao e o estado (so `assinaturas_concluidas` e `a_aguardar_ativacao`) sao decididos na base,
 * que e idempotente: concluir uma admissao ja concluida devolve ok.
 *
 * O ecra chama-a DEPOIS de o acesso ter sido criado e enviado com sucesso. Se ela falhar, o acesso fica criado: o ecra diz-o e
 * a admissao pode ser concluida mais tarde.
 *
 * O ecra so recebe TEXTO traduzido, nunca o codigo em bruto nem a mensagem da base (HRA38, HRA31, HRA41 e 42501 ja tem texto
 * em `errosAdmissao`). Defeitos (rede, sem codigo legivel, `erro_inesperado`) vao para o registo; recusas de negocio nao.
 */
import { useCallback, useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { hrRpc } from "@/lib/hr/hrDb";
import { codigoDeErroRpc, chaveDoErro } from "@/lib/hr/admissaoPipeline";
import { getLocalizedFallback } from "@/utils/friendlyError";
import type { ResultadoDecisao } from "@/hooks/hr/useDecisoesAdmissao";

const GENERICA = "hr.convite.erro.accaoFalhou";
const ORIGEM = "hr-admissao-concluir";

function textoDoErro(codigo: string | null): string {
  return getLocalizedFallback(chaveDoErro(codigo, GENERICA));
}

function falhaDaRpc(erro: unknown): ResultadoDecisao {
  const codigo = codigoDeErroRpc(erro);
  if (codigo === null || codigo === "erro_inesperado") captureFlowError(erro, ORIGEM);
  return { ok: false, erro: textoDoErro(codigo) };
}

export function useConcluirAdmissao() {
  const { activeCompany } = useCompany();
  const organizationId = activeCompany?.id ?? null;
  const [aExecutar, setAExecutar] = useState(false);

  const concluir = useCallback(
    async (conviteId: string): Promise<ResultadoDecisao> => {
      if (!organizationId) return { ok: false, erro: textoDoErro(null) };
      setAExecutar(true);
      try {
        const { error } = await hrRpc("rpc_hr_admissao_concluir", { p_convite_id: conviteId, p_organization_id: organizationId });
        if (error) return falhaDaRpc(error);
        return { ok: true, erro: null };
      } catch (e) {
        return falhaDaRpc(e);
      } finally {
        setAExecutar(false);
      }
    },
    [organizationId],
  );

  return { concluir, aExecutar };
}
