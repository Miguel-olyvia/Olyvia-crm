/** As contas do mes (`contasDoMes`) com os textos na lingua do ecra: as mesmas que o custo usou para o total, por isso a soma bate. */
import { contasDoMes, type ContasDoMes } from "@/components/rh-exemplo/lib/contasDoMes";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTranslation } from "@/hooks/useTranslation";
import type { CustoDaPessoa } from "./custoLido";

export function useContasDoMes(custo: CustoDaPessoa): ContasDoMes {
  const { t } = useTranslation();
  const { language } = useLanguage();
  return contasDoMes(custo.atual.entradaContas, {
    lingua: language === "pt" ? "pt" : "en",
    rotuloDias: t("rhContas.rotuloDias"),
    rotuloDia: t("rhContas.rotuloDia"),
    rotuloDiaADia: t("rhContas.rotuloDiaADia"),
    rotuloDeFalta: t("rhContas.rotuloDeFalta"),
    rotuloSubsidios: t("rhContas.rotuloSubsidios"),
    rotuloCalculado: t("rhContas.rotuloCalculado"),
  });
}
