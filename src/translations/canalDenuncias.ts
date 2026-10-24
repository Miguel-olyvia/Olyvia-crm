// Textos do canal de denúncias de exemplo (`cd.*` e `sidebar.canalDenuncias*`). Módulo próprio, juntado em
// `useTranslation.ts`. Apenas en/pt: nas outras línguas o `t()` cai para `en`. Os textos vivem em dois ficheiros para
// cada um ficar abaixo das 400 linhas.
import { canalDenunciasEn } from "./canalDenunciasEn";
import { canalDenunciasPt } from "./canalDenunciasPt";

export const canalDenunciasTranslations: Record<"en" | "pt", Record<string, string>> = {
  en: canalDenunciasEn,
  pt: canalDenunciasPt,
};
