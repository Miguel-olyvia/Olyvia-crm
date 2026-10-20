import { FOCO } from "@/components/negocio-metas/estilos";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { PerguntaEd } from "@/hooks/pessoas/workflow/questionario";
import { alvosPossiveis, dependentesDe, mudarCondicao } from "@/hooks/pessoas/workflow/questionarioEdicao";
import { useTranslation } from "@/hooks/useTranslation";
import { Caixa, W, type ContextoEditor } from "./LevantamentoPecas";

/**
 * A condição de visibilidade de uma pergunta (um só nível): aparece quando outra pergunta de escolha tem uma destas respostas. Só se impõe no
 * ecrã do levantamento (a base aceita respostas a perguntas escondidas). Uma pergunta que já é condição de outras não pode ter condição própria.
 */
export function LevantamentoCondicao({ pergunta, ctx }: { pergunta: PerguntaEd; ctx: ContextoEditor }) {
  const { t } = useTranslation();
  const alvos = alvosPossiveis(ctx.seccoes, pergunta.k);
  const usadaComoCondicao = dependentesDe(ctx.seccoes, pergunta.k).length > 0;
  const condicao = pergunta.depende;
  const alvo = condicao ? alvos.find((a) => a.k === condicao.pergunta) : undefined;
  const idSelect = `lev-${pergunta.k}-condicao`;
  const opcoes = [
    { value: "", label: t(`${W}lev.condition.none`) },
    ...alvos.map((a) => ({ value: a.k, label: a.texto.trim() || t(`${W}lev.question.unnamed`) })),
  ];
  const escolher = (k: string) =>
    ctx.mudar((s) => mudarCondicao(s, pergunta.k, k === "" ? null : { pergunta: k, opcoes: [], semResposta: false }));
  const alternar = (opcaoK: string, marcada: boolean) => {
    if (!condicao) return;
    const opcoesNovas = marcada ? [...condicao.opcoes, opcaoK] : condicao.opcoes.filter((o) => o !== opcaoK);
    ctx.mudar((s) => mudarCondicao(s, pergunta.k, { ...condicao, opcoes: opcoesNovas }));
  };
  return (
    <div role="group" aria-label={t(`${W}lev.condition.label`)} className="space-y-2 rounded-md border border-dashed p-3">
      <p className="text-sm font-medium">{t(`${W}lev.condition.label`)}</p>
      <div className="space-y-1">
        <Label htmlFor={idSelect} className="text-sm">{t(`${W}lev.condition.question`)}</Label>
        <NativeSelect
          id={idSelect} options={opcoes} value={condicao?.pergunta ?? ""} disabled={ctx.desativado || usadaComoCondicao}
          aria-invalid={ctx.invalido(pergunta.k, "condicao") || undefined} className={FOCO} onValueChange={escolher}
        />
      </div>
      {usadaComoCondicao && <p className="text-xs text-muted-foreground">{t(`${W}lev.condition.usedByOthers`)}</p>}
      {condicao && alvo && (
        <div role="group" aria-label={t(`${W}lev.condition.answers`)} className="space-y-1">
          <p className="text-xs text-muted-foreground">{t(`${W}lev.condition.answersHint`)}</p>
          {alvo.opcoes.map((o) => (
            <Caixa
              key={o.k} id={`lev-${pergunta.k}-cond-${o.k}`} rotulo={o.texto.trim() || t(`${W}lev.options.unnamed`)}
              marcada={condicao.opcoes.includes(o.k)} desativado={ctx.desativado} aoMudar={(m) => alternar(o.k, m)}
            />
          ))}
          <Caixa
            id={`lev-${pergunta.k}-cond-sem`} rotulo={t(`${W}lev.condition.noAnswer`)} marcada={condicao.semResposta} desativado={ctx.desativado}
            aoMudar={(semResposta) => ctx.mudar((s) => mudarCondicao(s, pergunta.k, { ...condicao, semResposta }))}
          />
        </div>
      )}
      <p className="text-xs text-muted-foreground">{t(`${W}lev.condition.screenOnly`)}</p>
    </div>
  );
}
