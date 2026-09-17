/**
 * As retribuicoes (`pessoas_retribuicoes`, 20261120060000/20261124090000) de
 * TODA a organizacao que se sobrepoem a um mes -- UMA query, ao contrario de
 * `usePessoaRetribuicao` (uma pessoa de cada vez). Feito para o resumo de
 * "Processamento Salarial" (`ProcessamentoVisaoGeralTab`), que precisa da
 * retribuicao de todas as pessoas activas ao mesmo tempo sem abrir uma query
 * por pessoa.
 *
 * PODE HAVER MAIS DO QUE UMA VERSAO A SOBREPOR O MES -- NAO SE ESCONDE ISSO
 * ---------------------------------------------------------------------------
 * Uma retribuicao pode mudar a meio do mes (ex.: aumento a 15 de Setembro).
 * Este hook devolve TODAS as versoes que tocam o intervalo do mes, por
 * pessoa -- a escolha de qual delas conta para o processamento (e o aviso
 * correspondente) fica em `escolherRetribuicaoVigente`, abaixo, para quem
 * consome o mapa decidir com o contexto todo.
 *
 * MESMO TRATAMENTO DE PERMISSAO QUE OS OUTROS HOOKS DO MODULO
 * -----------------------------------------------------------
 * `hr.pessoas.retribuicao.view` e `is_dangerous` -- uma recusa aqui e a
 * resposta correcta para quem nao a tem, nao um incidente. Segue o mesmo
 * padrao de `useProcessamentoLancamentos.ts`: `recusado=true` e mapa vazio,
 * sem `captureFlowError`.
 */
import { useCallback, useEffect, useState } from "react";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { hrFrom, isPermissionError } from "@/lib/hr/hrDb";
import type { PessoaRetribuicao } from "@/types/hr";

const COLUNAS = "pessoa_id, valor_base, periodicidade, duodecimos_pct, subsidio_alimentacao, valido_de, valido_ate";

/** Formas parciais devolvidas pela query -- so as colunas pedidas em `COLUNAS`. */
export type RetribuicaoVigenteLinha = Pick<
  PessoaRetribuicao,
  "pessoa_id" | "valor_base" | "periodicidade" | "duodecimos_pct" | "subsidio_alimentacao" | "valido_de" | "valido_ate"
>;

/** Primeiro e ultimo dia (ISO, `YYYY-MM-DD`) de um mes -- 1-indexado como no resto do modulo. */
export function limitesDoMes(ano: number, mes: number): { primeiroDia: string; ultimoDia: string } {
  const mesTexto = String(mes).padStart(2, "0");
  const primeiroDia = `${ano}-${mesTexto}-01`;
  // Dia 0 do mes seguinte = ultimo dia deste mes.
  const ultimoDiaDate = new Date(ano, mes, 0);
  const ultimoDia = `${ultimoDiaDate.getFullYear()}-${String(ultimoDiaDate.getMonth() + 1).padStart(2, "0")}-${String(
    ultimoDiaDate.getDate(),
  ).padStart(2, "0")}`;
  return { primeiroDia, ultimoDia };
}

export interface RetribuicaoVigenteResultado {
  /** `null` = nao ha nenhuma versao a cobrir o mes. */
  retribuicao: RetribuicaoVigenteLinha | null;
  /** Mais de uma versao tocou o mes -- a retribuicao mudou a meio dele. */
  mudouAMeioDoMes: boolean;
}

/**
 * Decisao ja tomada (P2 do artefacto de decisoes): vale a retribuicao em
 * vigor no ULTIMO DIA do mes. Se nenhuma cobrir exactamente esse dia (nao
 * deveria acontecer com o trigger de nao-sobreposicao, mas nao se assume),
 * cai-se para a de `valido_de` mais recente.
 */
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
  const [porPessoa, setPorPessoa] = useState<Map<string, RetribuicaoVigenteLinha[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [recusado, setRecusado] = useState(false);

  const load = useCallback(async () => {
    if (!organizationId) {
      setPorPessoa(new Map());
      setLoading(false);
      return;
    }
    setLoading(true);
    const { primeiroDia, ultimoDia } = limitesDoMes(ano, mes);
    const { data, error } = await hrFrom("pessoas_retribuicoes")
      .select(COLUNAS)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .lte("valido_de", ultimoDia)
      .or(`valido_ate.is.null,valido_ate.gt.${primeiroDia}`);
    if (error) {
      if (isPermissionError(error)) {
        setRecusado(true);
        setPorPessoa(new Map());
      } else {
        captureFlowError(error, "hr-retribuicoes-vigentes-organizacao-load");
        // Falhar fechado: sem isto, o ecra continuaria a mostrar o mapa do
        // mes anterior, agora rotulado com o mes novo, sem aviso nenhum.
        setPorPessoa(new Map());
      }
    } else {
      setRecusado(false);
      const mapa = new Map<string, RetribuicaoVigenteLinha[]>();
      for (const linha of (data ?? []) as RetribuicaoVigenteLinha[]) {
        const lista = mapa.get(linha.pessoa_id) ?? [];
        lista.push(linha);
        mapa.set(linha.pessoa_id, lista);
      }
      setPorPessoa(mapa);
    }
    setLoading(false);
  }, [organizationId, ano, mes]);

  useEffect(() => {
    void load();
  }, [load]);

  return { porPessoa, loading, recusado, recarregar: load };
}
