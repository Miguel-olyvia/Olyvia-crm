// 23/10/2026 (2.0, segurança): as permissões de quem entrou, lidas da base, para as ações dos Negócios (permissoes.ts) e para o que
// o ecrã mostra. Pergunta `tem_permissao(org, código)` (as mesmas funções de usePermissoes.ts e das políticas) por cada código abaixo.
// Quem decide de verdade é a base (as funções da 0015 e as políticas): isto só evita oferecer o que a base ia recusar. Em caso de erro
// nada se dá por concedido.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CODIGO_BASE } from "./permissoes";

/** Os códigos que o protótipo pergunta: os das ações (CODIGO_BASE), o de ver custos e (24/10) o de ver salários (a ponte do RH). */
export const CODIGOS_NEGOCIOS: readonly string[] = [...new Set([...Object.values(CODIGO_BASE), "orcamentos.ver_custos", "custos.ver_salarios"])];

export type LeituraPermissoes = { org: string; codigos: ReadonlySet<string> | null };

/** Lê as permissões concedidas a quem entrou na organização (null: a leitura falhou). */
export async function lerPermissoesNegocios(org: string): Promise<ReadonlySet<string> | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  try {
    const r = await Promise.all(CODIGOS_NEGOCIOS.map((perm) => db.rpc("tem_permissao", { org, perm }) as Promise<{ data: unknown; error: unknown }>));
    if (r.some((x) => x.error)) return null;
    return new Set(CODIGOS_NEGOCIOS.filter((_, i) => r[i].data === true));
  } catch {
    return null;
  }
}

/** As permissões de quem entrou em `org` (null enquanto se leem, ou sem organização). Uma resposta de outra organização ignora-se. */
export function usePermissoesNegocios(org: string | null): ReadonlySet<string> | null {
  const [l, setL] = useState<LeituraPermissoes | null>(null);
  useEffect(() => {
    if (!org) return;
    let cancelado = false;
    void lerPermissoesNegocios(org).then((codigos) => { if (!cancelado) setL({ org, codigos: codigos ?? new Set() }); });
    return () => { cancelado = true; };
  }, [org]);
  return l && l.org === org ? l.codigos : null;
}
