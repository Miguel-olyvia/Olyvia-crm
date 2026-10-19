// As células da Lista real que o protótipo não tem: a próxima visita e o texto dos negócios (só contagens, sem sub-linhas).
import { CheckCircle2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import type { PessoaDaLista } from "@/hooks/pessoas/listaPessoasTipos";

type Traduzir = ReturnType<typeof useTranslation>["t"];

const SELO = "inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium";
const R = "pessoasPagina.real.";

// Um formato por idioma, criado uma só vez (criar um Intl.DateTimeFormat por célula é caro em listas grandes).
const FORMATOS_VISITA = new Map<string, Intl.DateTimeFormat>();
function formatoVisita(lingua: string): Intl.DateTimeFormat {
  const local = lingua === "en" ? "en-GB" : "pt-PT";
  let formato = FORMATOS_VISITA.get(local);
  if (!formato) {
    formato = new Intl.DateTimeFormat(local, {
      timeZone: "Europe/Lisbon", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
    FORMATOS_VISITA.set(local, formato);
  }
  return formato;
}

/** O dia e a hora da visita, em Lisboa; null se o texto não for uma data. */
function formatarVisita(iso: string, lingua: string): string | null {
  const quando = new Date(iso);
  return Number.isNaN(quando.getTime()) ? null : formatoVisita(lingua).format(quando);
}

function textoNegocios(t: Traduzir, p: PessoaDaLista): string {
  if (p.abertos === 0 && p.ganhos === 0 && p.perdidos === 0) return t(`${R}deals.none`);
  return t(`${R}deals`, {
    abertos: p.abertos,
    ganhos: t(`${R}won.${p.ganhos === 1 ? "one" : "other"}`, { n: p.ganhos }),
    perdidos: t(`${R}lost.${p.perdidos === 1 ? "one" : "other"}`, { n: p.perdidos }),
  });
}

export function CelulaVisita({ iso }: { iso: string | null }) {
  const { t, language } = useTranslation();
  const texto = iso ? formatarVisita(iso, language) : null;
  if (!iso || !texto) return <span className="text-muted-foreground">{t(`${R}noVisit`)}</span>;
  return <time dateTime={iso}>{texto}</time>;
}

/** «X em curso · Y ganhos · Z perdidos» e o selo «Pronto a ganhar». */
export function CelulaNegocios({ pessoa }: { pessoa: PessoaDaLista }) {
  const { t } = useTranslation();
  return (
    <span className="flex flex-col items-start gap-1">
      <span>{textoNegocios(t, pessoa)}</span>
      {pessoa.prontoAGanhar && (
        <span className={cn(SELO, "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300")}>
          <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
          {t(`${R}readyToWin`)}
        </span>
      )}
    </span>
  );
}
