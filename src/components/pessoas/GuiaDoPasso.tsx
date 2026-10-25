// O guia do passo seguinte, como no desenho: um cartão com o cabeçalho (nome, linha, telefone, morada e «Marcar como perdido») e a barra de fases; por
// baixo, sobre o fundo suave, a lista da fase à esquerda (num cartão), no centro o título grande, o subtítulo, «Anterior» e UM botão primário, e o
// cartão do cliente com os últimos acontecimentos à direita (a partir de 1024 px; abaixo disso, por baixo). Na ficha da pessoa é o ÚNICO cabeçalho: leva
// também o título da ficha (`nomeEl`), os selos, o aviso de estado, a navegação entre pessoas, as ações secundárias (Email, Mais, atalhos) e a faixa
// fina de alertas, todos passados pelo chamador.
// Só apresentação: recebe o passo já calculado (`calcularPassoGuiado`) e os callbacks por props; não fala com a base. «Anterior» só lê a fase que
// já passou (não existe forma de recuar uma fase) e o botão primário passa a ser «Voltar ao passo atual». No telemóvel o passo vem primeiro e a
// lista da fase fica recolhida.
import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode, type Ref } from "react";
import { ArrowLeft, ArrowRight, Loader2, MapPin, Phone, Target } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { ligacoes } from "@/components/ficha-comum/ligacoesContacto";
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
  /** O nome da pessoa como elemento (o título da ficha, com o foco inicial): sem ele o guia desenha o seu próprio nome (h3). */
  nomeEl?: ReactNode;
  /** A descrição da ficha («Lead · Por contactar»): vê-se por baixo do nome; com uma linha de negócio fica só para o leitor de ecrã. */
  descricaoEl?: ReactNode;
  /** Os selos «Empresa», «Perdida» e «Encerrada», por baixo do nome. */
  selos?: ReactNode;
  /** O estado de uma pessoa perdida ou encerrada (o que antes vivia no «Próximo passo e prazo»). */
  aviso?: ReactNode;
  /** O canto superior direito: o paginador «1 de N» e Fechar. */
  navegacao?: ReactNode;
  /** Junto de «Marcar como perdido»: Email, WhatsApp e o menu Mais. */
  acoesSecundarias?: ReactNode;
  /** O h3 da linha do negócio (o serviço) recebe o foco quando o negócio abre ou muda de estado. */
  tituloRef?: Ref<HTMLHeadingElement>;
  /** A faixa fina de alertas, logo por baixo do cabeçalho (só existe quando há alertas). */
  faixa?: ReactNode;
  /** «Ver toda a atividade» no cartão do cliente; sem isto a ligação não existe. */
  aoVerAtividade?: (origem: HTMLElement) => void;
}

/** O ícone da fase atual, como no desenho (círculos concêntricos), num quadrado suave na cor primária da Olyvia. */
function Selo() {
  return (
    <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
      <Target className="h-7 w-7" />
    </span>
  );
}

type PecasCabecalho = Pick<GuiaDoPassoProps, "cabecalho" | "acaoPerder" | "nomeEl" | "descricaoEl" | "selos" | "aviso" | "navegacao" | "acoesSecundarias" | "tituloRef">;

function CabecalhoDoGuia({ cabecalho, acaoPerder, nomeEl, descricaoEl, selos, aviso, navegacao, acoesSecundarias, tituloRef }: PecasCabecalho) {
  const telefone = cabecalho.telefone ? ligacoes({ telefone: cabecalho.telefone, email: null }).telefone : undefined;
  // Na ficha (navegação ou ações secundárias) o canto de cima é do paginador e «Marcar como perdido» desce para junto das ações; fora dela fica como estava.
  const naFicha = navegacao !== undefined || acoesSecundarias !== undefined;
  const comLinhaDeNegocio = nomeEl !== undefined && Boolean(cabecalho.linha);
  return (
    <header className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Selo />
          <div className="min-w-0">
            {nomeEl ?? (
              <h3 ref={tituloRef} tabIndex={tituloRef ? -1 : undefined} className="break-words text-2xl font-bold text-foreground outline-none">{cabecalho.nome}</h3>
            )}
            {comLinhaDeNegocio ? (
              <h3 ref={tituloRef} tabIndex={-1} data-negocio-titulo="" className="break-words text-base font-normal text-muted-foreground outline-none">{cabecalho.linha}</h3>
            ) : cabecalho.linha && <p className="break-words text-base text-muted-foreground">{cabecalho.linha}</p>}
            {descricaoEl !== undefined && (comLinhaDeNegocio ? <div className="sr-only">{descricaoEl}</div> : <div className="text-base text-muted-foreground">{descricaoEl}</div>)}
          </div>
        </div>
        {navegacao}
        {!naFicha && acaoPerder}
      </div>
      {selos && <div className="flex flex-wrap gap-1.5">{selos}</div>}
      {aviso}
      {(cabecalho.telefone || cabecalho.local) && (
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[15px] text-foreground">
          {cabecalho.telefone && (
            <span className="flex items-center gap-1.5">
              <Phone className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              {telefone ? <a href={telefone} className={cn("rounded-sm underline-offset-2 hover:underline", FOCO)}>{cabecalho.telefone}</a> : cabecalho.telefone}
            </span>
          )}
          {cabecalho.local && <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-muted-foreground" aria-hidden="true" />{cabecalho.local}</span>}
        </div>
      )}
      {naFicha && (acoesSecundarias || acaoPerder) && (
        <div className="flex flex-wrap items-center gap-2">
          {acoesSecundarias}
          {acaoPerder && <div className="ml-auto">{acaoPerder}</div>}
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
  /** O nível do título do passo: h3 na ficha (o nome da pessoa é o h2), h2 fora dela. */
  nivel: "h2" | "h3";
}

/** O centro: a fase, o título (h2, recebe o foco quando o passo muda), o subtítulo e o rodapé com «Anterior» e o botão primário. */
function CentroDoGuia({ passo, vendoAnterior, aoVerAnterior, aoVoltarAoAtual, aoAcao, atributosAcao, explicacao, ocupado, extra, nivel }: CentroProps) {
  const Titulo = nivel;
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
    <div className="space-y-4 py-1 md:px-2">
      <p className="text-sm text-muted-foreground">{t(vendoAnterior && anterior ? anterior.rotuloChave : passo.faseRotuloChave)}</p>
      <div aria-live="polite" className="space-y-2">
        <Titulo ref={titulo} tabIndex={-1} className="text-2xl font-bold leading-tight tracking-tight text-foreground outline-none md:text-[28px]">
          {vendoAnterior && anterior ? t(anterior.rotuloChave) : t(passo.tituloChave)}
        </Titulo>
        <p className="text-base text-muted-foreground">
          {vendoAnterior && anterior ? t(`${P}guia.anterior.aviso`, { phase: t(anterior.rotuloChave) }) : t(passo.subtituloChave)}
        </p>
      </div>
      {vendoAnterior && anterior && <ChecklistDoPasso itens={anterior.itens} rotulo={t(`${P}guia.checklist`)} cartao={false} />}
      {!vendoAnterior && extra}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
        <Button type="button" variant="ghost" className={cn("min-h-11 gap-2 px-3 text-muted-foreground hover:text-foreground", FOCO)} disabled={!anterior || vendoAnterior} onClick={aoVerAnterior}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t(`${P}guia.anterior`)}
        </Button>
        {vendoAnterior ? (
          <Button type="button" className={cn("min-h-11 gap-2 rounded-lg px-6 font-semibold", FOCO)} onClick={aoVoltarAoAtual}>
            {t(`${P}guia.anterior.voltar`)}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        ) : acao.estado !== "semAcao" && (
          <Button
            type="button" className={cn("min-h-11 gap-2 rounded-lg px-6 font-semibold motion-reduce:transition-none", FOCO, desativada && "opacity-60")}
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

export function GuiaDoPasso({
  passo, fases, cabecalho, cliente, acontecimentos, aoAcao, atributosAcao, explicacao, ocupado = false, acaoPerder, extra, tituloSecao,
  nomeEl, descricaoEl, selos, aviso, navegacao, acoesSecundarias, tituloRef, faixa, aoVerAtividade,
}: GuiaDoPassoProps) {
  const { t } = useTranslation();
  const [vendoAnterior, setVendoAnterior] = useState(false);
  const [listaAberta, setListaAberta] = useState(false);
  const idLista = useId();
  // Quando o passo muda (a gravação avançou a fase), volta-se a ver o passo atual.
  useEffect(() => setVendoAnterior(false), [passo?.passo, passo?.faseId]);
  const faseAtual = fases.find((f) => f.estado === "atual" || f.estado === "perdida");
  // Na ficha o nome da pessoa (o título do painel) é o h2: o resto desce um nível, sem saltos. Fora dela o guia é o ecrã.
  const naFicha = nomeEl !== undefined;
  const Seccao = naFicha ? "h3" : "h4";
  return (
    <section aria-label={t(`${P}guia.regiao`)} className="space-y-4">
      {/* O cartão do topo: o cabeçalho, a faixa fina de alertas (só quando existem) e a barra de fases. */}
      <div className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm md:p-5">
        <CabecalhoDoGuia
          cabecalho={cabecalho} acaoPerder={acaoPerder} nomeEl={nomeEl} descricaoEl={descricaoEl} selos={selos} aviso={aviso}
          navegacao={navegacao} acoesSecundarias={acoesSecundarias} tituloRef={tituloRef}
        />
        {faixa}
        <Seccao className="sr-only">{t(`${P}phases.title`)}{faseAtual ? `: ${t(`${P}guia.faseAtual`, { phase: t(faseAtual.rotuloChave) })}` : ""}</Seccao>
        <BarraFasesGuia fases={fases} />
      </div>
      {/* O passo (lista da fase e centro) e o cartão do cliente, sobre o fundo suave: empilhados no telemóvel, duas colunas a partir de 768 px (o cliente por
          baixo, a toda a largura) e três a partir de 1024 px (lista | passo | cliente). */}
      {passo && tituloSecao && <Seccao className="sr-only">{tituloSecao}</Seccao>}
      <div className={cn("grid gap-4", passo && "md:grid-cols-[200px_minmax(0,1fr)] lg:grid-cols-[210px_minmax(0,1fr)_270px]")}>
        {passo && (
          <>
            <div className="order-1 md:order-2">
              <CentroDoGuia
                passo={passo} vendoAnterior={vendoAnterior} aoVerAnterior={() => setVendoAnterior(true)} aoVoltarAoAtual={() => setVendoAnterior(false)}
                aoAcao={aoAcao} atributosAcao={atributosAcao} explicacao={explicacao} ocupado={ocupado} extra={extra} nivel={naFicha ? "h3" : "h2"}
              />
            </div>
            <div className="order-2 md:order-1 md:self-start">
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
          </>
        )}
        <div className={cn("order-3", passo && "md:col-span-2 md:self-start lg:col-span-1 lg:col-start-3 lg:row-start-1")}>
          <CartaoClienteGuia
            cliente={cliente} acontecimentos={acontecimentos} comLinha={cliente.linha !== null} nivel={naFicha ? "h3" : "h4"} aoVerAtividade={aoVerAtividade}
          />
        </div>
      </div>
    </section>
  );
}
