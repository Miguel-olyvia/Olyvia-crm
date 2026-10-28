import { ChevronDown, ChevronRight, ChevronUp, Trash2 } from "lucide-react";
import { FOCO } from "@/components/negocio-metas/estilos";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { criarOpcao, ehEscolha, LIMITES, TIPOS_PERGUNTA, type PerguntaEd, type TipoPergunta } from "@/hooks/pessoas/workflow/questionario";
import { alterarPergunta, moverPergunta, removerPergunta } from "@/hooks/pessoas/workflow/questionarioEdicao";
import { useTranslation } from "@/hooks/useTranslation";
import { LevantamentoCondicao } from "./LevantamentoCondicao";
import { LevantamentoEfeito } from "./LevantamentoEfeito";
import { LevantamentoOpcoes } from "./LevantamentoOpcoes";
import { BotaoIcone, Campo, Caixa, W, type ContextoEditor } from "./LevantamentoPecas";

interface LevantamentoPerguntaProps {
  pergunta: PerguntaEd;
  seccaoK: string;
  indice: number;
  total: number;
  ctx: ContextoEditor;
}

/** Os campos que só um tipo de pergunta tem: o tamanho máximo do texto, ou os limites do número. */
function CamposDoTipo({ pergunta, ctx }: { pergunta: PerguntaEd; ctx: ContextoEditor }) {
  const { t } = useTranslation();
  const k = pergunta.k;
  const mudar = (patch: Partial<PerguntaEd>) => ctx.mudar((s) => alterarPergunta(s, k, patch));
  if (pergunta.tipo === "texto") {
    return (
      <Campo
        id={`lev-${k}-textomax`} tipo="number" rotulo={t(`${W}lev.text.max`)} valor={pergunta.textoMax} marcador={String(LIMITES.textoMaxOmissao)}
        desativado={ctx.desativado} invalido={ctx.invalido(k, "textoMax")} ajuda={t(`${W}lev.text.maxHint`, { max: LIMITES.textoMaxOmissao })}
        aoMudar={(textoMax) => mudar({ textoMax })}
      />
    );
  }
  if (pergunta.tipo === "numero") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id={`lev-${k}-min`} tipo="number" rotulo={t(`${W}lev.number.min`)} valor={pergunta.min} desativado={ctx.desativado} invalido={ctx.invalido(k, "min")} aoMudar={(min) => mudar({ min })} />
        {/* O Máximo usa o problema «min» de propósito: `limitesNumero` é um só (o mínimo não pode passar o máximo, ambos números), por isso os dois campos
            ficam aria-invalid juntos, mesmo que só um esteja mal. */}
        <Campo id={`lev-${k}-max`} tipo="number" rotulo={t(`${W}lev.number.max`)} valor={pergunta.max} desativado={ctx.desativado} invalido={ctx.invalido(k, "min")} aoMudar={(max) => mudar({ max })} />
        <Campo
          id={`lev-${k}-casas`} tipo="number" rotulo={t(`${W}lev.number.decimals`)} valor={pergunta.casas} desativado={ctx.desativado}
          invalido={ctx.invalido(k, "casas")} ajuda={t(`${W}lev.number.decimalsHint`, { max: LIMITES.casasMax })} aoMudar={(casas) => mudar({ casas })}
        />
        <Campo
          id={`lev-${k}-unidade`} rotulo={t(`${W}lev.number.unit`)} valor={pergunta.unidade} desativado={ctx.desativado}
          invalido={ctx.invalido(k, "unidade")} aoMudar={(unidade) => mudar({ unidade })}
        />
      </div>
    );
  }
  return null;
}

/** O editor de uma pergunta aberta: texto, tipo, subtítulo, ativa, o que é próprio do tipo e a condição. */
function EditorPergunta({ pergunta, ctx }: { pergunta: PerguntaEd; ctx: ContextoEditor }) {
  const { t } = useTranslation();
  const k = pergunta.k;
  const mudar = (patch: Partial<PerguntaEd>) => ctx.mudar((s) => alterarPergunta(s, k, patch));
  const nome = pergunta.texto.trim() || t(`${W}lev.question.unnamed`);
  const tipos = TIPOS_PERGUNTA.map((tipo) => ({ value: tipo, label: t(`${W}lev.type.${tipo}`) }));
  return (
    <div role="group" id={`lev-${k}-editor`} aria-label={t(`${W}lev.question.edit`, { nome })} className="space-y-3 border-t p-3">
      <Campo
        id={`lev-${k}-texto`} rotulo={t(`${W}lev.question.text`)} valor={pergunta.texto} desativado={ctx.desativado}
        invalido={ctx.invalido(k, "texto")} aoMudar={(texto) => mudar({ texto })}
      />
      <div className="space-y-1">
        <Label htmlFor={`lev-${k}-tipo`} className="text-sm">{t(`${W}lev.question.type`)}</Label>
        <NativeSelect
          id={`lev-${k}-tipo`} options={tipos} value={pergunta.tipo} disabled={ctx.desativado} className={FOCO}
          onValueChange={(valor) => {
            const tipo = valor as TipoPergunta;
            // Passar a escolha sem opções dá logo duas para preencher (o mínimo que a base aceita).
            mudar({ tipo, ...(ehEscolha(tipo) && pergunta.opcoes.length === 0 ? { opcoes: [criarOpcao(), criarOpcao()] } : {}) });
          }}
        />
      </div>
      <Campo
        id={`lev-${k}-bloco`} rotulo={t(`${W}lev.question.block`)} valor={pergunta.bloco} desativado={ctx.desativado}
        invalido={ctx.invalido(k, "bloco")} ajuda={t(`${W}lev.question.blockHint`)} aoMudar={(bloco) => mudar({ bloco })}
      />
      <Caixa
        id={`lev-${k}-activa`} rotulo={t(`${W}lev.question.active`)} marcada={pergunta.activa} desativado={ctx.desativado}
        aoMudar={(activa) => mudar({ activa })}
      />
      <CamposDoTipo pergunta={pergunta} ctx={ctx} />
      <LevantamentoEfeito pergunta={pergunta} ctx={ctx} />
      {ehEscolha(pergunta.tipo) && <LevantamentoOpcoes pergunta={pergunta} ctx={ctx} />}
      <LevantamentoCondicao pergunta={pergunta} ctx={ctx} />
    </div>
  );
}

/** Uma pergunta na lista da secção: a linha (abrir, tipo, estado, posição, apagar) e, aberta, o editor. */
export function LevantamentoPergunta({ pergunta, seccaoK, indice, total, ctx }: LevantamentoPerguntaProps) {
  const { t } = useTranslation();
  const k = pergunta.k;
  const aberta = ctx.abertas.has(k);
  const nome = pergunta.texto.trim() || t(`${W}lev.question.unnamed`);
  const mover = (delta: -1 | 1) => ctx.mudar((s) => moverPergunta(s, k, delta), {
    foco: `lev-${k}-${delta < 0 ? "subir" : "descer"}`,
    anuncio: t(`${W}lev.moved`, { nome, pos: indice + 1 + delta, total }),
  });
  return (
    <li className="rounded-md border bg-card">
      <div className="flex flex-wrap items-center gap-2 p-2">
        <button
          type="button" id={`lev-${k}-abrir`} aria-expanded={aberta} aria-controls={`lev-${k}-editor`} onClick={() => ctx.alternar(k)}
          className={`flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-1 text-left text-sm font-medium ${FOCO}`}
        >
          {aberta ? <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" /> : <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />}
          <span className="truncate">{nome}</span>
        </button>
        <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">{t(`${W}lev.type.${pergunta.tipo}`)}</span>
        {ehEscolha(pergunta.tipo) && <span className="text-xs text-muted-foreground">{t(`${W}lev.question.optionCount`, { n: pergunta.opcoes.length })}</span>}
        {pergunta.depende && <span className="text-xs text-muted-foreground">{t(`${W}lev.question.conditional`)}</span>}
        {!pergunta.activa && <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{t(`${W}lev.question.inactive`)}</span>}
        <BotaoIcone id={`lev-${k}-subir`} icone={ChevronUp} rotulo={t(`${W}lev.question.up`, { nome })} inativo={ctx.desativado || indice === 0} aoClicar={() => mover(-1)} />
        <BotaoIcone id={`lev-${k}-descer`} icone={ChevronDown} rotulo={t(`${W}lev.question.down`, { nome })} inativo={ctx.desativado || indice === total - 1} aoClicar={() => mover(1)} />
        <BotaoIcone
          icone={Trash2} rotulo={t(`${W}lev.question.remove`, { nome })} inativo={ctx.desativado}
          aoClicar={() => ctx.mudar((s) => removerPergunta(s, k), { foco: `lev-${seccaoK}-add-pergunta`, anuncio: t(`${W}lev.question.removed`, { nome }) })}
        />
      </div>
      {aberta && <EditorPergunta pergunta={pergunta} ctx={ctx} />}
    </li>
  );
}
