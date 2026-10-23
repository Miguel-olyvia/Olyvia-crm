/** O período de processamento salarial de um mês (abrir e fechar), em memória. */
import { useCallback, useMemo } from "react";
import { ORGANIZACAO_EXEMPLO_ID } from "@/components/rh-exemplo/dados/constantes";
import { lerEstado } from "@/components/rh-exemplo/dados/loja";
import { definirGestao, lerGestao, novoIdGestao, useGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import type { HrPeriodoProcessamento } from "@/components/rh-exemplo/tipos";

export function useProcessamentoPeriodo(ano: number, mes: number) {
  const periodos = useGestao((g) => g.periodos);
  const periodo = useMemo<HrPeriodoProcessamento | null>(
    () => periodos.find((p) => p.ano === ano && p.mes === mes) ?? null,
    [periodos, ano, mes],
  );

  const abrir = useCallback(async (): Promise<string | null> => {
    if (lerGestao().periodos.some((p) => p.ano === ano && p.mes === mes)) return null;
    const agora = new Date().toISOString();
    const novo: HrPeriodoProcessamento = {
      id: novoIdGestao("per"),
      organization_id: ORGANIZACAO_EXEMPLO_ID,
      ano,
      mes,
      estado: "aberto",
      fechado_em: null,
      fechado_por: null,
      created_at: agora,
      created_by: lerEstado().minhaPessoaId,
    };
    definirGestao((g) => ({ ...g, periodos: [...g.periodos, novo] }));
    return null;
  }, [ano, mes]);

  const fechar = useCallback(async (): Promise<string | null> => {
    if (!periodo) return "Sem periodo para fechar";
    definirGestao((g) => ({
      ...g,
      periodos: g.periodos.map((p) =>
        p.id === periodo.id
          ? { ...p, estado: "fechado" as const, fechado_em: new Date().toISOString(), fechado_por: lerEstado().minhaPessoaId }
          : p,
      ),
    }));
    return null;
  }, [periodo]);

  const recarregar = useCallback(async (): Promise<void> => undefined, []);

  return { periodo, loading: false, saving: false, recusado: false, recarregar, abrir, fechar };
}

export type ProcessamentoPeriodo = ReturnType<typeof useProcessamentoPeriodo>;
