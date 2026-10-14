/** A lista de pessoas de exemplo e os três números do topo, lidos do store em memória. */
import { useCallback, useMemo } from "react";
import { ORGANIZACAO_EXEMPLO_ID } from "@/components/rh-exemplo/dados/constantes";
import { hojeIso } from "@/components/rh-exemplo/dados/datas";
import { fichaDeEspec } from "@/components/rh-exemplo/dados/fichaExemplo";
import { definirEstado, novoId, useEstadoRh } from "@/components/rh-exemplo/dados/loja";
import { derivarEstadoContrato } from "@/components/rh-exemplo/lib/estadoContrato";
import type { EstadoAcesso, PessoaListItem, TipoContrato } from "@/components/rh-exemplo/tipos";

/** O que o assistente de "Nova pessoa" de exemplo recolhe. */
export interface NovaPessoaExemplo {
  primeiro_nome: string;
  apelido: string;
  cargoId: string;
  localId: string;
  tipoContrato: TipoContrato;
  dataInicio: string;
  dataFim: string | null;
  reportaAId: string | null;
}

export interface ResultadoCriacao {
  id: string;
  falhas: Array<{ seccao: string; mensagem: string }>;
}

export interface PessoasStats {
  activos: number;
  entradas90d: number;
  saidas90d: number;
}

const DIAS_JANELA = 90;
const MS_DIA = 24 * 60 * 60 * 1000;

function dentroDaJanela(data: string | null): boolean {
  if (!data) return false;
  const diff = Date.parse(`${hojeIso()}T00:00:00Z`) - Date.parse(`${data}T00:00:00Z`);
  return diff >= 0 && diff <= DIAS_JANELA * MS_DIA;
}

function diasAteHoje(data: string): number {
  return Math.round((Date.parse(`${data}T00:00:00Z`) - Date.parse(`${hojeIso()}T00:00:00Z`)) / MS_DIA);
}

export function usePessoas() {
  const ordem = useEstadoRh((e) => e.ordem);
  const fichas = useEstadoRh((e) => e.fichas);

  const pessoas = useMemo<PessoaListItem[]>(
    () =>
      ordem.map((id) => {
        const ficha = fichas[id];
        const estadoAcesso: EstadoAcesso = ficha.conta
          ? "ativo"
          : ficha.convite?.estado === "pendente"
            ? "convidado"
            : "semConta";
        return {
          ...ficha.pessoa,
          estadoAcesso,
          estado_contrato_derivado: derivarEstadoContrato(ficha.vinculos),
        };
      }),
    [ordem, fichas],
  );

  const stats = useMemo<PessoasStats>(
    () => ({
      activos: pessoas.filter((p) => p.estado_registo === "activo").length,
      entradas90d: pessoas.filter((p) => dentroDaJanela(p.data_admissao)).length,
      saidas90d: pessoas.filter((p) => dentroDaJanela(p.data_saida)).length,
    }),
    [pessoas],
  );

  const criarPessoa = useCallback(async (dados: NovaPessoaExemplo): Promise<ResultadoCriacao> => {
    const id = novoId("p");
    definirEstado((e) => {
      const inicio = diasAteHoje(dados.dataInicio);
      const ficha = fichaDeEspec(
        {
          id,
          nome: dados.primeiro_nome,
          apelido: dados.apelido,
          cargoId: dados.cargoId,
          localId: dados.localId,
          filialId: e.locais.find((l) => l.id === dados.localId)?.organograma_node_id ?? "fil-sede",
          tipo: dados.tipoContrato,
          inicio,
          fim: dados.dataFim ? diasAteHoje(dados.dataFim) : null,
          reportaA: dados.reportaAId,
          conta: false,
          estado: inicio > 0 ? "futuro" : "activo",
          genero: "nao_divulgar",
          nascimento: "1995-01-01",
          trabalho: "presencial",
          horas: 40,
          dias: ["seg", "ter", "qua", "qui", "sex"],
          pendencias: ["nif", "niss", "conta_numero"],
        },
        e.ordem.length,
        e,
        ORGANIZACAO_EXEMPLO_ID,
      );
      return { ...e, ordem: [...e.ordem, id], fichas: { ...e.fichas, [id]: ficha } };
    });
    return { id, falhas: [] };
  }, []);

  const refresh = useCallback(async (): Promise<void> => undefined, []);

  return { pessoas, stats, loading: false, error: null as string | null, refresh, criarPessoa };
}
