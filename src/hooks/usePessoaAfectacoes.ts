/**
 * As afectacoes a centros de UMA pessoa (`pessoas_afectacoes`, 20261130060000).
 *
 * PORQUE E UM HOOK A PARTE E NAO MAIS UM SATELITE DE `usePessoa`
 * -----------------------------------------------------------------
 * Ao contrario dos outros satelites, aqui a escrita nao e um upsert simples: e
 * ALTERAR (fechar a linha em vigor, abrir outra -- `hr.pessoas.afectacoes.edit`)
 * ou CORRIGIR (mexer numa linha cujo periodo ja decorreu --
 * `hr.pessoas.afectacoes.corrigir`), e um erro nomeado
 * (`afectacao_tem_horario_a_frente`) que o ecra tem de poder tratar em vez de
 * so mostrar. `guardar()` de `usePessoa` devolve so uma mensagem amigavel; aqui
 * os metodos de fecho devolvem um resultado tipado para o ecra decidir.
 *
 * `pessoas.local_id` NUNCA se escreve daqui directamente -- passa a ser
 * derivado pelo trigger `hr_afectacoes_manter_local_pessoa` assim que uma
 * afectacao e criada, fechada ou corrigida. Ver o cabecalho da migracao.
 */
import { useCallback, useEffect, useState } from "react";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getFriendlyErrorMessage, getLocalizedFallback } from "@/utils/friendlyError";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { hrFrom, isPermissionError } from "@/lib/hr/hrDb";
import {
  ERRO_AFECTACAO_HORARIO_A_FRENTE,
  ehErroNomeado,
  mensagemDeErro,
  ordenarAfectacoes,
} from "@/lib/hr/afectacoes";
import type { PessoaAfectacao } from "@/types/hr";

/**
 * `hr_horario_planeado_janela_imutavel` (20261130190000) -- todos os
 * ERRCODEs que levanta comecam por este prefixo (janela_decorrida,
 * fecha_no_passado, encolhe_inicio, altera_regra_em_curso,
 * insercao_no_passado).
 *
 * `apararEFechar` pode pedir para aparar um bloco cujo intervalo JA
 * DECORREU, ou fechar uma regra recorrente com um `corte` retroactivo a mais
 * de um dia -- e nesse caso o trigger recusa por desenho: uma janela ja
 * decorrida e imutavel, e nao ha correccao que a mude de sitio no tempo (a
 * `rpc_hr_planeado_corrigir` so corrige o que la estava, nunca o periodo).
 * Sem esta distincao, quem fecha uma afectacao no passado via aqui via a
 * mensagem de erro do horario planeado, que manda usar uma RPC que nao serve
 * para isto -- em vez de lhe dizerem, em vocabulario de afectacoes, que a
 * data escolhida nao pode retroceder tanto.
 */
function ehErroDeImutabilidadeDoPlaneado(erro: unknown): boolean {
  return mensagemDeErro(erro)?.startsWith("horario_planeado_") ?? false;
}

const COLUNAS =
  "id, pessoa_id, organization_id, vinculo_id, local_id, valido_de, valido_ate, motivo, " +
  "origem, confirmada_por, confirmada_em, created_at, updated_at";

/**
 * Resultado de uma operacao que pode fechar/encolher uma afectacao. `ok` cobre
 * sucesso; `erro` cobre qualquer outra recusa (amigavel, ja traduzida);
 * `precisaAparar` e o caso especial -- a base recusou por haver horario
 * planeado a frente do corte, e o ecra tem de PROPOR aparar, nao so recusar.
 */
export type ResultadoFecho =
  | { tipo: "ok" }
  | { tipo: "erro"; mensagem: string }
  | { tipo: "precisaAparar"; localId: string; corte: string };

export function usePessoaAfectacoes(pessoaId: string | undefined, organizationId: string | undefined) {
  const [afectacoes, setAfectacoes] = useState<PessoaAfectacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [recusado, setRecusado] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!pessoaId) {
      setAfectacoes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await hrFrom("pessoas_afectacoes")
      .select(COLUNAS)
      .eq("pessoa_id", pessoaId)
      .is("deleted_at", null)
      .order("valido_de", { ascending: false });
    if (error) {
      if (isPermissionError(error)) {
        setRecusado(true);
        setAfectacoes([]);
      } else {
        captureFlowError(error, "hr-afectacoes-load");
      }
    } else {
      setRecusado(false);
      setAfectacoes(ordenarAfectacoes((data ?? []) as PessoaAfectacao[]));
    }
    setLoading(false);
  }, [pessoaId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Devolve `null` em sucesso, ou a mensagem amigavel -- para as operacoes
   *  que NAO precisam de distinguir o erro de horario a frente. */
  const executar = useCallback(
    async (accao: (autorId: string | null) => Promise<{ error: unknown }>): Promise<string | null> => {
      setSaving(true);
      try {
        const autorId = await resolveCurrentBusinessUserId();
        const { error } = await accao(autorId);
        if (error) throw error;
        await load();
        return null;
      } catch (e) {
        if (!isPermissionError(e)) captureFlowError(e, "hr-afectacoes-write");
        return await getFriendlyErrorMessage(e);
      } finally {
        setSaving(false);
      }
    },
    [load],
  );

  /**
   * Cria uma afectacao nova. Serve tanto para "atribuir a um centro" (em
   * aberto, `validoAte: null`, precisa de `.edit`) como para encaixar um
   * periodo JA TERMINADO no historico -- inserir ENTRE dois que ja la estao
   * inclusive (`validoAte` no passado, precisa de `.corrigir`). A permissao
   * exigida NAO se escolhe aqui -- decide-a a politica de RLS pelo `valido_ate`
   * desta linha; o ecra so ve a recusa se nao tiver a permissao certa.
   */
  const criar = useCallback(
    (args: {
      localId: string;
      vinculoId: string | null;
      validoDe: string;
      validoAte: string | null;
      motivo: string | null;
    }) =>
      executar(async (autorId) => {
        if (!pessoaId || !organizationId) {
          return { error: new Error("Ficha sem organizacao resolvida") };
        }
        return hrFrom("pessoas_afectacoes").insert({
          pessoa_id: pessoaId,
          organization_id: organizationId,
          vinculo_id: args.vinculoId,
          local_id: args.localId,
          valido_de: args.validoDe,
          valido_ate: args.validoAte,
          motivo: args.motivo,
          origem: "declarada",
          created_by: autorId,
          updated_by: autorId,
        });
      }),
    [executar, pessoaId, organizationId],
  );

  /**
   * CORRIGIR: reescreve uma linha cujo periodo ja decorreu. So se chama sobre
   * uma linha com `valido_ate` no passado -- e essa condicao, avaliada pela
   * base sobre a linha ANTIGA, e que exige `hr.pessoas.afectacoes.corrigir` em
   * vez de `.edit`.
   */
  const corrigir = useCallback(
    (
      afectacaoId: string,
      patch: { localId: string; validoDe: string; validoAte: string; motivo: string | null },
    ) =>
      executar(async (autorId) =>
        hrFrom("pessoas_afectacoes")
          .update({
            local_id: patch.localId,
            valido_de: patch.validoDe,
            valido_ate: patch.validoAte,
            motivo: patch.motivo,
            updated_by: autorId,
          })
          .eq("id", afectacaoId),
      ),
    [executar],
  );

  /**
   * ALTERAR: fecha (ou encolhe) a afectacao em vigor. E aqui que o erro
   * nomeado `afectacao_tem_horario_a_frente` pode aparecer -- por isso esta
   * funcao NAO passa por `executar`: precisa do erro em bruto para o
   * distinguir de qualquer outra recusa e devolver `precisaAparar` em vez de
   * so uma mensagem.
   */
  const fechar = useCallback(
    async (afectacaoId: string, validoAte: string, motivo: string | null): Promise<ResultadoFecho> => {
      setSaving(true);
      try {
        const autorId = await resolveCurrentBusinessUserId();
        const linha = afectacoes.find((a) => a.id === afectacaoId);
        const { error } = await hrFrom("pessoas_afectacoes")
          .update({ valido_ate: validoAte, motivo, updated_by: autorId })
          .eq("id", afectacaoId);
        if (error) {
          if (ehErroNomeado(error, ERRO_AFECTACAO_HORARIO_A_FRENTE) && linha) {
            return { tipo: "precisaAparar", localId: linha.local_id, corte: validoAte };
          }
          if (!isPermissionError(error)) captureFlowError(error, "hr-afectacoes-write");
          return { tipo: "erro", mensagem: await getFriendlyErrorMessage(error) };
        }
        await load();
        return { tipo: "ok" };
      } catch (e) {
        if (!isPermissionError(e)) captureFlowError(e, "hr-afectacoes-write");
        return { tipo: "erro", mensagem: await getFriendlyErrorMessage(e) };
      } finally {
        setSaving(false);
      }
    },
    [afectacoes, load],
  );

  /**
   * O LADO "PROPOR APARAR" DO INVARIANTE
   * -------------------------------------
   * Apara (encurta ou apaga) os blocos de `pessoas_horario_planeado` desta
   * pessoa NESTE CENTRO que caiam depois do corte, e so DEPOIS tenta fechar a
   * afectacao outra vez. Nunca corre sozinho -- so quando quem edita confirma
   * explicitamente a proposta que `fechar()` devolveu.
   */
  const apararEFechar = useCallback(
    async (
      afectacaoId: string,
      localId: string,
      corte: string,
      motivo: string | null,
    ): Promise<ResultadoFecho> => {
      setSaving(true);
      try {
        if (!pessoaId) return { tipo: "erro", mensagem: await getFriendlyErrorMessage(null) };
        const autorId = await resolveCurrentBusinessUserId();
        const { data, error: erroLeitura } = await hrFrom("pessoas_horario_planeado")
          .select("id, data, dia_semana, valido_de, valido_ate")
          .eq("pessoa_id", pessoaId)
          .eq("local_id", localId)
          .is("deleted_at", null);
        if (erroLeitura) {
          return { tipo: "erro", mensagem: await getFriendlyErrorMessage(erroLeitura) };
        }

        const agora = new Date().toISOString();
        for (const bloco of (data ?? []) as Array<{
          id: string;
          data: string | null;
          dia_semana: number | null;
          valido_de: string | null;
          valido_ate: string | null;
        }>) {
          const excepcaoAFrente = bloco.data !== null && bloco.data > corte;
          const recorrenteAFrente =
            bloco.dia_semana !== null && (bloco.valido_ate === null || bloco.valido_ate > corte);
          if (!excepcaoAFrente && !recorrenteAFrente) continue;

          // Comeca inteiramente depois do corte: nao ha intervalo para
          // encolher, apaga-se a linha toda.
          const comecaDepoisDoCorte = bloco.valido_de !== null && bloco.valido_de > corte;
          if (excepcaoAFrente || comecaDepoisDoCorte) {
            const { error } = await hrFrom("pessoas_horario_planeado")
              .update({ deleted_at: agora, deleted_by: autorId, updated_by: autorId })
              .eq("id", bloco.id);
            if (error) {
              if (ehErroDeImutabilidadeDoPlaneado(error)) {
                return { tipo: "erro", mensagem: getLocalizedFallback("hr.afectacoes.erroAparaJaDecorrido") };
              }
              return { tipo: "erro", mensagem: await getFriendlyErrorMessage(error) };
            }
          } else {
            const { error } = await hrFrom("pessoas_horario_planeado")
              .update({ valido_ate: corte, updated_by: autorId })
              .eq("id", bloco.id);
            if (error) {
              if (ehErroDeImutabilidadeDoPlaneado(error)) {
                return { tipo: "erro", mensagem: getLocalizedFallback("hr.afectacoes.erroAparaJaDecorrido") };
              }
              return { tipo: "erro", mensagem: await getFriendlyErrorMessage(error) };
            }
          }
        }
      } catch (e) {
        if (!isPermissionError(e)) captureFlowError(e, "hr-afectacoes-write");
        return { tipo: "erro", mensagem: await getFriendlyErrorMessage(e) };
      } finally {
        setSaving(false);
      }
      // Aparados os blocos, tenta fechar outra vez -- desta vez sem os
      // blocos a frente, o guarda deixa passar.
      return fechar(afectacaoId, corte, motivo);
    },
    [pessoaId, fechar],
  );

  /**
   * Confirmar NAO apaga a origem -- so regista quem validou uma afectacao
   * `do_horario` ou `inferida`. E uma UPDATE como qualquer outra: se a linha
   * ja decorreu, a base exige `.corrigir` em vez de `.edit`, na mesma regra.
   */
  const confirmar = useCallback(
    (afectacaoId: string) =>
      executar(async (autorId) =>
        hrFrom("pessoas_afectacoes")
          .update({ confirmada_por: autorId, confirmada_em: new Date().toISOString() })
          .eq("id", afectacaoId),
      ),
    [executar],
  );

  return {
    afectacoes,
    loading,
    saving,
    recusado,
    recarregar: load,
    criar,
    corrigir,
    fechar,
    apararEFechar,
    confirmar,
  };
}
