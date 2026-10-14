import { useCallback } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { translations } from "@/translations/index";
import { bundleTranslations } from "@/translations/bundles";
import { priceContextsTranslations } from "@/translations/priceContexts";
import { directSalesTranslations } from "@/translations/directSales";
import { todayTranslations } from "@/translations/today";
import { inventoryNavTranslations } from "@/translations/inventoryNav";
import { negocioMetasTranslations } from "@/translations/negocioMetas";
import { pessoasPaginaTranslations } from "@/translations/pessoasPagina";
import { utilizadoresPerfisTranslations } from "@/translations/utilizadoresPerfis";

type Language = 'en' | 'pt' | 'es' | 'fr' | 'de';

// Merge bundle and priceContexts translations
const mergedTranslations: Record<string, Record<string, string>> = { ...translations } as any;
Object.keys(bundleTranslations).forEach((lang) => {
  mergedTranslations[lang] = { ...mergedTranslations[lang], ...bundleTranslations[lang as keyof typeof bundleTranslations] };
});
Object.keys(priceContextsTranslations).forEach((lang) => {
  mergedTranslations[lang] = { ...mergedTranslations[lang], ...priceContextsTranslations[lang as keyof typeof priceContextsTranslations] };
});
// Venda Direta (Fase 2) — módulo próprio, mesmo padrão dos dois acima.
Object.keys(directSalesTranslations).forEach((lang) => {
  mergedTranslations[lang] = { ...mergedTranslations[lang], ...directSalesTranslations[lang as keyof typeof directSalesTranslations] };
});
// Ecrã "Hoje" (/home) — módulo próprio, mesmo padrão.
Object.keys(todayTranslations).forEach((lang) => {
  mergedTranslations[lang] = { ...mergedTranslations[lang], ...todayTranslations[lang as keyof typeof todayTranslations] };
});
// Menu do Inventário (Hoje · Compras · Armazém) — módulo próprio, mesmo padrão.
Object.keys(inventoryNavTranslations).forEach((lang) => {
  mergedTranslations[lang] = { ...mergedTranslations[lang], ...inventoryNavTranslations[lang as keyof typeof inventoryNavTranslations] };
});
// Página "Negócio e metas" — módulo próprio, mesmo padrão.
Object.keys(negocioMetasTranslations).forEach((lang) => {
  mergedTranslations[lang] = { ...mergedTranslations[lang], ...negocioMetasTranslations[lang as keyof typeof negocioMetasTranslations] };
});
// Página "Pessoas" — módulo próprio, mesmo padrão.
Object.keys(pessoasPaginaTranslations).forEach((lang) => {
  mergedTranslations[lang] = { ...mergedTranslations[lang], ...pessoasPaginaTranslations[lang as keyof typeof pessoasPaginaTranslations] };
});

// Página "Utilizadores e perfis" — módulo próprio, mesmo padrão.
Object.keys(utilizadoresPerfisTranslations).forEach((lang) => {
  mergedTranslations[lang] = { ...mergedTranslations[lang], ...utilizadoresPerfisTranslations[lang as keyof typeof utilizadoresPerfisTranslations] };
});

export const useTranslation = () => {
  const { language } = useLanguage();

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const lang = language as Language;
      let translation =
        mergedTranslations[lang]?.[key] ||
        mergedTranslations.en?.[key] ||
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
