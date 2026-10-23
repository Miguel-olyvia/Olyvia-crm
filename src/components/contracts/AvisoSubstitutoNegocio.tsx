// O aviso, em texto visível, que a página de contratos mostra antes de anular um contrato ligado a um negócio e gerar o substituto
// (a decisão do aviso é de `avisoDeSubstituicao`). Sem aviso não desenha nada.
import { useTranslation } from "@/hooks/useTranslation";
import type { AvisoDeSubstituicao } from "@/components/negocio-metas/contratoNoNegocio";

const CHAVES = {
  reabre: "pessoasPagina.neg.fecho.replace.reopens",
  perdido: "pessoasPagina.neg.fecho.replace.lost",
  sem_permissao: "pessoasPagina.neg.fecho.replace.noPermission",
  a_verificar: "pessoasPagina.neg.fecho.replace.checking",
  indisponivel: "pessoasPagina.neg.fecho.replace.unavailable",
} as const;

export function AvisoSubstitutoNegocio({ aviso }: { aviso: AvisoDeSubstituicao }) {
  const { t } = useTranslation();
  if (!aviso) return null;
  return <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">{t(CHAVES[aviso])}</p>;
}
