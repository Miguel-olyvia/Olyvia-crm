/**
 * A colocacao de UMA pessoa no organograma (`pessoas_colocacao_organograma`,
 * 20261130080000) -- em que FILIAL/ESTRUTURA a pessoa esta classificada,
 * versionada por intervalo (Lisboa de Fevereiro a Junho, Porto dai em
 * diante).
 *
 * INDEPENDENTE DA AFECTACAO A CENTROS -- NAO SE CONFUNDE COM `usePessoaAfectacoes`
 * ---------------------------------------------------------------------------------
 * Isto NAO e onde a pessoa trabalha fisicamente -- isso continua a viver em
 * `pessoas_afectacoes` (`usePessoaAfectacoes`). Sao DUAS classificacoes
 * INDEPENDENTES: nenhuma se calcula da outra, e a colocacao nunca limita a
 * que centros a pessoa pode ser afecta. Uma pessoa classificada em Lisboa
 * afecta a um centro do Porto continua "de Lisboa" aqui -- e isso mostra-se
 * como excepcao, nao se esconde nem se corrige sozinho.
 *
 * ALTERAR != CORRIGIR, a MESMA distincao de `usePessoaAfectacoes` (ver o
 * cabecalho la para o raciocinio completo) -- a base decide pelo `valido_ate`
 * da linha (`public.hr_periodo_decorrido`). Sem o caso "precisaAparar": aqui
 * nao ha horario planeado dependente do corte, por isso `fechar` nunca
 * precisa de propor aparar nada -- so `ok` ou `erro`.
 */
import { useCallback, useEffect, useState } from "react";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { hrFrom, isPermissionError } from "@/lib/hr/hrDb";
import { ordenarColocacoes } from "@/lib/hr/colocacaoOrganograma";
import type { PessoaColocacaoOrganograma } from "@/types/hr";

const COLUNAS =
  "id, pessoa_id, organization_id, organograma_node_id, valido_de, valido_ate, motivo, created_at, updated_at";

/** Resultado de fechar (ALTERAR) uma colocacao. `ok` cobre sucesso; `erro`
 *  cobre qualquer recusa, ja amigavel e traduzida. */
export type ResultadoColocacao = { tipo: "ok" } | { tipo: "erro"; mensagem: string };

export function usePessoaColocacaoOrganograma(
  pessoaId: string | undefined,
  organizationId: string | undefined,
) {
  const [colocacoes, setColocacoes] = useState<PessoaColocacaoOrganograma[]>([]);
  const [loading, setLoading] = useState(true);
  const [recusado, setRecusado] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!pessoaId) {
      setColocacoes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await hrFrom("pessoas_colocacao_organograma")
      .select(COLUNAS)
      .eq("pessoa_id", pessoaId)
      .is("deleted_at", null)
      .order("valido_de", { ascending: false });
    if (error) {
      if (isPermissionError(error)) {
        setRecusado(true);
        setColocacoes([]);
      } else {
        captureFlowError(error, "hr-colocacao-organograma-load");
      }
    } else {
      setRecusado(false);
      setColocacoes(ordenarColocacoes((data ?? []) as PessoaColocacaoOrganograma[]));
    }
    setLoading(false);
  }, [pessoaId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Devolve `null` em sucesso, ou a mensagem amigavel. */
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
        if (!isPermissionError(e)) captureFlowError(e, "hr-colocacao-organograma-write");
        return await getFriendlyErrorMessage(e);
      } finally {
        setSaving(false);
      }
    },
    [load],
  );

  /**
   * Cria uma colocacao nova. Serve tanto para "classificar numa filial" (em
   * aberto, `validoAte: null`, precisa de `.edit`) como para encaixar um
   * periodo JA TERMINADO no historico -- entre duas que ja la estao
   * (`validoAte` no passado, precisa de `.corrigir`). A permissao exigida
   * NAO se escolhe aqui -- decide-a a politica de RLS pelo `valido_ate` desta
   * linha; o ecra so ve a recusa se nao tiver a permissao certa.
   *
   * `organogramaNodeId` pode ser `null`: "sem classificacao" e sempre
   * legitimo (ver o cabecalho da migracao).
   */
  const criar = useCallback(
    (args: {
      organogramaNodeId: string | null;
      validoDe: string;
      validoAte: string | null;
      motivo: string | null;
    }) =>
      executar(async (autorId) => {
        if (!pessoaId || !organizationId) {
          return { error: new Error("Ficha sem organizacao resolvida") };
        }
        return hrFrom("pessoas_colocacao_organograma").insert({
          pessoa_id: pessoaId,
          organization_id: organizationId,
          organograma_node_id: args.organogramaNodeId,
          valido_de: args.validoDe,
          valido_ate: args.validoAte,
          motivo: args.motivo,
          created_by: autorId,
          updated_by: autorId,
        });
      }),
    [executar, pessoaId, organizationId],
  );

  /**
   * CORRIGIR: reescreve uma linha cujo periodo ja decorreu. So se chama
   * sobre uma linha com `valido_ate` no passado -- e essa condicao, avaliada
   * pela base sobre a linha ANTIGA, e que exige `hr.pessoas.colocacao.corrigir`
   * em vez de `.edit`.
   */
  const corrigir = useCallback(
    (
      colocacaoId: string,
      patch: {
        organogramaNodeId: string | null;
        validoDe: string;
        validoAte: string;
        motivo: string | null;
      },
    ) =>
      executar(async (autorId) =>
        hrFrom("pessoas_colocacao_organograma")
          .update({
            organograma_node_id: patch.organogramaNodeId,
            valido_de: patch.validoDe,
            valido_ate: patch.validoAte,
            motivo: patch.motivo,
            updated_by: autorId,
          })
          .eq("id", colocacaoId),
      ),
    [executar],
  );

  /**
   * ALTERAR: fecha (ou encolhe) a colocacao em vigor -- gesto normal,
   * `hr.pessoas.colocacao.edit`. Ao contrario de `usePessoaAfectacoes.fechar`,
   * nunca devolve "precisaAparar": nao ha horario planeado dependente do
   * corte de uma classificacao no organograma.
   */
  const fechar = useCallback(
    async (colocacaoId: string, validoAte: string, motivo: string | null): Promise<ResultadoColocacao> => {
      setSaving(true);
      try {
        const autorId = await resolveCurrentBusinessUserId();
        const { error } = await hrFrom("pessoas_colocacao_organograma")
          .update({ valido_ate: validoAte, motivo, updated_by: autorId })
          .eq("id", colocacaoId);
        if (error) {
          if (!isPermissionError(error)) captureFlowError(error, "hr-colocacao-organograma-write");
          return { tipo: "erro", mensagem: await getFriendlyErrorMessage(error) };
        }
        await load();
        return { tipo: "ok" };
      } catch (e) {
        if (!isPermissionError(e)) captureFlowError(e, "hr-colocacao-organograma-write");
        return { tipo: "erro", mensagem: await getFriendlyErrorMessage(e) };
      } finally {
        setSaving(false);
      }
    },
    [load],
  );

  return {
    colocacoes,
    loading,
    saving,
    recusado,
    recarregar: load,
    criar,
    corrigir,
    fechar,
  };
}
