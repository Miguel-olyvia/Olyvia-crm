/**
 * A assiduidade de UMA pessoa numa janela de datas (picagens, horas, faltas), em memória.
 * Mesma assinatura do hook do módulo real: as acções devolvem `null` em sucesso ou uma chave de tradução.
 * As correcções empilham linhas novas que apontam a corrigida (`corrige_*`), como na base, e o valor em vigor
 * tira-se com `emVigor`, por isso o painel de histórico continua a ter o que mostrar.
 */
import { useCallback, useMemo } from "react";
import { atualizarFicha, lerEstado, novoId, useEstadoRh } from "@/components/rh-exemplo/dados/loja";
import { definirGestao, lerGestao, novoIdGestao, useGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import { agoraHoraLocal, hojeIso } from "@/components/rh-exemplo/lib/assiduidade";
import { minutosDe } from "@/components/rh-exemplo/lib/horario";
import type { HorarioPlaneado, HorarioRealizado } from "@/components/rh-exemplo/tipos";
import type {
  Falta,
  JustificacaoFaltaRevelada,
  MotivoFalta,
  OrigemPicagem,
  Picagem,
  SentidoPicagem,
  TipoCorreccaoPicagem,
  TipoDocumentoFalta,
} from "@/components/rh-exemplo/tiposAssiduidade";

/** Um dia de ausencia, so o que a assiduidade precisa de saber dele. */
export interface AusenciaDoDia {
  id: string;
  data: string;
  fraccao_dia: number;
  estado: string;
}

/** O realizado com as colunas de correccao. */
export type RealizadoComCorreccao = HorarioRealizado & {
  corrige_realizado_id: string | null;
  correccao_motivo: string | null;
  corrigido_por_pessoa_id: string | null;
  deleted_at: string | null;
};

export interface JanelaDeDatas {
  de: string;
  ate: string;
}

const SEM_PLANEADO: HorarioPlaneado[] = [];

export function comoRealizadoComCorreccao(linha: HorarioRealizado): RealizadoComCorreccao {
  const extra = linha as Partial<RealizadoComCorreccao>;
  return {
    ...linha,
    corrige_realizado_id: extra.corrige_realizado_id ?? null,
    correccao_motivo: extra.correccao_motivo ?? null,
    corrigido_por_pessoa_id: extra.corrigido_por_pessoa_id ?? null,
    deleted_at: extra.deleted_at ?? null,
  };
}

const dentro = (data: string, janela: JanelaDeDatas): boolean => data >= janela.de && data <= janela.ate;

function minutosEntreHoras(inicio: string, fim: string): number {
  const a = minutosDe(inicio);
  const b = minutosDe(fim);
  return a === null || b === null || b <= a ? 0 : b - a;
}

function dataEHoraDe(momento: string): { data: string; hora: string } {
  const quando = new Date(momento);
  return { data: hojeIso(quando), hora: `${agoraHoraLocal(quando)}:00` };
}

export function useAssiduidadeDaPessoa(pessoaId: string | undefined, janela: JanelaDeDatas) {
  const { de, ate } = janela;
  const todasPicagens = useGestao((g) => g.picagens);
  const todasFaltas = useGestao((g) => g.faltas);
  const ficha = useEstadoRh((e) => (pessoaId ? (e.fichas[pessoaId] ?? null) : null));
  const org = ficha?.pessoa.organization_id ?? "";

  const picagens = useMemo(
    () =>
      todasPicagens
        .filter((p) => p.pessoa_id === pessoaId && dentro(p.data_local, { de, ate }))
        .sort((a, b) => a.momento.localeCompare(b.momento)),
    [todasPicagens, pessoaId, de, ate],
  );
  const faltas = useMemo(
    () =>
      todasFaltas
        .filter((f) => f.pessoa_id === pessoaId && dentro(f.data, { de, ate }))
        .sort((a, b) => a.data.localeCompare(b.data) || a.hora_inicio.localeCompare(b.hora_inicio)),
    [todasFaltas, pessoaId, de, ate],
  );
  const realizado = useMemo(
    () =>
      (ficha?.horarioRealizado ?? [])
        .filter((r) => dentro(r.data, { de, ate }))
        .map(comoRealizadoComCorreccao)
        .sort((a, b) => a.data.localeCompare(b.data) || a.hora_inicio.localeCompare(b.hora_inicio)),
    [ficha, de, ate],
  );
  const planeado = ficha?.horarioPlaneado ?? SEM_PLANEADO;

  const ausenciaAprovadaPorDia = useMemo(() => {
    const mapa = new Map<string, AusenciaDoDia>();
    for (const dia of ficha?.ausencias.dias ?? []) {
      if (dia.estado !== "aprovado" || !dentro(dia.data, { de, ate })) continue;
      const anterior = mapa.get(dia.data);
      if (!anterior || dia.fraccao_dia > anterior.fraccao_dia) {
        mapa.set(dia.data, { id: dia.id, data: dia.data, fraccao_dia: dia.fraccao_dia, estado: dia.estado });
      }
    }
    return mapa;
  }, [ficha, de, ate]);

  const escreverRealizado = useCallback(
    (alterar: (linhas: HorarioRealizado[]) => HorarioRealizado[]) => {
      if (!pessoaId) return;
      atualizarFicha(pessoaId, (f) => ({ ...f, horarioRealizado: alterar(f.horarioRealizado) }));
    },
    [pessoaId],
  );

  const alterarFaltas = useCallback((alterar: (linhas: Falta[]) => Falta[]) => {
    definirGestao((g) => ({ ...g, faltas: alterar(g.faltas) }));
  }, []);

  /* ---- Picagens ---- */

  const consolidarPar = useCallback(
    (entrada: Picagem, saida: Picagem) => {
      const id = novoId("hr");
      const minutos = minutosEntreHoras(entrada.hora_local, saida.hora_local);
      escreverRealizado((linhas) => [
        ...linhas,
        {
          id,
          pessoa_id: entrada.pessoa_id,
          organization_id: entrada.organization_id,
          vinculo_id: entrada.vinculo_id,
          local_id: entrada.local_id ?? saida.local_id,
          planeado_id: null,
          data: entrada.data_local,
          hora_inicio: entrada.hora_local,
          hora_fim: saida.hora_local,
          minutos,
          origem: "picagem",
          estado: "registado",
          validado_por: null,
          validado_em: null,
          motivo_rejeicao: null,
          notas: null,
        },
      ]);
      definirGestao((g) => ({
        ...g,
        picagens: g.picagens.map((p) => (p.id === entrada.id || p.id === saida.id ? { ...p, realizado_id: id } : p)),
      }));
    },
    [escreverRealizado],
  );

  const picar = useCallback(
    async (args: {
      sentido: SentidoPicagem;
      momento?: string | null;
      localId?: string | null;
      latitude?: number | null;
      longitude?: number | null;
      precisaoMetros?: number | null;
      origem?: OrigemPicagem;
      vinculoId?: string | null;
    }): Promise<string | null> => {
      if (!pessoaId || !ficha) return "rhExemplo.erro.semPessoa";
      const momento = args.momento ?? new Date().toISOString();
      const { data, hora } = dataEHoraDe(momento);
      const nova: Picagem = {
        id: novoIdGestao("pg"),
        pessoa_id: pessoaId,
        organization_id: org,
        momento,
        data_local: data,
        hora_local: hora,
        sentido: args.sentido,
        local_id: args.localId ?? null,
        vinculo_id: args.vinculoId ?? ficha?.vinculos[0]?.id ?? null,
        planeado_id: null,
        origem: args.origem ?? "web",
        latitude: args.latitude ?? null,
        longitude: args.longitude ?? null,
        precisao_metros: args.precisaoMetros ?? null,
        estado: "valida",
        realizado_id: null,
        corrige_picagem_id: null,
        correccao_tipo: null,
        correccao_motivo: null,
        registado_por_pessoa_id: lerEstado().minhaPessoaId,
        anulado_em: null,
        anulacao_motivo: null,
        created_at: new Date().toISOString(),
      };
      definirGestao((g) => ({ ...g, picagens: [...g.picagens, nova] }));
      if (args.sentido === "saida") {
        const doDia = lerGestaoPicagens(pessoaId, data);
        const entrada = [...doDia].reverse().find((p) => p.sentido === "entrada" && p.hora_local <= nova.hora_local && !p.realizado_id);
        if (entrada) consolidarPar(entrada, nova);
      }
      return null;
    },
    [pessoaId, org, ficha, consolidarPar],
  );

  const corrigirPicagem = useCallback(
    async (args: {
      picagemId: string;
      momento: string;
      sentido: SentidoPicagem;
      localId: string | null;
      tipo: TipoCorreccaoPicagem;
      motivo: string;
    }): Promise<string | null> => {
      const { data, hora } = dataEHoraDe(args.momento);
      definirGestao((g) => {
        const original = g.picagens.find((p) => p.id === args.picagemId);
        if (!original) return g;
        const nova: Picagem = {
          ...original,
          id: novoIdGestao("pg"),
          momento: args.momento,
          data_local: data,
          hora_local: hora,
          sentido: args.sentido,
          local_id: args.localId,
          estado: "valida",
          corrige_picagem_id: original.id,
          correccao_tipo: args.tipo,
          correccao_motivo: args.motivo,
          origem: "manual_rh",
          created_at: new Date().toISOString(),
        };
        return {
          ...g,
          picagens: [...g.picagens.map((p) => (p.id === original.id ? { ...p, estado: "corrigida" as const } : p)), nova],
        };
      });
      return null;
    },
    [],
  );

  const anularPicagem = useCallback(async (picagemId: string, motivo: string): Promise<string | null> => {
    definirGestao((g) => ({
      ...g,
      picagens: g.picagens.map((p) =>
        p.id === picagemId ? { ...p, estado: "anulada" as const, anulado_em: new Date().toISOString(), anulacao_motivo: motivo } : p,
      ),
    }));
    return null;
  }, []);

  /* ---- Horas realizadas ---- */

  const consolidarDia = useCallback(async (_data: string): Promise<string | null> => null, []);

  const corrigirRealizado = useCallback(
    async (args: {
      realizadoId: string;
      horaInicio: string;
      horaFim: string;
      localId: string | null;
      motivo: string;
    }): Promise<string | null> => {
      escreverRealizado((linhas) => {
        const original = linhas.find((l) => l.id === args.realizadoId);
        if (!original) return linhas;
        const nova: RealizadoComCorreccao = {
          ...comoRealizadoComCorreccao(original),
          id: novoId("hr"),
          hora_inicio: args.horaInicio,
          hora_fim: args.horaFim,
          minutos: minutosEntreHoras(args.horaInicio, args.horaFim),
          local_id: args.localId,
          estado: "registado",
          corrige_realizado_id: original.id,
          correccao_motivo: args.motivo,
          corrigido_por_pessoa_id: lerEstado().minhaPessoaId,
        };
        return [...linhas, nova];
      });
      return null;
    },
    [escreverRealizado],
  );

  const validarRealizado = useCallback(
    async (realizadoId: string): Promise<string | null> => {
      escreverRealizado((linhas) =>
        linhas.map((l) =>
          l.id === realizadoId
            ? { ...l, estado: "validado" as const, validado_por: lerEstado().minhaPessoaId, validado_em: new Date().toISOString() }
            : l,
        ),
      );
      return null;
    },
    [escreverRealizado],
  );

  const rejeitarRealizado = useCallback(
    async (realizadoId: string, motivo: string): Promise<string | null> => {
      escreverRealizado((linhas) =>
        linhas.map((l) => (l.id === realizadoId ? { ...l, estado: "rejeitado" as const, motivo_rejeicao: motivo } : l)),
      );
      return null;
    },
    [escreverRealizado],
  );

  /* ---- Faltas ---- */

  const marcarFalta = useCallback(
    async (args: {
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
    }): Promise<string | null> => {
      if (!pessoaId || !ficha) return "rhExemplo.erro.semPessoa";
      const comJustificacao = Boolean(args.justificacao);
      const nova: Falta = {
        id: novoIdGestao("fa"),
        pessoa_id: pessoaId,
        organization_id: org,
        data: args.data,
        planeado_id: args.planeadoId ?? null,
        vinculo_id: ficha?.vinculos[0]?.id ?? null,
        local_id: null,
        hora_inicio: args.horaInicio,
        hora_fim: args.horaFim,
        minutos: minutosEntreHoras(args.horaInicio, args.horaFim),
        motivo_codigo: args.motivoCodigo,
        justificacao_estado: comJustificacao ? "pendente_documento" : "sem_justificacao",
        justificada: false,
        remunerada: args.remunerada ?? false,
        desconta_saldo: args.descontaSaldo ?? false,
        justificacao_decidida_por: null,
        justificacao_decidida_em: null,
        justificacao_motivo: null,
        ausencia_dia_id: null,
        corrige_falta_id: null,
        correccao_motivo: null,
        estado: "activa",
        anulado_em: null,
        anulacao_motivo: null,
        created_at: new Date().toISOString(),
      };
      alterarFaltas((linhas) => [...linhas, nova]);
      return null;
    },
    [pessoaId, org, ficha, alterarFaltas],
  );

  const corrigirFalta = useCallback(
    async (args: {
      faltaId: string;
      horaInicio: string;
      horaFim: string;
      motivoCodigo: MotivoFalta;
      motivo: string;
    }): Promise<string | null> => {
      alterarFaltas((linhas) => {
        const original = linhas.find((f) => f.id === args.faltaId);
        if (!original) return linhas;
        const nova: Falta = {
          ...original,
          id: novoIdGestao("fa"),
          hora_inicio: args.horaInicio,
          hora_fim: args.horaFim,
          minutos: minutosEntreHoras(args.horaInicio, args.horaFim),
          motivo_codigo: args.motivoCodigo,
          corrige_falta_id: original.id,
          correccao_motivo: args.motivo,
          estado: "activa",
        };
        return [...linhas.map((f) => (f.id === original.id ? { ...f, estado: "corrigida" as const } : f)), nova];
      });
      return null;
    },
    [alterarFaltas],
  );

  const anularFalta = useCallback(
    async (faltaId: string, motivo: string): Promise<string | null> => {
      alterarFaltas((linhas) =>
        linhas.map((f) =>
          f.id === faltaId ? { ...f, estado: "anulada" as const, anulado_em: new Date().toISOString(), anulacao_motivo: motivo } : f,
        ),
      );
      return null;
    },
    [alterarFaltas],
  );

  const anularFaltaPorAusencia = useCallback(
    async (faltaId: string, ausenciaDiaId: string): Promise<string | null> => {
      alterarFaltas((linhas) =>
        linhas.map((f) =>
          f.id === faltaId
            ? { ...f, estado: "anulada" as const, anulado_em: new Date().toISOString(), anulacao_motivo: "Coberta por ausência aprovada", ausencia_dia_id: ausenciaDiaId }
            : f,
        ),
      );
      return null;
    },
    [alterarFaltas],
  );

  /* ---- Justificações ---- */

  const registarJustificacao = useCallback(
    async (args: {
      faltaId: string;
      tipoDocumento?: TipoDocumentoFalta | null;
      documentoRef?: string | null;
      texto?: string | null;
      entidadeEmissora?: string | null;
      dataDocumento?: string | null;
      diasAtestados?: number | null;
    }): Promise<string | null> => {
      alterarFaltas((linhas) =>
        linhas.map((f) => (f.id === args.faltaId ? { ...f, justificacao_estado: "pendente_documento" as const } : f)),
      );
      return null;
    },
    [alterarFaltas],
  );

  const decidirJustificacao = useCallback(
    async (args: { faltaId: string; resultado: "justificada" | "recusada"; motivo?: string | null }): Promise<string | null> => {
      alterarFaltas((linhas) =>
        linhas.map((f) =>
          f.id === args.faltaId
            ? {
                ...f,
                justificacao_estado: args.resultado,
                justificada: args.resultado === "justificada",
                remunerada: args.resultado === "justificada",
                justificacao_decidida_por: lerEstado().minhaPessoaId,
                justificacao_decidida_em: new Date().toISOString(),
                justificacao_motivo: args.motivo ?? null,
              }
            : f,
        ),
      );
      return null;
    },
    [alterarFaltas],
  );

  const revelarJustificacao = useCallback(
    async (faltaId: string): Promise<JustificacaoFaltaRevelada[]> => [
      {
        id: `just-${faltaId}`,
        tipo_documento: "atestado_medico",
        documento_ref: "ATM-0192",
        entidade_emissora: "Centro de Saúde de Exemplo",
        data_documento: null,
        dias_atestados: 1,
        texto: "Justificação de exemplo.",
        ficheiro_nome: null,
        ficheiro_mime: null,
        ficheiro_bytes: null,
      },
    ],
    [],
  );

  const recarregar = useCallback(async (): Promise<void> => undefined, []);

  return {
    picagens,
    picagensRecusadas: false,
    realizado,
    realizadoRecusado: false,
    faltas,
    faltasRecusadas: false,
    planeado,
    planeadoRecusado: false,
    ausenciaAprovadaPorDia,
    loading: false,
    saving: false,
    recarregar,
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

/** As picagens de uma pessoa num dia, no estado actual (para consolidar logo a seguir a gravar). */
function lerGestaoPicagens(pessoaId: string, data: string): Picagem[] {
  return lerGestao()
    .picagens.filter((p) => p.pessoa_id === pessoaId && p.data_local === data && p.estado !== "anulada")
    .sort((a, b) => a.hora_local.localeCompare(b.hora_local));
}
