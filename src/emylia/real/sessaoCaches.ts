// 22/01 (M6): as caches em memória da pesquisa do Estúdio (produtosDoEstudio.ts) e das fotos (fotosDosProdutos.ts) pertencem a um utilizador: limpam-se no sign-out e quando
// entra OUTRO utilizador. O mesmo utilizador a voltar (SIGNED_IN ao refocar o separador) não as limpa. Um só ouvinte da sessão, como em lib/cachedAuth.ts.
import { supabase } from "@/integrations/supabase/client";

const limpezas = new Set<() => void>();
let ligado = false;
let utilizador: string | null = null;

/** Regista `limpar` para correr no sign-out e quando muda o utilizador. */
export function limparAoMudarDeSessao(limpar: () => void): void {
  limpezas.add(limpar);
  if (ligado) return;
  ligado = true;
  // `supabase.auth` pode faltar nos testes que simulam o cliente sem sessão
  supabase?.auth?.onAuthStateChange?.((evento, sessao) => {
    const id = sessao?.user?.id ?? null;
    const saiu = evento === "SIGNED_OUT";
    const outro = evento === "SIGNED_IN" && !!id && !!utilizador && id !== utilizador;
    if (saiu || outro) limpezas.forEach((f) => f());
    if (saiu) utilizador = null;
    else if (id) utilizador = id;
  });
}
