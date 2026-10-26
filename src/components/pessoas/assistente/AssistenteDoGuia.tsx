// O assistente de passos do guia do Pipeline, como no protótipo: à esquerda a lista dos passos da fase (visto nos feitos, «!» nos que ficaram com falta,
// o atual realçado e com aria-current) e «Fases feitas»; ao centro o cabeçalho «Passo N de M · faltam X respostas · tempo», o título com ícone, o corpo
// do passo e o rodapé «Anterior», «Ir para "..."» e «Continuar». Só apresentação: o estado vem de `useAssistente`, o corpo de cada passo de `renderCorpo` e
// gravar ao continuar é do chamador (`aoContinuar`). Devolve os dois blocos da grelha do guia (a coluna e o centro). No telemóvel a lista passa a bolinhas.
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft, ArrowRight, CalendarDays, CalendarPlus, Check, ClipboardList, ListChecks, Loader2, MapPin, Phone, Save, type LucideIcon,
} from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";
import { FasesFeitasNav } from "../GuiaColuna";
import type { FaseFeita } from "../processo/passoGuiado";
import { completo, estadoDoPasso, faltam, proximoRelevante, tempoDoPasso } from "./modeloAssistente";
import type { EstadoDoPasso, IconeDoPasso, PassoAssistente } from "./tiposAssistente";
import type { Assistente } from "./useAssistente";

const A = "pessoasPagina.assistente.";
const P = "pessoasPagina.";

const ICONES: Record<IconeDoPasso, LucideIcon> = {
  telefone: Phone, qualificacao: ClipboardList, morada: MapPin, preparar: ListChecks, agenda: CalendarPlus, visitas: CalendarDays, seccao: ListChecks, fechar: Save,
};

export interface AssistenteDoGuiaProps {
  /** O nome da fase (a chave de tradução), título da coluna. */
  faseRotuloChave: string;
  passos: readonly PassoAssistente[];
  assistente: Assistente;
  /** O conteúdo do passo atual. */
  renderCorpo: (passo: PassoAssistente) => ReactNode;
  /** Grava ao «Continuar»: `null` correu bem (avança); um texto é o erro, que se diz num alerta e deixa ficar no passo. */
  aoContinuar?: (passo: PassoAssistente) => Promise<string | null> | string | null;
  feitas: readonly FaseFeita[];
  aoVerFase: (id: string) => void;
  /** O nível do título do passo: h3 na ficha (o nome da pessoa é o h2), h2 fora dela. */
  nivel: "h2" | "h3";
  /** O que o guia mostra por baixo do passo (o prazo, «Alterar prazo»...): continua à mão com o assistente. */
  extra?: ReactNode;
}

const nomeDoPasso = (p: PassoAssistente, t: (c: string) => string): string => p.rotulo ?? t(p.rotuloChave ?? "");

function Circulo({ estado, numero }: { estado: EstadoDoPasso; numero: number }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
        estado === "feito" && "bg-primary text-primary-foreground",
        estado === "comFalta" && "border-2 border-destructive text-destructive",
        estado !== "feito" && estado !== "comFalta" && "border-2 border-muted-foreground text-muted-foreground",
      )}
    >
      {estado === "feito" ? <Check className="h-3.5 w-3.5" /> : estado === "comFalta" ? "!" : <span className="md:hidden">{numero}</span>}
    </span>
  );
}

function ColunaDosPassos({ faseRotuloChave, passos, assistente, feitas, aoVerFase }: Pick<AssistenteDoGuiaProps, "faseRotuloChave" | "passos" | "assistente" | "feitas" | "aoVerFase">) {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <nav aria-label={t(`${P}guia.passos`)}>
        <p className="mb-2 text-sm text-muted-foreground">{t(faseRotuloChave)}</p>
        <ol className="flex list-none flex-wrap gap-2 p-0 md:block md:space-y-1">
          {passos.map((p, i) => {
            const atual = i === assistente.indice;
            const estado = estadoDoPasso(p, { ativo: atual, visitado: assistente.visitados.has(p.id) });
            return (
              <li key={p.id}>
                <button
                  type="button" aria-current={atual ? "step" : undefined} onClick={() => assistente.irPara(i)}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left text-[15px] text-foreground hover:bg-muted motion-reduce:transition-none", FOCO,
                    atual && "bg-primary/10 font-semibold",
                  )}
                >
                  <Circulo estado={estado} numero={i + 1} />
                  <span className="max-md:sr-only">{nomeDoPasso(p, t)}</span>
                  <span className="sr-only">, {t(`${A}estado.${estado}`)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      <FasesFeitasNav feitas={feitas} faseVista={null} aoVerFase={aoVerFase} />
    </div>
  );
}

function textoDoCabecalho(passo: PassoAssistente, n: number, m: number, t: (c: string, p?: Record<string, string | number>) => string): string {
  const emFalta = faltam(passo);
  const tempo = tempoDoPasso(emFalta);
  const partes = [t(`${A}cabecalho.passo`, { n, m })];
  if (tempo.tipo === "completo") return [...partes, t(`${A}tempo.completo`)].join(" · ");
  partes.push(t(`${A}cabecalho.falta.${emFalta === 1 ? "uma" : "varias"}`, { n: emFalta }));
  partes.push(tempo.tipo === "menosDeUmMinuto" ? t(`${A}tempo.menos`) : t(`${A}tempo.minutos`, { n: tempo.minutos }));
  return partes.join(" · ");
}

export function AssistenteDoGuia({ faseRotuloChave, passos, assistente, renderCorpo, aoContinuar, feitas, aoVerFase, nivel, extra }: AssistenteDoGuiaProps) {
  const { t } = useTranslation();
  const Titulo = nivel;
  const { indice, passo } = assistente;
  const titulo = useRef<HTMLHeadingElement>(null);
  const primeira = useRef(true);
  const [ocupado, setOcupado] = useState(false);
  const aGravar = useRef(false);
  const [erro, setErro] = useState<string | null>(null);
  // O foco vai para o título quando o passo muda, e nunca à entrada: quem abre a ficha tem o foco no seu sítio.
  useEffect(() => {
    if (primeira.current) { primeira.current = false; return; }
    titulo.current?.focus();
  }, [assistente.pedidoFoco]);
  useEffect(() => { setErro(null); }, [passo?.id]);
  if (!passo) return null;
  const Icone = ICONES[passo.icone];
  const salto = proximoRelevante(passos, indice);
  const ultimo = indice === passos.length - 1;
  const continuar = async (): Promise<void> => {
    if (aGravar.current) return;
    aGravar.current = true;
    setOcupado(true);
    setErro(null);
    try {
      const falha = aoContinuar ? await aoContinuar(passo) : null;
      if (falha === null) assistente.avancar();
      else setErro(falha);
    } catch {
      // Quem grava devolve o erro em texto; se rebentar em vez disso, diz-se em geral e o passo não avança.
      setErro(t(`${A}erroGenerico`));
    } finally {
      aGravar.current = false;
      setOcupado(false);
    }
  };
  return (
    <>
      <div className="md:self-start">
        <ColunaDosPassos faseRotuloChave={faseRotuloChave} passos={passos} assistente={assistente} feitas={feitas} aoVerFase={aoVerFase} />
      </div>
      <div>
        <div className="space-y-4 py-1 md:px-2">
          <p className={cn("text-sm", completo(passo) ? "text-primary" : "text-muted-foreground")}>{textoDoCabecalho(passo, indice + 1, passos.length, t)}</p>
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icone className="h-5 w-5" />
            </span>
            <Titulo ref={titulo} tabIndex={-1} className="text-2xl font-bold leading-tight tracking-tight text-foreground outline-none md:text-[28px]">
              {nomeDoPasso(passo, t)}
            </Titulo>
          </div>
          <div className="space-y-4">{renderCorpo(passo)}</div>
          {erro && <p role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-foreground">{erro}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
            <Button type="button" variant="ghost" className={cn("min-h-11 gap-2 px-3 text-muted-foreground hover:text-foreground", FOCO)} disabled={indice === 0} onClick={assistente.recuar}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {t(`${P}guia.anterior`)}
            </Button>
            {!ultimo && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                {salto !== null && (
                  <Button type="button" variant="outline" className={cn("min-h-11 gap-2", FOCO)} onClick={() => assistente.irPara(salto)}>
                    {t(`${A}irPara`, { passo: nomeDoPasso(passos[salto], t) })}
                  </Button>
                )}
                <Button
                  type="button" className={cn("min-h-11 gap-2 rounded-lg px-6 font-semibold motion-reduce:transition-none", FOCO)}
                  aria-busy={ocupado || undefined} aria-disabled={ocupado || undefined} onClick={() => { void continuar(); }}
                >
                  {t(`${A}continuar`)}
                  {ocupado ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                </Button>
              </div>
            )}
          </div>
          {extra}
        </div>
      </div>
    </>
  );
}
