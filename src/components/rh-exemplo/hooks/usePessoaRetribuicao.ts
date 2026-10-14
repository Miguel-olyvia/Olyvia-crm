/** As versoes de retribuicao de uma pessoa de exemplo (em memoria). */
import { useCallback } from "react";
import { atualizarFicha, novoId, useFichaRh } from "@/components/rh-exemplo/dados/loja";
import type { PessoaRetribuicao, SubsidioAlimentacaoModo } from "@/components/rh-exemplo/tipos";

export interface CorrigirVersaoRetribuicaoPatch {
  moeda: string;
  subsidioAlimentacao: number | null;
  subsidioAlimentacaoModo: SubsidioAlimentacaoModo | null;
  duodecimosPct: 0 | 50 | 100 | null;
  validoDe: string;
  validoAte: string;
  motivo: string | null;
}

const SEM_VERSOES: PessoaRetribuicao[] = [];

export function usePessoaRetribuicao(pessoaId: string | undefined, _organizationId: string | undefined) {
  const ficha = useFichaRh(pessoaId);
  const versoes = ficha?.retribuicoes ?? SEM_VERSOES;
  const aberta = versoes.find((v) => v.valido_ate === null) ?? null;

  const definirPessoal = useCallback(
    async (
      desde: string,
      subsidio: number | null,
      subsidioModo: SubsidioAlimentacaoModo | null,
      duodecimosPct: 0 | 50 | 100 | null,
      motivo: string | null,
    ): Promise<string | null> => {
      if (!pessoaId) return "Sem pessoa";
      atualizarFicha(pessoaId, (f) => {
        const base = f.retribuicoes.find((v) => v.valido_ate === null) ?? f.retribuicoes[0];
        if (!base) return f;
        return {
          ...f,
          retribuicoes: [
            ...f.retribuicoes.map((v) => (v.valido_ate === null && v.valido_de < desde ? { ...v, valido_ate: desde } : v)),
            {
              ...base,
              id: novoId("ret"),
              subsidio_alimentacao: subsidio,
              subsidio_alimentacao_modo: subsidioModo,
              duodecimos_pct: duodecimosPct,
              valido_de: desde,
              valido_ate: null,
              motivo,
              origem: "pessoa" as const,
            },
          ],
        };
      });
      return null;
    },
    [pessoaId],
  );

  const corrigir = useCallback(
    async (versaoId: string, patch: CorrigirVersaoRetribuicaoPatch): Promise<string | null> => {
      if (!pessoaId) return "Sem pessoa";
      atualizarFicha(pessoaId, (f) => ({
        ...f,
        retribuicoes: f.retribuicoes.map((v) =>
          v.id === versaoId
            ? {
                ...v,
                moeda: patch.moeda,
                subsidio_alimentacao: patch.subsidioAlimentacao,
                subsidio_alimentacao_modo: patch.subsidioAlimentacaoModo,
                duodecimos_pct: patch.duodecimosPct,
                valido_de: patch.validoDe,
                valido_ate: patch.validoAte,
                motivo: patch.motivo,
              }
            : v,
        ),
      }));
      return null;
    },
    [pessoaId],
  );

  const recarregar = useCallback(async (): Promise<void> => undefined, []);

  return { versoes, aberta, loading: false, saving: false, recusado: false, recarregar, definirPessoal, corrigir };
}
