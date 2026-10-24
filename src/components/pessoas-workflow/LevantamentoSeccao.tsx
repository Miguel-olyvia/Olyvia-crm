import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { criarPergunta, LIMITES, type SeccaoEd } from "@/hooks/pessoas/workflow/questionario";
import { adicionarPergunta, alterarSeccao, contarPerguntas, moverSeccao, removerSeccao } from "@/hooks/pessoas/workflow/questionarioEdicao";
import { useTranslation } from "@/hooks/useTranslation";
import { LevantamentoPergunta } from "./LevantamentoPergunta";
import { BotaoIcone, BotaoTexto, Campo, Caixa, W, type ContextoEditor } from "./LevantamentoPecas";

interface LevantamentoSeccaoProps {
  seccao: SeccaoEd;
  indice: number;
  total: number;
  ctx: ContextoEditor;
}

/**
 * Uma secção do questionário. Visitas e Medidas (especiais) só se reordenam: sem título editável, sem perguntas, sem apagar. A Qualificação
 * é uma secção como as outras (renomeia-se, tem perguntas) mas não se apaga. Em cada uma, as perguntas e «Adicionar pergunta» (até 150 no total).
 */
export function LevantamentoSeccao({ seccao, indice, total, ctx }: LevantamentoSeccaoProps) {
  const { t } = useTranslation();
  const k = seccao.k;
  const nome = seccao.titulo.trim() || t(`${W}lev.section.unnamed`);
  const normal = seccao.especial === null;
  const apagavel = normal && seccao.aba !== "qualificacao";
  const cheio = contarPerguntas(ctx.seccoes) >= LIMITES.perguntas;
  const mover = (delta: -1 | 1) => ctx.mudar((s) => moverSeccao(s, k, delta), {
    foco: `lev-${k}-${delta < 0 ? "subir" : "descer"}`,
    anuncio: t(`${W}lev.moved`, { nome, pos: indice + 1 + delta, total }),
  });
  return (
    <section aria-labelledby={`lev-${k}-nome`} className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={`lev-${k}-nome`} className="min-w-0 flex-1 truncate text-base font-semibold">{nome}</h3>
        <BotaoIcone id={`lev-${k}-subir`} icone={ChevronUp} rotulo={t(`${W}lev.section.up`, { nome })} inativo={ctx.desativado || indice === 0} aoClicar={() => mover(-1)} />
        <BotaoIcone id={`lev-${k}-descer`} icone={ChevronDown} rotulo={t(`${W}lev.section.down`, { nome })} inativo={ctx.desativado || indice === total - 1} aoClicar={() => mover(1)} />
        {apagavel && (
          <BotaoIcone
            icone={Trash2} rotulo={t(`${W}lev.section.remove`, { nome })} inativo={ctx.desativado}
            aoClicar={() => ctx.mudar((s) => removerSeccao(s, k), { foco: "lev-add-seccao", anuncio: t(`${W}lev.section.removed`, { nome }) })}
          />
        )}
      </div>
      {!normal && <p className="text-sm text-muted-foreground">{t(`${W}lev.section.fixed`)}</p>}
      {normal && (
        <div className="space-y-1">
          <Campo
            id={`lev-${k}-titulo`} rotulo={t(`${W}lev.section.title`)} valor={seccao.titulo} desativado={ctx.desativado}
            invalido={ctx.invalido(k, "titulo")} aoMudar={(titulo) => ctx.mudar((s) => alterarSeccao(s, k, { titulo }))}
          />
          <Caixa
            id={`lev-${k}-activa`} rotulo={t(`${W}lev.section.active`)} marcada={seccao.activa} desativado={ctx.desativado}
            aoMudar={(activa) => ctx.mudar((s) => alterarSeccao(s, k, { activa }))}
          />
          {!apagavel && <p className="text-xs text-muted-foreground">{t(`${W}lev.section.noDelete`)}</p>}
        </div>
      )}
      {normal && (
        <>
          {seccao.perguntas.length > 0 && (
            <ul className="space-y-2" aria-label={t(`${W}lev.section.questions`, { nome })}>
              {seccao.perguntas.map((p, i) => (
                <LevantamentoPergunta key={p.k} pergunta={p} seccaoK={k} indice={i} total={seccao.perguntas.length} ctx={ctx} />
              ))}
            </ul>
          )}
          <BotaoTexto
            id={`lev-${k}-add-pergunta`} icone={Plus} inativo={ctx.desativado || cheio}
            aoClicar={() => {
              const nova = criarPergunta();
              // Primeiro a alteração (que sai sem fazer nada se estiver a gravar) e só depois abrir: não se abre o editor de uma pergunta que não entrou.
              ctx.mudar((s) => adicionarPergunta(s, k, nova), { foco: `lev-${nova.k}-texto`, anuncio: t(`${W}lev.question.added`) });
              ctx.abrir(nova.k);
            }}
          >
            {t(`${W}lev.question.add`)}
          </BotaoTexto>
        </>
      )}
    </section>
  );
}
