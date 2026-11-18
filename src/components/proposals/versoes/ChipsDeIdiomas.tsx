import { Badge } from "@/components/ui/badge";
import { obterIdioma } from "@/lib/idiomaDocumento";
import { useTranslation } from "@/hooks/useTranslation";
import { resumoDeIdiomasDoTemplate } from "./modeloVersoes";

interface ChipsDeIdiomasProps {
  /** A linha de proposal_templates (`select *`). */
  template: { sections?: unknown; design_settings?: unknown } | null | undefined;
}

/** «PT · EN» e «EN incompleto» nos cartões da lista. Sem versões não desenha nada. */
export function ChipsDeIdiomas({ template }: ChipsDeIdiomasProps) {
  const { t } = useTranslation();
  const { idiomas, incompletos } = resumoDeIdiomasDoTemplate(template);
  if (idiomas.length <= 1) return null;

  const nomes = idiomas.map((c) => obterIdioma(c)?.nomeNativo ?? c).join(", ");
  return (
    <span className="flex flex-wrap items-center gap-1">
      <Badge variant="secondary" aria-label={t("proposalTemplateEditor.versions.chip.languages", { languages: nomes })}>
        {idiomas.map((c) => c.toUpperCase()).join(" · ")}
      </Badge>
      {incompletos.map(({ codigo, faltam }) => (
        <Badge
          key={codigo}
          variant="outline"
          className="border-amber-600 text-amber-800 dark:border-amber-400 dark:text-amber-300"
          title={t("proposalTemplateEditor.versions.chip.incompleteTitle", { count: faltam, language: obterIdioma(codigo)?.nomeNativo ?? codigo })}
        >
          {t("proposalTemplateEditor.versions.chip.incomplete", { code: codigo.toUpperCase() })}
        </Badge>
      ))}
    </span>
  );
}
