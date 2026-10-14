import { useCallback } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { translations } from "@/translations/index";
import { bundleTranslations } from "@/translations/bundles";
import { priceContextsTranslations } from "@/translations/priceContexts";
import { directSalesTranslations } from "@/translations/directSales";
import { todayTranslations } from "@/translations/today";
import { inventoryNavTranslations } from "@/translations/inventoryNav";
import { frotaNavTranslations } from "@/translations/frotaNav";
import { negocioMetasTranslations } from "@/translations/negocioMetas";
import { pessoasPaginaTranslations } from "@/translations/pessoasPagina";
import { utilizadoresPerfisTranslations } from "@/translations/utilizadoresPerfis";
import { rhExemploTranslations } from "@/translations/rhExemplo";
import { rhExemploFormTranslations } from "@/translations/rhExemploForm";
import { rhExemploNovaPessoaTranslations } from "@/translations/rhExemploNovaPessoa";
import { rhExemploMenuTranslations } from "@/translations/rhExemploMenu";
import { rhExemploFluxosCTranslations } from "@/translations/rhExemploFluxosC";
import { rhExemploFluxosATranslations } from "@/translations/rhExemploFluxosA";
import { rhExemploFluxosBTranslations } from "@/translations/rhExemploFluxosB";
import { rhExemploFluxosDTranslations } from "@/translations/rhExemploFluxosD";
import { rhExemploCalendarioTranslations } from "@/translations/rhExemploCalendario";

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
// Menu da Frota de exemplo (/frota) e o selo "Dados de exemplo" — módulo próprio, mesmo padrão.
Object.keys(frotaNavTranslations).forEach((lang) => {
  mergedTranslations[lang] = { ...mergedTranslations[lang], ...frotaNavTranslations[lang as keyof typeof frotaNavTranslations] };
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

// Ecrãs de Recursos Humanos de exemplo (/rh-exemplo) — módulo próprio, mesmo padrão.
Object.keys(rhExemploTranslations).forEach((lang) => {
  mergedTranslations[lang] = { ...mergedTranslations[lang], ...rhExemploTranslations[lang as keyof typeof rhExemploTranslations] };
});

// Painel "Nova pessoa", ficha em painel lateral e lista compacta de RH de exemplo (`rhForm.*`).
Object.keys(rhExemploFormTranslations).forEach((lang) => {
  mergedTranslations[lang] = { ...mergedTranslations[lang], ...rhExemploFormTranslations[lang as keyof typeof rhExemploFormTranslations] };
});

// Painel "Nova pessoa" com todos os campos, em seis abas (`rhNova.*`).
Object.keys(rhExemploNovaPessoaTranslations).forEach((lang) => {
  mergedTranslations[lang] = { ...mergedTranslations[lang], ...rhExemploNovaPessoaTranslations[lang as keyof typeof rhExemploNovaPessoaTranslations] };
});

// Menu e ecrãs de gestão de RH de exemplo (assiduidade, ausências, centros, modelos, processamento salarial, convite).
Object.keys(rhExemploMenuTranslations).forEach((lang) => {
  mergedTranslations[lang] = { ...mergedTranslations[lang], ...rhExemploMenuTranslations[lang as keyof typeof rhExemploMenuTranslations] };
});

// Frente A dos fluxos de RH de exemplo: botões de configuração, Cargos, janela do responsável e separador Custo.
Object.keys(rhExemploFluxosATranslations).forEach((lang) => {
  mergedTranslations[lang] = { ...mergedTranslations[lang], ...rhExemploFluxosATranslations[lang as keyof typeof rhExemploFluxosATranslations] };
});

// Frente C: horas extra, banco de horas e cálculo do processamento salarial de exemplo (`rhFluxosC.*`).
Object.keys(rhExemploFluxosCTranslations).forEach((lang) => {
  mergedTranslations[lang] = { ...mergedTranslations[lang], ...rhExemploFluxosCTranslations[lang as keyof typeof rhExemploFluxosCTranslations] };
});

// Frente B: horário por tipo e versões, picagem com localização, alertas do fim do dia e faltas (`rhExemplo.hor/pic/fal.*`).
Object.keys(rhExemploFluxosBTranslations).forEach((lang) => {
  mergedTranslations[lang] = { ...mergedTranslations[lang], ...rhExemploFluxosBTranslations[lang as keyof typeof rhExemploFluxosBTranslations] };
});

// Frente D: banco de horas na ficha e horas extra pendentes na fila de trabalho (`rhFluxosD.*`).
Object.keys(rhExemploFluxosDTranslations).forEach((lang) => {
  mergedTranslations[lang] = { ...mergedTranslations[lang], ...rhExemploFluxosDTranslations[lang as keyof typeof rhExemploFluxosDTranslations] };
});

// Calendário do mês da pessoa, na aba Assiduidade da ficha de RH de exemplo (`rhCal.*`).
Object.keys(rhExemploCalendarioTranslations).forEach((lang) => {
  mergedTranslations[lang] = { ...mergedTranslations[lang], ...rhExemploCalendarioTranslations[lang as keyof typeof rhExemploCalendarioTranslations] };
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
