/**
 * As decisoes do RH sobre uma admissao submetida e o envio do contrato para assinar: Aprovar, Rejeitar e Enviar contrato.
 * Chamam as RPCs com o JWT do RH (a permissao, a organizacao do processo e o estado em que a acao e permitida sao decididos
 * na base):
 *  - `rpc_hr_admissao_aprovar(p_convite_id, p_organization_id)` e `rpc_hr_admissao_rejeitar(..., p_mensagem, p_motivo_interno)`:
 *    `hr.onboarding.approve`. A mensagem de rejeitar (3 a 2000) vai para a pessoa; o motivo interno fica so no RH.
 *  - `rpc_hr_admissao_enviar_contrato(p_convite_id, p_modelo_id, p_dias_portal)`: emite o contrato a partir do modelo, partilha-o
 *    no portal e reabre o portal so para documentos. Devolve `tem_telemovel`: sem telemovel valido na ficha a pessoa nao recebe
 *    o codigo SMS da assinatura e o ecra avisa.
 *  - depois de um envio com sucesso, a Edge `convite-admissao` (acao `documentos_avisar`) manda o e-mail com o link; se esse e-mail
 *    falhar o contrato fica enviado e o ecra diz que o aviso nao saiu.
 *
 * O ecra so recebe TEXTO traduzido, nunca o codigo em bruto nem a mensagem da base. Defeitos (rede, sem codigo legivel, ou
 * `erro_inesperado`) vao para o registo; recusas de negocio (permissao, estado) nao.
 */
import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { hrRpc } from "@/lib/hr/hrDb";
import { codigoDeErroRpc, chaveDoErro } from "@/lib/hr/admissaoPipeline";
import { codigoDeErroEdge } from "@/lib/hr/errosAdmissao";
import { getLocalizedFallback } from "@/utils/friendlyError";

/** Forma plana (sem `strictNullChecks` uma uniao por `ok` nao estreita). */
export interface ResultadoDecisao {
  ok: boolean;
  /** O texto traduzido para o RH; `null` quando correu bem. */
  erro: string | null;
}

export interface ResultadoEnvioContrato extends ResultadoDecisao {
  /** Falso: a pessoa nao tem telemovel valido na ficha e nao vai receber o codigo SMS. */
  semTelemovel: boolean;
  /** O e-mail com o link nao saiu: o contrato ficou enviado, falta avisar a pessoa (copiar o link ou reenviar o aviso). */
  avisoNaoSaiu: boolean;
}

const MOTIVO_MAX = 2000;
const MENSAGEM_MIN = 3;
const DIAS_PORTAL_OMISSAO = 14;
const GENERICA = "hr.convite.erro.accaoFalhou";

function textoDoErro(codigo: string | null): string {
  return getLocalizedFallback(chaveDoErro(codigo, GENERICA));
}

function falhaDaRpc(erro: unknown, origem: string): ResultadoDecisao {
  const codigo = codigoDeErroRpc(erro);
  if (codigo === null || codigo === "erro_inesperado") captureFlowError(erro, origem);
  return { ok: false, erro: textoDoErro(codigo) };
}

export function useDecisoesAdmissao() {
  const { activeCompany } = useCompany();
  const organizationId = activeCompany?.id ?? null;
  const [aExecutar, setAExecutar] = useState(false);

  const aprovar = useCallback(
    async (conviteId: string): Promise<ResultadoDecisao> => {
      if (!organizationId) return { ok: false, erro: textoDoErro(null) };
      setAExecutar(true);
      try {
        const { error } = await hrRpc("rpc_hr_admissao_aprovar", { p_convite_id: conviteId, p_organization_id: organizationId });
        if (error) return falhaDaRpc(error, "hr-admissao-aprovar");
        return { ok: true, erro: null };
      } catch (e) {
        return falhaDaRpc(e, "hr-admissao-aprovar");
      } finally {
        setAExecutar(false);
      }
    },
    [organizationId],
  );

  const rejeitar = useCallback(
    async (conviteId: string, mensagem: string, motivoInterno: string): Promise<ResultadoDecisao> => {
      const texto = mensagem.trim();
      const interno = motivoInterno.trim();
      // A mensagem e obrigatoria (vai para a pessoa): nem chega a base sem ela.
      if (texto.length < MENSAGEM_MIN || texto.length > MOTIVO_MAX || interno.length > MOTIVO_MAX) {
        return { ok: false, erro: textoDoErro("motivo_invalido") };
      }
      if (!organizationId) return { ok: false, erro: textoDoErro(null) };
      setAExecutar(true);
      try {
        const { error } = await hrRpc("rpc_hr_admissao_rejeitar", {
          p_convite_id: conviteId,
          p_organization_id: organizationId,
          p_mensagem: texto,
          p_motivo_interno: interno === "" ? null : interno,
        });
        if (error) return falhaDaRpc(error, "hr-admissao-rejeitar");
        return { ok: true, erro: null };
      } catch (e) {
        return falhaDaRpc(e, "hr-admissao-rejeitar");
      } finally {
        setAExecutar(false);
      }
    },
    [organizationId],
  );

  /** Manda o e-mail «tem um documento no portal». Sem titulo nem conteudo do documento (isso e da Edge). */
  const avisar = useCallback(
    async (conviteId: string): Promise<ResultadoDecisao> => {
      if (!organizationId) return { ok: false, erro: textoDoErro(null) };
      try {
        const { data, error } = await supabase.functions.invoke("convite-admissao", {
          body: { action: "documentos_avisar", organization_id: organizationId, convite_id: conviteId },
        });
        if (error || data?.error) {
          const codigo = await codigoDeErroEdge(error, data);
          if (codigo === null || codigo === "erro_inesperado") {
            captureFlowError(new Error(`documentos_avisar: ${codigo ?? "falha_de_rede"}`), "hr-documentos-avisar");
          }
          return { ok: false, erro: textoDoErro(codigo) };
        }
        return { ok: true, erro: null };
      } catch {
        captureFlowError(new Error("documentos_avisar: falha_de_rede"), "hr-documentos-avisar");
        return { ok: false, erro: textoDoErro(null) };
      }
    },
    [organizationId],
  );

  const enviarContrato = useCallback(
    async (conviteId: string, modeloId: string, diasPortal: number = DIAS_PORTAL_OMISSAO): Promise<ResultadoEnvioContrato> => {
      const falha = (r: ResultadoDecisao): ResultadoEnvioContrato => ({ ...r, semTelemovel: false, avisoNaoSaiu: false });
      if (!modeloId) return falha({ ok: false, erro: textoDoErro("pedido_invalido") });
      setAExecutar(true);
      try {
        const { data, error } = await hrRpc("rpc_hr_admissao_enviar_contrato", {
          p_convite_id: conviteId,
          p_modelo_id: modeloId,
          p_dias_portal: diasPortal,
        });
        if (error) return falha(falhaDaRpc(error, "hr-admissao-enviar-contrato"));
        const semTelemovel = data?.tem_telemovel === false;
        const aviso = await avisar(conviteId);
        return { ok: true, erro: null, semTelemovel, avisoNaoSaiu: !aviso.ok };
      } catch (e) {
        return falha(falhaDaRpc(e, "hr-admissao-enviar-contrato"));
      } finally {
        setAExecutar(false);
      }
    },
    [avisar],
  );

  return { aprovar, rejeitar, enviarContrato, avisar, aExecutar };
}
