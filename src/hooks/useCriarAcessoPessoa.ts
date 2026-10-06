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
import { corpoDeErroEdge, type CorpoErroEdge } from "@/lib/hr/errosAdmissao";
import { getLocalizedFallback } from "@/utils/friendlyError";

export interface ResultadoCriarAcesso {
  ok: boolean;
  emailEnviado: boolean;
  aviso: string | null;
  erro: string | null;
  /**
   * Os codigos de campo que faltam, quando a Edge Function recusou a criacao
   * por `ficha_incompleta` (409). `null` em qualquer outro resultado. E o que
   * permite ao dialogo listar o que falta em vez de dizer so "nao foi possivel".
   */
  faltam: string[] | null;
}

/** Os codigos que a Edge Function diz que faltam: `campos[]` ou `pendencias[].codigo`. */
export function codigosEmFalta(corpo: CorpoErroEdge): string[] {
  if (Array.isArray(corpo.campos)) {
    return corpo.campos.filter((c): c is string => typeof c === "string" && c !== "");
  }
  if (Array.isArray(corpo.pendencias)) {
    return corpo.pendencias
      .map((p) => (p && typeof p === "object" ? (p as { codigo?: unknown }).codigo : null))
      .filter((c): c is string => typeof c === "string" && c !== "");
  }
  return [];
}

function recusaPorFichaIncompleta(corpo: CorpoErroEdge | null): ResultadoCriarAcesso | null {
  if (corpo?.error !== "ficha_incompleta") return null;
  return {
    ok: false,
    emailEnviado: false,
    aviso: null,
    erro: getLocalizedFallback("hr.acesso.erroFichaIncompleta"),
    faltam: codigosEmFalta(corpo),
  };
}

const FALHA: Omit<ResultadoCriarAcesso, "erro"> = {
  ok: false,
  emailEnviado: false,
  aviso: null,
  faltam: null,
};

/** Os codigos da Edge Function com texto proprio; tudo o resto cai em `hr.acesso.erroCriar`. */
const CHAVE_POR_CODIGO: Readonly<Record<string, string>> = {
  sem_sessao: "friendlyError.sessionExpired",
  insufficient_privilege: "friendlyError.forbidden",
  papel_obrigatorio: "hr.acesso.erroPapelObrigatorio",
  pessoa_ja_tem_conta_activa: "hr.conta.erroPessoaJaTemConta",
  // Reenvio com uma conta sem e-mail de autenticacao: nao ha para onde mandar.
  conta_sem_email: "hr.acesso.erroContaSemEmail",
  // Inclui a guarda de ficha completa que nao conseguiu correr: o acesso NAO foi criado.
  erro_inesperado: "hr.acesso.erroInesperado",
};

/** Nunca o codigo em bruto: sempre texto traduzido. */
export function mensagemDoCodigo(codigo: string | null): string {
  const chave = (codigo ? CHAVE_POR_CODIGO[codigo] : undefined) ?? "hr.acesso.erroCriar";
  return getLocalizedFallback(chave);
}

/** So o inesperado ou o que nem codigo tem e defeito; o resto e uma recusa de negocio. */
function eDefeito(codigo: string | null): boolean {
  return codigo === null || codigo === "erro_inesperado";
}

/** Um erro sem corpo nem Response (o pedido tem dados de uma pessoa): e o unico que vai para o registo. */
function erroSemDados(codigo: string | null): Error {
  return new Error(`criar-acesso: ${codigo ?? "falha_de_rede"}`);
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
          // `ficha_incompleta` (409) e a regra a funcionar, nao um defeito: nao
          // vai para o Sentry e diz-se o que falta.
          const corpo = await corpoDeErroEdge(error, data);
          const recusa = recusaPorFichaIncompleta(corpo);
          if (recusa) return recusa;
          const codigo = corpo?.error ?? null;
          if (eDefeito(codigo)) {
            captureFlowError(erroSemDados(codigo), "hr-criar-acesso-pessoa");
          }
          return { ...FALHA, erro: mensagemDoCodigo(codigo) };
        }
        if (data?.error) {
          const recusa = recusaPorFichaIncompleta(data as CorpoErroEdge);
          if (recusa) return recusa;
          const codigo = String(data.error);
          if (eDefeito(codigo)) {
            captureFlowError(erroSemDados(codigo), "hr-criar-acesso-pessoa");
          }
          return { ...FALHA, erro: mensagemDoCodigo(codigo) };
        }
        return {
          ok: true,
          emailEnviado: Boolean(data?.email_enviado),
          aviso: data?.aviso ? String(data.aviso) : null,
          erro: null,
          faltam: null,
        };
      } catch {
        captureFlowError(erroSemDados(null), "hr-criar-acesso-pessoa");
        return { ...FALHA, erro: mensagemDoCodigo(null) };
      } finally {
        setProcessando(false);
      }
    },
    [],
  );

  return { criarAcesso, processando };
}
