/**
 * As regras do PERIODO DA FOLHA da organizacao activa (20270107200000): o dia de inicio (1 a 28), versionado.
 *
 * TUDO POR RPC: le por `rpc_hr_periodo_folha_regras_listar` (hr.processamento.periodo.view) e grava por
 * `rpc_hr_periodo_folha_regra_guardar` (hr.processamento.periodo.gerir). A tabela nao tem politicas nem GRANT.
 *
 * ENQUANTO A MIGRATION NAO ESTIVER APLICADA as RPCs nao existem (PGRST202 / 42883): `estado` e "indisponivel", a lista e
 * vazia e o resto do ecra continua a funcionar com o dia de inicio 1 (mes de calendario, o comportamento de sempre). Uma
 * recusa de permissao da o mesmo, sem erro; so uma falha de rede e reportada.
 */
import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { hrRpc, isPermissionError } from "@/lib/hr/hrDb";
import { rpcIndisponivel } from "@/lib/hr/justificacaoDia";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { diaInicioEmVigor, type RegraPeriodoFolha } from "@/lib/hr/periodoFolha";
import { invalidarPrazoDaJustificacao } from "@/lib/hr/prazoCache";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";

export interface RegraPeriodoFolhaLista extends RegraPeriodoFolha {
  id: string;
  em_vigor: boolean;
  criada_em: string;
  criada_por_nome: string | null;
}

export type EstadoDasRegrasDoPeriodo = "ok" | "indisponivel" | "recusado" | "erro";

interface Lido {
  regras: RegraPeriodoFolhaLista[];
  estado: EstadoDasRegrasDoPeriodo;
}

const SEM_REGRAS = (estado: Exclude<EstadoDasRegrasDoPeriodo, "ok">): Lido => ({ regras: [], estado });
const STALE_TIME_MS = 5 * 60 * 1000;
/** Uma lista vazia estavel: sem ela cada render criava uma nova e refazia os calculos que dependem das regras. */
const NENHUMA_REGRA: RegraPeriodoFolhaLista[] = [];

/** Os prefixos que as RPCs levantam (20270107200000), traduzidos em chave. */
const PREFIXOS: ReadonlyArray<[string, string]> = [
  ["periodo_folha_regra_retroactiva", "hr.periodoFolha.erro.retroactiva"],
  ["periodo_folha_dia_invalido", "hr.periodoFolha.erro.diaInvalido"],
  ["periodo_folha_valido_de_invalido", "hr.periodoFolha.erro.validoDeInvalido"],
  ["periodo_folha_intervalo_invalido", "hr.periodoFolha.erro.intervaloInvalido"],
  ["periodo_folha_sobreposto", "hr.periodoFolha.erro.sobreposto"],
  ["periodo_folha_regra_imutavel", "hr.periodoFolha.erro.imutavel"],
  ["periodo_folha_datas_imutaveis", "hr.periodoFolha.erro.imutavel"],
  ["periodo_folha_dados_em_falta", "hr.periodoFolha.erro.dadosEmFalta"],
  ["periodo_folha_sem_permissao", "hr.periodoFolha.erro.semPermissao"],
  ["periodo_folha_sem_sessao", "hr.periodoFolha.erro.semPermissao"],
  ["periodo_folha_sem_utilizador", "hr.periodoFolha.erro.semPermissao"],
];

const mensagemDe = (erro: unknown): string =>
  typeof erro === "string"
    ? erro
    : typeof (erro as { message?: unknown } | null)?.message === "string"
      ? (erro as { message: string }).message
      : "";

/** A chave de traducao do erro, ou `null` se nao o reconhece. */
export function chaveDoErroDoPeriodoFolha(erro: unknown): string | null {
  const mensagem = mensagemDe(erro);
  if (!mensagem) return null;
  return PREFIXOS.find(([prefixo]) => mensagem.includes(prefixo))?.[1] ?? null;
}

/** O que sai de gravar: `null` em sucesso, ou uma chave de traducao / mensagem amigavel ja escrita. */
export interface ResultadoDeGuardarPeriodo {
  erro: string | null;
}

export function usePeriodoFolhaRegras() {
  const { activeCompany } = useCompany();
  const queryClient = useQueryClient();
  const orgId = activeCompany?.id ?? null;
  const queryKey = useMemo(() => ["hr-periodo-folha-regras", orgId] as const, [orgId]);

  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async (): Promise<Lido> => {
      try {
        const { data: linhas, error } = await hrRpc("rpc_hr_periodo_folha_regras_listar", { _organization_id: orgId });
        if (error) {
          if (rpcIndisponivel(error)) return SEM_REGRAS("indisponivel");
          if (isPermissionError(error)) return SEM_REGRAS("recusado");
          captureFlowError(error, "hr-periodo-folha-regras-load");
          return SEM_REGRAS("erro");
        }
        return { regras: (Array.isArray(linhas) ? linhas : []) as RegraPeriodoFolhaLista[], estado: "ok" };
      } catch (e) {
        captureFlowError(e, "hr-periodo-folha-regras-load");
        return SEM_REGRAS("erro");
      }
    },
    enabled: !!orgId,
    staleTime: (query) => (query.state.data?.estado === "erro" ? 0 : STALE_TIME_MS),
  });

  const regras = data?.regras ?? NENHUMA_REGRA;
  const estado: EstadoDasRegrasDoPeriodo = data?.estado ?? "ok";

  const guardarMutation = useMutation({
    mutationFn: async (args: { diaInicio: number; validoDe: string }): Promise<void> => {
      const { error } = await hrRpc("rpc_hr_periodo_folha_regra_guardar", {
        _organization_id: orgId,
        _dia_inicio: args.diaInicio,
        _valido_de: args.validoDe,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey });
      // Uma regra nova muda o fim dos periodos futuros: o prazo guardado em cache deixa de valer.
      invalidarPrazoDaJustificacao(orgId);
    },
  });

  /** Grava o dia de inicio a partir da folha do mes `validoDe` (dia 1). Nunca lanca. */
  const guardar = useCallback(
    async (diaInicio: number, validoDe: string): Promise<ResultadoDeGuardarPeriodo> => {
      if (!orgId) return { erro: "hr.periodoFolha.erro.semOrganizacao" };
      try {
        await guardarMutation.mutateAsync({ diaInicio, validoDe });
        return { erro: null };
      } catch (e) {
        if (rpcIndisponivel(e)) return { erro: "hr.periodoFolha.indisponivel" };
        const chave = chaveDoErroDoPeriodoFolha(e);
        if (chave) return { erro: chave };
        if (isPermissionError(e)) return { erro: "hr.periodoFolha.erro.semPermissao" };
        captureFlowError(e, "hr-periodo-folha-regra-write");
        return { erro: await getFriendlyErrorMessage(e) };
      }
    },
    [orgId, guardarMutation],
  );

  return {
    regras,
    estado,
    isLoading,
    isSaving: guardarMutation.isPending,
    guardar,
    /** Repete a leitura (para o «Tentar de novo» depois de uma falha de rede). */
    recarregar: refetch,
    /** O dia de inicio em vigor para a folha do mes (ano, mes): 1 sem regra, ou com a leitura por fazer. */
    diaInicioDoMes: (ano: number, mes: number) => diaInicioEmVigor(regras, ano, mes),
  };
}
