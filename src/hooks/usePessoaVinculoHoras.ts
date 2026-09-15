/**
 * As horas contratadas versionadas de UMA pessoa (`pessoas_vinculos_horas`,
 * 20261130120000) -- copia estrutural de `usePessoaAfectacoes`.
 *
 * ALTERAR != CORRIGIR, A MESMA DISTINCAO DE `usePessoaAfectacoes`
 * -----------------------------------------------------------------
 * ALTERAR fecha a versao em vigor (se existir) e abre outra, com data de
 * efeito -- o gesto normal do dia-a-dia, `hr.pessoas.vinculos.edit`
 * (reaproveitada: e a MESMA permissao que ja edita o vinculo, nao se duplica).
 * CORRIGIR reescreve uma versao cujo periodo ja decorreu -- "o que
 * registamos para Marco estava errado" -- `hr.pessoas.vinculos.horas.corrigir`,
 * permissao a parte, mais perigosa. A base decide pelo `valido_ate` da linha
 * (`public.hr_periodo_decorrido`); este hook nunca decide sozinho, so evita
 * gastar um pedido que a base ia recusar.
 *
 * PORQUE FECHAR A VERSAO EM ABERTO NAO PRECISA DE "UM DIA ANTES"
 * ------------------------------------------------------------------
 * `hr_vinculos_horas_sem_sobreposicao` compara intervalos com
 * `daterange(valido_de, valido_ate, '[)')` -- fim EXCLUSIVO. Fechar a versao
 * em vigor com `valido_ate = dataEfeito` e abrir a nova com
 * `valido_de = dataEfeito` da dois intervalos contiguos, sem sobreposicao e
 * sem buraco: `[antigo.valido_de, dataEfeito)` e `[dataEfeito, +infinito)`.
 *
 * `pessoas_vinculos.horas_periodo`/`horas_frequencia` NUNCA se escrevem
 * daqui -- sao derivados por trigger a partir da versao em aberto desta
 * tabela. Ver o cabecalho da migracao e `usePessoa.saveVinculo`.
 */
import { useCallback, useEffect, useState } from "react";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { hrFrom, isPermissionError } from "@/lib/hr/hrDb";
import { estaEmAberto } from "@/lib/hr/afectacoes";
import type { HorasFrequencia, PessoaVinculoHoras } from "@/types/hr";

const COLUNAS =
  "id, pessoa_id, organization_id, vinculo_id, horas_periodo, horas_frequencia, " +
  "horas_semanais_equivalentes, valido_de, valido_ate, motivo, documento_id, " +
  "created_at, updated_at";

export interface CorrigirVersaoHorasPatch {
  horasPeriodo: number;
  horasFrequencia: HorasFrequencia;
  validoDe: string;
  validoAte: string;
  motivo: string | null;
  /** O documento de suporte (contrato/adenda) desta versao, se houver. */
  documentoId: string | null;
}

export function usePessoaVinculoHoras(
  pessoaId: string | undefined,
  organizationId: string | undefined,
) {
  const [versoes, setVersoes] = useState<PessoaVinculoHoras[]>([]);
  const [loading, setLoading] = useState(true);
  const [recusado, setRecusado] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!pessoaId) {
      setVersoes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await hrFrom("pessoas_vinculos_horas")
      .select(COLUNAS)
      .eq("pessoa_id", pessoaId)
      .is("deleted_at", null)
      .order("valido_de", { ascending: false });
    if (error) {
      if (isPermissionError(error)) {
        setRecusado(true);
        setVersoes([]);
      } else {
        captureFlowError(error, "hr-vinculo-horas-load");
      }
    } else {
      setRecusado(false);
      setVersoes((data ?? []) as PessoaVinculoHoras[]);
    }
    setLoading(false);
  }, [pessoaId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** A versao em vigor -- no maximo uma, garantida pelo indice unico parcial. */
  const aberta = versoes.find((v) => estaEmAberto(v)) ?? null;

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
        if (!isPermissionError(e)) captureFlowError(e, "hr-vinculo-horas-write");
        return await getFriendlyErrorMessage(e);
      } finally {
        setSaving(false);
      }
    },
    [load],
  );

  /**
   * ALTERAR: a partir de `dataEfeito` as horas passam a `horasPeriodo`/
   * `horasFrequencia`. Fecha a versao em aberto (se existir) e abre outra --
   * ver o porque de `valido_ate = dataEfeito` no cabecalho deste ficheiro.
   * Se nao houver versao em aberto (pessoa sem horas fixas ate agora), so
   * insere a primeira.
   */
  const alterar = useCallback(
    (args: {
      vinculoId: string | null;
      horasPeriodo: number;
      horasFrequencia: HorasFrequencia;
      dataEfeito: string;
      motivo: string | null;
      /** O documento de suporte (contrato/adenda) desta versao nova, se houver. */
      documentoId?: string | null;
    }) =>
      executar(async (autorId) => {
        if (!pessoaId || !organizationId) {
          return { error: new Error("Ficha sem organizacao resolvida") };
        }
        if (aberta) {
          const { error: erroFecho } = await hrFrom("pessoas_vinculos_horas")
            .update({ valido_ate: args.dataEfeito, updated_by: autorId })
            .eq("id", aberta.id);
          if (erroFecho) return { error: erroFecho };
        }
        return hrFrom("pessoas_vinculos_horas").insert({
          pessoa_id: pessoaId,
          organization_id: organizationId,
          vinculo_id: args.vinculoId,
          horas_periodo: args.horasPeriodo,
          horas_frequencia: args.horasFrequencia,
          valido_de: args.dataEfeito,
          valido_ate: null,
          motivo: args.motivo,
          documento_id: args.documentoId ?? null,
          created_by: autorId,
          updated_by: autorId,
        });
      }),
    [executar, pessoaId, organizationId, aberta],
  );

  /**
   * CORRIGIR: reescreve uma linha cujo periodo ja decorreu. So se chama sobre
   * uma linha com `valido_ate` no passado -- e essa condicao, avaliada pela
   * base sobre a linha ANTIGA, e que exige `hr.pessoas.vinculos.horas.corrigir`
   * em vez de `.edit`.
   */
  const corrigir = useCallback(
    (versaoId: string, patch: CorrigirVersaoHorasPatch) =>
      executar(async (autorId) =>
        hrFrom("pessoas_vinculos_horas")
          .update({
            horas_periodo: patch.horasPeriodo,
            horas_frequencia: patch.horasFrequencia,
            valido_de: patch.validoDe,
            valido_ate: patch.validoAte,
            motivo: patch.motivo,
            documento_id: patch.documentoId ?? null,
            updated_by: autorId,
          })
          .eq("id", versaoId),
      ),
    [executar],
  );

  return {
    versoes,
    aberta,
    loading,
    saving,
    recusado,
    recarregar: load,
    alterar,
    corrigir,
  };
}
