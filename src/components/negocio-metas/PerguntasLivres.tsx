import { useId } from "react";
import { AlertCircle, Check } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { N } from "./PecasNovoNegocio";
import { FOCO } from "./estilos";
import { LIVRE, MARCADA, PILULA } from "./estilosPergunta";
import type { ErroResposta } from "./respostasQuestionario";
import type { PerguntaDef } from "./perguntasTipos";
import { chavesEscolhidas, textoDaOpcao, textoDaPergunta } from "./respostasVisita";

/** Mensagem de erro (ícone e texto: a cor nunca é o único sinal), ligada ao campo por aria-describedby. */
function MensagemErro({ id, texto }: { id: string; texto: string }) {
  return (
    <p id={id} className="flex items-center gap-1.5 text-sm text-foreground">
      <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
      {texto}
    </p>
  );
}

interface BaseProps {
  pergunta: PerguntaDef;
  /** O que está respondido (sempre em texto, ver `Respostas`); `undefined` sem resposta. */
  valor: string | undefined;
  erro?: ErroResposta;
}

interface MultiplaProps extends BaseProps {
  /** Chamado com a chave da opção tocada: quem chama liga-a ou desliga-a. */
  aoEscolher: (opcao: string) => void;
}

/**
 * Uma pergunta de escolha múltipla: um grupo de botões-pílula (`group`), cada um uma caixa (`checkbox`) que se liga e desliga sozinha.
 * Alvo de 44 px; a escolhida diz-se por cor e por um visto. Cada botão está no ciclo do Tab (são caixas independentes, não um radiogroup).
 */
export function PerguntaMultipla({ pergunta, valor, aoEscolher }: MultiplaProps) {
  const { t } = useTranslation();
  const id = useId();
  const traduzir = (chave: string) => t(`${N}${chave}`);
  const escolhidas = chavesEscolhidas(valor);
  return (
    <div className="space-y-2">
      <p id={`${id}-rotulo`} className="text-sm font-medium text-foreground">{textoDaPergunta(pergunta, traduzir)}</p>
      <p id={`${id}-ajuda`} className="text-xs text-muted-foreground">{t(`${N}qform.multi.hint`)}</p>
      <div role="group" aria-labelledby={`${id}-rotulo`} aria-describedby={`${id}-ajuda`} className="flex flex-wrap gap-2">
        {pergunta.opcoes.map(([chave]) => {
          const marcada = escolhidas.includes(chave);
          return (
            <button
              key={chave} type="button" role="checkbox" aria-checked={marcada} onClick={() => aoEscolher(chave)}
              className={cn(PILULA, FOCO, marcada ? MARCADA : LIVRE)}
            >
              {marcada && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
              {textoDaOpcao(pergunta, chave, traduzir)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface EscritaProps extends BaseProps {
  /** Sem isto o campo só se lê: nunca aceita o que se escreve para o perder. */
  aoEscrever?: (valor: string) => void;
}

/** Uma pergunta de texto livre, até ao máximo de caracteres da pergunta. */
export function PerguntaTexto({ pergunta, valor, erro, aoEscrever }: EscritaProps) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{textoDaPergunta(pergunta, (c) => t(`${N}${c}`))}</Label>
      <Textarea
        id={id} data-pergunta={pergunta.id} value={valor ?? ""} maxLength={pergunta.textoMax} rows={3} autoComplete="off" readOnly={!aoEscrever}
        aria-invalid={erro ? true : undefined} aria-describedby={erro ? `${id}-erro` : undefined}
        onChange={(e) => aoEscrever?.(e.target.value)} className={cn(FOCO, erro && "border-destructive")}
      />
      {erro && <MensagemErro id={`${id}-erro`} texto={t(`${N}qform.error.${erro}`)} />}
    </div>
  );
}

/** Os limites de um número, ditos em texto ("Entre 0 e 100000", "Mínimo 0", "Máximo 10"); vazio quando não há. */
function textoDosLimites(pergunta: PerguntaDef, t: (chave: string, params?: Record<string, string | number>) => string): string {
  const min = pergunta.numero?.min ?? null;
  const max = pergunta.numero?.max ?? null;
  if (min !== null && max !== null) return t(`${N}qform.number.range`, { min, max });
  if (min !== null) return t(`${N}qform.number.min`, { min });
  return max !== null ? t(`${N}qform.number.max`, { max }) : "";
}

/** Uma pergunta de número: aceita vírgula ou ponto, mostra a unidade e os limites, e diz o que está errado. */
export function PerguntaNumero({ pergunta, valor, erro, aoEscrever }: EscritaProps) {
  const { t } = useTranslation();
  const id = useId();
  const unidade = pergunta.numero?.unidade;
  const limites = textoDosLimites(pergunta, t);
  const casas = pergunta.numero?.casas ?? 3;
  const textoErro = erro && (erro === "fora" ? [t(`${N}qform.error.fora`), limites].filter(Boolean).join(" ") : t(`${N}qform.error.${erro}`, { casas }));
  const ligacoes = [unidade ? `${id}-unidade` : "", limites ? `${id}-limites` : "", erro ? `${id}-erro` : ""].filter(Boolean).join(" ");
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{textoDaPergunta(pergunta, (c) => t(`${N}${c}`))}</Label>
      <div className="flex items-center gap-2">
        <Input
          id={id} data-pergunta={pergunta.id} type="text" inputMode="decimal" value={valor ?? ""} autoComplete="off" readOnly={!aoEscrever}
          aria-invalid={erro ? true : undefined} aria-describedby={ligacoes || undefined}
          onChange={(e) => aoEscrever?.(e.target.value)} className={cn("min-h-11 max-w-[14rem]", FOCO, erro && "border-destructive")}
        />
        {unidade && <span id={`${id}-unidade`} className="text-sm text-muted-foreground">{unidade}</span>}
      </div>
      {limites && <p id={`${id}-limites`} className="text-xs text-muted-foreground">{limites}</p>}
      {textoErro && <MensagemErro id={`${id}-erro`} texto={textoErro} />}
    </div>
  );
}
