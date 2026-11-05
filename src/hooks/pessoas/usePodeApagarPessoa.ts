import { useMemo } from "react";
import { usePermissionScope } from "@/hooks/usePermissionScope";

/** Quem pode apagar (e restaurar) uma lead e quem pode apagar um cliente. */
export interface PodeApagarPessoa {
  lead: boolean;
  cliente: boolean;
}

export const NINGUEM_APAGA: PodeApagarPessoa = { lead: false, cliente: false };

/**
 * Pode apagar uma pessoa por engano? `pessoas.delete` e `pessoas.edit` (neg_apagar_pessoa pede a primeira e, para ver se há negócios abertos,
 * a segunda), mais `leads.delete` numa lead ou `clients.delete` num cliente (fn_neg_pessoa_no_ambito com 'delete'). Lê-se como o
 * `usePodeApagarNegocios` (qualquer âmbito diferente de NONE): o âmbito exato é a base que o decide, pessoa a pessoa, e um «não» dela vem
 * traduzido (42501, NG003). Enquanto as permissões carregam ninguém apaga.
 */
export function usePodeApagarPessoa(): PodeApagarPessoa {
  const { loading, getPermissionScope } = usePermissionScope() as { loading?: boolean; getPermissionScope?: (codigo: string) => string };
  const pronto = loading !== true && typeof getPermissionScope === "function";
  const tem = (codigo: string): boolean => pronto && getPermissionScope?.(codigo) !== "NONE";
  const base = tem("pessoas.delete") && tem("pessoas.edit");
  const lead = base && tem("leads.delete");
  const cliente = base && tem("clients.delete");
  // A identidade só muda quando muda a resposta: quem a põe num `useMemo` (a fonte da página) não refaz tudo a cada render.
  return useMemo(() => (lead || cliente ? { lead, cliente } : NINGUEM_APAGA), [lead, cliente]);
}
