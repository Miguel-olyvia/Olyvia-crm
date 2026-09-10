/**
 * Criar (ou reenviar) o acesso de uma pessoa -- o lado B do PLANO FECHADO
 * (seccao 5: "Criar a conta -- Edge Function"). Chama `criar-acesso-pessoa`,
 * que reencaminha a sessao do chamador -- a verificacao de
 * `hr.pessoas.conta.criar` e a que fica do lado do servidor, nao uma copia
 * aqui.
 *
 * A EDGE FUNCTION AINDA NAO ESTA PUBLICADA
 * -----------------------------------------
 * Ver `vault/registo-trabalho.md`: a Fase 1 do plano ficou bloqueada antes
 * de `criar-acesso-pessoa` ser escrita. Este hook fica pronto para o
 * contrato que o plano descreve -- ate la, devolve o erro que a chamada (ou
 * a sua ausencia, um 404) trouxer, e quem usa o hook mostra-o como qualquer
 * outro erro de rede.
 *
 * NUNCA devolve a password: a Edge Function nunca a poe na resposta (regra
 * BASE-USR-012, a mesma de `create-client-portal-access`).
 */
import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";

interface ResultadoCriarAcesso {
  ok: boolean;
  emailEnviado: boolean;
  aviso: string | null;
  erro: string | null;
}

interface OpcoesCriarAcesso {
  forcarNovaPassword?: boolean;
}

export function useCriarAcessoPessoa() {
  const [processando, setProcessando] = useState(false);

  const criarAcesso = useCallback(
    async (
      pessoaId: string,
      roleId: string,
      opcoes?: OpcoesCriarAcesso,
    ): Promise<ResultadoCriarAcesso> => {
      setProcessando(true);
      try {
        const { data, error } = await supabase.functions.invoke("criar-acesso-pessoa", {
          body: {
            pessoa_id: pessoaId,
            role_id: roleId || null,
            forcar_nova_password: opcoes?.forcarNovaPassword ?? false,
          },
        });
        if (error) {
          captureFlowError(error, "hr-criar-acesso-pessoa");
          return {
            ok: false,
            emailEnviado: false,
            aviso: null,
            erro: await getFriendlyErrorMessage(error),
          };
        }
        if (data?.error) {
          return { ok: false, emailEnviado: false, aviso: null, erro: String(data.error) };
        }
        return {
          ok: true,
          emailEnviado: Boolean(data?.email_enviado),
          aviso: data?.aviso ? String(data.aviso) : null,
          erro: null,
        };
      } catch (e) {
        captureFlowError(e, "hr-criar-acesso-pessoa");
        return { ok: false, emailEnviado: false, aviso: null, erro: await getFriendlyErrorMessage(e) };
      } finally {
        setProcessando(false);
      }
    },
    [],
  );

  return { criarAcesso, processando };
}
