import { Info } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { FOCO } from "./estilos";
import { useTranslation } from "@/hooks/useTranslation";
import { MoradaObra, type AtalhosMoradaReal } from "./CamposMoradaObra";
import { EstadoQuestionarioVivo } from "./EstadoQuestionario";
import { BlocosPerguntas } from "./PerguntaEscolha";
import { N } from "./PecasNovoNegocio";
import { useQuestionario } from "./QuestionarioContexto";
import type { ChaveMorada, MoradaObraForm, OrigemMoradaObra } from "./moradaObra";

/** O pedido do cliente tem até 2000 caracteres (a base recusa mais). */
export const MAX_PEDIDO = 2000;
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
  /** Só a ficha real: os atalhos da morada (entidade e local). Sem isto, o atalho da morada do contacto. */
  atalhosMorada?: AtalhosMoradaReal;
  origemObra?: OrigemMoradaObra | null;
  /** Só com um negócio (ficha real): «o que o cliente pediu». */
  pedido?: { valor: string; aoMudar: (valor: string) => void };
  /** Ficha real sem negócio: as perguntas e o pedido não têm onde gravar, e diz-se. */
  semNegocio?: boolean;
}

/** «O que o cliente pediu»: um campo próprio, com o limite à vista. */
function PedidoDoCliente({ id, valor, aoMudar }: { id: string; valor: string; aoMudar: (valor: string) => void }) {
  const { t } = useTranslation();
  const n = Array.from(valor).length;
  return (
    <section className="space-y-1.5">
      <Label htmlFor={`${id}-pedido`} className="text-sm font-semibold">{t(`${N}qual.request`)}</Label>
      <p id={`${id}-pedido-ajuda`} className="text-sm text-muted-foreground">{t(`${N}qual.request.help`)}</p>
      <Textarea
        id={`${id}-pedido`} value={valor} rows={4} maxLength={MAX_PEDIDO} aria-describedby={`${id}-pedido-ajuda ${id}-pedido-conta`}
        className={cn("min-h-24", FOCO)} onChange={(e) => aoMudar(e.target.value)}
      />
      <p id={`${id}-pedido-conta`} className="text-right text-sm tabular-nums text-muted-foreground">{t(`${N}qual.request.count`, { n, m: MAX_PEDIDO })}</p>
    </section>
  );
}

/**
 * A aba Qualificação: as perguntas da secção Qualificação do questionário (uma secção como as outras: da base, ou do código no protótipo sem
 * base) e a morada da obra. Tudo opcional. Enquanto as perguntas não carregam, ou se a leitura falhou, diz-se no lugar delas.
 */
export function AbaQualificacao({ id, respostas, morada, erroCodigoPostal, origemMorada = null, moradaContacto, acoes, errosRespostas, atalhosMorada, origemObra, pedido, semNegocio = false }: Props) {
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
      {semNegocio && <p role="note" className="rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground">{t(`${N}qual.noDeal`)}</p>}
      {pedido && <PedidoDoCliente id={id} valor={pedido.valor} aoMudar={pedido.aoMudar} />}
      {!semNegocio && <EstadoQuestionarioVivo estado={estado} aoRepetir={repetir} />}
      {!semNegocio && pronto && blocos.length === 0 && (
        <p role="note" className="text-sm text-muted-foreground">{t(`${N}qform.qualEmpty`)}</p>
      )}
      {!semNegocio && pronto && blocos.length > 0 && (
        <section aria-labelledby={`${id}-qualificacao`} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id={`${id}-qualificacao`} className="text-sm font-semibold text-foreground">{titulo}</h3>
            <p className="text-sm tabular-nums text-muted-foreground">{t(`${N}answered`, { n: respondidas, m: total })}</p>
          </div>
          <BlocosPerguntas
            blocos={blocos} respostas={respostas} aoEscolher={acoes.escolher} aoEscrever={acoes.escrever}
            erros={errosRespostas}
          />
        </section>
      )}
      <MoradaObra
        id={id} valores={morada} erroCodigoPostal={erroCodigoPostal} moradaContacto={moradaContacto} origem={origemMorada}
        aoMudar={acoes.morada} aoPreencher={acoes.preencherMorada} real={atalhosMorada} origemObra={origemObra}
      />
    </div>
  );
}
