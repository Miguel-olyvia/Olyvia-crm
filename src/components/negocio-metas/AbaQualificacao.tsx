import { Info } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { MoradaObra } from "./CamposMoradaObra";
import { EstadoQuestionarioVivo } from "./EstadoQuestionario";
import { BlocosPerguntas } from "./PerguntaEscolha";
import { N } from "./PecasNovoNegocio";
import { useQuestionario } from "./QuestionarioContexto";
import type { ChaveMorada, MoradaObraForm } from "./moradaObra";
import type { OrigemMorada } from "./useEstadoNovoNegocio";
import type { Respostas } from "./perguntasTipos";
import { blocosDaQualificacao } from "./questionarioForm";
import type { ErroResposta } from "./respostasQuestionario";
import { contarRespostas } from "./respostasVisita";

export interface AcoesQualificacao {
  escolher: (pergunta: string, opcao: string) => void;
  /** Escreve a resposta de uma pergunta de texto ou de número; sem isto esses campos só se leem. */
  escrever?: (pergunta: string, valor: string) => void;
  morada: (chave: ChaveMorada, valor: string) => void;
  preencherMorada: (morada: MoradaObraForm) => void;
}

interface Props {
  id: string;
  respostas: Respostas;
  morada: MoradaObraForm;
  erroCodigoPostal: boolean;
  /** Quando a morada veio da visita, de onde: diz-se por baixo do título. */
  origemMorada?: OrigemMorada;
  /** A morada da aba Geral, para o atalho da morada da obra. */
  moradaContacto: string;
  acoes: AcoesQualificacao;
  /** Os erros das respostas de texto e número, pela pergunta (`validarRespostas`, calculado uma vez pelo formulário). */
  errosRespostas: Readonly<Record<string, ErroResposta>>;
}

/**
 * A aba Qualificação: as perguntas da secção Qualificação do questionário (uma secção como as outras: da base, ou do código no protótipo sem
 * base) e a morada da obra. Tudo opcional. Enquanto as perguntas não carregam, ou se a leitura falhou, diz-se no lugar delas.
 */
export function AbaQualificacao({ id, respostas, morada, erroCodigoPostal, origemMorada = null, moradaContacto, acoes, errosRespostas }: Props) {
  const { t } = useTranslation();
  const { questionario, estado, repetir } = useQuestionario();
  const blocos = blocosDaQualificacao(questionario);
  const seccao = questionario.seccoes.find((s) => s.aba === "qualificacao");
  const titulo = seccao?.literal ? seccao.titulo[0] : t(`${N}qual.questions`);
  const { respondidas, total } = contarRespostas(blocos, respostas);
  const pronto = estado === "pronto";
  return (
    <div className="space-y-6">
      <p role="note" className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {t(`${N}qual.help`)}
      </p>
      <EstadoQuestionarioVivo estado={estado} aoRepetir={repetir} />
      {pronto && blocos.length === 0 && (
        <p role="note" className="text-sm text-muted-foreground">{t(`${N}qform.qualEmpty`)}</p>
      )}
      {pronto && blocos.length > 0 && (
        <section aria-labelledby={`${id}-qualificacao`} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id={`${id}-qualificacao`} className="text-sm font-semibold text-foreground">{titulo}</h3>
            <p aria-live="polite" className="text-sm tabular-nums text-muted-foreground">{t(`${N}answered`, { n: respondidas, m: total })}</p>
          </div>
          <BlocosPerguntas
            blocos={blocos} respostas={respostas} aoEscolher={acoes.escolher} aoEscrever={acoes.escrever}
            erros={errosRespostas}
          />
        </section>
      )}
      <MoradaObra
        id={id} valores={morada} erroCodigoPostal={erroCodigoPostal} moradaContacto={moradaContacto} origem={origemMorada}
        aoMudar={acoes.morada} aoPreencher={acoes.preencherMorada}
      />
    </div>
  );
}
