/**
 * O mês de assiduidade de MUITA gente e a fila de desvios por despachar, em memória.
 * Lê o valor em vigor (as linhas já substituídas por correcções ficam de fora) e junta tudo num mapa
 * `pessoa|data -> célula`, feito uma vez por leitura e não por célula desenhada.
 */
import { useMemo } from "react";
import { useEstadoRh } from "@/components/rh-exemplo/dados/loja";
import { useGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import { emVigor, LEITOR_FALTAS, LEITOR_REALIZADO } from "@/components/rh-exemplo/lib/assiduidade";
import { comoRealizadoComCorreccao } from "@/components/rh-exemplo/hooks/useAssiduidadeDaPessoa";
import type { HorarioRealizado } from "@/components/rh-exemplo/tipos";

/** O que uma celula do mapa mostra de um dia de uma pessoa. */
export interface CelulaDoDia {
  minutosRealizados: number;
  minutosEmFalta: number;
  /** Os locais onde essa pessoa esteve nesse dia, sem repetir. */
  locais: (string | null)[];
  temDesvio: boolean;
  faltas: number;
  faltasJustificadas: number;
}

function celulaVazia(): CelulaDoDia {
  return { minutosRealizados: 0, minutosEmFalta: 0, locais: [], temDesvio: false, faltas: 0, faltasJustificadas: 0 };
}

export function chaveCelula(pessoaId: string, data: string): string {
  return `${pessoaId}|${data}`;
}

export function useAssiduidadeDaOrganizacao(janela: { de: string; ate: string }) {
  const { de, ate } = janela;
  const fichas = useEstadoRh((e) => e.fichas);
  const todasFaltas = useGestao((g) => g.faltas);
  const todosDesvios = useGestao((g) => g.desvios);

  const realizado = useMemo<HorarioRealizado[]>(() => {
    const todas = Object.values(fichas)
      .flatMap((f) => f.horarioRealizado)
      .filter((r) => r.data >= de && r.data <= ate)
      .map(comoRealizadoComCorreccao);
    return emVigor(todas, LEITOR_REALIZADO).filter((r) => !r.deleted_at);
  }, [fichas, de, ate]);

  const faltas = useMemo(
    () =>
      emVigor(
        todasFaltas.filter((f) => f.data >= de && f.data <= ate),
        LEITOR_FALTAS,
      ),
    [todasFaltas, de, ate],
  );

  const desvios = useMemo(() => todosDesvios.filter((d) => d.data >= de && d.data <= ate), [todosDesvios, de, ate]);

  const celulas = useMemo(() => {
    const mapa = new Map<string, CelulaDoDia>();
    const obter = (pessoaId: string, data: string) => {
      const chave = chaveCelula(pessoaId, data);
      const existente = mapa.get(chave);
      if (existente) return existente;
      const nova = celulaVazia();
      mapa.set(chave, nova);
      return nova;
    };
    for (const linha of realizado) {
      const celula = obter(linha.pessoa_id, linha.data);
      celula.minutosRealizados += linha.minutos ?? 0;
      if (!celula.locais.includes(linha.local_id)) celula.locais.push(linha.local_id);
    }
    for (const falta of faltas) {
      const celula = obter(falta.pessoa_id, falta.data);
      celula.minutosEmFalta += falta.minutos ?? 0;
      celula.faltas += 1;
      if (falta.justificacao_estado === "justificada") celula.faltasJustificadas += 1;
    }
    for (const desvio of desvios) obter(desvio.pessoa_id, desvio.data).temDesvio = true;
    return mapa;
  }, [realizado, faltas, desvios]);

  const pessoasComRegisto = useMemo(() => {
    const ids = new Set<string>();
    for (const linha of realizado) ids.add(linha.pessoa_id);
    for (const falta of faltas) ids.add(falta.pessoa_id);
    for (const desvio of desvios) ids.add(desvio.pessoa_id);
    return ids;
  }, [realizado, faltas, desvios]);

  return {
    realizado,
    faltas,
    desvios,
    celulas,
    pessoasComRegisto,
    recusado: false,
    loading: false,
    recarregar: async (): Promise<void> => undefined,
  };
}
