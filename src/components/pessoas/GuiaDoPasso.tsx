// O guia do passo seguinte: o cabeçalho (nome, linha, telefone, morada e «Marcar como perdido»), a barra de fases, a lista da fase à esquerda, no
// centro o título grande, o subtítulo, «Anterior» e UM botão primário, e em baixo o cartão do cliente com os últimos acontecimentos.
// Só apresentação: recebe o passo já calculado (`calcularPassoGuiado`) e os callbacks por props; não fala com a base. «Anterior» só lê a fase que
// já passou (não existe forma de recuar uma fase) e o botão primário passa a ser «Voltar ao passo atual». No telemóvel o passo vem primeiro e a
// lista da fase fica recolhida.
import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Loader2, MapPin, Phone, Target } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";
import { BarraFasesGuia, CartaoClienteGuia, ChecklistDoPasso, type AcontecimentoGuia, type DadosClienteGuia } from "./GuiaPecas";
import type { FaseGuia, PassoGuiado } from "./processo/passoGuiado";
import { ExplicacaoDoPasso } from "./processo/ExplicacaoDoPasso";

const P = "pessoasPagina.";

export interface CabecalhoGuia {
  nome: string;
  /** O serviço (a linha); sem ele não se mostra. */
  linha?: string | null;
  telefone?: string | null;
  local?: string | null;
}

export interface GuiaDoPassoProps {
  /** O passo calculado; `null` (um negócio ganho ou perdido): fica o cabeçalho e a barra, sem passo a fazer. */
  passo: PassoGuiado | null;
  fases: readonly FaseGuia[];
  cabecalho: CabecalhoGuia;
  cliente: DadosClienteGuia;
  acontecimentos: readonly AcontecimentoGuia[];
  /** O clique do botão primário (só se a ação está pronta). Recebe o evento: o foco volta ao botão que abriu o painel. */
  aoAcao?: (e: MouseEvent<HTMLElement>) => void;
  /** Atributos que marcam o botão (o foco encontra-o depois de o painel fechar). */
  atributosAcao?: Record<string, string>;
  /** O que o passo pede e falta (um portão que travou o botão), junto ao botão e ligado a ele por `aria-describedby`. */
  explicacao?: { id: string; texto: string } | null;
  /** A ação está a gravar: o botão fica ocupado. */
  ocupado?: boolean;
  /** «Marcar como perdido» (ou o botão que o faz); sem ele não aparece. */
  acaoPerder?: ReactNode;
  /** Abaixo do subtítulo: o prazo e a saúde do negócio. */
  extra?: ReactNode;
  /** O título (só para o leitor de ecrã) da secção do passo seguinte. */
  tituloSecao?: string;
}

/** O ícone da fase atual, como no desenho (círculos concêntricos), num quadrado suave. */
function Selo() {
  return (
    <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
      <Target className="h-6 w-6" />
    </span>
  );
}

function CabecalhoDoGuia({ cabecalho, acaoPerder }: Pick<GuiaDoPassoProps, "cabecalho" | "acaoPerder">) {
  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Selo />
          <div className="min-w-0">
            <h3 className="break-words text-xl font-semibold text-foreground">{cabecalho.nome}</h3>
            {cabecalho.linha && <p className="break-words text-[15px] text-muted-foreground">{cabecalho.linha}</p>}
          </div>
        </div>
        {acaoPerder}
      </div>
      {(cabecalho.telefone || cabecalho.local) && (
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-[15px] text-foreground">
          {cabecalho.telefone && <span className="flex items-center gap-1.5"><Phone className="h-4 w-4 text-muted-foreground" aria-hidden="true" />{cabecalho.telefone}</span>}
          {cabecalho.local && <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-muted-foreground" aria-hidden="true" />{cabecalho.local}</span>}
        </div>
      )}
    </header>
  );
}

interface CentroProps {
  passo: PassoGuiado;
  vendoAnterior: boolean;
  aoVerAnterior: () => void;
  aoVoltarAoAtual: () => void;
  aoAcao?: (e: MouseEvent<HTMLElement>) => void;
  atributosAcao?: Record<string, string>;
  explicacao?: GuiaDoPassoProps["explicacao"];
  ocupado: boolean;
  extra?: ReactNode;
}

/** O centro: a fase, o título (h2, recebe o foco quando o passo muda), o subtítulo e o rodapé com «Anterior» e o botão primário. */
function CentroDoGuia({ passo, vendoAnterior, aoVerAnterior, aoVoltarAoAtual, aoAcao, atributosAcao, explicacao, ocupado, extra }: CentroProps) {
  const { t } = useTranslation();
  const idRazao = useId();
  const titulo = useRef<HTMLHeadingElement>(null);
  const primeira = useRef(true);
  // O foco só vai para o título quando o passo (ou a vista) muda de verdade, e nunca à entrada: quem abre a ficha tem o foco no seu sítio.
  useEffect(() => {
    if (primeira.current) { primeira.current = false; return; }
    titulo.current?.focus();
  }, [passo.passo, passo.faseId, vendoAnterior]);
  const { acao, anterior } = passo;
  const razao = acao.estado === "desativada" && acao.razaoChave ? { id: idRazao, texto: t(acao.razaoChave) } : explicacao ?? null;
  const desativada = acao.estado === "desativada";
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">{t(vendoAnterior && anterior ? anterior.rotuloChave : passo.faseRotuloChave)}</p>
      <div aria-live="polite" className="space-y-1.5">
        <h2 ref={titulo} tabIndex={-1} className="text-2xl font-semibold leading-tight text-foreground outline-none">
          {vendoAnterior && anterior ? t(anterior.rotuloChave) : t(passo.tituloChave)}
        </h2>
        <p className="text-[15px] text-muted-foreground">
          {vendoAnterior && anterior ? t(`${P}guia.anterior.aviso`, { phase: t(anterior.rotuloChave) }) : t(passo.subtituloChave)}
        </p>
      </div>
      {vendoAnterior && anterior && <ChecklistDoPasso itens={anterior.itens} rotulo={t(`${P}guia.checklist`)} />}
      {!vendoAnterior && extra}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <Button type="button" variant="ghost" className={cn("min-h-11 gap-2", FOCO)} disabled={!anterior || vendoAnterior} onClick={aoVerAnterior}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t(`${P}guia.anterior`)}
        </Button>
        {vendoAnterior ? (
          <Button type="button" className={cn("min-h-11 gap-2", FOCO)} onClick={aoVoltarAoAtual}>
            {t(`${P}guia.anterior.voltar`)}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        ) : acao.estado !== "semAcao" && (
          <Button
            type="button" className={cn("min-h-11 gap-2 motion-reduce:transition-none", FOCO, desativada && "opacity-60")}
            aria-disabled={desativada || ocupado || undefined} aria-busy={ocupado || undefined}
            aria-describedby={razao ? razao.id : undefined} {...atributosAcao}
            onClick={(e) => { if (!desativada && !ocupado) aoAcao?.(e); }}
          >
            {t(acao.rotuloChave)}
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
          </Button>
        )}
      </div>
      {!vendoAnterior && razao && <ExplicacaoDoPasso id={razao.id} texto={razao.texto} />}
    </div>
  );
}

export function GuiaDoPasso({ passo, fases, cabecalho, cliente, acontecimentos, aoAcao, atributosAcao, explicacao, ocupado = false, acaoPerder, extra, tituloSecao }: GuiaDoPassoProps) {
  const { t } = useTranslation();
  const [vendoAnterior, setVendoAnterior] = useState(false);
  const [listaAberta, setListaAberta] = useState(false);
  const idLista = useId();
  // Quando o passo muda (a gravação avançou a fase), volta-se a ver o passo atual.
  useEffect(() => setVendoAnterior(false), [passo?.passo, passo?.faseId]);
  const faseAtual = fases.find((f) => f.estado === "atual" || f.estado === "perdida");
  return (
    <section aria-label={t(`${P}guia.regiao`)} className="space-y-4 rounded-xl border border-border bg-card p-4">
      <CabecalhoDoGuia cabecalho={cabecalho} acaoPerder={acaoPerder} />
      <h4 className="sr-only">{t(`${P}phases.title`)}{faseAtual ? `: ${t(`${P}guia.faseAtual`, { phase: t(faseAtual.rotuloChave) })}` : ""}</h4>
      <BarraFasesGuia fases={fases} />
      {passo && (
        <>
          {tituloSecao && <h4 className="sr-only">{tituloSecao}</h4>}
          <div className="grid gap-4 md:grid-cols-[200px_minmax(0,1fr)]">
            <div className="order-2 md:order-1">
              <Button
                type="button" variant="outline" className={cn("min-h-11 w-full justify-between md:hidden", FOCO)}
                aria-expanded={listaAberta} aria-controls={idLista} onClick={() => setListaAberta((a) => !a)}
              >
                {t(`${P}guia.checklist.${listaAberta ? "esconder" : "mostrar"}`)}
              </Button>
              <ChecklistDoPasso
                id={idLista} itens={passo.itens} rotulo={t(passo.faseRotuloChave)} className={cn("mt-3 md:mt-0", listaAberta ? "block" : "hidden md:block")}
              />
            </div>
            <div className="order-1 md:order-2">
              <CentroDoGuia
                passo={passo} vendoAnterior={vendoAnterior} aoVerAnterior={() => setVendoAnterior(true)} aoVoltarAoAtual={() => setVendoAnterior(false)}
                aoAcao={aoAcao} atributosAcao={atributosAcao} explicacao={explicacao} ocupado={ocupado} extra={extra}
              />
            </div>
          </div>
        </>
      )}
      <CartaoClienteGuia cliente={cliente} acontecimentos={acontecimentos} comLinha={cliente.linha !== null} />
    </section>
  );
}
