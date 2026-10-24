/** O catálogo de cargos de exemplo, em memória. Mesma forma do hook real; as acções escrevem no store. */
import { useCallback, useMemo } from "react";
import { diaIso } from "@/components/rh-exemplo/dados/datas";
import { definirEstado, novoId, useEstadoRh } from "@/components/rh-exemplo/dados/loja";
import { periodoDoCargoEm, type HrCargoPeriodo } from "@/components/rh-exemplo/lib/cargosPeriodos";
import type { ResultadoDefinirSalario } from "@/components/rh-exemplo/lib/respostasRpc";
import type { Periodicidade } from "@/components/rh-exemplo/tipos";

export type { ResultadoDefinirSalario };

export interface HrCargo {
  id: string;
  organization_id: string;
  nome: string;
  horas_referencia: number | null;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface NovoCargoRH {
  nome: string;
  salario_base: number;
  periodicidade: Periodicidade;
  horas_referencia: number | null;
}

export interface EdicaoCargoRH {
  id: string;
  nome: string;
  horas_referencia: number | null;
}

export function useCargos() {
  const cargos = useEstadoRh((e) => e.cargos);
  const periodos = useEstadoRh((e) => e.cargosPeriodos);

  const salarioDoCargoEm = useCallback(
    (cargoId: string, data: string): HrCargoPeriodo | null => periodoDoCargoEm(periodos, cargoId, data),
    [periodos],
  );

  const criar = useCallback(async (novo: NovoCargoRH): Promise<void> => {
    const id = novoId("cg");
    const agora = new Date().toISOString();
    definirEstado((e) => ({
      ...e,
      cargos: [
        ...e.cargos,
        {
          id,
          organization_id: e.cargos[0]?.organization_id ?? "",
          nome: novo.nome,
          horas_referencia: novo.horas_referencia,
          activo: true,
          created_at: agora,
          updated_at: agora,
        },
      ],
      cargosPeriodos: [
        ...e.cargosPeriodos,
        {
          id: novoId("cp"),
          cargo_id: id,
          salario_base: novo.salario_base,
          periodicidade: novo.periodicidade,
          valido_de: diaIso(0),
          valido_ate: null,
          motivo: null,
        },
      ],
    }));
  }, []);

  const editar = useCallback(async (edicao: EdicaoCargoRH): Promise<void> => {
    definirEstado((e) => ({
      ...e,
      cargos: e.cargos.map((c) =>
        c.id === edicao.id ? { ...c, nome: edicao.nome, horas_referencia: edicao.horas_referencia } : c,
      ),
    }));
  }, []);

  const definirActivo = useCallback(async (id: string, activo: boolean): Promise<void> => {
    definirEstado((e) => ({ ...e, cargos: e.cargos.map((c) => (c.id === id ? { ...c, activo } : c)) }));
  }, []);

  const definirSalario = useCallback(
    async (
      cargoId: string,
      salarioBase: number,
      periodicidade: Periodicidade,
      validoDe: string,
      motivo: string,
    ): Promise<ResultadoDefinirSalario> => {
      const periodoId = novoId("cp");
      let actualizadas = 0;
      definirEstado((e) => {
        const fichas = { ...e.fichas };
        for (const [id, ficha] of Object.entries(e.fichas)) {
          if (ficha.pessoa.cargo_id !== cargoId || ficha.retribuicoes.length === 0) continue;
          actualizadas += 1;
          const base = ficha.retribuicoes[0];
          fichas[id] = {
            ...ficha,
            retribuicoes: [
              ...ficha.retribuicoes.map((r) =>
                r.valido_ate === null && r.valido_de < validoDe ? { ...r, valido_ate: validoDe } : r,
              ),
              {
                ...base,
                id: novoId("ret"),
                valor_base: salarioBase,
                periodicidade,
                valido_de: validoDe,
                valido_ate: null,
                motivo,
                origem: "subida_cargo" as const,
              },
            ],
          };
        }
        return {
          ...e,
          fichas,
          cargosPeriodos: [
            ...e.cargosPeriodos.map((p) =>
              p.cargo_id === cargoId && p.valido_ate === null && p.valido_de < validoDe
                ? { ...p, valido_ate: validoDe }
                : p,
            ),
            {
              id: periodoId,
              cargo_id: cargoId,
              salario_base: salarioBase,
              periodicidade,
              valido_de: validoDe,
              valido_ate: null,
              motivo,
            },
          ],
        };
      });
      return { periodo_id: periodoId, pessoas_actualizadas: actualizadas, pessoas_sem_retribuicao: 0 };
    },
    [],
  );

  return useMemo(
    () => ({
      cargos,
      periodos,
      periodosLoading: false,
      periodosError: false,
      salarioDoCargoEm,
      isLoading: false,
      error: null as Error | null,
      isSaving: false,
      criar,
      editar,
      definirActivo,
      definirSalario,
    }),
    [cargos, periodos, salarioDoCargoEm, criar, editar, definirActivo, definirSalario],
  );
}
