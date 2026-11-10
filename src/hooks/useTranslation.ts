import { useCallback } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIdiomaForcado } from "@/contexts/IdiomaForcadoContext";
import { tabelaFundida } from "@/translations/tabelaFundida";

type Language = 'en' | 'pt' | 'es' | 'fr' | 'de';

/**
 * `idioma` e opcional e serve so para ecras que escolhem a sua propria lingua
 * (o convite de admissao publico, pelo navegador); sem ele vale a lingua do
 * contexto, como sempre.
 */
export const useTranslation = (idioma?: Language) => {
  const { language: linguaDoContexto } = useLanguage();
  const idiomaForcado = useIdiomaForcado();
  const language = idioma ?? idiomaForcado ?? linguaDoContexto;

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const lang = language as Language;
      let translation =
        tabelaFundida[lang]?.[key] ||
        tabelaFundida.en?.[key] ||
        key;

      // Replace parameters if provided (supports both {name} and {{name}} formats)
      if (params) {
        Object.entries(params).forEach(([paramKey, value]) => {
          // Replace {{name}} format
          translation = translation.replace(new RegExp(`\\{\\{${paramKey}\\}\\}`, 'g'), String(value));
          // Replace {name} format
          translation = translation.replace(new RegExp(`\\{${paramKey}\\}`, 'g'), String(value));
        });
      }

      return translation;
    },
    [language]
  );

  return { t, language };
};
