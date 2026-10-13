import { useId } from "react";
import { AlertTriangle, CalendarClock } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";
import { BlocoCandidata } from "./BlocoCandidata";
import { CamposSubmetidos } from "./CamposSubmetidos";
import { textoData } from "./formatoPessoas";
import type { CandidataSubmissao, Pessoa, Submissao } from "./pessoasTipos";

/** Uma candidata já resolvida: a pessoa da lista e o que a tornou candidata. */
export interface CandidataVista {
  pessoa: Pessoa;
  via: CandidataSubmissao["via"];
}

interface CartaoSubmissaoProps {
  submissao: Submissao;
  candidatas: CandidataVista[];
  hoje: string;
  aoPedir: (submissaoId: string, pessoaId: string) => void;
  aoAbrirFicha: (pessoaId: string) => void;
}

const SELO = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium text-foreground";

function AvisoVisita({ servico, nome }: { servico: string; nome: string }) {
  const { t } = useTranslation();
  return (
    <div role="note" className="flex flex-wrap items-center gap-3 rounded-lg border border-warning bg-warning/15 p-3">
      <CalendarClock className="h-4 w-4 shrink-0 text-foreground" aria-hidden="true" />
      <p className="flex-1 text-sm text-foreground">{t("pessoasPagina.visit.warning", { service: servico })}</p>
      <Button
        type="button" variant="outline" className={cn("min-h-11", FOCO)} aria-label={t("pessoasPagina.visit.bookNamed", { name: nome })}
        onClick={() => toast.info(t("pessoasPagina.visit.toast", { name: nome }))}
      >
        {t("pessoasPagina.visit.book")}
      </Button>
    </div>
  );
}

/** As candidatas: uma só (coincide com...) ou duas lado a lado num conflito, cada uma com "É esta pessoa". */
function Candidatas({ submissao: s, candidatas, aoPedir, aoAbrirFicha }: CartaoSubmissaoProps) {
  const { t } = useTranslation();
  if (s.codigo !== "CONFLITO") {
    return candidatas.length === 0 ? null : (
      <BlocoCandidata
        titulo={t(`pessoasPagina.match.${s.tipo}`)} pessoa={candidatas[0].pessoa} aoAbrirFicha={aoAbrirFicha}
        emailIgual={s._meta.emailIgual} telefoneIgual={s._meta.telefoneIgual}
      />
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-foreground">{t("pessoasPagina.conflict.hint")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {candidatas.map(({ pessoa, via }) => {
          const porEmail = via === "email";
          return (
            <BlocoCandidata
              key={pessoa.id} titulo={t(porEmail ? "pessoasPagina.match.byEmail" : "pessoasPagina.match.byPhone")} pessoa={pessoa}
              emailIgual={porEmail} telefoneIgual={!porEmail} aoAbrirFicha={aoAbrirFicha}
              aoEscolher={() => aoPedir(s.id, pessoa.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

/** Um cartão de submissão pendente, como o da página real: origem, quem coincide, aviso de visita, campos e a ação. */
export function CartaoSubmissao(props: CartaoSubmissaoProps) {
  const { submissao: s, candidatas, hoje, aoPedir } = props;
  const { t } = useTranslation();
  const idConflito = useId();
  const idTipo = useId();
  const idTitulo = useId();
  const idCampos = useId();
  const conflito = s.codigo === "CONFLITO";
  const nome = candidatas[0]?.pessoa.nome ?? s.nomeFicha;
  return (
    <article
      tabIndex={-1} data-submissao-id={s.id} data-foco-cartao
      aria-labelledby={conflito ? `${idConflito} ${idTipo} ${idTitulo}` : `${idTipo} ${idTitulo}`}
      className={cn("space-y-3 rounded-xl border border-border bg-card p-4", FOCO)}
    >
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {conflito && (
            <span id={idConflito} className={cn(SELO, "border-destructive bg-destructive/15")}>
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              {t("pessoasPagina.badge.conflict")}
            </span>
          )}
          <span id={idTipo} className={cn(SELO, "border-border bg-muted")}>{t(`pessoasPagina.type.${s.tipo}`)}</span>
        </div>
        <h2 id={idTitulo} className="text-base font-semibold text-foreground">{s.nomeFicha}</h2>
        <p className="text-xs text-muted-foreground">
          {t("pessoasPagina.card.campaign", { name: s.campanha })} · {t("pessoasPagina.card.form", { name: s.formulario })} · {textoData(t, s.data, hoje)}
        </p>
      </header>
      <Candidatas {...props} />
      {s.visitaPedida && <AvisoVisita servico={s.visitaPedida} nome={nome} />}
      <div role="group" aria-labelledby={idCampos} className="space-y-1">
        <h3 id={idCampos} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("pessoasPagina.fields.title")}</h3>
        <CamposSubmetidos campos={s.campos} />
      </div>
      {!conflito && candidatas[0] && (
        <Button type="button" className={cn("min-h-11", FOCO)} onClick={() => aoPedir(s.id, candidatas[0].pessoa.id)}>
          {t("pessoasPagina.action.register")}
        </Button>
      )}
    </article>
  );
}
