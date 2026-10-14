import { Check, Circle } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { DadosDaVisita, MedidasDaArea, type AcoesLevantamento } from "./LevantamentoCampos";
import { BlocosPerguntas } from "./PerguntaEscolha";
import { N } from "./PecasNovoNegocio";
import { FOCO } from "./estilos";
import type { LevantamentoForm } from "./levantamento";
import type { ErrosNovoNegocio } from "./novoNegocio";
import type { Respostas, SeccaoDef } from "./perguntasTipos";
import { chaveSeccao, contarSeccao, contarTotal, seccaoCompleta } from "./respostasVisita";
import { SECCOES_VISITA } from "./visitaExemplo";

interface Props {
  id: string;
  /** O id da secção aberta (`SECCOES_VISITA`). */
  seccaoAtiva: string;
  aoMudarSeccao: (id: string) => void;
  respostas: Respostas;
  aoEscolher: (pergunta: string, opcao: string) => void;
  levantamento: LevantamentoForm;
  erros: ErrosNovoNegocio;
  acoesLevantamento: AcoesLevantamento;
}

/** O texto curto de uma secção: "n de m respondidas", ou o número de linhas nas Medidas da área. */
function useContador(): (s: SeccaoDef, respostas: Respostas, linhas: number) => string {
  const { t } = useTranslation();
  return (s, respostas, linhas) => {
    if (s.especial === "medidas") return t(`${N}answered.lines${linhas === 1 ? ".one" : ""}`, { n: linhas });
    const { respondidas, total } = contarSeccao(s, respostas);
    return t(`${N}answered`, { n: respondidas, m: total });
  };
}

const feita = (s: SeccaoDef, respostas: Respostas, linhas: number): boolean =>
  s.especial === "medidas" ? linhas > 0 : seccaoCompleta(s, respostas);

/**
 * A lista das secções da visita: à esquerda em ecrã largo, em pílulas em linha no estreito. Cada uma mostra o círculo
 * vazio ou o visto (e diz-se em texto), a atual está destacada e leva `aria-current`.
 */
function ListaSeccoes({ ativa, aoMudar, respostas, linhas }: { ativa: string; aoMudar: (id: string) => void; respostas: Respostas; linhas: number }) {
  const { t } = useTranslation();
  const contador = useContador();
  return (
    <nav aria-label={t(`${N}visit.sections.label`)} className="lg:w-60 lg:shrink-0">
      <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {SECCOES_VISITA.map((s) => {
          const atual = s.id === ativa;
          const feito = feita(s, respostas, linhas);
          return (
            <li key={s.id} className="shrink-0 lg:shrink">
              <button
                type="button" onClick={() => aoMudar(s.id)} aria-current={atual ? "step" : undefined}
                className={cn(
                  "flex min-h-11 w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors motion-reduce:transition-none",
                  FOCO, atual ? "border-primary bg-primary/10 font-medium text-primary dark:text-violet-300" : "border-border bg-card text-foreground hover:border-foreground/40",
                )}
              >
                {feito ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : <Circle className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
                <span className="min-w-0 flex-1">
                  <span className="block">{t(`${N}${chaveSeccao(s.id)}`)}</span>
                  <span className="block text-xs font-normal tabular-nums text-muted-foreground">{contador(s, respostas, linhas)}</span>
                </span>
                <span className="sr-only">{t(`${N}visit.section.${feito ? "done" : "todo"}`)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** A frase do topo: "Passo x de y · faltam N respostas". */
function PassoDaVisita({ indice, respostas }: { indice: number; respostas: Respostas }) {
  const { t } = useTranslation();
  const { respondidas, total } = contarTotal(SECCOES_VISITA, respostas);
  const faltam = total - respondidas;
  const sufixo = faltam === 0 ? ".done" : faltam === 1 ? ".one" : "";
  return (
    <p aria-live="polite" className="text-sm font-medium tabular-nums text-foreground">
      {t(`${N}visit.step${sufixo}`, { x: indice + 1, y: SECCOES_VISITA.length, n: faltam })}
    </p>
  );
}

/** A aba Visita (só exemplo): o passo, a lista de secções e a secção aberta, com as perguntas e, onde cabem, o levantamento. */
export function AbaVisita({ id, seccaoAtiva, aoMudarSeccao, respostas, aoEscolher, levantamento, erros, acoesLevantamento }: Props) {
  const { t } = useTranslation();
  const contador = useContador();
  const indice = Math.max(0, SECCOES_VISITA.findIndex((s) => s.id === seccaoAtiva));
  const seccao = SECCOES_VISITA[indice];
  const linhas = levantamento.linhas.length;
  return (
    <div className="space-y-4">
      <PassoDaVisita indice={indice} respostas={respostas} />
      <p className="text-sm text-muted-foreground">{t(`${N}visit.help`)}</p>
      <div className="flex flex-col gap-6 lg:flex-row">
        <ListaSeccoes ativa={seccao.id} aoMudar={aoMudarSeccao} respostas={respostas} linhas={linhas} />
        <section aria-labelledby={`${id}-seccao`} className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id={`${id}-seccao`} className="text-base font-semibold text-foreground">{t(`${N}${chaveSeccao(seccao.id)}`)}</h3>
            <p className="text-sm tabular-nums text-muted-foreground">{contador(seccao, respostas, linhas)}</p>
          </div>
          {seccao.especial === "visitas" && <DadosDaVisita id={id} levantamento={levantamento} acoes={acoesLevantamento} />}
          <BlocosPerguntas blocos={seccao.blocos} respostas={respostas} aoEscolher={aoEscolher} />
          {seccao.especial === "medidas" && <MedidasDaArea id={id} levantamento={levantamento} erros={erros} acoes={acoesLevantamento} />}
        </section>
      </div>
    </div>
  );
}
