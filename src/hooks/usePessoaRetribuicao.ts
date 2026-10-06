/**
 * A retribuicao versionada de UMA pessoa (`pessoas_retribuicoes`,
 * 20261120060000) -- copia estrutural de `usePessoaVinculoHoras`.
 *
 * O VALOR BASE JA NAO SE ESCREVE AQUI (fluxo 2)
 * ------------------------------------------------
 * O salario base de uma pessoa vem SO do cargo (`hr_cargos_periodos`): muda-se
 * mudando o cargo da pessoa (`usePessoaCargo`) ou o salario do cargo
 * (`useCargos.definirSalario`). A base recusa o INSERT directo em
 * `pessoas_retribuicoes` a `authenticated` e o trigger de igualdade recusa
 * qualquer valor que nao seja o do cargo na data da versao. Por isso este hook
 * ja nao tem `alterar` (que fechava a versao em vigor e abria outra por INSERT).
 *
 * O QUE E DA PESSOA: SUBSIDIO E DUODECIMOS
 * ------------------------------------------
 * `definirPessoal` -- `rpc_hr_retribuicao_definir_pessoal`, permissao
 * `hr.pessoas.retribuicao.edit` -- cria uma versao nova a partir de `desde` com o
 * valor base do cargo nessa data e o subsidio (valor e modo) e os duodecimos que
 * se passam. E tambem a RPC que cria a PRIMEIRA versao de quem tem cargo e ainda
 * nao tem retribuicao. Quem fecha e abre versoes e a base, na mesma transaccao.
 *
 * CORRIGIR reescreve uma versao cujo periodo ja decorreu -- "o que registamos
 * para Marco estava errado" -- `hr.pessoas.retribuicao.corrigir`, permissao a
 * parte, mais perigosa (20261201040000). A base decide pelo `valido_ate` da
 * linha (`public.hr_periodo_decorrido`); este hook nunca decide sozinho. O valor
 * base e a periodicidade da linha NAO se enviam: ficam os que la estao.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { hrFrom, hrRpc, isPermissionError } from "@/lib/hr/hrDb";
import { mensagemDeErroCargo } from "@/lib/hr/errosCargo";
import { dataDeHojeBase } from "@/lib/hr/dataBase";
import type { PessoaRetribuicao, SubsidioAlimentacaoModo } from "@/types/hr";

const COLUNAS =
  "id, pessoa_id, organization_id, vinculo_id, valor_base, moeda, periodicidade, " +
  "subsidio_alimentacao, subsidio_alimentacao_modo, duodecimos_pct, valido_de, " +
  "valido_ate, motivo, origem, created_at, updated_at";

/** O que se corrige numa versao ja decorrida (o valor base e a periodicidade ficam como estao). */
export interface CorrigirVersaoRetribuicaoPatch {
  moeda: string;
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
  void organizationId;
  const [versoes, setVersoes] = useState<PessoaRetribuicao[]>([]);
  const [loading, setLoading] = useState(true);
  const [recusado, setRecusado] = useState(false);
  const [saving, setSaving] = useState(false);
  // O pedido corrente: uma resposta so se aplica se ainda for o ultimo lancado
  // (trocar de pessoa com um pedido em voo nao pode mostrar a retribuicao da anterior).
  const pedidoCorrente = useRef(0);

  const load = useCallback(async () => {
    const pedido = ++pedidoCorrente.current;
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
    if (pedido !== pedidoCorrente.current) return;
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
    return () => {
      // Desmontar (ou trocar de pessoa) invalida o pedido em voo.
      pedidoCorrente.current += 1;
    };
  }, [load]);

  /**
   * A versao EM VIGOR HOJE: ja comecou e ainda nao acabou. Nao e "a que nao tem
   * fim": desde o fluxo 2 uma subida agendada do cargo fecha a versao actual na
   * data da subida e abre outra (futura, sem fim) -- essa e a agendada, nao a
   * actual.
   */
  // O "hoje" da base (UTC), nao o dia local: ver `dataBase.ts`.
  const hoje = dataDeHojeBase();
  const aberta =
    versoes.find((v) => v.valido_de <= hoje && (v.valido_ate === null || v.valido_ate > hoje)) ??
    null;

  /** Corre uma escrita, recarrega, e devolve `null` (sucesso) ou o texto traduzido da recusa. */
  const executar = useCallback(
    async (accao: () => Promise<{ error: unknown }>): Promise<string | null> => {
      setSaving(true);
      try {
        const { error } = await accao();
        if (error) throw error;
        await load();
        return null;
      } catch (e) {
        return await mensagemDeErroCargo(e, "hr-retribuicao-write");
      } finally {
        setSaving(false);
      }
    },
    [load],
  );

  /**
   * DEFINIR O QUE E DA PESSOA: a partir de `desde` a pessoa passa a ter este
   * subsidio (valor e modo) e estes duodecimos, com o valor base do cargo nessa
   * data. `desde` futuro e permitido. Devolve `null` ou o texto da recusa (por
   * exemplo HRC11: "atribua primeiro um cargo").
   */
  const definirPessoal = useCallback(
    (
      desde: string,
      subsidio: number | null,
      subsidioModo: SubsidioAlimentacaoModo | null,
      duodecimosPct: 0 | 50 | 100 | null,
      motivo: string | null,
    ) =>
      executar(() => {
        if (!pessoaId) return Promise.resolve({ error: new Error("Ficha sem pessoa resolvida") });
        return hrRpc("rpc_hr_retribuicao_definir_pessoal", {
          p_pessoa_id: pessoaId,
          p_desde: desde,
          p_subsidio: subsidio,
          p_subsidio_modo: subsidioModo,
          p_duodecimos_pct: duodecimosPct,
          p_motivo: motivo,
        });
      }),
    [executar, pessoaId],
  );

  /**
   * CORRIGIR: reescreve uma linha cujo periodo ja decorreu. So se chama sobre
   * uma linha com `valido_ate` no passado -- e essa condicao, avaliada pela
   * base sobre a linha ANTIGA, e que exige `hr.pessoas.retribuicao.corrigir`
   * em vez de `.edit`.
   */
  const corrigir = useCallback(
    (versaoId: string, patch: CorrigirVersaoRetribuicaoPatch) =>
      executar(async () => {
        const autorId = await resolveCurrentBusinessUserId();
        return hrFrom("pessoas_retribuicoes")
          .update({
            moeda: patch.moeda,
            subsidio_alimentacao: patch.subsidioAlimentacao,
            subsidio_alimentacao_modo: patch.subsidioAlimentacaoModo,
            duodecimos_pct: patch.duodecimosPct,
            valido_de: patch.validoDe,
            valido_ate: patch.validoAte,
            motivo: patch.motivo,
            updated_by: autorId,
          })
          .eq("id", versaoId);
      }),
    [executar],
  );

  return {
    versoes,
    aberta,
    loading,
    saving,
    recusado,
    recarregar: load,
    definirPessoal,
    corrigir,
  };
}
