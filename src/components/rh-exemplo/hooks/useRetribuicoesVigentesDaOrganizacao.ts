/**
 * As retribuições de TODA a organização de exemplo que se sobrepõem a um mês, lidas das fichas em memória.
 * Feito para o resumo de "Processamento Salarial". As duas funções puras escolhem a retribuição que vigora
 * no fim do mês e dizem se mudou a meio.
 */
import { useCallback, useMemo } from "react";
import { useEstadoRh } from "@/components/rh-exemplo/dados/loja";
import type { PessoaRetribuicao } from "@/components/rh-exemplo/tipos";

export type RetribuicaoVigenteLinha = Pick<
  PessoaRetribuicao,
  "pessoa_id" | "valor_base" | "periodicidade" | "duodecimos_pct" | "subsidio_alimentacao" | "valido_de" | "valido_ate"
>;

/** O primeiro e o último dia do mês (`mes` de 1 a 12), em AAAA-MM-DD, sem passar por UTC. */
export function limitesDoMes(ano: number, mes: number): { primeiroDia: string; ultimoDia: string } {
  const mesTexto = String(mes).padStart(2, "0");
  const primeiroDia = `${ano}-${mesTexto}-01`;
  const ultimoDiaDate = new Date(ano, mes, 0);
  const ultimoDia = `${ultimoDiaDate.getFullYear()}-${String(ultimoDiaDate.getMonth() + 1).padStart(2, "0")}-${String(
    ultimoDiaDate.getDate(),
  ).padStart(2, "0")}`;
  return { primeiroDia, ultimoDia };
}

export interface RetribuicaoVigenteResultado {
  retribuicao: RetribuicaoVigenteLinha | null;
  mudouAMeioDoMes: boolean;
}

/** A versão que vigora no último dia do mês; se houver mais do que uma, avisa que mudou a meio do mês. */
export function escolherRetribuicaoVigente(
  versoes: readonly RetribuicaoVigenteLinha[],
  ultimoDiaDoMes: string,
): RetribuicaoVigenteResultado {
  if (versoes.length === 0) return { retribuicao: null, mudouAMeioDoMes: false };
  if (versoes.length === 1) return { retribuicao: versoes[0], mudouAMeioDoMes: false };

  const cobreUltimoDia = versoes.find(
    (v) => v.valido_de <= ultimoDiaDoMes && (v.valido_ate === null || v.valido_ate > ultimoDiaDoMes),
  );
  if (cobreUltimoDia) return { retribuicao: cobreUltimoDia, mudouAMeioDoMes: true };

  const maisRecente = [...versoes].sort((a, b) => b.valido_de.localeCompare(a.valido_de))[0];
  return { retribuicao: maisRecente, mudouAMeioDoMes: true };
}

export function useRetribuicoesVigentesDaOrganizacao(
  organizationId: string | undefined,
  ano: number,
  mes: number,
) {
  const fichas = useEstadoRh((e) => e.fichas);

  const porPessoa = useMemo(() => {
    const mapa = new Map<string, RetribuicaoVigenteLinha[]>();
    if (!organizationId) return mapa;
    const { primeiroDia, ultimoDia } = limitesDoMes(ano, mes);
    for (const ficha of Object.values(fichas)) {
      const linhas = ficha.retribuicoes.filter(
        (r) => r.valido_de <= ultimoDia && (r.valido_ate === null || r.valido_ate > primeiroDia),
      );
      if (linhas.length > 0) mapa.set(ficha.pessoa.id, linhas);
    }
    return mapa;
  }, [fichas, organizationId, ano, mes]);

  const recarregar = useCallback(async (): Promise<void> => undefined, []);

  return { porPessoa, loading: false, recusado: false, recarregar };
}
