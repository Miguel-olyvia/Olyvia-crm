import { useId, type KeyboardEvent } from "react";
import { Check } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { N } from "./PecasNovoNegocio";
import { FOCO } from "./estilos";
import type { BlocoDef, PerguntaDef, Respostas } from "./perguntasTipos";
import { chaveBloco, chaveOpcao, chavePergunta, perguntaVisivel } from "./respostasVisita";

const PILULA = [
  "inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-full border px-4 text-sm",
  "transition-colors motion-reduce:transition-none",
].join(" ");
const MARCADA = "border-primary bg-primary/10 font-medium text-primary dark:text-violet-300";
const LIVRE = "border-input bg-card text-foreground hover:border-foreground/40";

const SETAS_SEGUINTE = ["ArrowRight", "ArrowDown"];
const SETAS_ANTERIOR = ["ArrowLeft", "ArrowUp"];

interface PerguntaProps {
  pergunta: PerguntaDef;
  /** A chave da opção escolhida; `undefined` sem resposta. */
  valor: string | undefined;
  /** Chamado com a chave da opção: quem chama decide se escolhe ou, se já estava escolhida, retira. */
  aoEscolher: (opcao: string) => void;
}

/** As setas movem o foco entre as opções do grupo (com volta) e escolhem a nova; Espaço e Enter são o clique. */
function aoTeclar(e: KeyboardEvent<HTMLButtonElement>, aoEscolher: (opcao: string) => void, valor: string | undefined): void {
  const sentido = SETAS_SEGUINTE.includes(e.key) ? 1 : SETAS_ANTERIOR.includes(e.key) ? -1 : 0;
  if (sentido === 0) return;
  e.preventDefault();
  const botoes = Array.from(e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]') ?? []);
  const destino = botoes[(botoes.indexOf(e.currentTarget) + sentido + botoes.length) % botoes.length];
  destino.focus();
  const opcao = destino.dataset.opcao;
  if (opcao && opcao !== valor) aoEscolher(opcao);
}

/**
 * Uma pergunta de escolha rápida: um grupo de botões-pílula (`radiogroup`). Alvo de 44 px; a escolhida diz-se por cor e
 * por um visto; tocar de novo desseleciona. Só uma opção está no ciclo do Tab (a escolhida, ou a primeira).
 */
export function PerguntaEscolha({ pergunta, valor, aoEscolher }: PerguntaProps) {
  const { t } = useTranslation();
  const id = useId();
  const noTab = pergunta.opcoes.some(([c]) => c === valor) ? valor : pergunta.opcoes[0][0];
  return (
    <div className="space-y-2">
      <p id={`${id}-rotulo`} className="text-sm font-medium text-foreground">{t(`${N}${chavePergunta(pergunta.id)}`)}</p>
      <div role="radiogroup" aria-labelledby={`${id}-rotulo`} className="flex flex-wrap gap-2">
        {pergunta.opcoes.map(([chave]) => {
          const marcada = chave === valor;
          return (
            <button
              key={chave} type="button" role="radio" aria-checked={marcada} tabIndex={chave === noTab ? 0 : -1} data-opcao={chave}
              onClick={() => aoEscolher(chave)} onKeyDown={(e) => aoTeclar(e, aoEscolher, valor)}
              className={cn(PILULA, FOCO, marcada ? MARCADA : LIVRE)}
            >
              {marcada && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
              {t(`${N}${chaveOpcao(pergunta.id, chave)}`)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface BlocosProps {
  blocos: readonly BlocoDef[];
  respostas: Respostas;
  aoEscolher: (pergunta: string, opcao: string) => void;
}

/** Os blocos de perguntas (título por bloco, quando o tem) só com as perguntas visíveis. */
export function BlocosPerguntas({ blocos, respostas, aoEscolher }: BlocosProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      {blocos.map((bloco) => (
        <div key={bloco.id} className="space-y-4">
          {bloco.titulo && <h4 className="text-sm font-semibold text-foreground">{t(`${N}${chaveBloco(bloco.id)}`)}</h4>}
          {bloco.perguntas.filter((p) => perguntaVisivel(p, respostas)).map((p) => (
            <PerguntaEscolha key={p.id} pergunta={p} valor={respostas[p.id]} aoEscolher={(opcao) => aoEscolher(p.id, opcao)} />
          ))}
        </div>
      ))}
    </div>
  );
}
