import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { isRowInBucket, setRowInBucket, type RuleGroup } from "@/components/leads/workflow/conditionCatalog";
import { FOCO } from "@/components/negocio-metas/estilos";
import { LINHAS_QUALIFICACAO } from "@/hooks/pessoas/workflow/regrasQualificacao";
import { useTranslation } from "@/hooks/useTranslation";

const W = "pessoasPagina.real.workflow.";

const COLUNAS = [{ bucket: "all", texto: "all" }, { bucket: "any", texto: "any" }] as const;

const TONS = {
  mql: { caixa: "border-orange-500/20 bg-orange-500/5", titulo: "text-orange-700 dark:text-orange-400" },
  sql: { caixa: "border-emerald-500/20 bg-emerald-500/5", titulo: "text-emerald-700 dark:text-emerald-400" },
} as const;

interface EditorCondicoesProps {
  tom: keyof typeof TONS;
  /** Prefixo dos identificadores: único por regra na página (por exemplo «mql» e «sql»). */
  idBase: string;
  titulo: string;
  descricao: string;
  valor: RuleGroup | null;
  aoMudar: (valor: RuleGroup | null) => void;
  desativado?: boolean;
}

/**
 * O editor de uma regra MQL/SQL: duas colunas independentes, «Todas (AND)» e «Qualquer (OU)», cada uma com as 12 condições do separador
 * «Qualificação» de Leads. Usa o catálogo e a lógica de marcar de Leads (conditionCatalog.ts); o que muda é o texto (traduzido), as
 * colunas serem grupos com nome e descrição à vista (em Leads a explicação está num tooltip) e poder desativar-se enquanto grava.
 */
export function EditorCondicoes({ tom, idBase, titulo, descricao, valor, aoMudar, desativado = false }: EditorCondicoesProps) {
  const { t } = useTranslation();
  const idDescricao = `${idBase}-descricao`;
  return (
    <fieldset disabled={desativado} aria-describedby={idDescricao} className={cn("m-0 min-w-0 space-y-3 rounded-lg border p-4", TONS[tom].caixa)}>
      <legend className={cn("px-1 text-sm font-medium", TONS[tom].titulo)}>{titulo}</legend>
      <p id={idDescricao} className="text-xs text-muted-foreground">{descricao}</p>
      <div className="flex flex-col gap-3 md:flex-row">
        {COLUNAS.map(({ bucket, texto }) => {
          const idColuna = `${idBase}-${bucket}`;
          return (
            <fieldset key={bucket} aria-describedby={`${idColuna}-ajuda`} className="m-0 min-w-0 flex-1 rounded-md border bg-background/60 p-0">
              <legend className="ml-2 px-1 text-xs font-semibold">{t(`${W}qual.${texto}.title`)}</legend>
              <p id={`${idColuna}-ajuda`} className="px-3 pb-1 pt-1 text-xs text-muted-foreground">{t(`${W}qual.${texto}.hint`)}</p>
              <div className="divide-y">
                {LINHAS_QUALIFICACAO.map((linha) => {
                  const id = `${idColuna}-${linha.key}`;
                  return (
                    <div key={linha.key} className="flex min-h-11 items-center gap-2 px-3">
                      <Checkbox
                        id={id} disabled={desativado} className={FOCO} checked={isRowInBucket(valor, linha, bucket)}
                        onCheckedChange={(marcada) => aoMudar(setRowInBucket(valor, linha, bucket, marcada === true))}
                      />
                      <Label htmlFor={id} className="flex min-h-11 flex-1 cursor-pointer items-center text-sm font-normal">
                        {t(`${W}cond.${linha.key}`)}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>
    </fieldset>
  );
}
