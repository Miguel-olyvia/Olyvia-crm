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
import { useCallback, useEffect, useRef, useState } from "react";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { hrFrom, isPermissionError } from "@/lib/hr/hrDb";
import { periodoDaFolha, type IntervaloDaFolha } from "@/lib/hr/periodoFolha";
import type { PessoaRetribuicao } from "@/types/hr";

// `id`: o fecho do periodo grava a versao de retribuicao usada (`retribuicao_id`). O `cargo_periodo_id` NAO se pede aqui:
// `pessoas_retribuicoes` nao tem essa coluna em nenhuma migration (o fecho envia `null`; ver `resultadosFecho.ts`).
const PAGINA_RETRIBUICOES = 1000;
const COLUNAS = "id, pessoa_id, valor_base, periodicidade, duodecimos_pct, valido_de, valido_ate";

/**
 * Formas parciais devolvidas pela query -- so as colunas pedidas em `COLUNAS`.
 * `id` e opcional no tipo para as simulacoes antigas (testes) que nao o trazem; a query pede-o sempre.
 */
export type RetribuicaoVigenteLinha = Pick<
  PessoaRetribuicao,
  "pessoa_id" | "valor_base" | "periodicidade" | "duodecimos_pct" | "valido_de" | "valido_ate"
> & { id?: string };

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
  /** O intervalo da folha (de, ate inclusivos); sem ele, o mes de calendario (dia de inicio 1). */
  intervalo?: IntervaloDaFolha,
) {
  const de = intervalo?.de ?? periodoDaFolha(ano, mes).de;
  const ate = intervalo?.ate ?? periodoDaFolha(ano, mes).ate;
  const [porPessoa, setPorPessoa] = useState<Map<string, RetribuicaoVigenteLinha[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [recusado, setRecusado] = useState(false);
  const [erro, setErro] = useState(false);
  // So a resposta do pedido mais recente escreve no estado (mudar de mes a meio de uma leitura paginada).
  const ultimoPedido = useRef(0);

  const load = useCallback(async () => {
    const pedido = ++ultimoPedido.current;
    // Limpa ANTES de ler: durante a leitura nunca fica o mapa do periodo anterior com o rotulo do novo.
    setPorPessoa(new Map());
    setRecusado(false);
    setErro(false);
    if (!organizationId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const mapa = new Map<string, RetribuicaoVigenteLinha[]>();
    let falhou = false;
    let recusa = false;
    try {
      // PAGINADA: o PostgREST corta nas 1000 linhas em silencio e as versoes sao historico (varias por pessoa). Um mapa
      // truncado daria «sem retribuicao» a quem ficou de fora, e o fecho grava para sempre. `id` desempata a ordem.
      for (let inicio = 0; ; inicio += PAGINA_RETRIBUICOES) {
        const { data, error } = await hrFrom("pessoas_retribuicoes")
          .select(COLUNAS)
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .lte("valido_de", ate)
          .or(`valido_ate.is.null,valido_ate.gt.${de}`)
          .order("id", { ascending: true })
          .range(inicio, inicio + PAGINA_RETRIBUICOES - 1);
        if (error) {
          if (isPermissionError(error)) recusa = true;
          else {
            falhou = true;
            captureFlowError(error, "hr-retribuicoes-vigentes-organizacao-load");
          }
          break;
        }
        const pagina = (data ?? []) as RetribuicaoVigenteLinha[];
        for (const linha of pagina) {
          const lista = mapa.get(linha.pessoa_id) ?? [];
          lista.push(linha);
          mapa.set(linha.pessoa_id, lista);
        }
        if (pagina.length < PAGINA_RETRIBUICOES) break;
      }
    } catch (e) {
      falhou = true;
      captureFlowError(e, "hr-retribuicoes-vigentes-organizacao-load");
    }
    if (pedido !== ultimoPedido.current) return;
    // Falhar fechado: uma falha ou recusa a meio descarta tambem as paginas ja lidas (nunca um mapa parcial).
    setPorPessoa(falhou || recusa ? new Map() : mapa);
    setRecusado(recusa);
    setErro(falhou);
    setLoading(false);
  }, [organizationId, de, ate]);

  useEffect(() => {
    void load();
  }, [load]);

  /** `ok` so com a leitura completa: sem erro, sem recusa e fora do carregamento. */
  const estado: "ok" | "a_carregar" | "recusado" | "erro" = loading ? "a_carregar" : erro ? "erro" : recusado ? "recusado" : "ok";

  return { porPessoa, loading, recusado, erro, estado, recarregar: load };
}
