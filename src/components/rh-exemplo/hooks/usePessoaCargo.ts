/** O historico de cargos de uma pessoa de exemplo, e a mudanca de cargo (em memoria). */
import { useCallback } from "react";
import { atualizarFicha, lerEstado, novoId, useFichaRh } from "@/components/rh-exemplo/dados/loja";
import { periodoDoCargoEm, type PessoaCargoPeriodo } from "@/components/rh-exemplo/lib/cargosPeriodos";
import type { ResultadoMudarCargo } from "@/components/rh-exemplo/lib/respostasRpc";

export type { ResultadoMudarCargo };

export interface SaidaMudarCargo {
  erro: string | null;
  resultado: ResultadoMudarCargo | null;
}

const SEM_LINHAS: PessoaCargoPeriodo[] = [];

export function usePessoaCargo(pessoaId: string | undefined, _organizationId: string | undefined) {
  const ficha = useFichaRh(pessoaId);
  const linhas = ficha?.cargosPeriodos ?? SEM_LINHAS;
  const aberta = linhas.find((l) => l.valido_ate === null) ?? null;

  const mudarCargo = useCallback(
    async (cargoId: string, desde: string, motivo: string | null): Promise<SaidaMudarCargo> => {
      if (!pessoaId) return { erro: "Sem pessoa", resultado: null };
      const estado = lerEstado();
      const actual = estado.fichas[pessoaId];
      const cargo = estado.cargos.find((c) => c.id === cargoId);
      if (!actual || !cargo) return { erro: "Cargo desconhecido", resultado: null };
      const antes = actual.retribuicoes.find((r) => r.valido_ate === null) ?? null;
      const salario = periodoDoCargoEm(estado.cargosPeriodos, cargoId, desde);
      atualizarFicha(pessoaId, (f) => ({
        ...f,
        pessoa: { ...f.pessoa, cargo_id: cargoId, cargo: cargo.nome },
        cargosPeriodos: [
          ...f.cargosPeriodos.map((l) => (l.valido_ate === null ? { ...l, valido_ate: desde } : l)),
          {
            id: novoId("pc"),
            pessoa_id: pessoaId,
            cargo_id: cargoId,
            valido_de: desde,
            valido_ate: null,
            motivo,
          },
        ],
        retribuicoes: salario
          ? [
              ...f.retribuicoes.map((r) =>
                r.valido_ate === null && r.valido_de < desde ? { ...r, valido_ate: desde } : r,
              ),
              {
                ...(antes ?? f.retribuicoes[0]),
                id: novoId("ret"),
                valor_base: salario.salario_base,
                periodicidade: salario.periodicidade,
                valido_de: desde,
                valido_ate: null,
                motivo,
                origem: "cargo" as const,
              },
            ]
          : f.retribuicoes,
      }));
      return {
        erro: null,
        resultado: {
          cargo_anterior_id: aberta?.cargo_id ?? null,
          cargo_id: cargoId,
          desde,
          salario_antes: antes?.valor_base ?? null,
          periodicidade_antes: antes?.periodicidade ?? null,
          salario_depois: salario?.salario_base ?? null,
          periodicidade_depois: salario?.periodicidade ?? null,
          versoes_criadas: salario ? 1 : 0,
        },
      };
    },
    [pessoaId, aberta],
  );

  const recarregar = useCallback(async (): Promise<void> => undefined, []);

  return {
    linhas,
    aberta,
    loading: false,
    saving: false,
    recusado: false,
    erroLeitura: false,
    recarregar,
    mudarCargo,
  };
}
