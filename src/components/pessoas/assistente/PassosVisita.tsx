// O conteúdo de cada passo da fase Visita do assistente (só apresentação, tudo chega por props): a lista de TODAS as visitas do negócio em cartões
// expansíveis («Visita N · tipo»), uma secção do levantamento por passo (as perguntas vêm do questionário da base, no próprio ecrã) e «Fechar
// levantamento», que só guarda. Marcar a visita como feita continua manual. Aproveitam-se os campos que já existem, nunca o aspeto do painel antigo.
import { useId, useState, type ReactNode } from "react";
import { ChevronDown, Loader2, Plus } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FOCO } from "@/components/negocio-metas/estilos";
import { EstadoQuestionarioVivo } from "@/components/negocio-metas/EstadoQuestionario";
import { ListaLinhas } from "@/components/negocio-metas/LevantamentoCampos";
import { MAX_OBSERVACOES } from "@/components/negocio-metas/LinhaLevantamentoForm";
import { BlocosPerguntas } from "@/components/negocio-metas/PerguntaEscolha";
import type { EstadoDoQuestionario } from "@/components/negocio-metas/QuestionarioContexto";
import { levantamentoVazio, type LinhaForm } from "@/components/negocio-metas/levantamento";
import type { ErrosNovoNegocio } from "@/components/negocio-metas/novoNegocio";
import type { Respostas, SeccaoDef } from "@/components/negocio-metas/perguntasTipos";
import type { VisitaPessoa } from "@/components/negocio-metas/registosTipos";
import type { ErroResposta } from "@/components/negocio-metas/respostasQuestionario";
import { contarSeccao } from "@/components/negocio-metas/respostasVisita";
import { textoDiaCompleto } from "../formatoPessoas";

const A = "pessoasPagina.assistente.";
const V = "pessoasPagina.real.visit.agenda.";
const N = "businessGoals.new.";

const ETIQUETA: Record<VisitaPessoa["estado"], string> = {
  porFazer: "bg-primary/10 text-foreground border-primary/40",
  feita: "bg-muted text-foreground border-border",
  cancelada: "bg-muted text-muted-foreground border-border line-through",
};

function Nota({ children }: { children: ReactNode }) {
  return <p className="text-base text-muted-foreground">{children}</p>;
}

// ---------------------------------------------------------------- Visitas

/** Dar a visita como feita é manual: grava a visita e devolve `null`, ou o erro já em texto. */
type MarcarFeita = (visita: VisitaPessoa) => Promise<string | null>;

function CartaoDeVisita({ visita, numero, aberta, aoAlternar, aoMarcarFeita }: {
  visita: VisitaPessoa; numero: number; aberta: boolean; aoAlternar: () => void; aoMarcarFeita?: MarcarFeita;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [aMarcar, setAMarcar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const marcarFeita = async (): Promise<void> => {
    if (aMarcar || !aoMarcarFeita) return;
    setAMarcar(true);
    setErro(null);
    try {
      setErro(await aoMarcarFeita(visita));
    } finally {
      setAMarcar(false);
    }
  };
  const tipo = visita.tipo ? t(`pessoasPagina.real.visit.kind.${visita.tipo}`) : t(`${A}visitas.semTipo`);
  const titulo = t(`${A}visitas.titulo`, { n: numero, tipo });
  const resumo = [textoDiaCompleto(visita.data), visita.hora, visita.feitoPor].filter(Boolean).join(" · ");
  const linhas: [string, string][] = [
    ...(visita.duracao ? [[t(`${V}duration`), t(`${V}duration.${visita.duracao}`)] as [string, string]] : []),
    ...(visita.quemVaiEstar ? [[t(`${V}present`), t(`${V}present.${visita.quemVaiEstar}`)] as [string, string]] : []),
    ...(visita.nota ? [[t(`${A}visitas.nota`), visita.nota] as [string, string]] : []),
  ];
  return (
    <li className="rounded-lg border border-border bg-card">
      <button
        type="button" aria-expanded={aberta} aria-controls={`${id}-detalhe`} onClick={aoAlternar}
        className={cn("flex min-h-14 w-full items-center gap-3 rounded-lg px-4 py-2 text-left", FOCO)}
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-foreground">{titulo}</span>
          <span className="block text-sm text-muted-foreground">{resumo}</span>
        </span>
        <span className={cn("shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium", ETIQUETA[visita.estado])}>{t(`${A}visitas.estado.${visita.estado}`)}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", aberta && "rotate-180")} aria-hidden="true" />
      </button>
      {aberta && (
        <div id={`${id}-detalhe`} role="region" aria-label={titulo} className="border-t border-border/60 px-4 py-3">
          {linhas.length === 0 ? <p className="text-sm text-muted-foreground">{t(`${A}visitas.semDetalhe`)}</p> : (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[15px]">
              {linhas.map(([rotulo, valor]) => (
                <div key={rotulo} className="contents">
                  <dt className="text-muted-foreground">{rotulo}</dt>
                  <dd className="break-words text-foreground">{valor}</dd>
                </div>
              ))}
            </dl>
          )}
          {aoMarcarFeita && visita.estado === "porFazer" && (
            <Button
              type="button" variant="outline" className={cn("mt-3 min-h-11", FOCO)} aria-busy={aMarcar || undefined} aria-disabled={aMarcar || undefined}
              onClick={() => { void marcarFeita(); }}
            >
              {aMarcar && <Loader2 className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {t(`${A}visitas.marcarFeita`)}
            </Button>
          )}
          {erro && <p role="alert" className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-foreground">{erro}</p>}
        </div>
      )}
    </li>
  );
}

interface CorpoVisitasProps {
  visitas: readonly VisitaPessoa[];
  aoMarcarOutra: (origem: HTMLElement) => void;
  podeMarcar: boolean;
  /** «Marcar como feita» nas visitas marcadas; sem isto (sem permissão) o botão não existe. */
  aoMarcarFeita?: MarcarFeita;
}

export function CorpoVisitas({ visitas, aoMarcarOutra, podeMarcar, aoMarcarFeita }: CorpoVisitasProps) {
  const { t } = useTranslation();
  // Abre por omissão a última visita que ainda está marcada (por fazer); as outras ficam fechadas.
  const [abertas, setAbertas] = useState<ReadonlySet<string>>(() => {
    const ultima = [...visitas].reverse().find((v) => v.estado === "porFazer");
    return new Set(ultima ? [ultima.id] : []);
  });
  const alternar = (id: string): void => setAbertas((antes) => {
    const depois = new Set(antes);
    if (!depois.delete(id)) depois.add(id);
    return depois;
  });
  return (
    <div className="space-y-4">
      <Nota>{t(`${A}visitas.ajuda`)}</Nota>
      <Nota>{t(`${A}visitas.manual`)}</Nota>
      {visitas.length === 0 ? <p className="text-base text-foreground">{t(`${A}visitas.vazio`)}</p> : (
        <ul className="list-none space-y-2 p-0">
          {visitas.map((v, i) => (
            <CartaoDeVisita key={v.id} visita={v} numero={i + 1} aberta={abertas.has(v.id)} aoAlternar={() => alternar(v.id)} aoMarcarFeita={aoMarcarFeita} />
          ))}
        </ul>
      )}
      {podeMarcar && (
        <Button
          type="button" variant="outline" className={cn("min-h-11 w-full gap-2 border-dashed", FOCO)}
          onClick={(e) => aoMarcarOutra(e.currentTarget)}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t(`${A}visitas.outra`)}
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- uma secção do levantamento

/** As linhas de medidas (a secção «Medidas da área»): o que se escreveu e como mudar. */
export interface MedidasDoPasso {
  linhas: LinhaForm[];
  observacoes: string;
  erros: ErrosNovoNegocio;
  acoes: {
    adicionarLinha: () => void;
    mudarLinha: (id: string, parcial: Partial<LinhaForm>) => void;
    removerLinha: (id: string) => void;
    mudarObservacoes: (valor: string) => void;
  };
}

interface CorpoSeccaoProps {
  seccao: SeccaoDef;
  respostas: Respostas;
  erros: Readonly<Record<string, ErroResposta>>;
  aoEscolher: (pergunta: string, opcao: string) => void;
  aoEscrever: (pergunta: string, valor: string) => void;
  estado: EstadoDoQuestionario;
  aoRepetir: () => void;
  /** Só na secção de medidas. */
  medidas?: MedidasDoPasso;
}

function Medidas({ medidas }: { medidas: MedidasDoPasso }) {
  const { t } = useTranslation();
  const id = useId();
  const levantamento = { ...levantamentoVazio("", ""), linhas: medidas.linhas, observacoes: medidas.observacoes };
  return (
    <div className="space-y-4">
      <ListaLinhas
        id={id} levantamento={levantamento} erros={medidas.erros}
        acoes={{ mudar: () => undefined, adicionarLinha: medidas.acoes.adicionarLinha, mudarLinha: medidas.acoes.mudarLinha, removerLinha: medidas.acoes.removerLinha }}
      />
      <div className="space-y-1.5">
        <label htmlFor={`${id}-obs`} className="text-sm font-semibold text-foreground">{t(`${N}survey.generalNotes`)}</label>
        <Input
          id={`${id}-obs`} value={medidas.observacoes} maxLength={MAX_OBSERVACOES} autoComplete="off" className={cn("min-h-11", FOCO)}
          onChange={(e) => medidas.acoes.mudarObservacoes(e.target.value)}
        />
      </div>
    </div>
  );
}

export function CorpoSeccao({ seccao, respostas, erros, aoEscolher, aoEscrever, estado, aoRepetir, medidas }: CorpoSeccaoProps) {
  const { t } = useTranslation();
  const { respondidas, total } = contarSeccao(seccao, respostas);
  return (
    <div className="space-y-5">
      <EstadoQuestionarioVivo estado={estado} aoRepetir={aoRepetir} />
      {estado === "pronto" && seccao.especial === "medidas" && medidas && <Medidas medidas={medidas} />}
      {estado === "pronto" && seccao.especial !== "medidas" && (
        seccao.blocos.length === 0 ? <p role="note" className="text-sm text-muted-foreground">{t(`${A}seccao.semPerguntas`)}</p> : (
          <section className="space-y-4">
            <p className="text-sm tabular-nums text-muted-foreground">{t(`${N}answered`, { n: respondidas, m: total })}</p>
            <BlocosPerguntas blocos={seccao.blocos} respostas={respostas} aoEscolher={aoEscolher} aoEscrever={aoEscrever} erros={erros} />
          </section>
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Fechar levantamento

interface CorpoFecharProps {
  guardado: boolean;
  aGuardar: boolean;
  podeGuardar: boolean;
  aoGuardar: () => void;
  /** Porque não se pode guardar (dito em texto, ligado ao botão). */
  razao?: string;
  /** O erro da última tentativa de guardar, já em texto. */
  erro?: string | null;
}

export function CorpoFechar({ guardado, aGuardar, podeGuardar, aoGuardar, razao, erro }: CorpoFecharProps) {
  const { t } = useTranslation();
  const idRazao = useId();
  const desativado = !podeGuardar || aGuardar;
  return (
    <div className="space-y-4">
      <Nota>{t(`${A}fechar.ajuda`)}</Nota>
      {guardado ? <p className="text-base font-medium text-foreground">{t(`${A}fechar.guardado`)}</p> : (
        <>
          <Button
            type="button" className={cn("min-h-11 gap-2", FOCO, desativado && "opacity-60")} aria-disabled={desativado || undefined}
            aria-busy={aGuardar || undefined} aria-describedby={razao ? idRazao : undefined}
            onClick={() => { if (!desativado) aoGuardar(); }}
          >
            {aGuardar && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />}
            {t(`${A}fechar.guardar`)}
          </Button>
          {razao && <p id={idRazao} className="text-sm text-muted-foreground">{razao}</p>}
          {erro && <p role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-foreground">{erro}</p>}
        </>
      )}
    </div>
  );
}
