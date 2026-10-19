import { memo } from "react";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import type { PessoaDaLista } from "@/hooks/pessoas/listaPessoasTipos";
import { TableCell, TableRow } from "@/components/ui/table";
import { formatarMeta } from "@/components/negocio-metas/formatoMetas";
import { AvatarPessoa } from "@/components/pessoas/AvatarPessoa";
import { LIMITE_SEM_CONTACTO } from "@/components/pessoas/filtrosPessoas";
import { textoSemContacto, textoUltimoContacto } from "@/components/pessoas/formatoPessoas";
import { COR_ETAPA, ICONE_ETAPA } from "@/components/pessoas/iconesPessoa";

type Traduzir = ReturnType<typeof useTranslation>["t"];

const CELULA = "min-h-11 px-3 py-2.5 align-middle text-sm";
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

function textoEtapa(t: Traduzir, p: PessoaDaLista): string {
  if (p.etapa === "cliente") return t("pessoasPagina.stage.cliente");
  if (p.etapa === "qualificada" && p.faseEtapa) {
    return t("pessoasPagina.stage.qualificada", { phase: t(`businessGoals.phase.${p.faseEtapa}`) });
  }
  return t(`${R}stage.${p.etapa}`);
}

function textoNegocios(t: Traduzir, p: PessoaDaLista): string {
  if (p.abertos === 0 && p.ganhos === 0 && p.perdidos === 0) return t(`${R}deals.none`);
  return t(`${R}deals`, {
    abertos: p.abertos,
    ganhos: t(`${R}won.${p.ganhos === 1 ? "one" : "other"}`, { n: p.ganhos }),
    perdidos: t(`${R}lost.${p.perdidos === 1 ? "one" : "other"}`, { n: p.perdidos }),
  });
}

function SemTexto({ rotulo }: { rotulo: string }) {
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className="sr-only">{rotulo}</span>
    </>
  );
}

function CelulaPessoa({ pessoa }: { pessoa: PessoaDaLista }) {
  const { t } = useTranslation();
  const semNome = pessoa.nome === "";
  return (
    <span className="flex items-center gap-2.5">
      <AvatarPessoa nome={pessoa.nome} pequeno />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className={cn("text-sm font-medium leading-5", semNome ? "italic text-muted-foreground" : "text-foreground")}>
          {semNome ? t(`${R}noName`) : pessoa.nome}
        </span>
        {pessoa.encerrada && (
          <span className={cn(SELO, "border-border bg-muted")}>
            <XCircle className="h-3 w-3" aria-hidden="true" />
            {t(`${R}closed`, { result: t(`${R}closedResult.${pessoa.encerrada}`) })}
          </span>
        )}
      </span>
    </span>
  );
}

function CelulaContacto({ dias }: { dias: number | null }) {
  const { t } = useTranslation();
  if (dias === null) return <span className="text-muted-foreground">{t(`${R}noContact`)}</span>;
  const antigo = dias >= LIMITE_SEM_CONTACTO;
  return (
    <span className={cn("inline-flex items-center gap-1.5", antigo ? "font-medium text-foreground" : "text-muted-foreground")}>
      <Clock className={cn("h-3.5 w-3.5 shrink-0", antigo && "text-destructive")} aria-hidden="true" />
      {antigo ? textoSemContacto(t, dias) : textoUltimoContacto(t, dias)}
    </span>
  );
}

function CelulaVisita({ iso }: { iso: string | null }) {
  const { t, language } = useTranslation();
  const texto = iso ? formatarVisita(iso, language) : null;
  if (!iso || !texto) return <span className="text-muted-foreground">{t(`${R}noVisit`)}</span>;
  return <time dateTime={iso}>{texto}</time>;
}

/** Uma linha da Lista real: só leitura. O nome é texto simples (sem ficha no P1) e o cabeçalho da linha. */
export const LinhaListaReal = memo(function LinhaListaReal({ pessoa }: { pessoa: PessoaDaLista }) {
  const { t } = useTranslation();
  const Icone = ICONE_ETAPA[pessoa.etapa];
  return (
    <TableRow data-pessoa-id={pessoa.id}>
      <th scope="row" className={cn(CELULA, "text-left font-normal")}><CelulaPessoa pessoa={pessoa} /></th>
      <TableCell className={CELULA}>
        <span className="inline-flex items-center gap-2">
          <span className={cn("grid size-6 shrink-0 place-items-center rounded-full", COR_ETAPA[pessoa.etapa])} aria-hidden="true">
            <Icone className="h-3.5 w-3.5" />
          </span>
          <span>{textoEtapa(t, pessoa)}</span>
        </span>
      </TableCell>
      <TableCell className={CELULA}><CelulaContacto dias={pessoa.diasSemContacto} /></TableCell>
      <TableCell className={CELULA}><CelulaVisita iso={pessoa.proximaVisitaEm} /></TableCell>
      <TableCell className={cn(CELULA, "text-right tabular-nums")}>
        {pessoa.valorEmJogo > 0 ? formatarMeta("euro", pessoa.valorEmJogo) : <SemTexto rotulo={t("pessoasPagina.value.none")} />}
      </TableCell>
      <TableCell className={CELULA}>
        <span className="flex flex-col items-start gap-1">
          <span>{textoNegocios(t, pessoa)}</span>
          {pessoa.prontoAGanhar && (
            <span className={cn(SELO, "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300")}>
              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
              {t(`${R}readyToWin`)}
            </span>
          )}
        </span>
      </TableCell>
    </TableRow>
  );
});
