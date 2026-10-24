import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { chamarNeg, ErroNeg } from "../chamarNeg";
import { CHAVE_ERRO_GENERICO } from "../errosNeg";
import { useFontePessoas } from "../useFontePessoas";
import { lerQuestionario, paraEnvio, type QuestionarioEd, type SeccaoEd } from "./questionario";

/** Chave da leitura, com a organização (para não misturar organizações na cache). */
export const questionarioQueryKey = (organizationId: string | null | undefined) =>
  ["pessoas-questionario-levantamento", organizationId ?? null] as const;

/** O que uma gravação deu: se mudou alguma coisa, a versão que a base ficou a ter e se o questionário foi relido depois. */
export interface ResultadoGuardarQuestionario {
  mudou: boolean;
  versao: number;
  /** false: gravou, mas não se conseguiu reler (o ecrã ainda mostra o que lia antes). Sem alterações não há releitura e vale true. */
  recarregou: boolean;
}

export interface QuestionarioHook {
  /** O questionário gravado, com as inativas (null enquanto não chegou ou se a leitura falhou). */
  dados: QuestionarioEd | null;
  /** O erro da leitura, quando falhou (um `ErroNeg` se for um erro conhecido da base). */
  erro: unknown;
  isLoading: boolean;
  isError: boolean;
  /** Há uma gravação em curso (a releitura que vem a seguir incluída). */
  aGuardar: boolean;
  /** Grava o questionário inteiro enviando a versão lida. Lança `ErroNeg` se falhar. Um pedido durante outro devolve o que já está em curso. */
  guardar: (versao: number, seccoes: readonly SeccaoEd[]) => Promise<ResultadoGuardarQuestionario>;
  /** Relê da base, põe na cache e devolve o que leu (null se falhou). */
  recarregar: () => Promise<QuestionarioEd | null>;
}

async function ler(organizationId: string): Promise<QuestionarioEd> {
  const cru = await chamarNeg<unknown>("neg_questionario_levantamento", { p_organization_id: organizationId, p_incluir_inactivas: true });
  const lido = lerQuestionario(cru);
  if (!lido) throw new ErroNeg(null, null, CHAVE_ERRO_GENERICO);
  return lido;
}

const inteiroOu = (valor: unknown, alternativa: number): number => (typeof valor === "number" && Number.isInteger(valor) ? valor : alternativa);

/**
 * O questionário do levantamento da organização de Pessoas: lê-o por `neg_questionario_levantamento` (com as inativas, que só se pedem a quem
 * tem pessoas.config) e grava-o SÓ por `neg_guardar_questionario`, com a versão lida (NG021 se entretanto mudou; NG008, NG009 e 42501).
 * `habilitado` false não lê nada. Depois de gravar com alterações relê-se da base: a resposta da função não traz as perguntas.
 */
export function useQuestionarioLevantamento(habilitado = true): QuestionarioHook {
  const fonte = useFontePessoas();
  const client = useQueryClient();
  const organizationId = fonte.modo === "real" ? fonte.organizationId : null;
  const consulta = useQuery({
    queryKey: questionarioQueryKey(organizationId),
    queryFn: () => ler(organizationId as string),
    enabled: habilitado && !!organizationId,
    // Um erro que a base explica (NG008, 42501...) não passa a dar certo à segunda: só se repetem as avarias.
    retry: (tentativas, erro) => tentativas < 2 && !(erro instanceof ErroNeg && erro.codigo !== null),
  });
  const [aGuardar, setAGuardar] = useState(false);
  // O estado só muda no render seguinte: a referência é o que impede dois pedidos num duplo clique.
  const emCurso = useRef<Promise<ResultadoGuardarQuestionario> | null>(null);

  const recarregar = useCallback(async (): Promise<QuestionarioEd | null> => {
    if (!organizationId) return null;
    try {
      return await client.fetchQuery({ queryKey: questionarioQueryKey(organizationId), queryFn: () => ler(organizationId), staleTime: 0 });
    } catch {
      return null;
    }
  }, [organizationId, client]);

  const guardar = useCallback((versao: number, seccoes: readonly SeccaoEd[]): Promise<ResultadoGuardarQuestionario> => {
    if (emCurso.current) return emCurso.current;
    if (!organizationId) return Promise.reject(new ErroNeg(null, null, CHAVE_ERRO_GENERICO));
    setAGuardar(true);
    const voo = (async (): Promise<ResultadoGuardarQuestionario> => {
      try {
        const resposta = await chamarNeg<unknown>("neg_guardar_questionario", {
          p_organization_id: organizationId,
          p_versao: versao,
          p_seccoes: paraEnvio(seccoes),
        });
        const campos = typeof resposta === "object" && resposta !== null ? (resposta as Record<string, unknown>) : {};
        // Uma resposta que não se reconhece conta como «mudou»: relê-se em vez de se fingir que nada mudou.
        const mudou = campos.mudou !== false;
        if (!mudou) return { mudou: false, versao: inteiroOu(campos.versao, versao), recarregou: true };
        const lido = await recarregar();
        return { mudou: true, versao: inteiroOu(campos.versao, lido?.versao ?? versao), recarregou: lido !== null };
      } finally {
        emCurso.current = null;
        setAGuardar(false);
      }
    })();
    emCurso.current = voo;
    return voo;
  }, [organizationId, recarregar]);

  return {
    dados: consulta.data ?? null,
    erro: consulta.error ?? null,
    isLoading: consulta.isLoading,
    isError: consulta.isError,
    aGuardar,
    guardar,
    recarregar,
  };
}
