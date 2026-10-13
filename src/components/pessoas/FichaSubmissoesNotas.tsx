import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";
import { CamposSubmetidos } from "./CamposSubmetidos";
import { textoData } from "./formatoPessoas";
import type { NotaPessoa, Submissao } from "./pessoasTipos";

const SELO = "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium text-foreground";

interface MiniCartaoProps {
  submissao: Submissao;
  hoje: string;
  /** "É esta pessoa" num conflito; "Registar na ficha como nota" nas outras. */
  aoPedir: () => void;
}

/** A submissão pendente desta pessoa, em ponto pequeno, com a mesma ação do separador de submissões. */
function MiniCartao({ submissao: s, hoje, aoPedir }: MiniCartaoProps) {
  const { t } = useTranslation();
  const conflito = s.codigo === "CONFLITO";
  return (
    <li className="space-y-2 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {conflito && <span className={cn(SELO, "border-destructive bg-destructive/15")}>{t("pessoasPagina.badge.conflict")}</span>}
        <span className={cn(SELO, "border-border bg-muted")}>{t(`pessoasPagina.type.${s.tipo}`)}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("pessoasPagina.card.campaign", { name: s.campanha })} · {t("pessoasPagina.card.form", { name: s.formulario })} · {textoData(t, s.data, hoje)}
      </p>
      <CamposSubmetidos campos={s.campos} />
      <Button type="button" variant={conflito ? "outline" : "default"} className={cn("min-h-11", FOCO)} onClick={aoPedir}>
        {t(conflito ? "pessoasPagina.action.thisPerson" : "pessoasPagina.action.register")}
      </Button>
    </li>
  );
}

interface FichaSubmissoesProps {
  submissoes: Submissao[];
  hoje: string;
  aoPedir: (submissaoId: string) => void;
  aoVerTodas: () => void;
}

export function FichaSubmissoes({ submissoes, hoje, aoPedir, aoVerTodas }: FichaSubmissoesProps) {
  const { t } = useTranslation();
  if (submissoes.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border p-4">
        <p className="text-sm font-semibold text-foreground">{t("pessoasPagina.personSubs.empty")}</p>
        <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={aoVerTodas}>
          {t("pessoasPagina.personSubs.all")}
        </Button>
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      {submissoes.map((s) => <MiniCartao key={s.id} submissao={s} hoje={hoje} aoPedir={() => aoPedir(s.id)} />)}
    </ul>
  );
}

interface FichaNotasProps {
  notas: NotaPessoa[];
  hoje: string;
  /** Quantas submissões pendentes tem a pessoa: se houver, o estado vazio oferece vê-las. */
  pendentes: number;
  aoVerSubmissoes: () => void;
}

/** As notas desta pessoa (as submissões já registadas na ficha), da mais recente para a mais antiga. */
export function FichaNotas({ notas, hoje, pendentes, aoVerSubmissoes }: FichaNotasProps) {
  const { t } = useTranslation();
  if (notas.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border p-4">
        <p className="text-sm font-semibold text-foreground">{t("pessoasPagina.notes.empty")}</p>
        <p className="text-sm text-muted-foreground">{t("pessoasPagina.notes.hint")}</p>
        {pendentes > 0 && (
          <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={aoVerSubmissoes}>
            {t("pessoasPagina.actions.submissions", { count: pendentes })}
          </Button>
        )}
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      {[...notas].reverse().map((n) => (
        <li key={n.id} className="space-y-2 rounded-xl border border-border bg-card p-4">
          <p className="text-sm font-semibold text-foreground">{t("pessoasPagina.notes.fromForm", { form: n.formulario })}</p>
          <p className="text-xs text-muted-foreground">{textoData(t, n.data, hoje)}</p>
          <CamposSubmetidos campos={n.campos} />
        </li>
      ))}
    </ul>
  );
}
