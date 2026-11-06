/**
 * Os resultados GRAVADOS de um periodo FECHADO (`rpc_hr_processamento_resultados_ler`, migration 20270109900000).
 * Um periodo fechado le o que ficou gravado e NAO recalcula.
 *
 * A RPC devolve no maximo 500 linhas por chamada, ordenadas por `pessoa_id` (keyset): repete-se com o ultimo
 * `pessoa_id` recebido ate vir menos de 500. Zero linhas num periodo fechado = «fechado antes do registo»: o periodo
 * foi fechado antes de os resultados passarem a ser gravados e os valores nao existem.
 * Ler exige `hr.processamento.periodo.view` E `hr.pessoas.retribuicao.view`: sem elas o estado e `recusado`.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { hrRpc, isPermissionError } from "@/lib/hr/hrDb";
import { TAMANHO_PAGINA_RESULTADOS, type ResultadoLido } from "@/lib/hr/resultadosFecho";

/** Salvaguarda: 50 paginas = 25 000 pessoas, muito acima das 5000 que a RPC de fechar aceita. */
const MAX_PAGINAS = 50;

type RespostaPagina = { data: unknown; error: unknown };

/** Le todas as paginas, uma a seguir a outra, a partir do ultimo `pessoa_id` da anterior. */
export async function lerTodasAsPaginas(
  lerPagina: (depois: string | null) => Promise<RespostaPagina>,
): Promise<{ linhas: ResultadoLido[]; erro: unknown }> {
  const linhas: ResultadoLido[] = [];
  let depois: string | null = null;
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina += 1) {
    const { data, error } = await lerPagina(depois);
    if (error) return { linhas: [], erro: error };
    const recebidas = Array.isArray(data) ? (data as ResultadoLido[]) : [];
    linhas.push(...recebidas);
    if (recebidas.length < TAMANHO_PAGINA_RESULTADOS) return { linhas, erro: null };
    const ultimo = recebidas[recebidas.length - 1]?.pessoa_id;
    if (!ultimo) return { linhas: [], erro: new Error("Pagina de resultados sem pessoa_id") };
    depois = ultimo;
  }
  // Nunca devolver uma lista a meio como se estivesse completa.
  return { linhas: [], erro: new Error("Demasiadas paginas de resultados") };
}

export type EstadoResultados = "inactivo" | "a_carregar" | "ok" | "recusado" | "erro";

interface Lido {
  periodoId: string;
  estado: Exclude<EstadoResultados, "inactivo" | "a_carregar">;
  linhas: ResultadoLido[];
}

const SEM_LINHAS: ReadonlyMap<string, ResultadoLido> = new Map();

/** `activo` = o periodo esta fechado (so entao se le); com `false` nao faz nenhum pedido. */
export function useProcessamentoResultados(periodoId: string | undefined, activo: boolean) {
  const [lido, setLido] = useState<Lido | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const pedir = activo && !!periodoId;

  useEffect(() => {
    if (!pedir || !periodoId) return;
    let cancelado = false;
    void (async () => {
      const { linhas, erro } = await lerTodasAsPaginas((depois) =>
        hrRpc("rpc_hr_processamento_resultados_ler", { p_periodo_id: periodoId, p_depois: depois }),
      );
      if (cancelado) return;
      if (erro) {
        const recusado = isPermissionError(erro);
        if (!recusado) captureFlowError(erro, "hr-processamento-resultados-ler");
        setLido({ periodoId, estado: recusado ? "recusado" : "erro", linhas: [] });
        return;
      }
      setLido({ periodoId, estado: "ok", linhas });
    })();
    return () => {
      cancelado = true;
    };
  }, [pedir, periodoId, tentativa]);

  const recarregar = useCallback(() => {
    setLido(null);
    setTentativa((n) => n + 1);
  }, []);

  const daqui = pedir && lido?.periodoId === periodoId ? lido : null;
  const estado: EstadoResultados = !pedir ? "inactivo" : daqui ? daqui.estado : "a_carregar";
  const porPessoa = useMemo<ReadonlyMap<string, ResultadoLido>>(
    () => (daqui && daqui.estado === "ok" ? new Map(daqui.linhas.map((l) => [l.pessoa_id, l])) : SEM_LINHAS),
    [daqui],
  );
  const primeira = daqui?.estado === "ok" ? daqui.linhas[0] : undefined;

  return {
    estado,
    porPessoa,
    /** Quando o periodo foi fechado, tal como ficou gravado nos resultados. */
    fechadoEm: primeira?.fechado_em ?? null,
    fechadoPorNome: primeira?.fechado_por_nome ?? null,
    /** Periodo fechado antes do registo dos resultados: lido com sucesso e sem nenhuma linha. */
    antesDoRegisto: estado === "ok" && porPessoa.size === 0,
    recarregar,
  };
}

export type ProcessamentoResultados = ReturnType<typeof useProcessamentoResultados>;
