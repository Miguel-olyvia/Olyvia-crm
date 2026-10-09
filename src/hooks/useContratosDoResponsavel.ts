/**
 * Os contratos que a CHEFIA directa pode indicar, e a indicacao em si.
 *
 * A chefia NAO ve a ficha da pessoa: so o nome, o tipo de contrato, a data de
 * fim e a resposta que ja deu. Tudo passa por duas RPCs que decidem na base:
 *   - `rpc_hr_contratos_do_responsavel(p_organization_id)`: lista vazia se o
 *     utilizador nao e responsavel directo de ninguem (o ecra nao mostra nada);
 *   - `rpc_hr_contrato_indicar(p_vinculo_id, p_resposta)`: devolve a linha
 *     actualizada. So INDICA (pretendo continuar / nao pretendo continuar /
 *     ainda por decidir); quem renova ou termina e o RH.
 * HRV05 = nao e o responsavel desse contrato; HRV08 = resposta invalida.
 */
import { useCallback, useEffect, useState } from "react";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { hrRpc, isPermissionError } from "@/lib/hr/hrDb";
import { mensagemDeErroFimContrato } from "@/lib/hr/errosFimContrato";
import type { ContratoDoResponsavel, RespostaIndicacao } from "@/lib/hr/fimContrato";

export function useContratosDoResponsavel(organizationId: string | null | undefined, ativo: boolean) {
  const [contratos, setContratos] = useState<ContratoDoResponsavel[]>([]);
  const [loading, setLoading] = useState(false);
  const [erroLeitura, setErroLeitura] = useState(false);
  const [aGuardar, setAGuardar] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!organizationId || !ativo) {
      setContratos([]);
      return;
    }
    setLoading(true);
    const { data, error } = await hrRpc("rpc_hr_contratos_do_responsavel", {
      p_organization_id: organizationId,
    });
    if (error) {
      // Sem permissao / nao e responsavel: lista vazia, nao e um defeito.
      const recusa = isPermissionError(error) || error.code === "HRV05";
      if (!recusa) captureFlowError(error, "hr-contrato-fim-load");
      setErroLeitura(!recusa);
      setContratos([]);
    } else {
      setErroLeitura(false);
      setContratos((data ?? []) as ContratoDoResponsavel[]);
    }
    setLoading(false);
  }, [organizationId, ativo]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Devolve o texto de erro traduzido, ou `null` se a indicacao ficou gravada. */
  const indicar = useCallback(
    async (vinculoId: string, resposta: RespostaIndicacao): Promise<string | null> => {
      setAGuardar(vinculoId);
      try {
        const { data, error } = await hrRpc("rpc_hr_contrato_indicar", {
          p_vinculo_id: vinculoId,
          p_resposta: resposta,
        });
        if (error) return await mensagemDeErroFimContrato(error, "hr-contrato-fim-write");
        const actualizada = ((data ?? []) as ContratoDoResponsavel[])[0];
        if (actualizada) {
          setContratos((anteriores) =>
            anteriores.map((c) => (c.vinculo_id === actualizada.vinculo_id ? actualizada : c)),
          );
        } else {
          await load();
        }
        return null;
      } finally {
        setAGuardar(null);
      }
    },
    [load],
  );

  return { contratos, loading, erroLeitura, aGuardar, indicar };
}
