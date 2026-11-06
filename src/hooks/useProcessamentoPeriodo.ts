/**
 * O periodo de processamento salarial (`hr_periodos_processamento`,
 * 20261201220000) de UM mes/ano da organizacao activa -- abrir e fechar.
 *
 * ESCRITA SO POR RPC
 * -------------------
 * A tabela bloqueia INSERT/UPDATE directo a `authenticated`; abrir e fechar
 * passam sempre por `rpc_hr_processamento_periodo_abrir` /
 * `rpc_hr_processamento_periodo_fechar(p_periodo_id, p_resultados)`: fechar grava o resultado de cada pessoa.
 * Fechar e irreversivel nesta fase --
 * ver o cabecalho da migracao 20261201220000 (sem reabertura auditada ainda).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import { hrFrom, hrRpc, isPermissionError } from "@/lib/hr/hrDb";
import { invalidarPrazoDaJustificacao } from "@/lib/hr/prazoCache";
import { mensagemDeErroDoFecho, mensagemDeOperacaoSemRelida, type ResultadoParaGravar } from "@/lib/hr/resultadosFecho";
import type { HrPeriodoProcessamento } from "@/types/hr";

const COLUNAS_ANTIGAS =
  "id, organization_id, ano, mes, estado, fechado_em, fechado_por, created_at, created_by";
/** O periodo da folha tem datas proprias (20270107200000): (ano, mes) e o mes do FECHO e o intervalo vai de data_inicio a data_fim. */
const COLUNAS = `${COLUNAS_ANTIGAS}, data_inicio, data_fim`;

/** 42703 = coluna inexistente, e so por causa de data_inicio / data_fim: a migration das datas ainda nao esta aplicada. */
const colunaInexistente = (erro: unknown): boolean => {
  if (!erro || typeof erro !== "object") return false;
  const { code, message } = erro as { code?: unknown; message?: unknown };
  return code === "42703" && typeof message === "string" && /data_(inicio|fim)/.test(message);
};

export function useProcessamentoPeriodo(ano: number, mes: number) {
  const { activeCompany } = useCompany();
  const orgId = activeCompany?.id;

  const [periodo, setPeriodo] = useState<HrPeriodoProcessamento | null>(null);
  const [loading, setLoading] = useState(true);
  const [recusado, setRecusado] = useState(false);
  const [saving, setSaving] = useState(false);
  // A releitura (depois de abrir/fechar, ou ao mudar de mes) falhou: o que o ecra mostra pode nao ser o estado real do periodo.
  const [desactualizado, setDesactualizado] = useState(false);

  // Conta os pedidos: so a resposta do mais recente escreve no estado (mudar de mes durante uma releitura).
  const ultimoPedido = useRef(0);

  /**
   * `silencioso`: reler depois de abrir/fechar. NAO poe `loading` a true -- o ecra trocaria a tabela por um
   * loader, desmontaria tudo o que depende do periodo (e repetiria os pedidos de assiduidade) so porque o estado
   * do periodo mudou. `loading` e so o primeiro carregamento de uma organizacao/mes.
   */
  const load = useCallback(async (silencioso = false): Promise<boolean> => {
    const pedido = ++ultimoPedido.current;
    if (!orgId) {
      setPeriodo(null);
      setLoading(false);
      return true;
    }
    if (!silencioso) setLoading(true);
    const ler = (colunas: string) =>
      hrFrom("hr_periodos_processamento")
        .select(colunas)
        .eq("organization_id", orgId)
        .eq("ano", ano)
        .eq("mes", mes)
        .maybeSingle();
    let { data, error } = await ler(COLUNAS);
    // Base ainda sem as datas: le como antes (o ecra cai para o mes de calendario).
    if (colunaInexistente(error)) ({ data, error } = await ler(COLUNAS_ANTIGAS));
    // Outro pedido tomou o lugar deste: quem manda e o mais recente (nao e uma falha desta leitura).
    if (pedido !== ultimoPedido.current) return true;
    let leuBem = true;
    if (error) {
      leuBem = false;
      if (isPermissionError(error)) {
        setRecusado(true);
        setPeriodo(null);
      } else {
        captureFlowError(error, "hr-processamento-periodo-load");
      }
    } else {
      setRecusado(false);
      setPeriodo((data ?? null) as HrPeriodoProcessamento | null);
    }
    setDesactualizado(!leuBem);
    setLoading(false);
    return leuBem;
  }, [orgId, ano, mes]);

  useEffect(() => {
    void load();
  }, [load]);

  const recarregar = useCallback(() => load(true), [load]);

  const executar = useCallback(
    async (accao: () => Promise<{ data?: unknown; error: unknown }>): Promise<string | null> => {
      setSaving(true);
      try {
        const { error } = await accao();
        if (error) throw error;
        // Abrir ou fechar muda o prazo de justificar dos dias deste periodo.
        invalidarPrazoDaJustificacao(orgId);
        // A RPC JA correu (o periodo mudou na base). Se a releitura falhar, o ecra ficaria a mostrar o estado antigo
        // com um aviso de sucesso por cima: devolve-se um aviso proprio (nao «sucesso») a dizer que e preciso atualizar.
        const releuBem = await load(true);
        return releuBem ? null : mensagemDeOperacaoSemRelida();
      } catch (e) {
        if (!isPermissionError(e)) captureFlowError(e, "hr-processamento-periodo-write");
        return mensagemDeErroDoFecho(e) ?? (await getFriendlyErrorMessage(e));
      } finally {
        setSaving(false);
      }
    },
    [load, orgId],
  );

  const abrir = useCallback(
    () =>
      executar(() => {
        if (!orgId) return Promise.resolve({ error: new Error("Sem organizacao activa") });
        return hrRpc("rpc_hr_processamento_periodo_abrir", {
          p_organization_id: orgId,
          p_ano: ano,
          p_mes: mes,
        });
      }),
    [executar, orgId, ano, mes],
  );

  /**
   * Fecha o periodo e GRAVA o resultado de cada pessoa (`p_resultados`, ver `resultadosFecho.ts`) na mesma transaccao.
   * Se a RPC recusar, o periodo fica aberto e o erro volta em portugues claro.
   */
  const fechar = useCallback(
    (resultados: readonly ResultadoParaGravar[]) =>
      executar(() => {
        if (!periodo) return Promise.resolve({ error: new Error("Sem periodo para fechar") });
        return hrRpc("rpc_hr_processamento_periodo_fechar", { p_periodo_id: periodo.id, p_resultados: resultados });
      }),
    [executar, periodo],
  );

  return {
    periodo,
    loading,
    saving,
    recusado,
    /** A ultima releitura falhou: o periodo mostrado pode estar desatualizado (ha que atualizar o ecra). */
    desactualizado,
    recarregar,
    abrir,
    fechar,
  };
}

export type ProcessamentoPeriodo = ReturnType<typeof useProcessamentoPeriodo>;
