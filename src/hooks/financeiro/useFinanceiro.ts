import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  anularFatura,
  lerFila,
  registarFatura,
  validarPagamento,
  type RegistarArgs,
} from "./financeiro";

export const chaveFila = (orgId: string | null | undefined) => ["financeiro", "fila", orgId ?? null] as const;

/** As duas listas do ecrã /financeiro (rpc_fin_fila). */
export function useFilaFinanceiro(orgId: string | null | undefined) {
  return useQuery({
    queryKey: chaveFila(orgId),
    queryFn: () => lerFila(orgId as string),
    enabled: !!orgId,
  });
}

function useRecarregarFila(orgId: string | null | undefined) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: chaveFila(orgId) });
}

export function useRegistarFatura(orgId: string | null | undefined) {
  const recarregar = useRecarregarFila(orgId);
  return useMutation({
    mutationFn: (args: Omit<RegistarArgs, "orgId">) => registarFatura({ ...args, orgId: orgId as string }),
    onSuccess: recarregar,
  });
}

export function useValidarPagamento(orgId: string | null | undefined) {
  const recarregar = useRecarregarFila(orgId);
  return useMutation({
    mutationFn: ({ invoiceId, data }: { invoiceId: string; data: string }) => validarPagamento(invoiceId, data),
    onSuccess: recarregar,
  });
}

export function useAnularFatura(orgId: string | null | undefined) {
  const recarregar = useRecarregarFila(orgId);
  return useMutation({
    mutationFn: ({ invoiceId, motivo }: { invoiceId: string; motivo: string }) => anularFatura(invoiceId, motivo),
    onSuccess: recarregar,
  });
}
