import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/hooks/useTranslation";
import { calcularCompletude, idiomaBaseDoTemplate, lerVersoes, obterIdioma, ordenarPorRegisto } from "@/lib/idiomaDocumento";

interface Props {
  template: { language?: string | null; body_html?: string | null; doc_settings?: Record<string, unknown> | null };
}

/**
 * Chips do cartão da lista de minutas: «PT · EN» e, por cada versão por acabar, «EN incompleto».
 * Uma minuta sem versões não mostra nada (o cartão fica como sempre foi).
 */
export function ChipsDeIdiomasDoCartao({ template }: Props) {
  const { t } = useTranslation();
  const dados = useMemo(() => {
    const base = idiomaBaseDoTemplate(template);
    const existentes = ordenarPorRegisto(Object.keys(lerVersoes(template.doc_settings, base)));
    const incompletas = existentes.filter((c) => !calcularCompletude({ ...template, body_html: template.body_html ?? "" }, c).completo);
    return { codigos: ordenarPorRegisto([base, ...existentes]), existentes, incompletas };
  }, [template]);

  if (dados.existentes.length === 0) return null;

  const nomes = dados.codigos.map((c) => obterIdioma(c)?.nomeNativo ?? c).join(", ");
  return (
    <>
      <Badge variant="outline" role="img" aria-label={t("contractTemplates.versoes.cartao.idiomas", { lista: nomes })} className="text-[10px]">
        {dados.codigos.map((c) => c.toUpperCase()).join(" · ")}
      </Badge>
      {dados.incompletas.map((c) => (
        <Badge key={c} variant="secondary" className="text-[10px] text-amber-800 dark:text-amber-300">
          {t("contractTemplates.versoes.cartao.incompleto", { codigo: c.toUpperCase() })}
        </Badge>
      ))}
    </>
  );
}
