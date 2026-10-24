// A barra «Voltar à pessoa» dos ecrãs partilhados (orçamentos, propostas e contratos): só existe quando o endereço traz um `?voltar=` seguro
// (um caminho que começa por /pessoas, ver `voltarParaPessoas.ts`). Sem ele, ou com qualquer outro valor, não desenha nada: o ecrã fica
// exatamente como era para quem não vem da ficha (a Mudelar, por exemplo).
import { ArrowLeft } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "@/hooks/useTranslation";
import { caminhoVoltarSeguro } from "@/lib/voltarParaPessoas";

export function BarraVoltar() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const caminho = caminhoVoltarSeguro(params.get("voltar"));
  if (caminho === null) return null;
  return (
    <nav aria-label={t("pessoasPagina.neg.back.label")} className="flex-shrink-0 border-b bg-muted/40 px-4 py-2 md:px-6">
      <Link
        to={caminho}
        className="inline-flex min-h-11 items-center gap-2 rounded-sm text-sm font-medium text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring dark:text-violet-300"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t("pessoasPagina.neg.back.link")}
      </Link>
    </nav>
  );
}
