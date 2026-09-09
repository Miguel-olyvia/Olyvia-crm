/**
 * As ausencias vistas de cima: a fila de quem decide e o mapa da organizacao.
 *
 * QUEM VE O QUE, DECIDE-O A BASE
 * ------------------------------
 * Este hook nao filtra por cadeia de chefia nenhuma. A RLS de
 * `pessoas_ausencias_pedidos` tem tres ramos -- `hr.ausencias.view` (a
 * organizacao toda), a propria pessoa, e a cadeia de chefia por
 * `hr_ausencias_pessoa_na_minha_cadeia`. Replicar a regra no cliente daria
 * duas versoes da mesma coisa, e a que estivesse errada seria a do cliente.
 * Le-se tudo o que a base deixa e mostra-se.
 *
 * Uma lista vazia aqui NAO prova que nao ha pedidos: pode ser falta de
 * permissao. Por isso `recusado` vem separado.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import { hrFrom, hrRpc, isPermissionError } from "@/lib/hr/hrDb";
import type { AusenciaDecisao, AusenciaDia, AusenciaPedido } from "@/types/hrAusencias";

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

export interface OpcoesOrganizacao {
  /** Janela para os dias do mapa. Sem ela nao se carregam dias nenhuns. */
  anoDoMapa?: number;
}

export function useAusenciasDaOrganizacao(opcoes: OpcoesOrganizacao = {}) {
  const { activeCompany } = useCompany();
  const orgId = activeCompany?.id ?? null;
  const ano = opcoes.anoDoMapa;

  const [pedidos, setPedidos] = useState<AusenciaPedido[]>([]);
  const [decisoes, setDecisoes] = useState<AusenciaDecisao[]>([]);
  const [dias, setDias] = useState<AusenciaDia[]>([]);
  const [loading, setLoading] = useState(true);
  const [recusado, setRecusado] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) {
      setPedidos([]);
      setDecisoes([]);
      setDias([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setRecusado(false);
    try {
      const { data, error } = await hrFrom("pessoas_ausencias_pedidos")
        .select(COLUNAS_PEDIDO)
        .eq("organization_id", orgId)
        .order("data_inicio", { ascending: false })
        .limit(500);

      if (error) {
        if (isPermissionError(error)) setRecusado(true);
        else captureFlowError(error, "hr-ausencias-load");
        setPedidos([]);
      } else {
        setPedidos((data ?? []) as AusenciaPedido[]);
      }

      const { data: linhasDecisao, error: erroDecisao } = await hrFrom(
        "pessoas_ausencias_pedido_decisoes",
      )
        .select(COLUNAS_DECISAO)
        .eq("organization_id", orgId)
        .order("decidido_em", { ascending: true })
        .limit(2000);
      if (erroDecisao && !isPermissionError(erroDecisao)) {
        captureFlowError(erroDecisao, "hr-ausencias-load");
      }
      setDecisoes((linhasDecisao ?? []) as AusenciaDecisao[]);

      if (ano) {
        const { data: linhasDia, error: erroDia } = await hrFrom("pessoas_ausencias_dias")
          .select(COLUNAS_DIA)
          .eq("organization_id", orgId)
          .gte("data", `${ano}-01-01`)
          .lte("data", `${ano}-12-31`)
          .limit(20000);
        if (erroDia && !isPermissionError(erroDia)) captureFlowError(erroDia, "hr-ausencias-load");
        setDias((linhasDia ?? []) as AusenciaDia[]);
      } else {
        setDias([]);
      }
    } catch (e) {
      captureFlowError(e, "hr-ausencias-load");
    } finally {
      setLoading(false);
    }
  }, [orgId, ano]);

  useEffect(() => {
    void load();
  }, [load]);

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

  const cancelar = useCallback(
    (pedidoId: string, motivo: string) =>
      executar(() => hrRpc("rpc_hr_ausencia_cancelar", { _pedido_id: pedidoId, _motivo: motivo })),
    [executar],
  );

  const corrigirAprovado = useCallback(
    (pedidoId: string, motivo: string) =>
      executar(() =>
        hrRpc("rpc_hr_ausencia_corrigir_aprovado", { _pedido_id: pedidoId, _motivo: motivo }),
      ),
    [executar],
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

  const pendentes = useMemo(
    () =>
      pedidos.filter(
        (pedido) => pedido.estado === "pendente_chefia" || pedido.estado === "pendente_rh",
      ),
    [pedidos],
  );

  return {
    pedidos,
    pendentes,
    decisoesPorPedido,
    dias,
    loading,
    recusado,
    saving,
    recarregar: load,
    decidirChefia,
    decidirRh,
    cancelar,
    corrigirAprovado,
  };
}
