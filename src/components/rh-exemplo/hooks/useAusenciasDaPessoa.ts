/** Os pedidos, dias, direitos, ajustes e saldos de ausencia de uma pessoa de exemplo; as acoes escrevem no store. */
import { useCallback, useMemo } from "react";
import { montarPedido } from "@/components/rh-exemplo/dados/fichaTempo";
import { atualizarFicha, lerEstado, novoId, useFichaRh } from "@/components/rh-exemplo/dados/loja";
import type { FichaRh } from "@/components/rh-exemplo/dados/tiposLoja";
import { arredondarDias, indexarFeriados, type IndiceFeriados } from "@/components/rh-exemplo/lib/ausencias";
import type {
  AusenciaAjuste,
  AusenciaDecisao,
  AusenciaDia,
  AusenciaDireito,
  AusenciaJustificacaoRevelada,
  AusenciaPedido,
  AusenciaSaldo,
  EstadoDia,
  EstadoPedido,
  MotivoAjuste,
} from "@/components/rh-exemplo/tiposAusencias";

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
  saldosRecusados: boolean;
  ajustesRecusados: boolean;
  direitosRecusados: boolean;
  recarregar: () => Promise<void>;
}

const FERIADOS = indexarFeriados([]);
const VAZIO: FichaRh["ausencias"] = { pedidos: [], decisoes: [], dias: [], direitos: [], ajustes: [] };

function calcularSaldos(a: FichaRh["ausencias"], pessoaId: string, org: string): AusenciaSaldo[] {
  return a.direitos.map((d) => {
    const dias = a.dias.filter((x) => x.tipo_id === d.tipo_id && x.periodo_inicio === d.periodo_inicio && x.conta_saldo);
    const soma = (estado: EstadoDia) =>
      arredondarDias(dias.filter((x) => x.estado === estado).reduce((s, x) => s + x.fraccao_dia, 0));
    const ajustes = arredondarDias(
      a.ajustes
        .filter((x) => x.tipo_id === d.tipo_id && x.periodo_inicio === d.periodo_inicio && !x.anulado_em)
        .reduce((s, x) => s + x.dias, 0),
    );
    const utilizados = soma("aprovado");
    const pendentes = soma("pendente");
    return {
      pessoa_id: pessoaId,
      organization_id: org,
      tipo_id: d.tipo_id,
      periodo_inicio: d.periodo_inicio,
      adquiridos: d.dias_direito,
      ajustes,
      utilizados,
      pendentes,
      disponiveis: arredondarDias(d.dias_direito + ajustes - utilizados - pendentes),
    };
  });
}

function mudarEstado(a: FichaRh["ausencias"], pedidoId: string, estado: EstadoPedido): FichaRh["ausencias"] {
  const estadoDia: EstadoDia =
    estado === "aprovado" ? "aprovado" : estado === "recusado" ? "recusado" : estado === "cancelado" ? "cancelado" : "pendente";
  return {
    ...a,
    pedidos: a.pedidos.map((p) => (p.id === pedidoId ? { ...p, estado } : p)),
    dias: a.dias.map((d) => (d.pedido_id === pedidoId ? { ...d, estado: estadoDia } : d)),
  };
}

export function useAusenciasDaPessoa(pessoaId: string | undefined) {
  const ficha = useFichaRh(pessoaId);
  const dados = ficha?.ausencias ?? VAZIO;
  const org = ficha?.pessoa.organization_id ?? "";

  const alterar = useCallback(
    (fn: (a: FichaRh["ausencias"], f: FichaRh) => FichaRh["ausencias"]): Promise<string | null> => {
      if (!pessoaId) return Promise.resolve("Sem pessoa");
      atualizarFicha(pessoaId, (f) => ({ ...f, ausencias: fn(f.ausencias, f) }));
      return Promise.resolve(null);
    },
    [pessoaId],
  );

  const criar = useCallback(
    (args: {
      tipoId: string;
      dataInicio: string;
      dataFim: string;
      meioDiaInicio: boolean;
      meioDiaFim: boolean;
      vinculoId?: string | null;
      substituiPedidoId?: string | null;
      origem?: "board" | "ficha";
    }): Promise<string | null> =>
      alterar((a, f) => {
        const tipo = lerEstado().tiposAusencia.find((t) => t.id === args.tipoId);
        if (!tipo || !pessoaId) return a;
        const { pedido, dias } = montarPedido({
          id: novoId("ped"),
          org,
          pessoaId,
          tipo,
          vinculoId: args.vinculoId ?? f.vinculos[0]?.id ?? null,
          dataInicio: args.dataInicio,
          dataFim: args.dataFim,
          meioDiaInicio: args.meioDiaInicio,
          meioDiaFim: args.meioDiaFim,
          estado: tipo.exige_aprovacao_chefia ? "pendente_chefia" : "aprovado",
          aprovadorId: f.pessoa.reporta_a_pessoa_id,
          criadoPorId: pessoaId,
          origem: args.origem,
          substituiPedidoId: args.substituiPedidoId,
        });
        return { ...a, pedidos: [pedido, ...a.pedidos], dias: [...a.dias, ...dias] };
      }),
    [alterar, org, pessoaId],
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
    }) => criar(args),
    [criar],
  );

  const pedirAlteracao = useCallback(
    (args: {
      pedidoOriginalId: string;
      novaDataInicio: string;
      novaDataFim: string;
      novoMeioDiaInicio: boolean;
      novoMeioDiaFim: boolean;
      motivo: string | null;
    }) => {
      const original = dados.pedidos.find((p) => p.id === args.pedidoOriginalId);
      if (!original) return Promise.resolve("Pedido desconhecido");
      return criar({
        tipoId: original.tipo_id,
        dataInicio: args.novaDataInicio,
        dataFim: args.novaDataFim,
        meioDiaInicio: args.novoMeioDiaInicio,
        meioDiaFim: args.novoMeioDiaFim,
        vinculoId: original.vinculo_id,
        substituiPedidoId: original.id,
      });
    },
    [criar, dados.pedidos],
  );

  const cancelar = useCallback(
    (pedidoId: string, _motivo: string) => alterar((a) => mudarEstado(a, pedidoId, "cancelado")),
    [alterar],
  );

  const decidir = useCallback(
    (
      pedidoId: string,
      passo: "chefia" | "rh",
      resultado: AusenciaDecisao["resultado"],
      motivo: string | null | undefined,
      proximo: EstadoPedido,
    ) =>
      alterar((a) => {
        const decisao: AusenciaDecisao = {
          id: novoId("dec"),
          pedido_id: pedidoId,
          pessoa_id: pessoaId ?? "",
          organization_id: org,
          ordem: a.decisoes.filter((d) => d.pedido_id === pedidoId).length + 1,
          passo,
          resultado,
          decidido_por_pessoa_id: lerEstado().minhaPessoaId,
          decidido_em: new Date().toISOString(),
          motivo: motivo ?? null,
          ajuste_data_inicio: null,
          ajuste_data_fim: null,
          ajuste_dias: null,
        };
        return { ...mudarEstado(a, pedidoId, proximo), decisoes: [...a.decisoes, decisao] };
      }),
    [alterar, org, pessoaId],
  );

  const decidirChefia = useCallback(
    (args: {
      pedidoId: string;
      resultado: "aprovado" | "recusado" | "ajustado";
      motivo?: string | null;
      ajusteDataInicio?: string | null;
      ajusteDataFim?: string | null;
    }) => {
      const pedido = dados.pedidos.find((p) => p.id === args.pedidoId);
      const tipo = lerEstado().tiposAusencia.find((t) => t.id === pedido?.tipo_id);
      const proximo: EstadoPedido =
        args.resultado === "recusado" ? "recusado" : tipo?.exige_aprovacao_rh ? "pendente_rh" : "aprovado";
      return decidir(args.pedidoId, "chefia", args.resultado, args.motivo, proximo);
    },
    [decidir, dados.pedidos],
  );

  const decidirRh = useCallback(
    (args: { pedidoId: string; resultado: "aprovado" | "recusado" | "devolvido"; motivo?: string | null }) =>
      decidir(
        args.pedidoId,
        "rh",
        args.resultado,
        args.motivo,
        args.resultado === "aprovado" ? "aprovado" : args.resultado === "recusado" ? "recusado" : "pendente_chefia",
      ),
    [decidir],
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
      alterar((a) => ({
        ...a,
        ajustes: [
          {
            id: novoId("aj"),
            pessoa_id: pessoaId ?? "",
            organization_id: org,
            tipo_id: args.tipoId,
            periodo_inicio: args.periodoInicio,
            periodo_fim: args.periodoFim,
            dias: args.dias,
            motivo_codigo: args.motivoCodigo,
            motivo: args.motivo,
            documento_ref: args.documentoRef ?? null,
            aplicado_em: new Date().toISOString(),
            anulado_em: null,
            anulacao_motivo: null,
          },
          ...a.ajustes,
        ],
      })),
    [alterar, org, pessoaId],
  );

  const anularAjuste = useCallback(
    (ajusteId: string, motivo: string) =>
      alterar((a) => ({
        ...a,
        ajustes: a.ajustes.map((x) =>
          x.id === ajusteId ? { ...x, anulado_em: new Date().toISOString(), anulacao_motivo: motivo } : x,
        ),
      })),
    [alterar],
  );

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
      alterar((a, f) => {
        const novo: AusenciaDireito = {
          id: args.id ?? novoId("ad"),
          pessoa_id: pessoaId ?? "",
          organization_id: org,
          tipo_id: args.tipoId,
          vinculo_id: f.vinculos[0]?.id ?? null,
          periodo_inicio: args.periodoInicio,
          periodo_fim: args.periodoFim,
          dias_direito: args.diasDireito,
          minutos_direito: null,
          origem: args.origem,
          notas: args.notas ?? null,
        };
        return {
          ...a,
          direitos: args.id ? a.direitos.map((d) => (d.id === args.id ? novo : d)) : [...a.direitos, novo],
        };
      }),
    [alterar, org, pessoaId],
  );

  const revelarJustificacao = useCallback(
    async (pedidoId: string): Promise<AusenciaJustificacaoRevelada[]> => [
      {
        id: `just-${pedidoId}`,
        tipo_documento: "Atestado médico",
        documento_ref: "ATM-0192",
        texto: "Justificação de exemplo.",
        entidade_emissora: "Centro de Saúde de Exemplo",
        data_documento: null,
      },
    ],
    [],
  );

  const verMotivo = useCallback(async (_pedidoId: string): Promise<string | null> => "Motivo de exemplo.", []);
  const recarregar = useCallback(async (): Promise<void> => undefined, []);

  const decisoesPorPedido = useMemo(() => {
    const mapa = new Map<string, AusenciaDecisao[]>();
    for (const d of dados.decisoes) mapa.set(d.pedido_id, [...(mapa.get(d.pedido_id) ?? []), d]);
    return mapa;
  }, [dados.decisoes]);

  const saldos = useMemo(() => calcularSaldos(dados, pessoaId ?? "", org), [dados, pessoaId, org]);

  return {
    pedidos: dados.pedidos,
    decisoesPorPedido,
    dias: dados.dias,
    direitos: dados.direitos,
    direitosRecusados: false,
    ajustes: dados.ajustes,
    ajustesRecusados: false,
    saldos,
    saldosRecusados: false,
    feriados: FERIADOS,
    loading: false,
    saving: false,
    recarregar,
    pedir,
    pedirAlteracao,
    cancelar,
    corrigirAprovado: cancelar,
    decidirChefia,
    decidirRh,
    ajustarSaldo,
    anularAjuste,
    guardarDireito,
    revelarJustificacao,
    verMotivo,
  };
}
