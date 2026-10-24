/** As versoes de horas contratadas de uma pessoa de exemplo (em memoria). */
import { useCallback } from "react";
import { atualizarFicha, novoId, useFichaRh } from "@/components/rh-exemplo/dados/loja";
import type { HorasFrequencia, PessoaVinculoHoras } from "@/components/rh-exemplo/tipos";

export interface CorrigirVersaoHorasPatch {
  horasPeriodo: number;
  horasFrequencia: HorasFrequencia;
  validoDe: string;
  validoAte: string;
  motivo: string | null;
  documentoId: string | null;
}

const SEM_VERSOES: PessoaVinculoHoras[] = [];

export function usePessoaVinculoHoras(pessoaId: string | undefined, _organizationId: string | undefined) {
  const ficha = useFichaRh(pessoaId);
  const versoes = ficha?.horasVersoes ?? SEM_VERSOES;
  const aberta = versoes.find((v) => v.valido_ate === null) ?? null;

  const alterar = useCallback(
    async (args: {
      vinculoId: string | null;
      horasPeriodo: number;
      horasFrequencia: HorasFrequencia;
      dataEfeito: string;
      motivo: string | null;
      documentoId?: string | null;
    }): Promise<string | null> => {
      if (!pessoaId) return "Sem pessoa";
      atualizarFicha(pessoaId, (f) => ({
        ...f,
        horasVersoes: [
          ...f.horasVersoes.map((v) => (v.valido_ate === null ? { ...v, valido_ate: args.dataEfeito } : v)),
          {
            id: novoId("hv"),
            pessoa_id: pessoaId,
            organization_id: f.pessoa.organization_id,
            vinculo_id: args.vinculoId,
            horas_periodo: args.horasPeriodo,
            horas_frequencia: args.horasFrequencia,
            horas_semanais_equivalentes: args.horasFrequencia === "semanal" ? args.horasPeriodo : null,
            valido_de: args.dataEfeito,
            valido_ate: null,
            motivo: args.motivo,
            documento_id: args.documentoId ?? null,
          },
        ],
        vinculos: f.vinculos.map((v) =>
          v.id === args.vinculoId
            ? { ...v, horas_periodo: args.horasPeriodo, horas_frequencia: args.horasFrequencia }
            : v,
        ),
      }));
      return null;
    },
    [pessoaId],
  );

  const corrigir = useCallback(
    async (versaoId: string, patch: CorrigirVersaoHorasPatch): Promise<string | null> => {
      if (!pessoaId) return "Sem pessoa";
      atualizarFicha(pessoaId, (f) => ({
        ...f,
        horasVersoes: f.horasVersoes.map((v) =>
          v.id === versaoId
            ? {
                ...v,
                horas_periodo: patch.horasPeriodo,
                horas_frequencia: patch.horasFrequencia,
                valido_de: patch.validoDe,
                valido_ate: patch.validoAte,
                motivo: patch.motivo,
                documento_id: patch.documentoId,
              }
            : v,
        ),
      }));
      return null;
    },
    [pessoaId],
  );

  const recarregar = useCallback(async (): Promise<void> => undefined, []);

  return { versoes, aberta, loading: false, saving: false, recusado: false, recarregar, alterar, corrigir };
}
