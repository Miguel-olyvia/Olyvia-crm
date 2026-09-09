/**
 * A assiduidade de UMA pessoa numa janela de datas: picagens, horas, faltas.
 *
 * SEGUE O PADRAO DE `usePessoa` E DE `useAusenciasDaPessoa`
 * ---------------------------------------------------------
 * O hook carrega, os componentes nao. Cada satelite tem a sua permissao: uma
 * recusa deixa esse bloco vazio e o ecra esconde-o -- essa e a resposta
 * CORRECTA e nao vai ao Sentry. Tudo o que nao for recusa vai.
 *
 * LE-SE EM BRUTO, MOSTRA-SE EM VIGOR
 * ----------------------------------
 * As tabelas leem-se INTEIRAS, com as linhas ja substituidas, e nao pelas
 * vistas `v_hr_*_em_vigor`. Nao e distraccao: o valor em vigor tira-se com
 * `emVigor`, que aplica a mesma regra da vista, e as linhas substituidas sao
 * precisamente o que o painel de historico mostra ("registado assim, depois
 * corrigido assim, e hoje vale isto"). Ler so a vista deixaria o historico
 * impossivel sem uma segunda ida a base por cada linha.
 *
 * TODAS AS ESCRITAS SAO POR RPC
 * -----------------------------
 * `pessoas_picagens`, `pessoas_faltas` e `pessoas_faltas_justificacoes` tem
 * INSERT, UPDATE e DELETE fechados por politicas RESTRICTIVE, e a coluna
 * `estado` do realizado esta fechada por trigger. Um insert directo daqui era
 * recusado pela base -- e por isso nao existe nenhum.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import { hrFrom, hrRpc, isPermissionError } from "@/lib/hr/hrDb";
import { chaveDoErroDeAssiduidade } from "@/lib/hr/assiduidade";
import type {
  Falta,
  JustificacaoFaltaRevelada,
  MotivoFalta,
  OrigemPicagem,
  Picagem,
  SentidoPicagem,
  TipoCorreccaoPicagem,
  TipoDocumentoFalta,
} from "@/types/hrAssiduidade";
import type { HorarioPlaneado, HorarioRealizado } from "@/types/hr";

/**
 * Nunca `*`: uma coluna revogada ao nivel de coluna faz o PostgREST devolver
 * 42501 e PERDER A LINHA INTEIRA. As colunas escrevem-se a mao, uma a uma.
 */
const COLUNAS_PICAGEM =
  "id, pessoa_id, organization_id, momento, data_local, hora_local, sentido, local_id, " +
  "vinculo_id, planeado_id, origem, dispositivo_id, dispositivo_ref_externa, estado, " +
  "realizado_id, corrige_picagem_id, correccao_tipo, correccao_motivo, " +
  "registado_por_pessoa_id, anulado_em, anulacao_motivo, created_at";

const COLUNAS_REALIZADO =
  "id, pessoa_id, organization_id, vinculo_id, local_id, planeado_id, data, hora_inicio, " +
  "hora_fim, minutos, origem, estado, validado_por, validado_em, motivo_rejeicao, notas, " +
  "corrige_realizado_id, correccao_motivo, corrigido_por_pessoa_id, deleted_at";

const COLUNAS_FALTA =
  "id, pessoa_id, organization_id, data, planeado_id, vinculo_id, local_id, hora_inicio, " +
  "hora_fim, minutos, motivo_codigo, justificacao_estado, justificada, remunerada, " +
  "desconta_saldo, justificacao_decidida_por, justificacao_decidida_em, justificacao_motivo, " +
  "ausencia_dia_id, corrige_falta_id, correccao_motivo, estado, anulado_em, anulacao_motivo, " +
  "created_at";

const COLUNAS_PLANEADO =
  "id, pessoa_id, organization_id, vinculo_id, local_id, dia_semana, data, hora_inicio, " +
  "hora_fim, nao_trabalha, ordem, valido_de, valido_ate, notas";

const COLUNAS_AUSENCIA_DIA =
  "id, pedido_id, pessoa_id, organization_id, tipo_id, data, fraccao_dia, estado";

/** Um dia de ausencia, so o que a assiduidade precisa de saber dele. */
export interface AusenciaDoDia {
  id: string;
  data: string;
  fraccao_dia: number;
  estado: string;
}

/** O realizado com as colunas de correccao que a migration 20261121180000 acrescentou. */
export type RealizadoComCorreccao = HorarioRealizado & {
  corrige_realizado_id: string | null;
  correccao_motivo: string | null;
  corrigido_por_pessoa_id: string | null;
  deleted_at: string | null;
};

interface Satelite<T> {
  linhas: T[];
  recusado: boolean;
}

const vazio = <T,>(): Satelite<T> => ({ linhas: [], recusado: false });

async function carregar<T>(
  tabela: string,
  colunas: string,
  aplicar: (query: any) => any,
): Promise<Satelite<T>> {
  const { data, error } = await aplicar(hrFrom(tabela).select(colunas));
  if (error) {
    // Recusa por permissao e a resposta correcta: o bloco esconde-se e nao ha
    // incidente nenhum a reportar.
    if (isPermissionError(error)) return { linhas: [], recusado: true };
    captureFlowError(error, "hr-assiduidade-load");
    return { linhas: [], recusado: false };
  }
  return { linhas: (data ?? []) as T[], recusado: false };
}

export interface JanelaDeDatas {
  de: string;
  ate: string;
}

export function useAssiduidadeDaPessoa(pessoaId: string | undefined, janela: JanelaDeDatas) {
  const { activeCompany } = useCompany();
  const orgId = activeCompany?.id ?? null;

  const [picagens, setPicagens] = useState<Satelite<Picagem>>(vazio<Picagem>());
  const [realizado, setRealizado] = useState<Satelite<RealizadoComCorreccao>>(
    vazio<RealizadoComCorreccao>(),
  );
  const [faltas, setFaltas] = useState<Satelite<Falta>>(vazio<Falta>());
  const [planeado, setPlaneado] = useState<Satelite<HorarioPlaneado>>(vazio<HorarioPlaneado>());
  const [ausencias, setAusencias] = useState<Satelite<AusenciaDoDia>>(vazio<AusenciaDoDia>());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const { de, ate } = janela;

  const load = useCallback(async () => {
    if (!pessoaId || !orgId) {
      setPicagens(vazio<Picagem>());
      setRealizado(vazio<RealizadoComCorreccao>());
      setFaltas(vazio<Falta>());
      setPlaneado(vazio<HorarioPlaneado>());
      setAusencias(vazio<AusenciaDoDia>());
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [asPicagens, oRealizado, asFaltas, oPlaneado, asAusencias] = await Promise.all([
        carregar<Picagem>("pessoas_picagens", COLUNAS_PICAGEM, (q) =>
          q
            .eq("pessoa_id", pessoaId)
            .gte("data_local", de)
            .lte("data_local", ate)
            .order("momento", { ascending: true }),
        ),
        carregar<RealizadoComCorreccao>("pessoas_horario_realizado", COLUNAS_REALIZADO, (q) =>
          q
            .eq("pessoa_id", pessoaId)
            .gte("data", de)
            .lte("data", ate)
            .order("data", { ascending: true })
            .order("hora_inicio", { ascending: true }),
        ),
        carregar<Falta>("pessoas_faltas", COLUNAS_FALTA, (q) =>
          q
            .eq("pessoa_id", pessoaId)
            .gte("data", de)
            .lte("data", ate)
            .order("data", { ascending: true })
            .order("hora_inicio", { ascending: true }),
        ),
        // O planeado nao se filtra por data: o padrao semanal nao tem data
        // nenhuma, e e ele que responde pela maioria dos dias.
        carregar<HorarioPlaneado>("pessoas_horario_planeado", COLUNAS_PLANEADO, (q) =>
          q.eq("pessoa_id", pessoaId).order("ordem", { ascending: true }),
        ),
        carregar<AusenciaDoDia>("pessoas_ausencias_dias", COLUNAS_AUSENCIA_DIA, (q) =>
          q.eq("pessoa_id", pessoaId).gte("data", de).lte("data", ate),
        ),
      ]);

      setPicagens(asPicagens);
      setRealizado(oRealizado);
      setFaltas(asFaltas);
      setPlaneado(oPlaneado);
      setAusencias(asAusencias);
    } catch (e) {
      captureFlowError(e, "hr-assiduidade-load");
    } finally {
      setLoading(false);
    }
  }, [pessoaId, orgId, de, ate]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Devolve `null` em sucesso, ou o que o utilizador le. O erro nunca fica so
   * na consola: ou tem chave estavel, ou vai ao Sentry.
   *
   * O que sai e uma CHAVE de traducao quando a base levantou um erro
   * reconhecido, e a mensagem amigavel ja escrita quando nao. Quem chama faz
   * sempre `toast.error(t(erro))`: o `t` deste projecto devolve a propria
   * cadeia quando nao conhece a chave, por isso os dois casos passam pelo
   * mesmo caminho e nao ha um `if` a decidir qual e qual.
   */
  const executar = useCallback(
    async (accao: () => Promise<{ error: unknown }>): Promise<string | null> => {
      setSaving(true);
      try {
        const { error } = await accao();
        if (error) throw error;
        await load();
        return null;
      } catch (e) {
        const chave = chaveDoErroDeAssiduidade(e);
        // Um erro reconhecido e uma regra de negocio a funcionar; um erro sem
        // chave e um defeito, mesmo que a base o tenha levantado.
        if (!chave && !isPermissionError(e)) captureFlowError(e, "hr-assiduidade-write");
        return chave ?? (await getFriendlyErrorMessage(e));
      } finally {
        setSaving(false);
      }
    },
    [load],
  );

  /* ---- Picagens ---- */

  const picar = useCallback(
    (args: {
      sentido: SentidoPicagem;
      momento?: string | null;
      localId?: string | null;
      dispositivoId?: string | null;
      latitude?: number | null;
      longitude?: number | null;
      precisaoMetros?: number | null;
      origem?: OrigemPicagem;
      vinculoId?: string | null;
    }) =>
      executar(() =>
        hrRpc("rpc_hr_picar", {
          _organization_id: orgId,
          _pessoa_id: pessoaId,
          _sentido: args.sentido,
          // Sem momento, a base usa `now()` -- e o caso do botao de picar.
          ...(args.momento ? { _momento: args.momento } : {}),
          _local_id: args.localId ?? null,
          _dispositivo_id: args.dispositivoId ?? null,
          _latitude: args.latitude ?? null,
          _longitude: args.longitude ?? null,
          _precisao_metros: args.precisaoMetros ?? null,
          _origem: args.origem ?? "web",
          _vinculo_id: args.vinculoId ?? null,
        }),
      ),
    [executar, orgId, pessoaId],
  );

  const corrigirPicagem = useCallback(
    (args: {
      picagemId: string;
      momento: string;
      sentido: SentidoPicagem;
      localId: string | null;
      tipo: TipoCorreccaoPicagem;
      motivo: string;
    }) =>
      executar(() =>
        hrRpc("rpc_hr_picagem_corrigir", {
          _picagem_id: args.picagemId,
          _momento: args.momento,
          _sentido: args.sentido,
          _local_id: args.localId,
          _correccao_tipo: args.tipo,
          _correccao_motivo: args.motivo,
        }),
      ),
    [executar],
  );

  const anularPicagem = useCallback(
    (picagemId: string, motivo: string) =>
      executar(() => hrRpc("rpc_hr_picagem_anular", { _picagem_id: picagemId, _motivo: motivo })),
    [executar],
  );

  /* ---- Horas realizadas ---- */

  const consolidarDia = useCallback(
    (data: string) =>
      executar(() =>
        hrRpc("rpc_hr_picagens_consolidar_dia", {
          _organization_id: orgId,
          _pessoa_id: pessoaId,
          _data: data,
        }),
      ),
    [executar, orgId, pessoaId],
  );

  const corrigirRealizado = useCallback(
    (args: {
      realizadoId: string;
      horaInicio: string;
      horaFim: string;
      localId: string | null;
      motivo: string;
    }) =>
      executar(() =>
        hrRpc("rpc_hr_realizado_corrigir", {
          _realizado_id: args.realizadoId,
          _hora_inicio: args.horaInicio,
          _hora_fim: args.horaFim,
          _local_id: args.localId,
          _motivo: args.motivo,
        }),
      ),
    [executar],
  );

  /** A base recusa a autovalidacao com 42501: o ecra esconde o botao antes disso. */
  const validarRealizado = useCallback(
    (realizadoId: string) =>
      executar(() => hrRpc("rpc_hr_realizado_validar", { _realizado_id: realizadoId })),
    [executar],
  );

  const rejeitarRealizado = useCallback(
    (realizadoId: string, motivo: string) =>
      executar(() =>
        hrRpc("rpc_hr_realizado_rejeitar", { _realizado_id: realizadoId, _motivo: motivo }),
      ),
    [executar],
  );

  /* ---- Faltas ---- */

  /**
   * Marcar a falta e, se vier justificacao, regista-la na mesma passagem.
   *
   * Sao DUAS chamadas e nao uma transaccao: `rpc_hr_falta_registar_justificacao`
   * precisa do id que a primeira devolve. Se a segunda falhar, a falta FICA
   * marcada -- e por isso o erro que sai daqui e o da justificacao e nao um
   * "nao foi possivel", que faria alguem marcar a falta outra vez.
   */
  const marcarFalta = useCallback(
    (args: {
      data: string;
      horaInicio: string;
      horaFim: string;
      motivoCodigo: MotivoFalta;
      planeadoId?: string | null;
      remunerada?: boolean;
      descontaSaldo?: boolean;
      justificacao?: {
        tipoDocumento: TipoDocumentoFalta | null;
        documentoRef: string | null;
        texto: string | null;
        entidadeEmissora: string | null;
        dataDocumento: string | null;
        diasAtestados: number | null;
      } | null;
    }) =>
      executar(async () => {
        const { data, error } = await hrRpc("rpc_hr_falta_marcar", {
          _organization_id: orgId,
          _pessoa_id: pessoaId,
          _data: args.data,
          _hora_inicio: args.horaInicio,
          _hora_fim: args.horaFim,
          _motivo_codigo: args.motivoCodigo,
          _planeado_id: args.planeadoId ?? null,
          _remunerada: args.remunerada ?? false,
          _desconta_saldo: args.descontaSaldo ?? false,
        });
        if (error) return { error };
        if (!args.justificacao) return { error: null };

        return hrRpc("rpc_hr_falta_registar_justificacao", {
          _falta_id: data as string,
          _tipo_documento: args.justificacao.tipoDocumento,
          _documento_ref: args.justificacao.documentoRef,
          _texto: args.justificacao.texto,
          _entidade_emissora: args.justificacao.entidadeEmissora,
          _data_documento: args.justificacao.dataDocumento,
          _dias_atestados: args.justificacao.diasAtestados,
        });
      }),
    [executar, orgId, pessoaId],
  );

  const corrigirFalta = useCallback(
    (args: {
      faltaId: string;
      horaInicio: string;
      horaFim: string;
      motivoCodigo: MotivoFalta;
      motivo: string;
    }) =>
      executar(() =>
        hrRpc("rpc_hr_falta_corrigir", {
          _falta_id: args.faltaId,
          _hora_inicio: args.horaInicio,
          _hora_fim: args.horaFim,
          _motivo_codigo: args.motivoCodigo,
          _motivo: args.motivo,
        }),
      ),
    [executar],
  );

  const anularFalta = useCallback(
    (faltaId: string, motivo: string) =>
      executar(() => hrRpc("rpc_hr_falta_anular", { _falta_id: faltaId, _motivo: motivo })),
    [executar],
  );

  const anularFaltaPorAusencia = useCallback(
    (faltaId: string, ausenciaDiaId: string) =>
      executar(() =>
        hrRpc("rpc_hr_falta_anular_por_ausencia", {
          _falta_id: faltaId,
          _ausencia_dia_id: ausenciaDiaId,
        }),
      ),
    [executar],
  );

  /* ---- Justificacoes ---- */

  /**
   * REGISTAR nao e DECIDIR: isto passa a falta a `pendente_documento` e mais
   * nada. Nao ha ficheiro -- o bucket esta fechado a escrita do cliente ate
   * existir a Edge Function de upload, e a propria RPC recusa uma chamada sem
   * referencia nem texto.
   */
  const registarJustificacao = useCallback(
    (args: {
      faltaId: string;
      tipoDocumento?: TipoDocumentoFalta | null;
      documentoRef?: string | null;
      texto?: string | null;
      entidadeEmissora?: string | null;
      dataDocumento?: string | null;
      diasAtestados?: number | null;
    }) =>
      executar(() =>
        hrRpc("rpc_hr_falta_registar_justificacao", {
          _falta_id: args.faltaId,
          _tipo_documento: args.tipoDocumento ?? null,
          _documento_ref: args.documentoRef ?? null,
          _texto: args.texto ?? null,
          _entidade_emissora: args.entidadeEmissora ?? null,
          _data_documento: args.dataDocumento ?? null,
          _dias_atestados: args.diasAtestados ?? null,
        }),
      ),
    [executar],
  );

  const decidirJustificacao = useCallback(
    (args: { faltaId: string; resultado: "justificada" | "recusada"; motivo?: string | null }) =>
      executar(() =>
        hrRpc("rpc_hr_falta_decidir_justificacao", {
          _falta_id: args.faltaId,
          _resultado: args.resultado,
          _motivo: args.motivo ?? null,
        }),
      ),
    [executar],
  );

  /**
   * O documento em claro, uma vez, sob registo em `pessoas_acessos_sensiveis`.
   * NUNCA se chama ao carregar o ecra -- e o mesmo padrao do NISS e do IBAN, e
   * cada chamada deixa rasto de quem viu o dado de saude de outra pessoa.
   */
  const revelarJustificacao = useCallback(
    async (faltaId: string): Promise<JustificacaoFaltaRevelada[]> => {
      const { data, error } = await hrRpc("rpc_hr_falta_ver_justificacao", { _falta_id: faltaId });
      if (error) {
        if (!isPermissionError(error)) captureFlowError(error, "hr-assiduidade-write");
        throw error;
      }
      return (data ?? []) as JustificacaoFaltaRevelada[];
    },
    [],
  );

  /** A fraccao de ausencia APROVADA por dia -- o que avisa sobre a falta sobreposta. */
  const ausenciaAprovadaPorDia = useMemo(() => {
    const mapa = new Map<string, AusenciaDoDia>();
    for (const dia of ausencias.linhas) {
      if (dia.estado !== "aprovado") continue;
      const anterior = mapa.get(dia.data);
      if (!anterior || dia.fraccao_dia > anterior.fraccao_dia) mapa.set(dia.data, dia);
    }
    return mapa;
  }, [ausencias.linhas]);

  return {
    picagens: picagens.linhas,
    picagensRecusadas: picagens.recusado,
    realizado: realizado.linhas,
    realizadoRecusado: realizado.recusado,
    faltas: faltas.linhas,
    faltasRecusadas: faltas.recusado,
    planeado: planeado.linhas,
    planeadoRecusado: planeado.recusado,
    ausenciaAprovadaPorDia,
    loading,
    saving,
    recarregar: load,
    picar,
    corrigirPicagem,
    anularPicagem,
    consolidarDia,
    corrigirRealizado,
    validarRealizado,
    rejeitarRealizado,
    marcarFalta,
    corrigirFalta,
    anularFalta,
    anularFaltaPorAusencia,
    registarJustificacao,
    decidirJustificacao,
    revelarJustificacao,
  };
}

export type AssiduidadeDaPessoa = ReturnType<typeof useAssiduidadeDaPessoa>;
