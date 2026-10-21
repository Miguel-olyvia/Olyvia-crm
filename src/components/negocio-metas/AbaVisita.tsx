import { AlertCircle, Check, Circle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { EstadoQuestionarioVivo } from "./EstadoQuestionario";
import { MedidasDaArea, type AcoesLevantamento } from "./LevantamentoCampos";
import { ListaVisitas } from "./ListaVisitas";
import { BlocosPerguntas } from "./PerguntaEscolha";
import { N } from "./PecasNovoNegocio";
import { useQuestionario } from "./QuestionarioContexto";
import { FOCO } from "./estilos";
import type { LevantamentoForm } from "./levantamento";
import type { VisitaNegocio } from "./negocioMetas";
import type { ErrosNovoNegocio } from "./novoNegocio";
import type { Respostas, SeccaoDef } from "./perguntasTipos";
import { seccoesDaVisita } from "./questionarioForm";
import { localizarErrosRespostas, type ErroResposta } from "./respostasQuestionario";
import { contarSeccao, contarTotal, seccaoCompleta, tituloDaSeccao } from "./respostasVisita";
import type { AcoesVisitas } from "./useEstadoNovoNegocio";
import { contarVisitas, visitaRepresentaLevantamento } from "./visitasNegocio";

interface Props {
  id: string;
  /** O id da secção aberta (uma das secções do questionário: da base, ou do código no protótipo sem base). */
  seccaoAtiva: string;
  aoMudarSeccao: (id: string) => void;
  respostas: Respostas;
  aoEscolher: (pergunta: string, opcao: string) => void;
  /** Escreve a resposta de uma pergunta de texto ou de número; sem isto esses campos só se leem. */
  aoEscrever?: (pergunta: string, valor: string) => void;
  /** Os erros das respostas de texto e número, pela pergunta (ver `validarRespostas`). */
  errosRespostas?: Readonly<Record<string, ErroResposta>>;
  levantamento: LevantamentoForm;
  erros: ErrosNovoNegocio;
  acoesLevantamento: AcoesLevantamento;
  visitas: readonly VisitaNegocio[];
  /** O id da visita aberta (ou `null`). */
  visitaAberta: string | null;
  acoesVisitas: AcoesVisitas;
  /** Os ids das visitas que já existem na base (a ficha real): não se removem, cancelam-se. */
  visitasGravadas?: ReadonlySet<string>;
  /** Os ids das visitas com o código postal fora do formato (depois de tentar guardar). */
  visitasComCodigoPostalInvalido?: readonly string[];
  /** Só as secções do levantamento (as perguntas e as medidas), sem a lista de visitas: a aba «Levantamento» do criar negócio, que tem as visitas na sua. */
  semVisitas?: boolean;
}

const um = (n: number): string => (n === 1 ? ".one" : "");

/** O texto curto de uma secção: "n visitas · m feitas", o número de linhas nas Medidas da área, ou "n de m respondidas". */
function useContador(): (s: SeccaoDef, respostas: Respostas, linhas: number, visitas: readonly VisitaNegocio[]) => string {
  const { t } = useTranslation();
  return (s, respostas, linhas, visitas) => {
    if (s.especial === "visitas") {
      const { total, feitas } = contarVisitas(visitas);
      return t(`${N}visits.counter`, { visitas: t(`${N}visits.n${um(total)}`, { n: total }), feitas: t(`${N}visits.done${um(feitas)}`, { n: feitas }) });
    }
    if (s.especial === "medidas") return t(`${N}answered.lines${um(linhas)}`, { n: linhas });
    const { respondidas, total } = contarSeccao(s, respostas);
    return t(`${N}answered`, { n: respondidas, m: total });
  };
}

/** Uma secção está feita: as Visitas com alguma visita feita, as Medidas com linhas, as outras com tudo respondido. */
const feita = (s: SeccaoDef, respostas: Respostas, linhas: number, visitas: readonly VisitaNegocio[]): boolean => {
  if (s.especial === "visitas") return contarVisitas(visitas).feitas > 0;
  return s.especial === "medidas" ? linhas > 0 : seccaoCompleta(s, respostas);
};

/**
 * A lista das secções da visita: à esquerda em ecrã largo, em pílulas em linha no estreito. Cada uma mostra o círculo
 * vazio ou o visto (e diz-se em texto), a atual está destacada e leva `aria-current`.
 */
function ListaSeccoes({ seccoes, ativa, aoMudar, respostas, linhas, visitas, comErros }: {
  seccoes: readonly SeccaoDef[]; ativa: string; aoMudar: (id: string) => void; respostas: Respostas; linhas: number; visitas: readonly VisitaNegocio[];
  /** Os ids das secções com respostas erradas: levam o aviso, em ícone e em texto. */
  comErros: ReadonlySet<string>;
}) {
  const { t } = useTranslation();
  const contador = useContador();
  return (
    <nav aria-label={t(`${N}visit.sections.label`)} className="lg:w-60 lg:shrink-0">
      <ul className="flex flex-wrap gap-2 lg:flex-col lg:flex-nowrap">
        {seccoes.map((s) => {
          const atual = s.id === ativa;
          const feito = feita(s, respostas, linhas, visitas);
          const chaveFeito = s.especial === "visitas" ? "visits.section" : "visit.section";
          return (
            <li key={s.id}>
              <button
                type="button" onClick={() => aoMudar(s.id)} aria-current={atual ? "step" : undefined}
                className={cn(
                  "flex min-h-11 w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors motion-reduce:transition-none",
                  FOCO, atual ? "border-primary bg-primary/10 font-medium text-primary dark:text-violet-300" : "border-border bg-card text-foreground hover:border-foreground/40",
                )}
              >
                {feito ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : <Circle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                <span className="min-w-0 flex-1">
                  <span className="block">{tituloDaSeccao(s, (c) => t(`${N}${c}`))}</span>
                  <span className="block text-xs font-normal tabular-nums text-muted-foreground">{contador(s, respostas, linhas, visitas)}</span>
                </span>
                {comErros.has(s.id) && <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />}
                <span className="sr-only">{t(`${N}${chaveFeito}.${feito ? "done" : "todo"}`)}{comErros.has(s.id) ? t(`${N}tab.errors`) : ""}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** A frase do topo: "Passo x de y · faltam N respostas". */
function PassoDaVisita({ seccoes, indice, respostas }: { seccoes: readonly SeccaoDef[]; indice: number; respostas: Respostas }) {
  const { t } = useTranslation();
  const { respondidas, total } = contarTotal(seccoes, respostas);
  const faltam = total - respondidas;
  const sufixo = faltam === 0 ? ".done" : faltam === 1 ? ".one" : "";
  return (
    <p aria-live="polite" className="text-sm font-medium tabular-nums text-foreground">
      {t(`${N}visit.step${sufixo}`, { x: indice + 1, y: seccoes.length, n: faltam })}
    </p>
  );
}

/**
 * A aba Visita: o passo, a lista de secções e a secção aberta, com as perguntas e, onde cabem, o levantamento. As secções são as do questionário
 * (a base, ou o catálogo do código no protótipo sem base). Enquanto as perguntas não carregam, ou se a leitura falhou, diz-se no lugar delas.
 */
export function AbaVisita({
  id, seccaoAtiva, aoMudarSeccao, respostas, aoEscolher, aoEscrever, errosRespostas, levantamento, erros, acoesLevantamento, visitas, visitaAberta,
  acoesVisitas, visitasGravadas, visitasComCodigoPostalInvalido, semVisitas = false,
}: Props) {
  const { t } = useTranslation();
  const contador = useContador();
  const { questionario, estado, repetir } = useQuestionario();
  const seccoes = seccoesDaVisita(questionario).filter((s) => !semVisitas || s.especial !== "visitas");
  const indice = Math.max(0, seccoes.findIndex((s) => s.id === seccaoAtiva));
  const seccao = seccoes[indice];
  const linhas = levantamento.linhas.length;
  if (estado !== "pronto" || !seccao) {
    return (
      <div className="space-y-4">
        <EstadoQuestionarioVivo estado={estado} aoRepetir={repetir} />
        {estado === "pronto" && <p role="note" className="text-sm text-muted-foreground">{t(`${N}qform.visitEmpty`)}</p>}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <EstadoQuestionarioVivo estado={estado} aoRepetir={repetir} />
      <PassoDaVisita seccoes={seccoes} indice={indice} respostas={respostas} />
      <p className="text-sm text-muted-foreground">{t(`${N}visit.help`)}</p>
      <div className="flex flex-col gap-6 lg:flex-row">
        <ListaSeccoes
          seccoes={seccoes} ativa={seccao.id} aoMudar={aoMudarSeccao} respostas={respostas} linhas={linhas} visitas={visitas}
          comErros={localizarErrosRespostas(questionario, errosRespostas ?? {}).seccoes}
        />
        <section aria-labelledby={`${id}-seccao`} className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id={`${id}-seccao`} tabIndex={-1} data-foco-seccao className="text-base font-semibold text-foreground outline-none">
              {tituloDaSeccao(seccao, (c) => t(`${N}${c}`))}
            </h3>
            <p className="text-sm tabular-nums text-muted-foreground">{contador(seccao, respostas, linhas, visitas)}</p>
          </div>
          {seccao.especial === "visitas" && (
            <ListaVisitas
              id={id} visitas={visitas} aberta={visitaAberta} acoes={acoesVisitas} gravadas={visitasGravadas} comCodigoPostalInvalido={visitasComCodigoPostalInvalido}
            />
          )}
          <BlocosPerguntas blocos={seccao.blocos} respostas={respostas} aoEscolher={aoEscolher} aoEscrever={aoEscrever} erros={errosRespostas} />
          {seccao.especial === "medidas" && (
            <MedidasDaArea id={id} levantamento={levantamento} erros={erros} acoes={acoesLevantamento} deVisita={visitaRepresentaLevantamento(visitas)} />
          )}
        </section>
      </div>
    </div>
  );
}
