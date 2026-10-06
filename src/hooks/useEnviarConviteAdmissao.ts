/**
 * Enviar o convite de admissao a uma pessoa -- o lado AUTENTICADO do fluxo.
 *
 * Chama a Edge Function `convite-admissao` (accao "criar"), que reencaminha a
 * sessao do chamador para `rpc_hr_convite_admissao_criar` -- a verificacao de
 * `hr.pessoas.convite.enviar` e a que ja existe na base, nao uma copia aqui.
 * "Reenviar" e a mesma accao: cria um convite novo, que substitui o anterior.
 *
 * O LINK
 * ------
 * O token so existe na Edge Function, que o hash-eia antes de o mandar a base.
 * Quando o e-mail NAO sai, a resposta traz o link UMA vez (`link`) para o RH o
 * copiar; quando sai, `link` e `null`. Este hook limita-se a devolve-lo a quem
 * chamou: nunca o guarda em estado, nunca o escreve em storage, em URL, em
 * log ou no Sentry.
 *
 * O SENTRY
 * --------
 * So recebe DEFEITOS (sem codigo legivel, ou `erro_inesperado`), e sempre um
 * `Error` sintetico sem corpo: o `FunctionsHttpError` original traz a
 * `Response`, e o pedido tem o e-mail da pessoa. As recusas de negocio (403
 * sem permissao, 400, pessoa apagada, sessao expirada) nao sao defeitos.
 *
 * LINK EM FALTA
 * -------------
 * `semLink` e verdadeiro quando o convite FOI criado, o e-mail NAO saiu e a
 * resposta nao trouxe um link utilizavel (Edge Function antiga, campo perdido,
 * ou um link relativo sem host). O link so se mostra uma vez; quem usa o hook
 * tem de tratar isto como falha persistente -- nao fechar o dialogo.
 */
import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { chaveDeErroAdmissao, codigoDeErroEdge } from "@/lib/hr/errosAdmissao";
import { getLocalizedFallback } from "@/utils/friendlyError";

export interface ResultadoConvite {
  ok: boolean;
  emailEnviado: boolean;
  erro: string | null;
  conviteId: string | null;
  /** Ate quando o convite novo serve (ISO), quando a Edge Function o diz. */
  validUntil: string | null;
  /** O link, SO quando o e-mail nao saiu. Mostra-se uma vez e perde-se. */
  link: string | null;
  /** Porque e que o e-mail nao saiu: detalhe para o RH, nunca para a pessoa. */
  emailErro: string | null;
  /** O convite existe, o e-mail nao saiu e nao ha link para o RH copiar: o link perdeu-se. */
  semLink: boolean;
}

const FALHA: Omit<ResultadoConvite, "erro"> = {
  ok: false,
  emailEnviado: false,
  conviteId: null,
  validUntil: null,
  link: null,
  emailErro: null,
  semLink: false,
};

function textoOuNull(valor: unknown): string | null {
  return typeof valor === "string" && valor !== "" ? valor : null;
}

/** So um link absoluto serve ao RH: um caminho relativo ("/admissao/...") e inutil fora da app. */
function linkAbsolutoOuNull(valor: unknown): string | null {
  const texto = textoOuNull(valor);
  return texto !== null && /^https?:\/\//i.test(texto) ? texto : null;
}

/** So o inesperado ou o que nem codigo tem e defeito; o resto e uma recusa de negocio. */
function eDefeito(codigo: string | null): boolean {
  return codigo === null || codigo === "erro_inesperado";
}

/** Um erro sem corpo nem Response: e o unico que vai para o registo. */
function erroSemDados(codigo: string | null): Error {
  return new Error(`criar: ${codigo ?? "falha_de_rede"}`);
}

/** Os codigos do catalogo que dizem ao RH o que fazer ao enviar; o resto cai no texto generico. */
const CODIGOS_COM_TEXTO_AO_ENVIAR: ReadonlySet<string> = new Set([
  "insufficient_privilege",
  "sem_sessao",
  "pessoa_nao_encontrada",
  "validade_invalida",
]);

/**
 * Texto para o RH a partir do codigo da Edge Function; nunca o codigo em
 * bruto. Os codigos com chave no catalogo (sem permissao, sessao expirada)
 * dizem o que fazer; o resto cai no texto generico de "nao foi possivel enviar".
 */
function mensagemDoCodigo(codigo: string | null): string {
  const entrada = codigo ? chaveDeErroAdmissao(codigo) : null;
  if (entrada && codigo !== null && CODIGOS_COM_TEXTO_AO_ENVIAR.has(codigo)) {
    return getLocalizedFallback(entrada.chave);
  }
  return getLocalizedFallback("hr.convite.erroEnviar");
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
        if (error || data?.error) {
          const codigo = await codigoDeErroEdge(error, data);
          if (eDefeito(codigo)) {
            captureFlowError(erroSemDados(codigo), "hr-convite-admissao-criar");
          }
          return { ...FALHA, erro: mensagemDoCodigo(codigo) };
        }
        const emailEnviado = Boolean(data?.email_enviado);
        // So faz sentido sem e-mail; com e-mail o servidor manda `null`.
        const link = emailEnviado ? null : linkAbsolutoOuNull(data?.link);
        return {
          ok: true,
          emailEnviado,
          erro: null,
          conviteId: textoOuNull(data?.convite_id),
          validUntil: textoOuNull(data?.valid_until),
          link,
          emailErro: emailEnviado ? null : textoOuNull(data?.email_erro),
          semLink: !emailEnviado && link === null,
        };
      } catch {
        captureFlowError(erroSemDados(null), "hr-convite-admissao-criar");
        // Falha de transporte: texto generico traduzido, nunca a mensagem crua.
        return { ...FALHA, erro: mensagemDoCodigo(null) };
      } finally {
        setEnviando(false);
      }
    },
    [],
  );

  return { enviarConvite, enviando };
}
