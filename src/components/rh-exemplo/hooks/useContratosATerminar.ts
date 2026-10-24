/** A lista de contratos a terminar, calculada sobre as fichas de exemplo. */
import { useCallback, useMemo } from "react";
import { hojeIso } from "@/components/rh-exemplo/dados/datas";
import { useEstadoRh } from "@/components/rh-exemplo/dados/loja";
import type { ContratoATerminar } from "@/components/rh-exemplo/lib/fimContrato";

const MS_DIA = 86_400_000;

export function useContratosATerminar(_organizationId: string | undefined, dias: number | null) {
  const fichas = useEstadoRh((e) => e.fichas);

  const contratos = useMemo<ContratoATerminar[]>(() => {
    const hoje = Date.parse(`${hojeIso()}T00:00:00Z`);
    const lista: ContratoATerminar[] = [];
    for (const ficha of Object.values(fichas)) {
      for (const v of ficha.vinculos) {
        if (v.estado !== "activo" || v.data_fim === null) continue;
        const restantes = Math.round((Date.parse(`${v.data_fim}T00:00:00Z`) - hoje) / MS_DIA);
        if (restantes < 0 || (dias !== null && restantes > dias)) continue;
        const resposta = ficha.respostasFim[v.id];
        lista.push({
          vinculo_id: v.id,
          pessoa_id: ficha.pessoa.id,
          pessoa_nome: ficha.pessoa.nome_completo,
          responsavel_nome: ficha.pessoa.reporta_a_pessoa_id
            ? (fichas[ficha.pessoa.reporta_a_pessoa_id]?.pessoa.nome_completo ?? null)
            : null,
          tipo_contrato: v.tipo_contrato,
          data_inicio: v.data_inicio,
          data_fim: v.data_fim,
          dias_restantes: restantes,
          renovacoes_realizadas: ficha.renovacoes.filter((r) => r.vinculo_id === v.id).length,
          max_renovacoes: 2,
          ativo: true,
          renovacao_automatica: false,
          dias_aviso: 30,
          ao_atingir_limite: "decisao_manual_rh",
          fonte: "organizacao",
          o_que_acontece: "decisao_rh",
          fim_decisao: null,
          resposta: resposta?.resposta ?? null,
          resposta_em: resposta?.em ?? null,
        });
      }
    }
    return lista.sort((a, b) => a.dias_restantes - b.dias_restantes);
  }, [fichas, dias]);

  const recarregar = useCallback(async (): Promise<void> => undefined, []);
  return { contratos, isLoading: false, error: null as Error | null, recarregar };
}
