/** A lingua do convite na apresentacao: a da propria aplicacao (en ou pt); as outras caem para portugues. */
import { useMemo } from "react";
import type { IdiomaConvite } from "@/components/rh-exemplo/lib/conviteAdmissaoEcra";
import { useTranslation } from "@/hooks/useTranslation";

export function useIdiomaConvite(): IdiomaConvite {
  const { language } = useTranslation();
  return useMemo<IdiomaConvite>(
    () => (["pt", "es", "fr", "de", "en"].includes(language) ? (language as IdiomaConvite) : "pt"),
    [language],
  );
}
