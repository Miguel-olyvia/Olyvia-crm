// O nome do utilizador com sessão iniciada, para assinar o histórico da Frota de exemplo. Mesma fonte do cabeçalho da
// app (Layout: anew_users.name pelo auth_user_id da sessão), só leitura; sem nome, o email da sessão. Fica em cache no
// módulo (um pedido por sessão de página).
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

let cache: string | null = null;
let pedido: Promise<string | null> | null = null;

async function lerNome(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data } = await (supabase as unknown as { from: (t: string) => any })
    .from("anew_users").select("name").eq("auth_user_id", session.user.id).maybeSingle();
  return (data?.name as string | undefined) || session.user.email || null;
}

export function useNomeUtilizador(): string | null {
  const [nome, setNome] = useState<string | null>(cache);
  useEffect(() => {
    if (cache) return;
    let vivo = true;
    pedido ??= lerNome().catch(() => null);
    pedido.then((n) => { if (n) cache = n; if (vivo) setNome(n); });
    return () => { vivo = false; };
  }, []);
  return nome;
}
