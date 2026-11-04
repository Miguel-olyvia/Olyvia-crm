import { useCallback, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lerDadosPagamento, paraGravar, type DadosPagamento } from "@/emylia/pagamentoCliente";
import { chamarNeg } from "../chamarNeg";
import { useFontePessoas } from "../useFontePessoas";

/** Chave da leitura, com a organização (para não misturar organizações na cache). */
export const dadosPagamentoQueryKey = (organizationId: string | null | undefined) => ["pessoas-dados-pagamento", organizationId ?? null] as const;

export interface DadosPagamentoHook {
  /** «sem-org» no modo de exemplo (não há empresa para ler). */
  estado: "sem-org" | "a-carregar" | "erro" | "pronto";
  /** null: a empresa ainda não indicou nenhum dado. */
  dados: DadosPagamento | null;
  aGuardar: boolean;
  /** Grava pela função da base e devolve o que ela ficou a ter. Lança se falhar. Um pedido durante outro devolve o que já está em curso. */
  guardar: (d: DadosPagamento) => Promise<DadosPagamento | null>;
  recarregar: () => void;
}

/**
 * 4/11 (Rúben): os dados da empresa para o cliente pagar (negocio_dados_pagamento, 20270106700000). Lê por neg_dados_pagamento_ler e grava
 * SÓ por neg_dados_pagamento_guardar (pessoas.config). `habilitado` false não lê nada (separador fora de vista).
 */
export function useDadosPagamento(habilitado = true): DadosPagamentoHook {
  const fonte = useFontePessoas();
  const client = useQueryClient();
  const organizationId = fonte.modo === "real" ? fonte.organizationId : null;
  const consulta = useQuery({
    queryKey: dadosPagamentoQueryKey(organizationId),
    queryFn: async () => lerDadosPagamento(await chamarNeg<unknown>("neg_dados_pagamento_ler", { p_org: organizationId })),
    enabled: habilitado && !!organizationId,
  });
  const [aGuardar, setAGuardar] = useState(false);
  const emCurso = useRef<Promise<DadosPagamento | null> | null>(null);

  const guardar = useCallback((d: DadosPagamento): Promise<DadosPagamento | null> => {
    if (emCurso.current) return emCurso.current;
    if (!organizationId) return Promise.reject(new Error("Sem organização."));
    setAGuardar(true);
    const voo = (async () => {
      try {
        const depois = lerDadosPagamento(await chamarNeg<unknown>("neg_dados_pagamento_guardar", { p_org: organizationId, p_dados: paraGravar(d) }));
        client.setQueryData(dadosPagamentoQueryKey(organizationId), depois);
        return depois;
      } finally {
        emCurso.current = null;
        setAGuardar(false);
      }
    })();
    emCurso.current = voo;
    return voo;
  }, [organizationId, client]);

  const recarregar = useCallback(() => { void consulta.refetch(); }, [consulta]);
  const estado = !organizationId ? "sem-org" : consulta.isError ? "erro" : consulta.isSuccess ? "pronto" : "a-carregar";
  return { estado, dados: consulta.data ?? null, aGuardar, guardar, recarregar };
}
