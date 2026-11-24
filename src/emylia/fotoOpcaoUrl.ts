// O URL público de uma foto de opção de atributo (bucket `catalogo-opcoes`, caminho «{org}/{uuid}.webp») e o hook que o usa. Tolerante: sem storage ou sem URL
// devolve null (quem desenha cai no hex), nunca lança.
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const BUCKET_FOTOS_OPCOES = "catalogo-opcoes";

export function urlDaFotoOpcao(caminho: string): string | null {
  try {
    const url = supabase.storage.from(BUCKET_FOTOS_OPCOES).getPublicUrl(caminho).data?.publicUrl;
    return url || null;
  } catch {
    return null;
  }
}

/** O URL da foto a desenhar (null: sem foto, ou já falhou, ou o storage não responde: quem desenha cai no hex) e o que fazer quando a imagem falha.
 *  O que falhou é o caminho (e não um booleano): outra foto tenta-se de novo. */
export function useFotoOpcao(foto: string | null | undefined): { url: string | null; aoFalhar: () => void } {
  const [falhou, setFalhou] = useState<string | null>(null);
  return { url: foto && falhou !== foto ? urlDaFotoOpcao(foto) : null, aoFalhar: () => setFalhou(foto ?? null) };
}
