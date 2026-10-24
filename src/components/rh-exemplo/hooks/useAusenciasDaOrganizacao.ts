/**
 * Os pedidos de ausência de TODA a organização de exemplo, com as decisões (chefia e RH), em memória.
 * Mesma assinatura do hook do módulo real; as decisões escrevem na ficha da pessoa a quem o pedido pertence.
 */
import { useCallback, useMemo } from "react";
import { atualizarFicha, lerEstado, novoId, useEstadoRh } from "@/components/rh-exemplo/dados/loja";
import type { FichaRh } from "@/components/rh-exemplo/dados/tiposLoja";
import type {
  AusenciaDecisao,
  AusenciaDia,
  AusenciaPedido,
  EstadoDia,
  EstadoPedido,
} from "@/components/rh-exemplo/tiposAusencias";

export interface OpcoesOrganizacao {
  anoDoMapa?: number;
}

const ESTADO_DO_DIA: Record<EstadoPedido, EstadoDia> = {
  aprovado: "aprovado",
  recusado: "recusado",
  cancelado: "cancelado",
  pendente_chefia: "pendente",
  pendente_rh: "pendente",
} as unknown as Record<EstadoPedido, EstadoDia>;

function donoDoPedido(pedidoId: string): FichaRh | null {
  return Object.values(lerEstado().fichas).find((f) => f.ausencias.pedidos.some((p) => p.id === pedidoId)) ?? null;
}

function mudarEstado(a: FichaRh["ausencias"], pedidoId: string, estado: EstadoPedido): FichaRh["ausencias"] {
  const estadoDia = ESTADO_DO_DIA[estado] ?? "pendente";
  return {
    ...a,
    pedidos: a.pedidos.map((p) => (p.id === pedidoId ? { ...p, estado } : p)),
    dias: a.dias.map((d) => (d.pedido_id === pedidoId ? { ...d, estado: estadoDia } : d)),
  };
}

function registarDecisao(
  pedidoId: string,
  passo: "chefia" | "rh",
  resultado: AusenciaDecisao["resultado"],
  motivo: string | null | undefined,
  proximo: EstadoPedido,
  ajuste?: { inicio?: string | null; fim?: string | null },
): Promise<string | null> {
  const dono = donoDoPedido(pedidoId);
  if (!dono) return Promise.resolve("Pedido desconhecido");
  atualizarFicha(dono.pessoa.id, (f) => {
    const decisao: AusenciaDecisao = {
      id: novoId("dec"),
      pedido_id: pedidoId,
      pessoa_id: f.pessoa.id,
      organization_id: f.pessoa.organization_id,
      ordem: f.ausencias.decisoes.filter((d) => d.pedido_id === pedidoId).length + 1,
      passo,
      resultado,
      decidido_por_pessoa_id: lerEstado().minhaPessoaId,
      decidido_em: new Date().toISOString(),
      motivo: motivo ?? null,
      ajuste_data_inicio: ajuste?.inicio ?? null,
      ajuste_data_fim: ajuste?.fim ?? null,
      ajuste_dias: null,
    };
    const base = mudarEstado(f.ausencias, pedidoId, proximo);
    return { ...f, ausencias: { ...base, decisoes: [...base.decisoes, decisao] } };
  });
  return Promise.resolve(null);
}

export function useAusenciasDaOrganizacao(opcoes: OpcoesOrganizacao = {}) {
  const ano = opcoes.anoDoMapa;
  const fichas = useEstadoRh((e) => e.fichas);

  const pedidos = useMemo<AusenciaPedido[]>(
    () =>
      Object.values(fichas)
        .flatMap((f) => f.ausencias.pedidos)
        .sort((a, b) => b.data_inicio.localeCompare(a.data_inicio)),
    [fichas],
  );
  const decisoes = useMemo<AusenciaDecisao[]>(
    () =>
      Object.values(fichas)
        .flatMap((f) => f.ausencias.decisoes)
        .sort((a, b) => a.decidido_em.localeCompare(b.decidido_em)),
    [fichas],
  );
  const dias = useMemo<AusenciaDia[]>(
    () =>
      ano
        ? Object.values(fichas)
            .flatMap((f) => f.ausencias.dias)
            .filter((d) => d.data >= `${ano}-01-01` && d.data <= `${ano}-12-31`)
        : [],
    [fichas, ano],
  );

  const decidirChefia = useCallback(
    (args: {
      pedidoId: string;
      resultado: "aprovado" | "recusado" | "ajustado";
      motivo?: string | null;
      ajusteDataInicio?: string | null;
      ajusteDataFim?: string | null;
    }) => {
      const dono = donoDoPedido(args.pedidoId);
      const pedido = dono?.ausencias.pedidos.find((p) => p.id === args.pedidoId);
      const tipo = lerEstado().tiposAusencia.find((t) => t.id === pedido?.tipo_id);
      const proximo: EstadoPedido =
        args.resultado === "recusado" ? "recusado" : tipo?.exige_aprovacao_rh ? "pendente_rh" : "aprovado";
      return registarDecisao(args.pedidoId, "chefia", args.resultado, args.motivo, proximo, {
        inicio: args.ajusteDataInicio,
        fim: args.ajusteDataFim,
      });
    },
    [],
  );

  const decidirRh = useCallback(
    (args: { pedidoId: string; resultado: "aprovado" | "recusado" | "devolvido"; motivo?: string | null }) =>
      registarDecisao(
        args.pedidoId,
        "rh",
        args.resultado,
        args.motivo,
        args.resultado === "aprovado" ? "aprovado" : args.resultado === "recusado" ? "recusado" : "pendente_chefia",
      ),
    [],
  );

  const cancelar = useCallback((pedidoId: string, _motivo: string): Promise<string | null> => {
    const dono = donoDoPedido(pedidoId);
    if (!dono) return Promise.resolve("Pedido desconhecido");
    atualizarFicha(dono.pessoa.id, (f) => ({ ...f, ausencias: mudarEstado(f.ausencias, pedidoId, "cancelado") }));
    return Promise.resolve(null);
  }, []);

  const verMotivo = useCallback(async (_pedidoId: string): Promise<string | null> => "Motivo de exemplo.", []);
  const recarregar = useCallback(async (): Promise<void> => undefined, []);

  const decisoesPorPedido = useMemo(() => {
    const mapa = new Map<string, AusenciaDecisao[]>();
    for (const decisao of decisoes) mapa.set(decisao.pedido_id, [...(mapa.get(decisao.pedido_id) ?? []), decisao]);
    return mapa;
  }, [decisoes]);

  const pendentes = useMemo(
    () => pedidos.filter((p) => p.estado === "pendente_chefia" || p.estado === "pendente_rh"),
    [pedidos],
  );

  return {
    pedidos,
    pendentes,
    decisoesPorPedido,
    dias,
    loading: false,
    recusado: false,
    saving: false,
    recarregar,
    decidirChefia,
    decidirRh,
    cancelar,
    corrigirAprovado: cancelar,
    verMotivo,
  };
}
