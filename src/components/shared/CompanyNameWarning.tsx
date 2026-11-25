import { AlertTriangle } from "lucide-react";
import { getCompanyNameWarning, type CompanyNameWarningInput } from "@/lib/companyNameWarning";

interface CompanyNameWarningProps extends CompanyNameWarningInput {
  /**
   * Como se corrige: «field» = preencher o campo Empresa (leads);
   * «type» = escolher o tipo Empresa (formulario de cliente, que nao tem o campo).
   */
  fix?: "field" | "type";
}

const MESSAGES = {
  "looks-like-company": {
    field: "Parece um nome de empresa: preencha o campo Empresa para o nome aparecer certo nas propostas e PDFs.",
    type: "Parece um nome de empresa: escolha o tipo Empresa para o nome aparecer certo nas propostas e PDFs.",
  },
  "company-equals-name": {
    field: "A empresa é igual ao nome e apelido. Se são os de uma pessoa, deixe a Empresa só com a firma, para o nome aparecer certo nas propostas e PDFs.",
    type: "A empresa é igual ao nome e apelido. Se são os de uma pessoa, escreva aqui os dela: a empresa fica só com a firma e o nome aparece certo nas propostas e PDFs.",
  },
} as const;

/** Aviso não bloqueante; não desenha nada quando o nome parece de pessoa. */
export function CompanyNameWarning({ first, last, company, fix = "field" }: CompanyNameWarningProps) {
  const warning = getCompanyNameWarning({ first, last, company });
  if (!warning) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-amber-500/60 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-400/50 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 break-words">
        <strong className="font-semibold">Atenção: </strong>
        {MESSAGES[warning][fix]}
      </p>
    </div>
  );
}
