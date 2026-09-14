/**
 * A retribuicao versionada de UMA pessoa (`pessoas_retribuicoes`,
 * 20261120060000) -- copia estrutural de `usePessoaVinculoHoras`.
 *
 * ALTERAR != CORRIGIR, A MESMA DISTINCAO DE `usePessoaVinculoHoras`
 * -------------------------------------------------------------------
 * ALTERAR fecha a versao em vigor (se existir) e abre outra, com data de
 * efeito -- o gesto normal ("a partir de 1 de Abril passa a ganhar X"),
 * `hr.pessoas.retribuicao.edit` (reaproveitada: e a MESMA permissao que ja
 * escreve na admissao, nao se duplica). CORRIGIR reescreve uma versao cujo
 * periodo ja decorreu -- "o que registamos para Marco estava errado" --
 * `hr.pessoas.retribuicao.corrigir`, permissao a parte, mais perigosa
 * (20261201040000). A base decide pelo `valido_ate` da linha
 * (`public.hr_periodo_decorrido`); este hook nunca decide sozinho, so evita
 * gastar um pedido que a base ia recusar.
 *
 * PORQUE FECHAR A VERSAO EM ABERTO NAO PRECISA DE "UM DIA ANTES"
 * ------------------------------------------------------------------
 * O trigger de nao-sobreposicao de `pessoas_retribuicoes` compara intervalos
 * com fim EXCLUSIVO. Fechar a versao em vigor com `valido_ate = dataEfeito`
 * e abrir a nova com `valido_de = dataEfeito` da dois intervalos contiguos,
 * sem sobreposicao e sem buraco.
 */
import { useCallback, useEffect, useState } from "react";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { hrFrom, isPermissionError } from "@/lib/hr/hrDb";
import { estaEmAberto } from "@/lib/hr/afectacoes";
import type { Periodicidade, PessoaRetribuicao, SubsidioAlimentacaoModo } from "@/types/hr";

const COLUNAS =
  "id, pessoa_id, organization_id, vinculo_id, valor_base, moeda, periodicidade, " +
  "subsidio_alimentacao, subsidio_alimentacao_modo, duodecimos_pct, valido_de, " +
  "valido_ate, motivo, created_at, updated_at";

export interface CorrigirVersaoRetribuicaoPatch {
  valorBase: number;
  moeda: string;
  periodicidade: Periodicidade;
  subsidioAlimentacao: number | null;
  subsidioAlimentacaoModo: SubsidioAlimentacaoModo | null;
  duodecimosPct: 0 | 50 | 100 | null;
  validoDe: string;
  validoAte: string;
  motivo: string | null;
}

export function usePessoaRetribuicao(
  pessoaId: string | undefined,
  organizationId: string | undefined,
) {
  const [versoes, setVersoes] = useState<PessoaRetribuicao[]>([]);
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
    const { data, error } = await hrFrom("pessoas_retribuicoes")
      .select(COLUNAS)
      .eq("pessoa_id", pessoaId)
      .is("deleted_at", null)
      .order("valido_de", { ascending: false });
    if (error) {
      if (isPermissionError(error)) {
        setRecusado(true);
        setVersoes([]);
      } else {
        captureFlowError(error, "hr-retribuicao-load");
      }
    } else {
      setRecusado(false);
      setVersoes((data ?? []) as PessoaRetribuicao[]);
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
        if (!isPermissionError(e)) captureFlowError(e, "hr-retribuicao-write");
        return await getFriendlyErrorMessage(e);
      } finally {
        setSaving(false);
      }
    },
    [load],
  );

  /**
   * ALTERAR: a partir de `dataEfeito` a retribuicao passa a este valor. Fecha
   * a versao em aberto (se existir) e abre outra -- ver o porque de
   * `valido_ate = dataEfeito` no cabecalho deste ficheiro. Se nao houver
   * versao em aberto (nunca deveria acontecer depois da admissao, mas nao se
   * assume), so insere a primeira.
   */
  const alterar = useCallback(
    (args: {
      vinculoId: string | null;
      valorBase: number;
      moeda: string;
      periodicidade: Periodicidade;
      subsidioAlimentacao: number | null;
      subsidioAlimentacaoModo: SubsidioAlimentacaoModo | null;
      duodecimosPct: 0 | 50 | 100 | null;
      dataEfeito: string;
      motivo: string | null;
    }) =>
      executar(async (autorId) => {
        if (!pessoaId || !organizationId) {
          return { error: new Error("Ficha sem organizacao resolvida") };
        }
        if (aberta) {
          const { error: erroFecho } = await hrFrom("pessoas_retribuicoes")
            .update({ valido_ate: args.dataEfeito, updated_by: autorId })
            .eq("id", aberta.id);
          if (erroFecho) return { error: erroFecho };
        }
        return hrFrom("pessoas_retribuicoes").insert({
          pessoa_id: pessoaId,
          organization_id: organizationId,
          vinculo_id: args.vinculoId,
          valor_base: args.valorBase,
          moeda: args.moeda,
          periodicidade: args.periodicidade,
          subsidio_alimentacao: args.subsidioAlimentacao,
          subsidio_alimentacao_modo: args.subsidioAlimentacaoModo,
          duodecimos_pct: args.duodecimosPct,
          valido_de: args.dataEfeito,
          valido_ate: null,
          motivo: args.motivo,
          created_by: autorId,
          updated_by: autorId,
        });
      }),
    [executar, pessoaId, organizationId, aberta],
  );

  /**
   * CORRIGIR: reescreve uma linha cujo periodo ja decorreu. So se chama sobre
   * uma linha com `valido_ate` no passado -- e essa condicao, avaliada pela
   * base sobre a linha ANTIGA, e que exige `hr.pessoas.retribuicao.corrigir`
   * em vez de `.edit`.
   */
  const corrigir = useCallback(
    (versaoId: string, patch: CorrigirVersaoRetribuicaoPatch) =>
      executar(async (autorId) =>
        hrFrom("pessoas_retribuicoes")
          .update({
            valor_base: patch.valorBase,
            moeda: patch.moeda,
            periodicidade: patch.periodicidade,
            subsidio_alimentacao: patch.subsidioAlimentacao,
            subsidio_alimentacao_modo: patch.subsidioAlimentacaoModo,
            duodecimos_pct: patch.duodecimosPct,
            valido_de: patch.validoDe,
            valido_ate: patch.validoAte,
            motivo: patch.motivo,
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
