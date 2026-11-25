// 23/11: as variáveis dos textos do template de proposta ({{condicoes_pagamento}}, …; src/lib/textoDaProposta.ts), no editor de
// templates: a lista para inserir nos termos e o aviso quando as condições de pagamento estão escritas à mão. Só mexe no texto do
// editor: nada se grava sem o «Guardar» de sempre.
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import { VARIAVEIS_DA_PROPOSTA, pagamentoFixoEscritoAMao, trocarPagamentoPelaVariavel } from "@/lib/textoDaProposta";

const CONDICOES = "{{condicoes_pagamento}}";

export interface VariaveisDoTemplateProps {
  termos: string;
  aoMudarTermos: (termos: string) => void;
}

export function VariaveisDoTemplate({ termos, aoMudarTermos }: VariaveisDoTemplateProps) {
  const { t } = useTranslation();
  const fixo = pagamentoFixoEscritoAMao(termos);
  const trocado = fixo ? trocarPagamentoPelaVariavel(termos) : null;
  const inserir = (chave: string) => aoMudarTermos(`${termos}${termos && !termos.endsWith("\n") ? " " : ""}{{${chave}}}`);
  return (
    <div className="space-y-2 rounded-md border border-border p-2" data-testid="variaveis-do-template">
      {fixo && (
        <div role="status" className="space-y-1.5 rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-xs">
          <p>{t("proposalTemplateEditor.variaveis.avisoFixo", { variavel: CONDICOES })}</p>
          {trocado !== null && (
            <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => aoMudarTermos(trocado)}>
              {t("proposalTemplateEditor.variaveis.trocar", { variavel: CONDICOES })}
            </Button>
          )}
        </div>
      )}
      <p className="text-xs font-medium">{t("proposalTemplateEditor.variaveis.titulo")}</p>
      <p className="text-xs text-muted-foreground">{t("proposalTemplateEditor.variaveis.ajuda")}</p>
      <ul className="space-y-1">
        {VARIAVEIS_DA_PROPOSTA.map((v) => (
          <li key={v.chave} className="flex flex-wrap items-center gap-2 text-xs">
            <Button type="button" size="sm" variant="secondary" className="h-7 px-2 font-mono text-[11px]"
              onClick={() => inserir(v.chave)} aria-label={t("proposalTemplateEditor.variaveis.inserir", { variavel: `{{${v.chave}}}` })}>
              {`{{${v.chave}}}`}
            </Button>
            <span className="text-muted-foreground">{t(`proposalTemplateEditor.variaveis.${v.chave}`)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
