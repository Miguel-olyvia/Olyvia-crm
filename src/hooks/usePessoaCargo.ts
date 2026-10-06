/**
 * O cargo de UMA pessoa ao longo do tempo (`pessoas_cargos`, fluxo 2) e o unico
 * caminho de escrita, `rpc_hr_pessoa_mudar_cargo`.
 *
 * `pessoas.cargo_id` e DERIVADO da linha em aberto desta tabela: escreve-lo por
 * UPDATE e recusado pela base (HRC10). Por isso este hook nunca faz INSERT nem
 * UPDATE -- so le, e muda o cargo pela RPC, que fecha a linha aberta na data
 * escolhida, abre a nova e refaz as versoes de retribuicao de quem ja a tem.
 *
 * A RPC devolve o que mudou no salario (`salario_antes`, `salario_depois`,
 * `versoes_criadas`); o ecra mostra o AVISO "de X para Y" ANTES de confirmar, a
 * partir dos periodos do cargo, e usa esta resposta so para confirmar. Uma
 * resposta sem as chaves (ou `null`) NAO e um sucesso: ver `respostasRpc.ts`.
 *
 * LEITURA: tres estados distintos, para o ecra nao confundir "sem cargo" com
 * "nao consegui ler" --
 *   - `recusado`: a base recusou por permissao (nao e defeito, nao vai ao Sentry);
 *   - `erroLeitura`: falhou por outro motivo (reportado ao Sentry);
 *   - nenhum dos dois: leu, e `linhas` e a verdade (pode ser vazia).
 * Trocar de `pessoaId` com um pedido ainda a correr ignora a resposta antiga.
 *
 * Os erros da base voltam traduzidos (`mensagemDeErroCargo`); as recusas de
 * regra de negocio (HRC..) e de permissao nao vao para o Sentry.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { hrFrom, hrRpc, isPermissionError } from "@/lib/hr/hrDb";
import { mensagemDeErroCargo } from "@/lib/hr/errosCargo";
import { lerResultadoMudarCargo, type ResultadoMudarCargo } from "@/lib/hr/respostasRpc";
import type { PessoaCargoPeriodo } from "@/lib/hr/cargosPeriodos";

export type { ResultadoMudarCargo };

const COLUNAS = "id, pessoa_id, organization_id, cargo_id, valido_de, valido_ate, motivo";

export interface SaidaMudarCargo {
  /** O texto traduzido da recusa, ou `null` quando correu bem. */
  erro: string | null;
  resultado: ResultadoMudarCargo | null;
}

export function usePessoaCargo(
  pessoaId: string | undefined,
  _organizationId: string | undefined,
) {
  const [linhas, setLinhas] = useState<PessoaCargoPeriodo[]>([]);
  const [loading, setLoading] = useState(true);
  const [recusado, setRecusado] = useState(false);
  const [erroLeitura, setErroLeitura] = useState(false);
  const [saving, setSaving] = useState(false);
  // O pedido corrente: uma resposta so se aplica se ainda for o ultimo lancado.
  const pedidoCorrente = useRef(0);

  const load = useCallback(async () => {
    const pedido = ++pedidoCorrente.current;
    const aindaValido = () => pedido === pedidoCorrente.current;

    if (!pessoaId) {
      setLinhas([]);
      setRecusado(false);
      setErroLeitura(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await hrFrom("pessoas_cargos")
      .select(COLUNAS)
      .eq("pessoa_id", pessoaId)
      .order("valido_de", { ascending: false });
    if (!aindaValido()) return;

    if (error) {
      const permissao = isPermissionError(error);
      if (!permissao) captureFlowError(error, "hr-pessoa-cargo-load");
      setRecusado(permissao);
      setErroLeitura(!permissao);
      // Nunca se deixa o cargo da leitura anterior: seria mostrar um dado que
      // ja nao sabemos se e verdade.
      setLinhas([]);
    } else {
      setRecusado(false);
      setErroLeitura(false);
      setLinhas((data ?? []) as PessoaCargoPeriodo[]);
    }
    setLoading(false);
  }, [pessoaId]);

  useEffect(() => {
    void load();
    return () => {
      // Desmontar (ou trocar de pessoa) invalida o pedido em voo.
      pedidoCorrente.current += 1;
    };
  }, [load]);

  /** A linha em vigor (sem fim) -- no maximo uma, garantida pelo indice unico parcial. */
  const aberta = linhas.find((l) => l.valido_ate === null) ?? null;

  const mudarCargo = useCallback(
    async (cargoId: string, desde: string, motivo: string | null): Promise<SaidaMudarCargo> => {
      if (!pessoaId) {
        // Erro de programacao (ecra montado sem ficha): reporta-se e diz-se.
        const erro = await mensagemDeErroCargo(
          new Error("Ficha sem pessoa resolvida"),
          "hr-pessoa-cargo-write",
        );
        return { erro, resultado: null };
      }
      setSaving(true);
      try {
        const { data, error } = await hrRpc("rpc_hr_pessoa_mudar_cargo", {
          p_pessoa_id: pessoaId,
          p_cargo_id: cargoId,
          p_desde: desde,
          p_motivo: motivo?.trim() ? motivo.trim() : null,
        });
        if (error) throw error;
        // A escrita pode ter acontecido mesmo com uma resposta ilegivel: recarrega
        // sempre, e so depois decide se a resposta e um sucesso.
        await load();
        const resultado = lerResultadoMudarCargo(data);
        if (!resultado) {
          throw new Error("rpc_hr_pessoa_mudar_cargo devolveu uma resposta sem o resultado esperado");
        }
        return { erro: null, resultado };
      } catch (e) {
        return { erro: await mensagemDeErroCargo(e, "hr-pessoa-cargo-write"), resultado: null };
      } finally {
        setSaving(false);
      }
    },
    [pessoaId, load],
  );

  return {
    linhas,
    aberta,
    loading,
    saving,
    recusado,
    erroLeitura,
    recarregar: load,
    mudarCargo,
  };
}
