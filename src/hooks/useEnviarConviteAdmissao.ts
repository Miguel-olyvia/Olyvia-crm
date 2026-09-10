/**
 * Enviar o convite de admissao a uma pessoa -- o lado AUTENTICADO do fluxo.
 *
 * Chama a Edge Function `convite-admissao` (accao "criar"), que reencaminha a
 * sessao do chamador para `rpc_hr_convite_admissao_criar` -- a verificacao de
 * `hr.pessoas.convite.enviar` e a que ja existe na base, nao uma copia aqui.
 *
 * NAO gera o token no browser: o token so existe na Edge Function, que o
 * hash-eia antes de o mandar a base e envia o valor em claro por e-mail. Este
 * hook nunca ve o token -- so sabe se o envio correu bem.
 */
import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";

interface ResultadoConvite {
  ok: boolean;
  emailEnviado: boolean;
  erro: string | null;
}

export function useEnviarConviteAdmissao() {
  const [enviando, setEnviando] = useState(false);

  const enviarConvite = useCallback(
    async (pessoaId: string, email: string): Promise<ResultadoConvite> => {
      setEnviando(true);
      try {
        const { data, error } = await supabase.functions.invoke("convite-admissao", {
          body: { action: "criar", pessoa_id: pessoaId, email },
        });
        if (error) {
          captureFlowError(error, "hr-convite-admissao-criar");
          return { ok: false, emailEnviado: false, erro: await getFriendlyErrorMessage(error) };
        }
        if (data?.error) {
          return { ok: false, emailEnviado: false, erro: String(data.error) };
        }
        return { ok: true, emailEnviado: Boolean(data?.email_enviado), erro: null };
      } catch (e) {
        captureFlowError(e, "hr-convite-admissao-criar");
        return { ok: false, emailEnviado: false, erro: await getFriendlyErrorMessage(e) };
      } finally {
        setEnviando(false);
      }
    },
    [],
  );

  return { enviarConvite, enviando };
}
