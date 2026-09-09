/**
 * As ausencias de UMA pessoa: saldo, direitos, pedidos, dias, ajustes.
 *
 * SEGUE O PADRAO DE `usePessoa`
 * -----------------------------
 * Um hook carrega tudo em paralelo e os componentes nao carregam nada. Cada
 * satelite tem a sua permissao: uma recusa deixa esse bloco a vazio e o ecra
 * esconde-o -- e isso e a resposta CORRECTA e nao vai ao Sentry. Tudo o que
 * nao for recusa vai, por `captureFlowError`.
 *
 * O QUE AQUI SE ESCREVE, ESCREVE-SE POR RPC
 * -----------------------------------------
 * Cinco das sete tabelas do modulo tem escrita fechada por politicas
 * RESTRICTIVE: pedidos, decisoes, dias, ajustes e justificacoes. Um insert
 * directo e recusado pela base. As unicas escritas directas daqui sao aos
 * DIREITOS, e mesmo essas nunca para corrigir um contador -- corrigir um
 * contador e um ajuste, e um ajuste e uma RPC.
 *
 * O AVISO DOS ZEROS
 * -----------------
 * `v_hr_ausencias_saldos` e `security_invoker`: quem nao tem permissao de
 * leitura ve ZEROS e nao um erro. Por isso o hook devolve `saldosRecusados`
 * separado da lista -- sem isso o ecra escreveria "0 dias disponiveis" como
 * facto, quando o que houve foi uma recusa.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { hrFrom, hrRpc, isPermissionError } from "@/lib/hr/hrDb";
import { indexarFeriados, type FeriadoOrg, type IndiceFeriados } from "@/lib/hr/ausencias";
import type {
  AusenciaAjuste,
  AusenciaDecisao,
  AusenciaDia,
  AusenciaDireito,
  AusenciaJustificacaoRevelada,
  AusenciaPedido,
  AusenciaSaldo,
  MotivoAjuste,
} from "@/types/hrAusencias";

const COLUNAS_PEDIDO =
  "id, organization_id, pessoa_id, tipo_id, vinculo_id, data_inicio, data_fim, " +
  "meio_dia_inicio, meio_dia_fim, hora_inicio, hora_fim, dias_solicitados, motivo, estado, " +
  "aprovador_chefia_pessoa_id, criado_por_pessoa_id, origem, schedule_item_id, " +
  "periodo_inicio, periodo_fim, created_at";

const COLUNAS_DECISAO =
  "id, pedido_id, pessoa_id, organization_id, ordem, passo, resultado, " +
  "decidido_por_pessoa_id, decidido_em, motivo, ajuste_data_inicio, ajuste_data_fim, ajuste_dias";

const COLUNAS_DIA =
  "id, pedido_id, pessoa_id, organization_id, tipo_id, data, fraccao_dia, conta_saldo, " +
  "e_feriado, e_fim_semana, periodo_inicio, estado";

const COLUNAS_DIREITO =
  "id, pessoa_id, organization_id, tipo_id, vinculo_id, periodo_inicio, periodo_fim, " +
  "dias_direito, minutos_direito, origem, notas";

const COLUNAS_AJUSTE =
  "id, pessoa_id, organization_id, tipo_id, periodo_inicio, periodo_fim, dias, " +
  "motivo_codigo, motivo, documento_ref, aplicado_em, anulado_em, anulacao_motivo";

const COLUNAS_SALDO =
  "pessoa_id, organization_id, tipo_id, periodo_inicio, adquiridos, ajustes, " +
  "utilizados, pendentes, disponiveis";

interface Satelite<T> {
  linhas: T[];
  recusado: boolean;
}

const VAZIO = <T,>(): Satelite<T> => ({ linhas: [], recusado: false });

async function carregar<T>(
  tabela: string,
  colunas: string,
  aplicar: (query: any) => any,
): Promise<Satelite<T>> {
  const { data, error } = await aplicar(hrFrom(tabela).select(colunas));
  if (error) {
    if (isPermissionError(error)) return { linhas: [], recusado: true };
    captureFlowError(error, "hr-ausencias-load");
    return { linhas: [], recusado: false };
  }
  return { linhas: (data ?? []) as T[], recusado: false };
}

export interface AusenciasDaPessoa {
  pedidos: AusenciaPedido[];
  decisoesPorPedido: Map<string, AusenciaDecisao[]>;
  dias: AusenciaDia[];
  direitos: AusenciaDireito[];
  ajustes: AusenciaAjuste[];
  saldos: AusenciaSaldo[];
  feriados: IndiceFeriados;
  loading: boolean;
  saving: boolean;
  /** Distingue "sem linhas" de "sem permissao". Ver o comentario do topo. */
  saldosRecusados: boolean;
  ajustesRecusados: boolean;
  direitosRecusados: boolean;
  recarregar: () => Promise<void>;
}

export function useAusenciasDaPessoa(pessoaId: string | undefined) {
  const { activeCompany } = useCompany();
  const orgId = activeCompany?.id ?? null;

  const [pedidos, setPedidos] = useState<AusenciaPedido[]>([]);
  const [decisoes, setDecisoes] = useState<AusenciaDecisao[]>([]);
  const [dias, setDias] = useState<AusenciaDia[]>([]);
  const [direitos, setDireitos] = useState<Satelite<AusenciaDireito>>(VAZIO<AusenciaDireito>());
  const [ajustes, setAjustes] = useState<Satelite<AusenciaAjuste>>(VAZIO<AusenciaAjuste>());
  const [saldos, setSaldos] = useState<Satelite<AusenciaSaldo>>(VAZIO<AusenciaSaldo>());
  const [feriados, setFeriados] = useState<IndiceFeriados>(() => indexarFeriados([]));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!pessoaId || !orgId) {
      setPedidos([]);
      setDecisoes([]);
      setDias([]);
      setDireitos(VAZIO<AusenciaDireito>());
      setAjustes(VAZIO<AusenciaAjuste>());
      setSaldos(VAZIO<AusenciaSaldo>());
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [osPedidos, asDecisoes, osDias, osDireitos, osAjustes, osSaldos, osFeriados] =
        await Promise.all([
          carregar<AusenciaPedido>("pessoas_ausencias_pedidos", COLUNAS_PEDIDO, (q) =>
            q.eq("pessoa_id", pessoaId).order("data_inicio", { ascending: false }),
          ),
          carregar<AusenciaDecisao>("pessoas_ausencias_pedido_decisoes", COLUNAS_DECISAO, (q) =>
            q.eq("pessoa_id", pessoaId).order("decidido_em", { ascending: true }),
          ),
          carregar<AusenciaDia>("pessoas_ausencias_dias", COLUNAS_DIA, (q) =>
            q.eq("pessoa_id", pessoaId).order("data", { ascending: true }),
          ),
          carregar<AusenciaDireito>("pessoas_ausencias_direitos", COLUNAS_DIREITO, (q) =>
            q.eq("pessoa_id", pessoaId).is("deleted_at", null).order("periodo_inicio", {
              ascending: false,
            }),
          ),
          carregar<AusenciaAjuste>("pessoas_ausencias_ajustes", COLUNAS_AJUSTE, (q) =>
            q.eq("pessoa_id", pessoaId).order("aplicado_em", { ascending: false }),
          ),
          carregar<AusenciaSaldo>("v_hr_ausencias_saldos", COLUNAS_SALDO, (q) =>
            q.eq("pessoa_id", pessoaId).eq("organization_id", orgId),
          ),
          carregar<FeriadoOrg>("schedule_holidays", "holiday_date, is_recurring", (q) =>
            q.eq("organization_id", orgId),
          ),
        ]);

      setPedidos(osPedidos.linhas);
      setDecisoes(asDecisoes.linhas);
      setDias(osDias.linhas);
      setDireitos(osDireitos);
      setAjustes(osAjustes);
      setSaldos(osSaldos);
      setFeriados(indexarFeriados(osFeriados.linhas));
    } catch (e) {
      captureFlowError(e, "hr-ausencias-load");
    } finally {
      setLoading(false);
    }
  }, [pessoaId, orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Devolve `null` em sucesso, ou a mensagem amigavel. Nunca so no console. */
  const executar = useCallback(
    async (accao: () => Promise<{ error: unknown }>): Promise<string | null> => {
      setSaving(true);
      try {
        const { error } = await accao();
        if (error) throw error;
        await load();
        return null;
      } catch (e) {
        if (!isPermissionError(e)) captureFlowError(e, "hr-ausencias-write");
        return await getFriendlyErrorMessage(e);
      } finally {
        setSaving(false);
      }
    },
    [load],
  );

  const pedir = useCallback(
    (args: {
      tipoId: string;
      dataInicio: string;
      dataFim: string;
      meioDiaInicio: boolean;
      meioDiaFim: boolean;
      motivo: string | null;
      vinculoId?: string | null;
      origem?: "board" | "ficha";
    }) =>
      executar(() =>
        hrRpc("rpc_hr_ausencia_pedir", {
          _organization_id: orgId,
          _pessoa_id: pessoaId,
          _tipo_id: args.tipoId,
          _data_inicio: args.dataInicio,
          _data_fim: args.dataFim,
          _meio_dia_inicio: args.meioDiaInicio,
          _meio_dia_fim: args.meioDiaFim,
          _hora_inicio: null,
          _hora_fim: null,
          _motivo: args.motivo,
          _vinculo_id: args.vinculoId ?? null,
          _origem: args.origem ?? "ficha",
        }),
      ),
    [executar, orgId, pessoaId],
  );

  const cancelar = useCallback(
    (pedidoId: string, motivo: string) =>
      executar(() =>
        hrRpc("rpc_hr_ausencia_cancelar", { _pedido_id: pedidoId, _motivo: motivo }),
      ),
    [executar],
  );

  /**
   * Nesta ronda corrigir um aprovado NAO reescreve datas: cancela com rasto e
   * obriga a pedir de novo. O ecra tem de dizer isso -- chamar-lhe "editar"
   * seria mentir.
   */
  const corrigirAprovado = useCallback(
    (pedidoId: string, motivo: string) =>
      executar(() =>
        hrRpc("rpc_hr_ausencia_corrigir_aprovado", { _pedido_id: pedidoId, _motivo: motivo }),
      ),
    [executar],
  );

  const decidirChefia = useCallback(
    (args: {
      pedidoId: string;
      resultado: "aprovado" | "recusado" | "ajustado";
      motivo?: string | null;
      ajusteDataInicio?: string | null;
      ajusteDataFim?: string | null;
    }) =>
      executar(() =>
        hrRpc("rpc_hr_ausencia_decidir_chefia", {
          _pedido_id: args.pedidoId,
          _resultado: args.resultado,
          _motivo: args.motivo ?? null,
          _ajuste_data_inicio: args.ajusteDataInicio ?? null,
          _ajuste_data_fim: args.ajusteDataFim ?? null,
        }),
      ),
    [executar],
  );

  const decidirRh = useCallback(
    (args: {
      pedidoId: string;
      resultado: "aprovado" | "recusado" | "devolvido";
      motivo?: string | null;
    }) =>
      executar(() =>
        hrRpc("rpc_hr_ausencia_decidir_rh", {
          _pedido_id: args.pedidoId,
          _resultado: args.resultado,
          _motivo: args.motivo ?? null,
        }),
      ),
    [executar],
  );

  const ajustarSaldo = useCallback(
    (args: {
      tipoId: string;
      periodoInicio: string;
      periodoFim: string;
      dias: number;
      motivoCodigo: MotivoAjuste;
      motivo: string;
      documentoRef?: string | null;
    }) =>
      executar(() =>
        hrRpc("rpc_hr_ausencia_ajustar_saldo", {
          _organization_id: orgId,
          _pessoa_id: pessoaId,
          _tipo_id: args.tipoId,
          _periodo_inicio: args.periodoInicio,
          _periodo_fim: args.periodoFim,
          _dias: args.dias,
          _motivo_codigo: args.motivoCodigo,
          _motivo: args.motivo,
          _documento_ref: args.documentoRef ?? null,
        }),
      ),
    [executar, orgId, pessoaId],
  );

  const anularAjuste = useCallback(
    (ajusteId: string, motivo: string) =>
      executar(() =>
        hrRpc("rpc_hr_ausencia_anular_ajuste", { _ajuste_id: ajusteId, _motivo: motivo }),
      ),
    [executar],
  );

  /** Direitos tem escrita DIRECTA. Nunca para corrigir contador: isso e ajuste. */
  const guardarDireito = useCallback(
    (args: {
      id?: string;
      tipoId: string;
      periodoInicio: string;
      periodoFim: string;
      diasDireito: number;
      origem: AusenciaDireito["origem"];
      notas?: string | null;
    }) =>
      executar(async () => {
        const autorId = await resolveCurrentBusinessUserId();
        if (args.id) {
          return hrFrom("pessoas_ausencias_direitos")
            .update({
              periodo_inicio: args.periodoInicio,
              periodo_fim: args.periodoFim,
              dias_direito: args.diasDireito,
              origem: args.origem,
              notas: args.notas ?? null,
              updated_by: autorId,
            })
            .eq("id", args.id);
        }
        return hrFrom("pessoas_ausencias_direitos").insert({
          pessoa_id: pessoaId,
          organization_id: orgId,
          tipo_id: args.tipoId,
          periodo_inicio: args.periodoInicio,
          periodo_fim: args.periodoFim,
          dias_direito: args.diasDireito,
          origem: args.origem,
          notas: args.notas ?? null,
          created_by: autorId,
          updated_by: autorId,
        });
      }),
    [executar, orgId, pessoaId],
  );

  /**
   * A justificacao em claro, uma vez, sob registo em `pessoas_acessos_sensiveis`.
   * NUNCA chamar ao carregar o ecra: e o mesmo padrao do NISS e do IBAN.
   */
  const revelarJustificacao = useCallback(
    async (pedidoId: string): Promise<AusenciaJustificacaoRevelada[]> => {
      const { data, error } = await hrRpc("rpc_hr_ausencia_ver_justificacao", {
        _pedido_id: pedidoId,
      });
      if (error) {
        if (!isPermissionError(error)) captureFlowError(error, "hr-ausencias-write");
        throw error;
      }
      return (data ?? []) as AusenciaJustificacaoRevelada[];
    },
    [],
  );

  const decisoesPorPedido = useMemo(() => {
    const mapa = new Map<string, AusenciaDecisao[]>();
    for (const decisao of decisoes) {
      const lista = mapa.get(decisao.pedido_id);
      if (lista) lista.push(decisao);
      else mapa.set(decisao.pedido_id, [decisao]);
    }
    return mapa;
  }, [decisoes]);

  return {
    pedidos,
    decisoesPorPedido,
    dias,
    direitos: direitos.linhas,
    direitosRecusados: direitos.recusado,
    ajustes: ajustes.linhas,
    ajustesRecusados: ajustes.recusado,
    saldos: saldos.linhas,
    saldosRecusados: saldos.recusado,
    feriados,
    loading,
    saving,
    recarregar: load,
    pedir,
    cancelar,
    corrigirAprovado,
    decidirChefia,
    decidirRh,
    ajustarSaldo,
    anularAjuste,
    guardarDireito,
    revelarJustificacao,
  };
}
