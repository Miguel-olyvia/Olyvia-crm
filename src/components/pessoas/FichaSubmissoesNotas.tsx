import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LinhaCampo, ListaCampos } from "@/components/ficha-comum/ListaCampos";
import { FOCO } from "@/components/negocio-metas/estilos";
import { textoDataCompleta } from "./formatoPessoas";
import { LinhaSubmissao } from "./LinhaSubmissao";
import type { NotaPessoa, Pessoa, Submissao } from "./pessoasTipos";
import { idDaMaisRecente } from "./resolverSubmissao";

interface FichaSubmissoesProps {
  submissoes: Submissao[];
  hoje: string;
  /** Todas as pessoas, por id: as candidatas de cada submissão. */
  pessoas: ReadonlyMap<string, Pessoa>;
  aoPedir: (submissaoId: string) => void;
  aoVerTodas: () => void;
}

/** As submissões pendentes desta pessoa, em linhas divididas, com a mesma ação do separador de submissões. */
export function FichaSubmissoes({ submissoes, hoje, pessoas, aoPedir, aoVerTodas }: FichaSubmissoesProps) {
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
  const nova = idDaMaisRecente(submissoes);
  return (
    <ul>
      {submissoes.map((s) => (
        <LinhaSubmissao key={s.id} submissao={s} hoje={hoje} pessoas={pessoas} maisRecente={s.id === nova} aoPedir={() => aoPedir(s.id)} />
      ))}
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

/** As notas desta pessoa (as submissões já registadas na ficha), da mais recente para a mais antiga, em linhas divididas. */
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
    <ul>
      {[...notas].reverse().map((n) => (
        <li key={n.id} className="space-y-2 border-b border-border py-4 first:pt-0 last:border-b-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="text-[15px] font-semibold text-foreground">{t("pessoasPagina.notes.fromForm", { form: n.formulario })}</p>
            <p className="text-sm tabular-nums text-muted-foreground">{textoDataCompleta(t, n.data, hoje)}</p>
          </div>
          <ListaCampos>{n.campos.map((c) => <LinhaCampo key={c.rotulo} rotulo={c.rotulo}>{c.valor}</LinhaCampo>)}</ListaCampos>
        </li>
      ))}
    </ul>
  );
}
