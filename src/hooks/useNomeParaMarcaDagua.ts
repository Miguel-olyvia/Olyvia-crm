/**
 * O nome de quem esta a ver um documento sensivel, para a marca de agua.
 *
 * Vem da sessao (nome completo, se a conta o tem; senao o e-mail). Se a leitura
 * falhar devolve uma cadeia vazia: a marca de agua desenha so a hora, e o
 * documento continua auditado no servidor (a marca e dissuasao, nao registo).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

function nomeDoMetadata(metadata: Record<string, unknown> | undefined): string | null {
  for (const chave of ["full_name", "name", "nome"]) {
    const valor = metadata?.[chave];
    if (typeof valor === "string" && valor.trim() !== "") return valor.trim();
  }
  return null;
}

export function useNomeParaMarcaDagua(): string {
  const [nome, setNome] = useState("");

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (cancelado) return;
        const utilizador = data?.user;
        setNome(nomeDoMetadata(utilizador?.user_metadata) ?? utilizador?.email ?? "");
      } catch {
        if (!cancelado) setNome("");
      }
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  return nome;
}
