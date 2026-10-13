import { Inbox } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";
import { CartaoSubmissao } from "./CartaoSubmissao";
import type { Pessoa, Submissao } from "./pessoasTipos";

interface SeparadorSubmissoesProps {
  /** Já ordenadas: conflitos primeiro, depois a data mais recente. */
  submissoes: Submissao[];
  pessoas: ReadonlyMap<string, Pessoa>;
  hoje: string;
  aoPedir: (submissaoId: string, pessoaId: string) => void;
  aoAbrirFicha: (pessoaId: string) => void;
  aoVerPessoas: () => void;
}

/** Sem submissões pendentes: diz-o e leva às pessoas. O botão recebe o foco quando se resolve a última. */
function SemSubmissoes({ aoVerPessoas }: { aoVerPessoas: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border p-6">
      <Inbox className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      <div className="space-y-1">
        <p className="text-base font-semibold text-foreground">{t("pessoasPagina.subsEmpty.title")}</p>
        <p className="text-sm text-muted-foreground">{t("pessoasPagina.subsEmpty.hint")}</p>
      </div>
      <Button type="button" data-foco-vazio className={cn("min-h-11", FOCO)} onClick={aoVerPessoas}>
        {t("pessoasPagina.subsEmpty.action")}
      </Button>
    </div>
  );
}

/** O separador "Submissões pendentes": um cartão por submissão, ou o estado vazio. */
export function SeparadorSubmissoes({ submissoes, pessoas, hoje, aoPedir, aoAbrirFicha, aoVerPessoas }: SeparadorSubmissoesProps) {
  const { t } = useTranslation();
  if (submissoes.length === 0) return <SemSubmissoes aoVerPessoas={aoVerPessoas} />;
  return (
    <ul aria-label={t("pessoasPagina.subsList.label")} className="space-y-4">
      {submissoes.map((s) => (
        <li key={s.id}>
          <CartaoSubmissao
            submissao={s} hoje={hoje} aoPedir={aoPedir} aoAbrirFicha={aoAbrirFicha}
            candidatas={s.candidatas.flatMap((c) => {
              const pessoa = pessoas.get(c.pessoaId);
              return pessoa ? [{ pessoa, via: c.via }] : [];
            })}
          />
        </li>
      ))}
    </ul>
  );
}
