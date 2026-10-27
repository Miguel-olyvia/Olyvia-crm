// O assistente de passos do guia do Pipeline, como no protótipo: à esquerda a lista dos passos da fase (visto nos feitos, «!» nos que ficaram com falta,
// o atual realçado e com aria-current) e «Fases feitas»; ao centro o cabeçalho «Passo N de M · faltam X respostas · tempo», o título com ícone, o corpo
// do passo e o rodapé «Anterior», «Ir para "..."» e «Continuar». Só apresentação: o estado vem de `useAssistente`, o corpo de cada passo de `renderCorpo` e
// gravar ao continuar é do chamador (`aoContinuar`). Devolve os dois blocos da grelha do guia (a coluna e o centro). No telemóvel a lista passa a bolinhas.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft, ArrowRight, CalendarDays, CalendarPlus, Check, ClipboardList, ListChecks, Loader2, MapPin, Phone, Save, type LucideIcon,
} from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";
import { FasesFeitasNav } from "../GuiaColuna";
import { CENTRO_QUE_ROLA, LATERAL_FIXA } from "../layoutGuia";
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
      {estado === "feito" ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : estado === "comFalta" ? "!" : <span className="md:hidden">{numero}</span>}
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
  const idBase = useId();
  const idCabecalho = `${idBase}-cabecalho`;
  const idErro = `${idBase}-erro`;
  const titulo = useRef<HTMLHeadingElement>(null);
  const corpo = useRef<HTMLDivElement>(null);
  const [ocupado, setOcupado] = useState(false);
  const aGravar = useRef(false);
  // O erro é do passo em que aconteceu: deriva-se na leitura, sem efeito que o limpe ao mudar de passo.
  // `pedido` é o pedido de foco de quando se carregou em Continuar: se o passo mudou desde então, o erro já não se mostra (nem ao voltar a este passo).
  const [falha, setFalha] = useState<{ passoId: string; texto: string; pedido: number } | null>(null);
  const erro = falha !== null && falha.passoId === passo?.id && falha.pedido === assistente.pedidoFoco ? falha.texto : null;
  // O passo de agora, para depois de gravar só se avançar se a pessoa ainda estiver nele.
  const passoAgora = useRef<string | null>(passo?.id ?? null);
  passoAgora.current = passo?.id ?? null;
  // O foco vai para o título quando o passo muda, e nunca à entrada: o pedido só cresce quando se muda de passo (sem flag que o StrictMode estrague).
  // Em ecrã largo o centro é quem rola: ao mudar de passo volta ao topo (o elemento é o mesmo e o scroll ficaria a meio).
  const centro = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (assistente.pedidoFoco === 0) return;
    if (centro.current) centro.current.scrollTop = 0;
    titulo.current?.focus();
  }, [assistente.pedidoFoco]);
  // O erro liga-se ao campo em falta e o foco vai para o primeiro campo inválido do passo.
  useEffect(() => {
    if (!erro) return;
    const campo = corpo.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (!campo) return;
    const antes = campo.getAttribute("aria-describedby");
    const antesErro = campo.getAttribute("aria-errormessage");
    campo.setAttribute("aria-describedby", [antes, idErro].filter(Boolean).join(" "));
    campo.setAttribute("aria-errormessage", idErro);
    campo.focus();
    return () => {
      if (antes === null) campo.removeAttribute("aria-describedby"); else campo.setAttribute("aria-describedby", antes);
      if (antesErro === null) campo.removeAttribute("aria-errormessage"); else campo.setAttribute("aria-errormessage", antesErro);
    };
  }, [erro, idErro]);
  if (!passo) return null;
  const Icone = ICONES[passo.icone];
  const salto = proximoRelevante(passos, indice);
  const ultimo = indice === passos.length - 1;
  const continuar = async (): Promise<void> => {
    if (aGravar.current) return;
    aGravar.current = true;
    setOcupado(true);
    setFalha(null);
    // O id do passo guarda-se antes do await: depois dele o índice do render do clique pode estar velho (a lista muda com as respostas).
    const idDoPasso = passo.id;
    const pedido = assistente.pedidoFoco;
    try {
      const texto = aoContinuar ? await aoContinuar(passo) : null;
      if (texto === null) {
        if (passoAgora.current === idDoPasso) assistente.avancarDe(idDoPasso);
      } else setFalha({ passoId: idDoPasso, texto, pedido });
    } catch {
      // Quem grava devolve o erro em texto; se rebentar em vez disso, diz-se em geral e o passo não avança.
      setFalha({ passoId: idDoPasso, texto: t(`${A}erroGenerico`), pedido });
    } finally {
      aGravar.current = false;
      setOcupado(false);
    }
  };
  return (
    <>
      <div className={cn("md:self-start", LATERAL_FIXA)}>
        <ColunaDosPassos faseRotuloChave={faseRotuloChave} passos={passos} assistente={assistente} feitas={feitas} aoVerFase={aoVerFase} />
      </div>
      {/* A única coluna que rola em ecrã largo: região com nome e foco, para o teclado a poder rolar. */}
      <div ref={centro} role="region" aria-label={t(`${P}guia.centro`)} tabIndex={0} data-guia-centro="" className={cn(CENTRO_QUE_ROLA, FOCO)}>
        <div className="space-y-4 py-1 md:px-2">
          <p id={idCabecalho} className={cn("text-sm", completo(passo) ? "text-primary" : "text-muted-foreground")}>{textoDoCabecalho(passo, indice + 1, passos.length, t)}</p>
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icone className="h-5 w-5" />
            </span>
            <Titulo ref={titulo} tabIndex={-1} aria-describedby={idCabecalho} className="text-2xl font-bold leading-tight tracking-tight text-foreground outline-none md:text-[28px]">
              {nomeDoPasso(passo, t)}
            </Titulo>
          </div>
          <div ref={corpo} className="space-y-4">{renderCorpo(passo)}</div>
          {erro && <p id={idErro} role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-foreground">{erro}</p>}
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
            {/* O estado existe sempre (vazio) para o leitor de ecrã anunciar quando passa a «A guardar...». */}
            <span role="status" className="sr-only">{ocupado ? t(`${A}aGuardar`) : ""}</span>
          </div>
          {extra}
        </div>
      </div>
    </>
  );
}
