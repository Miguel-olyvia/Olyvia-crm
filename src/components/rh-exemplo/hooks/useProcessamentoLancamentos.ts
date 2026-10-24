/** Os lançamentos pontuais de um período de processamento salarial, em memória. */
import { useCallback, useMemo } from "react";
import { ORGANIZACAO_EXEMPLO_ID } from "@/components/rh-exemplo/dados/constantes";
import { lerEstado } from "@/components/rh-exemplo/dados/loja";
import { definirGestao, novoIdGestao, useGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import type { HrProcessamentoLancamento } from "@/components/rh-exemplo/tipos";

export interface NovoLancamentoProcessamento {
  pessoaId: string;
  descricao: string;
  valor: number;
  codigoProcessamentoId: string | null;
}

export function useProcessamentoLancamentos(periodoId: string | undefined) {
  const todos = useGestao((g) => g.lancamentos);
  const lancamentos = useMemo<HrProcessamentoLancamento[]>(
    () => (periodoId ? todos.filter((l) => l.periodo_id === periodoId).sort((a, b) => b.created_at.localeCompare(a.created_at)) : []),
    [todos, periodoId],
  );

  const criar = useCallback(
    async (novo: NovoLancamentoProcessamento): Promise<string | null> => {
      if (!periodoId) return "Sem periodo activo";
      const agora = new Date().toISOString();
      const minha = lerEstado().minhaPessoaId;
      const linha: HrProcessamentoLancamento = {
        id: novoIdGestao("lan"),
        periodo_id: periodoId,
        pessoa_id: novo.pessoaId,
        organization_id: ORGANIZACAO_EXEMPLO_ID,
        descricao: novo.descricao,
        valor: novo.valor,
        codigo_processamento_id: novo.codigoProcessamentoId,
        anulado_em: null,
        anulado_por: null,
        anulado_motivo: null,
        created_at: agora,
        created_by: minha,
        updated_at: agora,
        updated_by: minha,
      };
      definirGestao((g) => ({ ...g, lancamentos: [...g.lancamentos, linha] }));
      return null;
    },
    [periodoId],
  );

  const anular = useCallback(async (lancamentoId: string, motivo: string): Promise<string | null> => {
    definirGestao((g) => ({
      ...g,
      lancamentos: g.lancamentos.map((l) =>
        l.id === lancamentoId
          ? { ...l, anulado_em: new Date().toISOString(), anulado_por: lerEstado().minhaPessoaId, anulado_motivo: motivo }
          : l,
      ),
    }));
    return null;
  }, []);

  const recarregar = useCallback(async (): Promise<void> => undefined, []);

  return { lancamentos, loading: false, saving: false, recusado: false, recarregar, criar, anular };
}

export type ProcessamentoLancamentos = ReturnType<typeof useProcessamentoLancamentos>;
