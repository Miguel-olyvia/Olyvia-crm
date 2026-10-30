// O detalhe de um negócio dentro da ficha: "← Voltar aos negócios", o título, os selos, o valor e o comercial e as «Fases do negócio»
// (Orçamento, Proposta, Contrato, Financeiro e Obra, com a atual marcada). Sem o guia, é só isto: o passo e o prazo, os botões (perder,
// mudar o fecho, editar, lixo) e os detalhes (percurso, registos ligados, orçamentos, proposta, condições) saíram desta vista (30/10).
// A Financeiro e a Obra vêm do `negocios.fase` lido da base, pela mesma regra do Quadro. Com o guia (a ficha real) nada disto muda.
// Com o guia (a ficha real) por baixo do guia só ficam os elementos de decisão (perda, alertas, fecho); as secções recolhíveis e as ações de editar,
// mandar para o lixo e mudar o fecho abrem a pedido nos «Detalhes do negócio» (um diálogo por cima, a partir do menu «Mais»).
import { useEffect, useRef, type MutableRefObject } from "react";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Seccao } from "@/components/ficha-comum/Seccao";
import { BotaoAnularPerda, BotaoPerderNegocio } from "@/components/negocio-metas/BotoesPerda";
import { useDadosNegocio } from "@/components/negocio-metas/costuraNegocio";
import { semContratosSeProposta } from "@/components/negocio-metas/fechoNegocio";
import { FOCO } from "@/components/negocio-metas/estilos";
import { formatarMeta } from "@/components/negocio-metas/formatoMetas";
import { useAlteracoesNegocios } from "@/components/negocio-metas/negociosAlterados";
import { valorDoNegocio, type NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { RESTO_EM_COLUNA } from "./layoutGuia";
import { useRegistosPessoa } from "@/components/negocio-metas/registosPessoa";
import { AcoesEdicaoNegocio } from "./AcoesEdicaoNegocio";
import { DetalhesRecolhiveis, secaoAberta } from "./ApoioNegocio";
import { AlertasNegocio } from "./AlertasNegocio";
import { BlocoFechoNegocio } from "./BlocoFechoNegocio";
import { EtiquetaFecho } from "./EtiquetaFecho";
import { FaixaFasesNegocio } from "./FaixaFasesNegocio";
import { comPosContrato, fasesDoNegocio } from "./fasesDoNegocio";
import { useFontePessoas } from "@/hooks/pessoas/useFontePessoas";
import { useNegocioEmylia } from "./negocioEmylia/useNegocioEmylia";
import { FichaApoioDialogo } from "./FichaApoioDialogo";
import { FasesDoNegocioLista } from "./FasesDoNegocioLista";
import type { PecasCabecalhoFicha } from "./CabecalhoGuiaFicha";
import { GuiaDoNegocio } from "./GuiaDoNegocio";
import type { ItemAtividade, Pessoa } from "./pessoasTipos";
import { estaAberto } from "./juntarPessoas";
import { MudarFechoNegocio } from "./MudarFechoNegocio";
import { useAcoesDoNegocio } from "./permissoesNegocio";
import type { ItemProcesso } from "./processo/tiposProcesso";

const P = "pessoasPagina.";

/** Sem o ref da ficha (um uso fora dela) o diálogo deixa o foco por conta do Radix. */
const SEM_ORIGEM: MutableRefObject<HTMLElement | null> = { current: null };

interface DetalheNegocioFichaProps {
  negocio: NegocioMes;
  hoje: string;
  aoVoltar: () => void;
  /** O item do processo deste negócio: com ele, o passo seguinte tem o botão que o executa (sem ele, só se lê). */
  item?: ItemProcesso;
  /** O negócio foi para o lixo: quem abre a lista pode querer dar o foco ao filtro. Sem isto, volta-se à lista como em «Voltar». */
  aoApagado?: () => void;
  /** A pessoa e a atividade da ficha: o cartão do cliente e os últimos acontecimentos do guia do passo. Sem elas vale o que o negócio traz. */
  pessoa?: Pessoa;
  atividade?: readonly ItemAtividade[];
  /**
   * O guia do passo seguinte (a ficha real) em vez do bloco de título, da lista de fases e do texto do passo: é o ÚNICO cabeçalho do negócio (o nome da
   * pessoa, o serviço como linha, as fases, o passo, o valor e o comercial, o botão que o faz e «Perder negócio»). Sem `item` (ganho ou perdido) fica sem passo.
   */
  comGuia?: boolean;
  /** O cabeçalho único da ficha (título, selos, paginador, Email e Mais), que o guia do negócio passa a ter; sem isto o guia desenha o nome da pessoa. */
  cabecalhoFicha?: PecasCabecalhoFicha;
  /** Com o guia: o diálogo «Detalhes do negócio» está aberto (o estado vive na ficha, porque o menu «Mais» do cabeçalho é que o abre). */
  apoioAberto?: boolean;
  aoFecharApoio?: () => void;
  /** O botão a que o foco regressa quando o diálogo fecha. */
  origemApoio?: MutableRefObject<HTMLElement | null>;
  /** Com o guia: abre o registo da chamada da ficha (um negócio por contactar, e o passo Chamada do assistente). */
  aoRegistarChamada?: (origem: HTMLElement | null) => void;
  /** Com o guia: a ficha está na página e tem a ligação «← Pipeline» / «← Pessoas» no topo, por isso não há segundo botão de voltar. No painel lateral não há essa ligação e o botão fica. */
  comSaidaNaPagina?: boolean;
}

/** Um negócio perdido: em que fase e porquê, e o botão que anula a perda (o negócio volta ao quadro). */
function PerdaDoNegocio({ negocio, fase, motivo, podeAnular }: { negocio: NegocioMes; fase: string; motivo: string; podeAnular: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/40 p-3">
      <p className="text-[15px] font-medium text-foreground">
        {t("businessGoals.lose.lostIn", { phase: t(`businessGoals.lose.phase.${fase}`), reason: motivo })}
      </p>
      {podeAnular && <BotaoAnularPerda negocio={negocio} />}
    </div>
  );
}

export function DetalheNegocioFicha({ negocio: negocioDaFicha, hoje, aoVoltar, item, aoApagado, pessoa, atividade, comGuia, cabecalhoFicha, apoioAberto = false, aoFecharApoio, origemApoio, aoRegistarChamada, comSaidaNaPagina = false }: DetalheNegocioFichaProps) {
  const { t } = useTranslation();
  // Fecho na proposta: os contratos são ignorados, por isso o ecrã vê o negócio sem contrato (sem secção, sem fase, sem passo de contrato).
  const negocio = semContratosSeProposta(negocioDaFicha);
  const titulo = useRef<HTMLHeadingElement>(null);
  // O título do diálogo «Detalhes do negócio»: para onde vai o foco quando o botão de mudar o fecho desaparece lá dentro.
  const tituloApoio = useRef<HTMLHeadingElement>(null);
  // Ao abrir o detalhe, o foco vai para o título (a lista de onde veio já não existe).
  useEffect(() => titulo.current?.focus(), []);
  const perda = useAlteracoesNegocios().perdidos[negocio.id];
  // Sem os dados da ficha real (o exemplo) pode-se sempre agir; na ficha real, só com `pessoas.edit` (e, com a bandeira da migration B, neste negócio).
  const acoes = useAcoesDoNegocio(negocio);
  const podeEditar = useDadosNegocio() === null ? true : acoes.podeAgir;
  // Perder, anular a perda ou ganhar troca o botão que tinha o foco: o foco passa para o título, em vez de se perder.
  // O mesmo vale para o aviso do negócio e a conversão por fazer: ao gravar, o botão e o aviso saem e o foco cairia no corpo da página.
  const situacao = `${perda !== undefined}:${negocio.estadoReal ?? ""}:${negocio.alerta?.codigo ?? (negocio.alerta ? "?" : "")}:${negocio.conversaoPendente === true}`;
  const situacaoAnterior = useRef(situacao);
  useEffect(() => {
    if (situacaoAnterior.current === situacao) return;
    situacaoAnterior.current = situacao;
    titulo.current?.focus();
  }, [situacao]);
  // As fases deste negócio (as da abordagem só aparecem quando existem) e a atual, que é a etiqueta do cabeçalho.
  const registos = useRegistosPessoa();
  const perdidoAntigo = (negocio as { resultado?: string }).resultado === "perdido";
  const fases = fasesDoNegocio(negocio, registos, perda, perdidoAntigo);
  const faseAtual = (fases.find((f) => f.estado === "atual" || f.estado === "perdida") ?? fases[fases.length - 1])?.id;
  // A Financeiro e a Obra vêm do `negocios.fase` lido da base (a mesma regra do Quadro); só se lê no negócio aberto da aba «Negócios», sem o guia.
  const fonte = useFontePessoas();
  const org = fonte.modo === "real" ? fonte.organizationId : null;
  const utilizador = fonte.modo === "real" ? (fonte.utilizadorId ?? "") : "";
  const perdidoNeg = negocio.estadoReal === "perdido" || perda !== undefined || perdidoAntigo;
  const emylia = useNegocioEmylia(comGuia || perdidoNeg ? null : org, negocio.id, undefined, undefined, utilizador);
  const fasesVistas = comPosContrato(fases, { fase: emylia.d?.fase, estado: negocio.estadoReal, contratoAssinado: negocio.contrato?.estado === "assinado", perdido: perdidoNeg });
  const faseVista = (fasesVistas.find((f) => f.estado === "atual" || f.estado === "perdida") ?? fasesVistas[fasesVistas.length - 1])?.id;
  // O passo seguinte só existe num negócio aberto: num ganho ou perdido reabre-se primeiro.
  const comPasso = estaAberto(negocio) && !acoes.fechado;
  // Os detalhes: só o da fase em que o negócio está vem aberto (num ganho ou perdido, o percurso); os outros ficam a uma linha de resumo.
  const aberta = secaoAberta(faseAtual, perda !== undefined || perdidoAntigo);
  const valor = formatarMeta("euro", valorDoNegocio(negocio));
  // Com o guia, a perda e os avisos do negócio vão para a faixa fina logo por baixo do cabeçalho (junto dos alertas da pessoa), e só se existirem.
  const faixaNegocio = comGuia ? (
    <div className="space-y-2 empty:hidden">
      {cabecalhoFicha?.faixa}
      {perda && <PerdaDoNegocio negocio={negocio} fase={perda.fase} motivo={perda.motivo} podeAnular={podeEditar} />}
      <AlertasNegocio negocio={negocio} semFecharAgora />
    </div>
  ) : undefined;
  // Com o guia, a nota do fecho na proposta e o bloco de fecho vão no fim da coluna do meio (a que rola em ecrã largo), e não por baixo do guia.
  const rodapeDoGuia = comGuia ? (
    <>
      {/* Só a venda directa (fecho na proposta) leva selo e nota: «Fecha no contrato» é a omissão. */}
      {negocio.fecho === "proposta" && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2"><EtiquetaFecho fecho={negocio.fecho} /></div>
          <p className="text-sm text-muted-foreground">{t("pessoasPagina.neg.fecho.note.proposta")}</p>
        </div>
      )}
      <BlocoFechoNegocio negocio={negocio} semFecharAgora />
    </>
  ) : undefined;
  return (
    <div className={cn("space-y-4", comGuia && RESTO_EM_COLUNA)}>
      {/* Com o guia na página a única saída é «← Pipeline» da ficha: aqui não há segundo botão de voltar. No painel lateral (sem essa ligação) o botão fica. */}
      {!(comGuia && comSaidaNaPagina) && (
        <Button type="button" variant="ghost" className={cn("-ml-3 min-h-11 gap-2", FOCO)} onClick={aoVoltar}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t(`${P}deal.back`)}
        </Button>
      )}
      {/* O estado do negócio, num só bloco: o que é, em que fase está e o que fazer agora. Com o guia (a ficha real) o cabeçalho do guia é o único: o serviço
          é a linha, o valor e o comercial vão no passo e a fase já está na barra; só o tipo de fecho continua à vista. */}
      <div className={cn("space-y-4", comGuia ? RESTO_EM_COLUNA : "rounded-xl border border-border bg-card p-4")}>
        {!comGuia && (
          <div className="space-y-3">
            <h3 ref={titulo} tabIndex={-1} className="text-lg font-semibold text-foreground outline-none">{negocio.servico}</h3>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{t(`${P}deals.kind.deal`)}</Badge>
              {negocio.fecho && <EtiquetaFecho fecho={negocio.fecho} />}
              {faseVista && <Badge variant="secondary">{t(`${P}phases.${faseVista}`)}</Badge>}
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[15px]">
              <dt className="text-muted-foreground">{t(`${P}detail.value`)}</dt>
              <dd className="font-semibold tabular-nums text-foreground">{valor}</dd>
              <dt className="text-muted-foreground">{t(`${P}detail.rep`)}</dt>
              <dd className="text-foreground">{negocio.comercial}</dd>
            </dl>
            {negocio.fecho === "proposta" && <p className="text-sm text-muted-foreground">{t("pessoasPagina.neg.fecho.note.proposta")}</p>}
          </div>
        )}
        {/* Um negócio com o guia (a ficha real): as fases, o passo, o botão que o faz e «Perder negócio»; fechado, só o cabeçalho, as fases e o cartão. */}
        {comGuia ? (
          <>
            <GuiaDoNegocio
              negocio={negocio} hoje={hoje} item={item} fases={fases} podeEditar={podeEditar} pessoa={pessoa} atividade={atividade}
              cabecalhoFicha={cabecalhoFicha} faixa={faixaNegocio} tituloRef={titulo} semPasso={!comPasso} aoRegistarChamada={aoRegistarChamada}
              acaoPerder={comPasso && podeEditar ? <BotaoPerderNegocio negocio={negocio} hoje={hoje} className="self-start" rotuloChave="pessoasPagina.guia.perder" /> : undefined}
              rodape={rodapeDoGuia}
            />
          </>
        ) : (
          // Sem o guia (o negócio aberto na aba «Negócios»): só em que fase está, da Orçamento à Obra. O passo, os botões e os detalhes saíram.
          <Seccao titulo={t(`${P}phases.title`)} nivel={4}><div className="space-y-3"><FaixaFasesNegocio fases={fasesVistas} /><FasesDoNegocioLista fases={fasesVistas} /></div></Seccao>
        )}
      </div>
      {comGuia ? (
        <FichaApoioDialogo
          aberto={apoioAberto} aoFechar={() => aoFecharApoio?.()} titulo={t("pessoasPagina.apoio.negocio.titulo")} descricao={negocio.servico}
          origem={origemApoio ?? SEM_ORIGEM} tituloRef={tituloApoio}
        >
          <div className="space-y-4 p-4 sm:p-6">
            <MudarFechoNegocio negocio={negocio} aoSemBotao={() => tituloApoio.current?.focus()} />
            <AcoesEdicaoNegocio negocio={negocio} aoApagado={() => { aoFecharApoio?.(); (aoApagado ?? aoVoltar)(); }} />
            <DetalhesRecolhiveis negocio={negocio} hoje={hoje} aberta={aberta} />
          </div>
        </FichaApoioDialogo>
      ) : null}
    </div>
  );
}
