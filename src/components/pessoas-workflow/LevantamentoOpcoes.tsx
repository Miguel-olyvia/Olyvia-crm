import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { FOCO } from "@/components/negocio-metas/estilos";
import { Input } from "@/components/ui/input";
import { criarOpcao, LIMITES, type PerguntaEd } from "@/hooks/pessoas/workflow/questionario";
import { adicionarOpcao, alterarOpcao, moverOpcao, removerOpcao } from "@/hooks/pessoas/workflow/questionarioEdicao";
import { useTranslation } from "@/hooks/useTranslation";
import { BotaoIcone, BotaoTexto, Caixa, W, type ContextoEditor } from "./LevantamentoPecas";

/** As opções de resposta de uma pergunta de escolha: texto, ativa, posição e apagar, e «Adicionar opção» (até 30). */
export function LevantamentoOpcoes({ pergunta, ctx }: { pergunta: PerguntaEd; ctx: ContextoEditor }) {
  const { t } = useTranslation();
  const total = pergunta.opcoes.length;
  const cheia = total >= LIMITES.opcoesMax;
  return (
    <div role="group" aria-label={t(`${W}lev.options.label`)} className="space-y-2">
      <p className="text-sm font-medium">{t(`${W}lev.options.label`)}</p>
      <p className="text-xs text-muted-foreground">{t(`${W}lev.options.hint`)}</p>
      <ul className="space-y-2">
        {pergunta.opcoes.map((o, i) => {
          const n = i + 1;
          const mover = (delta: -1 | 1) => ctx.mudar((s) => moverOpcao(s, pergunta.k, o.k, delta), {
            foco: `lev-${o.k}-${delta < 0 ? "subir" : "descer"}`,
            anuncio: t(`${W}lev.moved`, { nome: t(`${W}lev.options.name`, { n }), pos: n + delta, total }),
          });
          return (
            <li key={o.k} className="flex flex-wrap items-center gap-2 rounded-md border bg-background/60 p-2">
              <span className="w-6 text-center text-xs text-muted-foreground" aria-hidden="true">{n}</span>
              <Input
                id={`lev-${o.k}-opcao`} value={o.texto} disabled={ctx.desativado} aria-label={t(`${W}lev.options.text`, { n })}
                aria-invalid={ctx.invalido(o.k, "opcao") || undefined} className={`${FOCO} min-w-40 flex-1`}
                onChange={(e) => ctx.mudar((s) => alterarOpcao(s, pergunta.k, o.k, { texto: e.target.value }))}
              />
              <Caixa
                id={`lev-${o.k}-activa`} rotulo={t(`${W}lev.options.active`, { n })} marcada={o.activa} desativado={ctx.desativado}
                aoMudar={(activa) => ctx.mudar((s) => alterarOpcao(s, pergunta.k, o.k, { activa }))}
              />
              <BotaoIcone id={`lev-${o.k}-subir`} icone={ChevronUp} rotulo={t(`${W}lev.options.up`, { n })} inativo={ctx.desativado || i === 0} aoClicar={() => mover(-1)} />
              <BotaoIcone id={`lev-${o.k}-descer`} icone={ChevronDown} rotulo={t(`${W}lev.options.down`, { n })} inativo={ctx.desativado || i === total - 1} aoClicar={() => mover(1)} />
              <BotaoIcone
                icone={Trash2} rotulo={t(`${W}lev.options.remove`, { n })} inativo={ctx.desativado}
                aoClicar={() => ctx.mudar((s) => removerOpcao(s, pergunta.k, o.k), { foco: `lev-${pergunta.k}-add-opcao`, anuncio: t(`${W}lev.options.removed`, { n }) })}
              />
            </li>
          );
        })}
      </ul>
      <BotaoTexto
        id={`lev-${pergunta.k}-add-opcao`} icone={Plus} inativo={ctx.desativado || cheia}
        aoClicar={() => {
          const nova = criarOpcao();
          ctx.mudar((s) => adicionarOpcao(s, pergunta.k, nova), { foco: `lev-${nova.k}-opcao`, anuncio: t(`${W}lev.options.added`, { n: total + 1 }) });
        }}
      >
        {t(`${W}lev.options.add`)}
      </BotaoTexto>
      {cheia && <p className="text-xs text-muted-foreground">{t(`${W}lev.options.full`, { max: LIMITES.opcoesMax })}</p>}
    </div>
  );
}
