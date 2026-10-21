// A etiqueta do tipo de fecho de um negócio da base: «Fecha no contrato» ou «Fecha na proposta (venda directa)». O texto diz-se por extenso (a cor
// nunca é o único sinal).
import { useTranslation } from "@/hooks/useTranslation";
import { Badge } from "@/components/ui/badge";
import type { FechoNegocio } from "@/components/negocio-metas/fechoNegocio";

export function EtiquetaFecho({ fecho }: { fecho: FechoNegocio }) {
  const { t } = useTranslation();
  return <Badge variant="outline">{t(`pessoasPagina.neg.fecho.tag.${fecho}`)}</Badge>;
}
