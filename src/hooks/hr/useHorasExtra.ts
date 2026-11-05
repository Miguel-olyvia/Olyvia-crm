/**
 * As horas extra de uma organizacao, lidas e escritas so pelas RPCs `rpc_hr_horas_extra_*` (as tabelas nao se tocam):
 *  - listar: `hr.assiduidade.view` ve todas; `hr.assiduidade.view.own` so as da propria pessoa.
 *  - decidir (confirmar/rejeitar), registar, detetar, guardar limites e autorizar: `hr.assiduidade.gerir`. Quem decide nunca
 *    decide sobre si proprio (HRA75). Rejeitar, e confirmar acima do limite ou sem autorizacao, exigem motivo (3 a 500).
 *  - detetar: compara o horario planeado com o realizado e cria UMA hora extra por pessoa, dia e origem. Para a organizacao
 *    inteira a base recusa mais de 31 dias (HRA84): este hook parte o intervalo (organizacao: semanas; pessoa: 62 dias) e soma as respostas.
 * O ecra so recebe TEXTO traduzido, nunca o codigo em bruto nem a mensagem da base. Defeitos (rede, sem codigo legivel) vao
 * para o registo; recusas de negocio (permissao, estado, limite) nao.
 */
import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { captureFlowError, type BusinessFlow } from "@/lib/observability/captureFlowError";
import { getLocalizedFallback } from "@/utils/friendlyError";
import type { EstadoHoraExtra, HoraExtra, LimitesHE } from "@/components/rh-exemplo/fluxosC/horasExtraRegras";
import {
  DIAS_JANELA_SEMANAL, MAX_JANELAS_DETECAO, MOTIVO_MIN, RESUMO_VAZIO, SUCESSO_HE,
  chaveDoErroHorasExtra, codigoDeErroHorasExtra, diasDoIntervalo, horaExtraDaLinha, janelasDoIntervalo, limitesDaLinha, planoDeDeteccao,
  resumoDaResposta, saldoDaLinha, somarResumos,
  type LinhaConfigHE, type LinhaHoraExtra, type LinhaSaldoHE, type ResultadoHE, type ResumoDeteccao, type SaldoHE,
} from "@/lib/hr/horasExtraBase";

export const CHAVE_HORAS_EXTRA = "hr-horas-extra";

/**
 * O cliente da base so se carrega quando se vai mesmo chamar uma RPC: o prototipo de RH (sem base) chega a este ficheiro pelos
 * ecras partilhados e nao pode importar o cliente Supabase ao carregar o modulo.
 */
async function rpc(fn: string, args?: Record<string, unknown>): Promise<{ data: any; error: any }> {
  const { hrRpc } = await import("@/lib/hr/hrDb");
  return hrRpc(fn, args);
}
const MOTIVO_MAX_DECIDIR = 500;
const MOTIVO_MAX_REGISTAR = 200;
const LIMITE_PAGINA = 500;
const SEM_HORAS: HoraExtra[] = [];

/** O texto traduzido de um erro de uma RPC; defeitos vao para o registo, recusas de negocio nao. */
function textoDoErro(erro: unknown, origem: BusinessFlow): string {
  const codigo = codigoDeErroHorasExtra(erro);
  if (codigo === null) captureFlowError(erro, origem);
  return getLocalizedFallback(chaveDoErroHorasExtra(codigo));
}

const falha = (erro: unknown, origem: BusinessFlow): ResultadoHE => ({ ok: false, erro: textoDoErro(erro, origem) });
const recusa = (codigo: string): ResultadoHE => ({ ok: false, erro: getLocalizedFallback(chaveDoErroHorasExtra(codigo)) });

/* ------------------------------------------------------------------ listar */
export interface FiltrosHorasExtra {
  estado?: EstadoHoraExtra | null;
  pessoaId?: string | null;
  de?: string | null;
  ate?: string | null;
  /** Falso: nao pede nada. */
  enabled?: boolean;
}

export interface ListaHorasExtra {
  /** Vazio enquanto carrega, ou quando a leitura falhou. */
  horas: HoraExtra[];
  /** Quantas ha no total para este filtro (pode ser mais do que `horas`, que vem em paginas de 500). */
  total: number;
  aCarregar: boolean;
  /** O texto traduzido da falha de leitura; `null` quando correu bem. */
  erro: string | null;
  recarregar: () => Promise<unknown>;
}

/**
 * A leitura de uma pagina (ate 500) de horas extra, sem hooks: serve `useHorasExtraListar` e a fila de trabalho.
 * Lanca `Error` com o texto traduzido quando a base falha.
 */
export async function lerHorasExtra(
  organizationId: string | null,
  { estado = null, pessoaId = null, de = null, ate = null }: Omit<FiltrosHorasExtra, "enabled"> = {},
): Promise<{ horas: HoraExtra[]; total: number }> {
  const { data, error } = await rpc("rpc_hr_horas_extra_listar", {
    p_organization_id: organizationId,
    p_estado: estado,
    p_pessoa_id: pessoaId,
    p_data_de: de,
    p_data_ate: ate,
    p_limite: LIMITE_PAGINA,
    p_offset: 0,
  });
  if (error || !data) throw new Error(textoDoErro(error, "hr-horas-extra-listar"));
  const linhas = (Array.isArray(data.linhas) ? data.linhas : []) as LinhaHoraExtra[];
  return { horas: linhas.map(horaExtraDaLinha), total: Number(data.total ?? linhas.length) };
}

export function useHorasExtraListar({ estado = null, pessoaId = null, de = null, ate = null, enabled = true }: FiltrosHorasExtra = {}): ListaHorasExtra {
  const { activeCompany } = useCompany();
  const organizationId = activeCompany?.id ?? null;
  const consulta = useQuery({
    queryKey: [CHAVE_HORAS_EXTRA, organizationId, "lista", estado, pessoaId, de, ate],
    enabled: enabled && organizationId !== null,
    retry: false,
    queryFn: (): Promise<{ horas: HoraExtra[]; total: number }> => lerHorasExtra(organizationId, { estado, pessoaId, de, ate }),
  });
  return {
    horas: consulta.data?.horas ?? SEM_HORAS,
    total: consulta.data?.total ?? 0,
    aCarregar: consulta.isLoading,
    erro: consulta.error ? (consulta.error as Error).message : null,
    recarregar: consulta.refetch,
  };
}

/* ------------------------------------------------------------------ saldo */
export interface SaldoHorasExtraHook {
  saldo: SaldoHE | null;
  aCarregar: boolean;
  erro: string | null;
}

export function useHorasExtraSaldo(pessoaId: string | null | undefined, ano: number | null = null, enabled = true): SaldoHorasExtraHook {
  const { activeCompany } = useCompany();
  const organizationId = activeCompany?.id ?? null;
  const consulta = useQuery({
    queryKey: [CHAVE_HORAS_EXTRA, organizationId, "saldo", pessoaId ?? null, ano],
    enabled: enabled && organizationId !== null && Boolean(pessoaId),
    retry: false,
    queryFn: async (): Promise<SaldoHE> => {
      const { data, error } = await rpc("rpc_hr_horas_extra_saldo", { p_organization_id: organizationId, p_pessoa_id: pessoaId, p_ano: ano });
      if (error || !data) throw new Error(textoDoErro(error, "hr-horas-extra-saldo"));
      return saldoDaLinha(data as LinhaSaldoHE);
    },
  });
  return { saldo: consulta.data ?? null, aCarregar: consulta.isLoading, erro: consulta.error ? (consulta.error as Error).message : null };
}

/* ------------------------------------------------------------------ limites da organizacao */
export interface ConfigHorasExtraHook {
  /** `null` enquanto carrega, ou quando a leitura falhou (por exemplo sem a permissao de ver). */
  limites: LimitesHE | null;
  /** Verdadeiro: a organizacao ainda nao guardou nada e estes sao os valores de omissao da base. */
  omissao: boolean;
  aCarregar: boolean;
  /** Verdadeiro enquanto um `guardar` esta a correr (o botao fica bloqueado). */
  aGuardar: boolean;
  erro: string | null;
  guardar: (novos: LimitesHE) => Promise<ResultadoHE>;
}

export function useHorasExtraConfig(enabled = true): ConfigHorasExtraHook {
  const { activeCompany } = useCompany();
  const organizationId = activeCompany?.id ?? null;
  const queryClient = useQueryClient();
  const ocupado = useRef(false);
  const [aGuardar, setAGuardar] = useState(false);
  const consulta = useQuery({
    queryKey: [CHAVE_HORAS_EXTRA, organizationId, "config"],
    enabled: enabled && organizationId !== null,
    retry: false,
    queryFn: async (): Promise<{ limites: LimitesHE; omissao: boolean }> => {
      const { data, error } = await rpc("rpc_hr_horas_extra_config_ler", { p_organization_id: organizationId });
      if (error || !data) throw new Error(textoDoErro(error, "hr-horas-extra-config-ler"));
      const linha = data as LinhaConfigHE;
      return { limites: limitesDaLinha(linha), omissao: linha.omissao === true };
    },
  });

  const guardar = useCallback(
    async (n: LimitesHE): Promise<ResultadoHE> => {
      if (!organizationId) return recusa("pedido_invalido");
      // Guarda SINCRONA: dois cliques no mesmo instante nao chegam a fazer dois pedidos.
      if (ocupado.current) return recusa("pedido_em_curso");
      ocupado.current = true;
      setAGuardar(true);
      try {
        const { error } = await rpc("rpc_hr_horas_extra_config_guardar", {
          p_organization_id: organizationId,
          p_dia_min: n.diaMin,
          p_ano_min: n.anoMin,
          p_alerta_pct: n.alertaPct,
          p_minimo_min: n.minimoMin,
        });
        if (error) return falha(error, "hr-horas-extra-config-guardar");
        await queryClient.invalidateQueries({ queryKey: [CHAVE_HORAS_EXTRA, organizationId] });
        return SUCESSO_HE;
      } catch (e) {
        return falha(e, "hr-horas-extra-config-guardar");
      } finally {
        ocupado.current = false;
        setAGuardar(false);
      }
    },
    [organizationId, queryClient],
  );

  return {
    limites: consulta.data?.limites ?? null,
    omissao: consulta.data?.omissao ?? false,
    aCarregar: consulta.isLoading,
    aGuardar,
    erro: consulta.error ? (consulta.error as Error).message : null,
    guardar,
  };
}

/* ------------------------------------------------------------------ «pode fazer horas extra» por pessoa */
export interface AutorizacoesHorasExtraHook {
  /** Sem linha na base = nao pode. So vale quando `erro` e `null` e a leitura acabou. */
  pode: (pessoaId: string) => boolean;
  aCarregar: boolean;
  /** Verdadeiro enquanto um `autorizar` esta a correr. */
  aGuardar: boolean;
  erro: string | null;
  autorizar: (pessoaId: string, pode: boolean) => Promise<ResultadoHE>;
}

export function useHorasExtraAutorizacoes(enabled = true): AutorizacoesHorasExtraHook {
  const { activeCompany } = useCompany();
  const organizationId = activeCompany?.id ?? null;
  const queryClient = useQueryClient();
  const ocupado = useRef(false);
  const [aGuardar, setAGuardar] = useState(false);
  const consulta = useQuery({
    queryKey: [CHAVE_HORAS_EXTRA, organizationId, "autorizacoes"],
    enabled: enabled && organizationId !== null,
    retry: false,
    queryFn: async (): Promise<Record<string, boolean>> => {
      const { data, error } = await rpc("rpc_hr_horas_extra_autorizacoes_listar", { p_organization_id: organizationId });
      if (error || !Array.isArray(data)) throw new Error(textoDoErro(error, "hr-horas-extra-autorizacoes"));
      const mapa: Record<string, boolean> = {};
      for (const l of data as Array<{ pessoa_id: string; pode: boolean }>) mapa[l.pessoa_id] = l.pode === true;
      return mapa;
    },
  });

  const autorizar = useCallback(
    async (pessoaId: string, pode: boolean): Promise<ResultadoHE> => {
      if (!organizationId) return recusa("pedido_invalido");
      if (ocupado.current) return recusa("pedido_em_curso");
      ocupado.current = true;
      setAGuardar(true);
      try {
        const { error } = await rpc("rpc_hr_pessoa_horas_extra_autorizar", { p_pessoa_id: pessoaId, p_organization_id: organizationId, p_pode: pode });
        if (error) return falha(error, "hr-horas-extra-autorizar");
        await queryClient.invalidateQueries({ queryKey: [CHAVE_HORAS_EXTRA, organizationId] });
        return SUCESSO_HE;
      } catch (e) {
        return falha(e, "hr-horas-extra-autorizar");
      } finally {
        ocupado.current = false;
        setAGuardar(false);
      }
    },
    [organizationId, queryClient],
  );

  const mapa = consulta.data;
  const pode = useCallback((pessoaId: string): boolean => mapa?.[pessoaId] === true, [mapa]);
  return { pode, aCarregar: consulta.isLoading, aGuardar, erro: consulta.error ? (consulta.error as Error).message : null, autorizar };
}

/* ------------------------------------------------------------------ acoes: decidir, registar, detetar */
export interface PedidoRegistoHoraExtra {
  pessoaId: string;
  data: string;
  /** HH:MM */
  horaInicio: string;
  /** HH:MM (24:00 e aceite como fim) */
  horaFim: string;
  motivo: string;
}

export interface ResultadoDeteccao extends ResultadoHE {
  /** O que ja se tinha detetado quando parou (soma de todas as janelas que correram). */
  resumo: ResumoDeteccao;
  /** Quantos pedidos a base recebeu (mais de um quando o intervalo foi partido). */
  pedidos: number;
  /** O ultimo dia ate onde a deteccao correu bem (`null` se nenhuma janela correu). */
  ultimoDiaOk: string | null;
  /** A janela que a base recusou (`null` se correu tudo). */
  janelaFalhada: { de: string; ate: string } | null;
}

export interface ResultadoRegisto extends ResultadoHE {
  acimaDoLimite: boolean;
  semAutorizacao: boolean;
}

/** Quando a linha ja nao esta como o ecra a mostra (decidida por outro, ou apagada), a lista tem de se refazer. */
const CODIGOS_QUE_DESACTUALIZAM = new Set(["ja_decidida", "nao_encontrado"]);

export function useHorasExtraAcoes() {
  const { activeCompany } = useCompany();
  const organizationId = activeCompany?.id ?? null;
  const queryClient = useQueryClient();
  const ocupado = useRef(false);
  const [aExecutar, setAExecutar] = useState(false);

  const refazer = useCallback(
    () => queryClient.invalidateQueries({ queryKey: [CHAVE_HORAS_EXTRA, organizationId] }),
    [organizationId, queryClient],
  );

  /** Uma acao de cada vez, com guarda SINCRONA (o estado de React so muda no render seguinte). */
  const comGuarda = useCallback(
    async <T>(corre: () => Promise<T>, aoOcupado: () => T): Promise<T> => {
      if (ocupado.current) return aoOcupado();
      ocupado.current = true;
      setAExecutar(true);
      try {
        return await corre();
      } finally {
        ocupado.current = false;
        setAExecutar(false);
      }
    },
    [],
  );

  const decidir = useCallback(
    async (id: string, decisao: "confirmar" | "rejeitar", motivo: string, exigeMotivo: boolean): Promise<ResultadoHE> => {
      if (!organizationId) return recusa("pedido_invalido");
      const texto = motivo.trim();
      // Obrigatorio: >= 3. Opcional: vazio ou >= 3 (a base recusa um motivo de 1 ou 2 caracteres).
      if ((exigeMotivo || decisao === "rejeitar" ? texto.length < MOTIVO_MIN : texto !== "" && texto.length < MOTIVO_MIN)) return recusa("motivo_obrigatorio");
      if (texto.length > MOTIVO_MAX_DECIDIR) return recusa("motivo_invalido");
      return comGuarda(async () => {
        try {
          const { error } = await rpc("rpc_hr_hora_extra_decidir", {
            p_id: id, p_organization_id: organizationId, p_decisao: decisao, p_motivo: texto === "" ? null : texto,
          });
          if (error) {
            // Ja decidida por outro (ou desaparecida): a lista que o ecra mostra esta desactualizada.
            if (CODIGOS_QUE_DESACTUALIZAM.has(codigoDeErroHorasExtra(error) ?? "")) await refazer();
            return falha(error, "hr-hora-extra-decidir");
          }
          await refazer();
          return SUCESSO_HE;
        } catch (e) {
          return falha(e, "hr-hora-extra-decidir");
        }
      }, () => recusa("pedido_em_curso"));
    },
    [organizationId, refazer, comGuarda],
  );

  const registar = useCallback(
    async (p: PedidoRegistoHoraExtra): Promise<ResultadoRegisto> => {
      const semResposta = (r: ResultadoHE): ResultadoRegisto => ({ ...r, acimaDoLimite: false, semAutorizacao: false });
      if (!organizationId) return semResposta(recusa("pedido_invalido"));
      const motivo = p.motivo.trim();
      if (motivo.length < MOTIVO_MIN) return semResposta(recusa("motivo_obrigatorio"));
      if (motivo.length > MOTIVO_MAX_REGISTAR) return semResposta(recusa("motivo_invalido"));
      return comGuarda(async () => {
        try {
          const { data, error } = await rpc("rpc_hr_hora_extra_registar", {
            p_organization_id: organizationId, p_pessoa_id: p.pessoaId, p_data: p.data, p_hora_inicio: p.horaInicio, p_hora_fim: p.horaFim, p_motivo: motivo,
          });
          if (error) return semResposta(falha(error, "hr-hora-extra-registar"));
          await refazer();
          return { ...SUCESSO_HE, acimaDoLimite: data?.acima_limite === true, semAutorizacao: data?.sem_autorizacao === true };
        } catch (e) {
          return semResposta(falha(e, "hr-hora-extra-registar"));
        }
      }, () => semResposta(recusa("pedido_em_curso")));
    },
    [organizationId, refazer, comGuarda],
  );

  /**
   * Detecta as horas extra de um intervalo, partido segundo `planoDeDeteccao` (organizacao inteira acima de 31 dias: semanas;
   * uma pessoa acima de 62 dias: janelas de 62). Se a base recusar uma janela por tamanho (HRA84), repete-a em semanas. Para na
   * primeira recusa e devolve o que ja somou, ate que dia correu bem e que janela falhou. A lista refaz-se SEMPRE no fim.
   */
  const detetar = useCallback(
    async (de: string, ate: string, pessoaId: string | null = null): Promise<ResultadoDeteccao> => {
      const parcial = (r: ResultadoHE): ResultadoDeteccao => ({ ...r, resumo: RESUMO_VAZIO, pedidos: 0, ultimoDiaOk: null, janelaFalhada: null });
      if (!organizationId) return parcial(recusa("pedido_invalido"));
      if (diasDoIntervalo(de, ate) === 0) return parcial(recusa("data_invalida"));
      const plano = planoDeDeteccao(de, ate, pessoaId);
      if (plano.excede) return parcial(recusa("intervalo_grande"));
      return comGuarda(async () => {
        const fila = [...plano.janelas];
        let resumo = RESUMO_VAZIO;
        let pedidos = 0;
        let ultimoDiaOk: string | null = null;
        let janelaFalhada: { de: string; ate: string } | null = null;
        let resultado: ResultadoHE = SUCESSO_HE;
        try {
          while (fila.length > 0) {
            const j = fila.shift() as { de: string; ate: string };
            pedidos += 1;
            const { data, error } = await rpc("rpc_hr_horas_extra_detetar", {
              p_organization_id: organizationId, p_data_de: j.de, p_data_ate: j.ate, p_pessoa_id: pessoaId,
            });
            if (error) {
              // HRA84 numa janela maior do que uma semana (muitas pessoas com horas): repete-a por semanas.
              if (codigoDeErroHorasExtra(error) === "intervalo_excedido" && diasDoIntervalo(j.de, j.ate) > DIAS_JANELA_SEMANAL) {
                fila.unshift(...janelasDoIntervalo(j.de, j.ate, DIAS_JANELA_SEMANAL));
                if (pedidos + fila.length > MAX_JANELAS_DETECAO) {
                  janelaFalhada = j;
                  resultado = recusa("intervalo_grande");
                  break;
                }
                continue;
              }
              janelaFalhada = j;
              resultado = falha(error, "hr-horas-extra-detetar");
              break;
            }
            resumo = somarResumos(resumo, resumoDaResposta(data));
            ultimoDiaOk = j.ate;
          }
        } catch (e) {
          resultado = falha(e, "hr-horas-extra-detetar");
        } finally {
          await refazer();
        }
        return { ...resultado, resumo, pedidos, ultimoDiaOk, janelaFalhada };
      }, () => parcial(recusa("pedido_em_curso")));
    },
    [organizationId, refazer, comGuarda],
  );

  return { decidir, registar, detetar, aExecutar };
}

export type { LimitesHE, ResumoDeteccao, SaldoHE, ResultadoHE };
