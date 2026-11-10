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
  // Criar sem e-mail de acesso (nem no pedido, nem na ficha) ou com um e-mail invalido.
  sem_email_acesso: "hr.acesso.erroSemEmailAcesso",
  email_invalido: "hr.acesso.erroEmailInvalido",
  // Inclui a guarda de ficha completa que nao conseguiu correr: o acesso NAO foi criado.
  erro_inesperado: "hr.acesso.erroInesperado",
  // A conta de autenticacao com este e-mail ja existia e nao e uma conta orfa de admissao.
  conta_existente_nao_reutilizavel: "hr.acesso.erroContaExistenteNaoReutilizavel",
  // Pedido mal formado (nao devia acontecer a partir do ecra).
  method_not_allowed: "hr.acesso.erroPedidoInvalido",
  pedido_invalido: "hr.acesso.erroPedidoInvalido",
  pessoa_nao_encontrada: "hr.acesso.erroPessoaNaoEncontrada",
  // Reenvio: a conta ligada a ficha nao tem utilizador de autenticacao, ou a password nao mudou.
  conta_sem_utilizador_de_autenticacao: "hr.acesso.erroContaSemUtilizadorAutenticacao",
  password_nao_alterada: "hr.acesso.erroPasswordNaoAlterada",
  // O papel escolhido.
  papel_fora_da_organizacao: "hr.acesso.erroPapelForaDaOrganizacao",
  papel_nao_permitido: "hr.acesso.erroPapelNaoPermitido",
  papel_nao_encontrado: "hr.acesso.erroPapelNaoEncontrado",
  // A conta de autenticacao com este e-mail ja existia (rpc_hr_associar_conta_existente).
  conta_existente_nao_encontrada: "hr.acesso.erroContaExistenteNaoEncontrada",
  conta_existente_inativa: "hr.acesso.erroContaExistenteInativa",
  conta_existente_sem_perfil: "hr.acesso.erroContaExistenteSemPerfil",
  // A ligacao da conta a ficha (rpc_hr_ligar_conta_por_servico).
  conta_ja_ligada_a_outra_pessoa: "hr.conta.erroJaLigadaAOutraPessoa",
  conta_sem_membership_na_organizacao: "hr.conta.erroSemMembershipNaOrganizacao",
  // Passos da criacao que falharam.
  conta_nao_criada: "hr.acesso.erroContaNaoCriada",
  perfil_nao_criado: "hr.acesso.erroPerfilNaoCriado",
  conta_nao_ligada_a_ficha: "hr.acesso.erroContaNaoLigadaAFicha",
};

/**
 * As RPCs devolvem algumas recusas como texto livre (RAISE EXCEPTION com frase), que a Edge Function passa tal e qual.
 * Reconhecem-se por padrao para nunca mostrar o texto em bruto.
 */
const CHAVE_POR_PADRAO: ReadonlyArray<readonly [RegExp, string]> = [
  [/manage_roles/, "hr.acesso.erroSemGerirPapeis"],
  [/si próprio/, "hr.acesso.erroPapelASiProprio"],
  [/Sem permissão|insufficient|não tem permissão/i, "friendlyError.forbidden"],
];

/** Nunca o codigo em bruto: sempre texto traduzido. */
export function mensagemDoCodigo(codigo: string | null): string {
  const chave =
    (codigo ? CHAVE_POR_CODIGO[codigo] : undefined) ??
    (codigo ? CHAVE_POR_PADRAO.find(([padrao]) => padrao.test(codigo))?.[1] : undefined) ??
    "hr.acesso.erroCriar";
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
  /** E-mail de acesso (o da empresa): login e destino das credenciais. So na criacao. */
  email?: string;
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
            ...(opcoes?.email ? { email: opcoes.email } : {}),
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
