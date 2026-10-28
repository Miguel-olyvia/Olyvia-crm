// Wrapper: o cliente da base sem os tipos gerados. Várias tabelas e RPCs usadas por Utilizadores (anew_membership_permission_scopes,
// anew_entity_history, rpc_update_user...) não estão todas nos tipos gerados; UsersNew.tsx também usa `(supabase as any)`.
// Fica num só sítio para o `any` não se espalhar.
import { supabase } from "@/integrations/supabase/client";

type Resposta<T = unknown> = PromiseLike<{ data: T; error: { message: string } | null }>;

export interface ClienteSolto {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (tabela: string) => any;
  rpc: (nome: string, args?: Record<string, unknown>) => Resposta;
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
  functions: { invoke: (nome: string, opcoes?: { body?: unknown }) => Promise<{ data: unknown; error: unknown }> };
}

export const db = supabase as unknown as ClienteSolto;
