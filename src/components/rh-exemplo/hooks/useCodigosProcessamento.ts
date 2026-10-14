/** Os códigos de processamento salarial de exemplo, em memória. */
import { useCallback, useMemo } from "react";
import { ORGANIZACAO_EXEMPLO_ID } from "@/components/rh-exemplo/dados/constantes";
import { definirGestao, novoIdGestao, useGestao } from "@/components/rh-exemplo/dados/lojaGestao";
import type {
  HrCodigoProcessamento,
  HrCodigoProcessamentoModoCalculo,
  HrCodigoProcessamentoOrigemAutomatica,
} from "@/components/rh-exemplo/tipos";

export interface NovoCodigoProcessamento {
  codigo: string;
  nome: string;
  descricao: string | null;
  modo_calculo?: HrCodigoProcessamentoModoCalculo;
  percentagem?: number | null;
  valor_fixo?: number | null;
  origem_automatica?: HrCodigoProcessamentoOrigemAutomatica | null;
}

export interface CamposCodigoProcessamento {
  nome: string;
  descricao: string | null;
  modo_calculo: HrCodigoProcessamentoModoCalculo;
  percentagem: number | null;
  valor_fixo: number | null;
  origem_automatica: HrCodigoProcessamentoOrigemAutomatica | null;
}

export function useCodigosProcessamento() {
  const todos = useGestao((g) => g.codigos);
  const codigos = useMemo(() => [...todos].sort((a, b) => a.codigo.localeCompare(b.codigo)), [todos]);

  const criar = useCallback(async (novo: NovoCodigoProcessamento): Promise<void> => {
    const agora = new Date().toISOString();
    const linha: HrCodigoProcessamento = {
      id: novoIdGestao("cod"),
      organization_id: ORGANIZACAO_EXEMPLO_ID,
      codigo: novo.codigo,
      nome: novo.nome,
      descricao: novo.descricao,
      activo: true,
      modo_calculo: novo.modo_calculo ?? "manual",
      percentagem: novo.percentagem ?? null,
      valor_fixo: novo.valor_fixo ?? null,
      origem_automatica: novo.origem_automatica ?? null,
      created_at: agora,
      updated_at: agora,
    };
    definirGestao((g) => ({ ...g, codigos: [...g.codigos, linha] }));
  }, []);

  const actualizar = useCallback(async (id: string, campos: CamposCodigoProcessamento): Promise<void> => {
    definirGestao((g) => ({
      ...g,
      codigos: g.codigos.map((c) => (c.id === id ? { ...c, ...campos, updated_at: new Date().toISOString() } : c)),
    }));
  }, []);

  const definirActivo = useCallback(async (id: string, activo: boolean): Promise<void> => {
    definirGestao((g) => ({ ...g, codigos: g.codigos.map((c) => (c.id === id ? { ...c, activo } : c)) }));
  }, []);

  return { codigos, isLoading: false, error: null as unknown, isSaving: false, criar, actualizar, definirActivo };
}
