import { useCallback } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { tDoc } from "@/lib/idiomaDocumento/dicionario";

/**
 * O nome de um idioma para meter numa frase do CRM, na língua do CRM: «português», «inglês» (minúscula inicial)
 * em português; «Portuguese», «English» nas outras línguas (o CRM cai para o inglês). Os nomes mostrados nas
 * abas e nas listas continuam a ser os nativos (Português, English).
 */
export function useNomeParaFrase(): (codigo: string) => string {
  const { language } = useTranslation();
  return useCallback(
    (codigo: string) => {
      const nome = tDoc(language === "pt" ? "pt" : "en", `doc.idioma.${codigo}`);
      return nome.startsWith("doc.idioma.") ? codigo : nome;
    },
    [language],
  );
}
