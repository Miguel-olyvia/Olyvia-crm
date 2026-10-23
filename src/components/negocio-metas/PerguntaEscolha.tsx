import { useId, type KeyboardEvent } from "react";
import { Check } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { N } from "./PecasNovoNegocio";
import { PerguntaMultipla, PerguntaNumero, PerguntaTexto } from "./PerguntasLivres";
import { FOCO } from "./estilos";
import { LIVRE, MARCADA, PILULA } from "./estilosPergunta";
import type { BlocoDef, PerguntaDef, Respostas } from "./perguntasTipos";
import type { ErroResposta } from "./respostasQuestionario";
import { perguntaVisivel, textoDaOpcao, textoDaPergunta, tipoDaPergunta, tituloDoBloco } from "./respostasVisita";

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
  const traduzir = (chave: string) => t(`${N}${chave}`);
  const noTab = pergunta.opcoes.some(([c]) => c === valor) ? valor : pergunta.opcoes[0]?.[0];
  return (
    <div className="space-y-2">
      <p id={`${id}-rotulo`} className="text-sm font-medium text-foreground">{textoDaPergunta(pergunta, traduzir)}</p>
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
              {textoDaOpcao(pergunta, chave, traduzir)}
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
  /** Toca numa opção (escolha única: escolhe ou retira; múltipla: liga ou desliga). */
  aoEscolher: (pergunta: string, opcao: string) => void;
  /** Escreve a resposta de uma pergunta de texto ou de número. Sem isto esses campos só se leem. */
  aoEscrever?: (pergunta: string, valor: string) => void;
  /** Os erros das respostas de texto e número, pela pergunta. */
  erros?: Readonly<Record<string, ErroResposta>>;
}

/** A pergunta com o campo do seu tipo. */
function Pergunta({ pergunta: p, respostas, aoEscolher, aoEscrever, erros }: Omit<BlocosProps, "blocos"> & { pergunta: PerguntaDef }) {
  const valor = respostas[p.id];
  switch (tipoDaPergunta(p)) {
    case "escolha_multipla": return <PerguntaMultipla pergunta={p} valor={valor} aoEscolher={(opcao) => aoEscolher(p.id, opcao)} />;
    case "texto": return <PerguntaTexto pergunta={p} valor={valor} erro={erros?.[p.id]} aoEscrever={aoEscrever && ((v) => aoEscrever(p.id, v))} />;
    case "numero": return <PerguntaNumero pergunta={p} valor={valor} erro={erros?.[p.id]} aoEscrever={aoEscrever && ((v) => aoEscrever(p.id, v))} />;
    default: return <PerguntaEscolha pergunta={p} valor={valor} aoEscolher={(opcao) => aoEscolher(p.id, opcao)} />;
  }
}

/** Os blocos de perguntas (título por bloco, quando o tem) só com as perguntas visíveis. */
export function BlocosPerguntas({ blocos, respostas, aoEscolher, aoEscrever, erros }: BlocosProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      {blocos.map((bloco) => (
        <div key={bloco.id} className="space-y-4">
          {bloco.titulo && <h4 className="text-sm font-semibold text-foreground">{tituloDoBloco(bloco, (c) => t(`${N}${c}`))}</h4>}
          {bloco.perguntas.filter((p) => perguntaVisivel(p, respostas)).map((p) => (
            <Pergunta key={p.id} pergunta={p} respostas={respostas} aoEscolher={aoEscolher} aoEscrever={aoEscrever} erros={erros} />
          ))}
        </div>
      ))}
    </div>
  );
}
