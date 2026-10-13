import { useTranslation } from "@/hooks/useTranslation";
import type { Submissao } from "./pessoasTipos";

/** Os campos que a pessoa preencheu, em pares rótulo e valor. */
export function CamposSubmetidos({ campos }: { campos: Submissao["campos"] }) {
  const { t } = useTranslation();
  if (campos.length === 0) return <p className="text-sm text-muted-foreground">{t("pessoasPagina.fields.none")}</p>;
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
      {campos.map((c) => (
        <div key={c.rotulo} className="flex gap-2">
          <dt className="text-muted-foreground">{c.rotulo}:</dt>
          <dd className="break-words text-foreground">{c.valor}</dd>
        </div>
      ))}
    </dl>
  );
}
