import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QUESTIONARIO_CODIGO, lerQuestionarioForm, type QuestionarioForm } from "@/components/negocio-metas/questionarioForm";
import type { EstadoDoQuestionario, ValorQuestionario } from "@/components/negocio-metas/QuestionarioContexto";
import { chamarNeg, ErroNeg } from "./chamarNeg";
import { CHAVE_ERRO_GENERICO, CHAVES_ERRO_NEG } from "./errosNeg";
import { useFontePessoas } from "./useFontePessoas";

/**
 * Chave da leitura do formulário, com a organização. É outra que a do separador «Levantamento» do Workflow (essa lê com as inativas, só quem
 * tem pessoas.config): as perguntas de quem preenche vêm sem inativas.
 */
export const questionarioFormularioQueryKey = (organizationId: string | null | undefined) => ["neg-questionario", organizationId ?? null] as const;

/** As perguntas mudam raramente: cinco minutos na cache; a gravação diz quando mudaram (`questionario_mudou`) e então relê-se. */
const STALE_TIME = 5 * 60 * 1000;

async function ler(organizationId: string): Promise<QuestionarioForm> {
  const cru = await chamarNeg<unknown>("neg_questionario_levantamento", { p_organization_id: organizationId, p_incluir_inactivas: false });
  const lido = lerQuestionarioForm(cru);
  if (!lido) throw new ErroNeg(null, null, CHAVE_ERRO_GENERICO);
  return lido;
}

const VAZIO: QuestionarioForm = { versao: null, semBase: false, seccoes: [] };

/** Modo real sem organização na fonte: não há de onde ler, e esperar não resolve. Diz-se como falta de acesso (NG008) em vez de um «a carregar» sem fim. */
const ERRO_SEM_ORGANIZACAO = new ErroNeg(null, "NG008", CHAVES_ERRO_NEG.NG008);

/** Fora do modo real não há base: o catálogo do código, sempre pronto. */
const SEM_BASE: ValorQuestionario = {
  questionario: QUESTIONARIO_CODIGO, estado: "pronto", erro: null, podeGuardar: true, repetir: () => {}, recarregar: async () => QUESTIONARIO_CODIGO,
};

/**
 * As perguntas do formulário do levantamento da organização de Pessoas, lidas por `neg_questionario_levantamento` SEM as inativas, com cache por
 * organização. Diz se está a carregar, pronto ou com erro (`repetir` volta a pedir) e só deixa gravar com o questionário carregado: gravar com
 * ele por carregar seria validar respostas contra perguntas que não se viram. Fora do modo real vale o catálogo do código (o protótipo sem base).
 * `habilitado` false não lê nada.
 */
export function useQuestionarioFormulario(habilitado = true): ValorQuestionario {
  const fonte = useFontePessoas();
  const client = useQueryClient();
  const organizationId = fonte.modo === "real" ? fonte.organizationId : null;
  const consulta = useQuery({
    queryKey: questionarioFormularioQueryKey(organizationId),
    queryFn: () => ler(organizationId as string),
    enabled: habilitado && !!organizationId,
    staleTime: STALE_TIME,
    // Um erro que a base explica (NG008, 42501...) não passa a dar certo à segunda: só se repetem as avarias.
    retry: (tentativas, erro) => tentativas < 2 && !(erro instanceof ErroNeg && erro.codigo !== null),
  });
  const { refetch } = consulta;

  const recarregar = useCallback(async (): Promise<QuestionarioForm | null> => {
    if (!organizationId) return null;
    try {
      return await client.fetchQuery({ queryKey: questionarioFormularioQueryKey(organizationId), queryFn: () => ler(organizationId), staleTime: 0 });
    } catch {
      return null;
    }
  }, [organizationId, client]);
  // Sem organização o `refetch` correria a leitura com um id vazio: não se repete nada.
  const repetir = useCallback(() => { if (organizationId) void refetch(); }, [refetch, organizationId]);

  const modoReal = fonte.modo === "real";
  const semOrganizacao = modoReal && habilitado && !organizationId;
  const dados = consulta.data;
  const erro = consulta.error ?? (semOrganizacao ? ERRO_SEM_ORGANIZACAO : null);
  const estado: EstadoDoQuestionario = dados ? "pronto" : consulta.isError || semOrganizacao ? "erro" : "a-carregar";
  return useMemo((): ValorQuestionario => {
    if (!modoReal) return SEM_BASE;
    return { questionario: dados ?? VAZIO, estado, erro, podeGuardar: estado === "pronto", repetir, recarregar };
  }, [modoReal, dados, estado, erro, repetir, recarregar]);
}
