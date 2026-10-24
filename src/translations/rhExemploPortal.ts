// Textos do Portal do colaborador de exemplo (`rhPortal.*`): a página pública do link, a troca de documentos e o lado do RH.
// Módulo próprio, juntado em `useTranslation.ts`. Apenas en/pt: nas outras línguas o `t()` cai para `en`. Os textos vivem em
// dois ficheiros para cada um ficar abaixo das 400 linhas.
import { rhExemploPortalEn } from "./rhExemploPortalEn";
import { rhExemploPortalPt } from "./rhExemploPortalPt";

export const rhExemploPortalTranslations: Record<"en" | "pt", Record<string, string>> = {
  en: rhExemploPortalEn,
  pt: rhExemploPortalPt,
};
