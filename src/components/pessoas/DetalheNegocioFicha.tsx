// O detalhe de um negócio dentro da ficha: "← Voltar aos negócios", o título e secções (não abas): próximo passo e prazo,
// o percurso (contactos, visitas, levantamento), orçamentos e, se existirem, proposta e contrato. Tudo na página de Pessoas, sem
// ir à de Negócio e metas: só reutiliza os seus painéis, com os detalhes de exemplo (ou nenhuns). Na ficha real (com `DadosNegocio` e as
// mutações por contexto) lê os documentos da base, perde, anula a perda e dá como ganho contra a base, só com permissão de editar.
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, FilePlus2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Seccao } from "@/components/ficha-comum/Seccao";
import { registosDoNegocio, registosPorLigar, totalDeRegistos } from "@/components/negocio-metas/acoesRegistos";
import { BotaoAnularPerda, BotaoPerderNegocio } from "@/components/negocio-metas/BotoesPerda";
import { ContratoPainel } from "@/components/negocio-metas/ContratoPainel";
import { useDadosNegocio } from "@/components/negocio-metas/costuraNegocio";
import { semContratosSeProposta } from "@/components/negocio-metas/fechoNegocio";
import { FOCO } from "@/components/negocio-metas/estilos";
import { formatarMeta } from "@/components/negocio-metas/formatoMetas";
import { NovoOrcamentoDialogo } from "@/components/negocio-metas/NovoOrcamentoDialogo";
import { aceitaOrcamentos } from "@/components/negocio-metas/negocioAcoes";
import { useAlteracoesNegocios, useDetalheDoNegocio } from "@/components/negocio-metas/negociosAlterados";
import { valorDoNegocio, type NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { OrcamentosPainel } from "@/components/negocio-metas/OrcamentosPainel";
import { PercursoNegocio } from "@/components/negocio-metas/PercursoPainel";
import { PropostaPainel } from "@/components/negocio-metas/PropostaPainel";
import { useRegistosPessoa } from "@/components/negocio-metas/registosPessoa";
import { SaudeTag } from "@/components/negocio-metas/SaudeTag";
import { AbrirDocumento } from "./AbrirDocumento";
import { AcoesEdicaoNegocio } from "./AcoesEdicaoNegocio";
import { AlertasNegocio } from "./AlertasNegocio";
import { BlocoFechoNegocio } from "./BlocoFechoNegocio";
import { CondicoesDaProposta } from "./CondicoesDaProposta";
import { EtiquetaFecho } from "./EtiquetaFecho";
import { passoDoNegocio } from "./etapaPessoa";
import { FaixaFasesNegocio } from "./FaixaFasesNegocio";
import { fasesDoNegocio, type IdFase } from "./fasesDoNegocio";
import { FasesDoNegocioLista } from "./FasesDoNegocioLista";
import { GuiaDoNegocio } from "./GuiaDoNegocio";
import type { ItemAtividade, Pessoa } from "./pessoasTipos";
import { estaAberto } from "./juntarPessoas";
import { MudarFechoNegocio } from "./MudarFechoNegocio";
import { ExplicacaoDoPasso } from "./processo/ExplicacaoDoPasso";
import { useAcoesDoNegocio } from "./permissoesNegocio";
import { passoDoItem } from "./processo/passosProcesso";
import { useAcaoDoPasso } from "./processo/processoContexto";
import type { ItemProcesso } from "./processo/tiposProcesso";
import { trabalhoDoItem } from "./processo/trabalhoDoItem";
import { RegistosLigadosNegocio } from "./RegistosLigadosNegocio";
import { SeccaoRecolhivel } from "./SeccaoRecolhivel";
import { Prazo } from "./SeccoesResumo";

const P = "pessoasPagina.";

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
  /** O guia do passo seguinte (a ficha real) em vez do texto do passo: as fases, o passo, o botão que o faz e «Perder negócio». Precisa do `item`. */
  comGuia?: boolean;
}

/**
 * O "A fazer" de um negócio: o passo, a explicação, o prazo e a saúde, e o botão que executa o passo (o mesmo do Quadro e da Lista) quando
 * há processo. Só os negócios abertos têm passo: num ganho ou perdido não há nada a fazer.
 */
function PassoDoNegocio({ negocio, hoje, item }: { negocio: NegocioMes; hoje: string; item?: ItemProcesso }) {
  const { t } = useTranslation();
  const id = passoDoNegocio(negocio);
  const acao = useAcaoDoPasso(item, () => undefined);
  const passo = item ? t(passoDoItem(item).chave) : "";
  return (
    <Seccao titulo={t(`${P}deal.next`)} nivel={4}>
      <div className="space-y-2">
        <p className="text-[15px] font-medium text-foreground">{t(`${P}next.${id}`)}</p>
        <p className="text-[15px] text-muted-foreground">{t(`${P}next.${id}.hint`)}</p>
        <Prazo prazo={negocio.proximoPrazo} hoje={hoje} />
        <SaudeTag negocio={negocio} hoje={hoje} />
        {item && acao.executa && (
          <Button
            type="button" onClick={acao.aoClicar} {...acao.atributos}
            // Começa pelo texto visível (WCAG 2.5.3) e diz de que trabalho é.
            aria-label={t(`${P}process.stepLabel`, { step: passo, work: trabalhoDoItem(t, item), name: negocio.pessoa })}
            className={cn("h-auto min-h-11 w-full justify-start gap-2 whitespace-normal py-2 text-left motion-reduce:transition-none sm:w-auto", FOCO)}
          >
            {passo}
            <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          </Button>
        )}
        {acao.bloqueio && acao.idBloqueio && <ExplicacaoDoPasso id={acao.idBloqueio} texto={acao.bloqueio} />}
      </div>
    </Seccao>
  );
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

type SecaoDetalhe = "percurso" | "registos" | "orcamentos" | "proposta" | "contrato";

/** A secção de detalhes que vem aberta: a da fase em que o negócio está; num negócio ganho ou perdido, o percurso. */
function secaoAberta(fase: IdFase | undefined, terminado: boolean): SecaoDetalhe {
  if (terminado) return "percurso";
  if (fase === "orcamento") return "orcamentos";
  if (fase === "proposta") return "proposta";
  if (fase === "contrato") return "contrato";
  if (fase === "levantamento") return "registos";
  return "percurso";
}

export function DetalheNegocioFicha({ negocio: negocioDaFicha, hoje, aoVoltar, item, aoApagado, pessoa, atividade, comGuia }: DetalheNegocioFichaProps) {
  const { t } = useTranslation();
  // Fecho na proposta: os contratos são ignorados, por isso o ecrã vê o negócio sem contrato (sem secção, sem fase, sem passo de contrato).
  const negocio = semContratosSeProposta(negocioDaFicha);
  const titulo = useRef<HTMLHeadingElement>(null);
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
  const detalhe = useDetalheDoNegocio(negocio.id);
  const [criando, setCriando] = useState(false);
  // Só o exemplo tem «Criar orçamento»: o diálogo grava em memória. Na ficha real o orçamento cria-se pelo passo do processo (editor real).
  const emExemplo = useDadosNegocio() === null;
  const podeCriar = emExemplo && estaAberto(negocio) && aceitaOrcamentos(negocio);
  // As fases deste negócio (as da abordagem só aparecem quando existem) e a atual, que é a etiqueta do cabeçalho.
  const registos = useRegistosPessoa();
  const perdidoAntigo = (negocio as { resultado?: string }).resultado === "perdido";
  const fases = fasesDoNegocio(negocio, registos, perda, perdidoAntigo);
  const faseAtual = (fases.find((f) => f.estado === "atual" || f.estado === "perdida") ?? fases[fases.length - 1])?.id;
  // O passo seguinte só existe num negócio aberto: num ganho ou perdido reabre-se primeiro.
  const comPasso = estaAberto(negocio) && !acoes.fechado;
  // Os detalhes: só o da fase em que o negócio está vem aberto (num ganho ou perdido, o percurso); os outros ficam a uma linha de resumo.
  const aberta = secaoAberta(faseAtual, perda !== undefined || perdidoAntigo);
  const ligados = totalDeRegistos(registosDoNegocio(registos, negocio.id));
  const porLigar = totalDeRegistos(registosPorLigar(registos, negocio.pessoaId ?? ""));
  const nOrcamentos = negocio.orcamentos.length;
  const valor = formatarMeta("euro", valorDoNegocio(negocio));
  const resumoOrcamentos = nOrcamentos === 0 ? t(`${P}detail.quotes.none`) : nOrcamentos === 1 ? t(`${P}detail.quotes.one`, { value: valor }) : t(`${P}detail.quotes.many`, { count: nOrcamentos, value: valor });
  const resumoLigados = estaAberto(negocio) ? t(`${P}detail.linkedSummary`, { linked: ligados, toLink: porLigar }) : t(`${P}detail.linkedSummaryClosed`, { linked: ligados });
  return (
    <div className="space-y-4">
      <Button type="button" variant="ghost" className={cn("-ml-3 min-h-11 gap-2", FOCO)} onClick={aoVoltar}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t(`${P}deal.back`)}
      </Button>
      {/* O estado do negócio, num só bloco: o que é, em que fase está e o que fazer agora. */}
      <div className="space-y-4 rounded-xl border border-border bg-card p-4">
        <div className="space-y-3">
          <h3 ref={titulo} tabIndex={-1} className="text-lg font-semibold text-foreground outline-none">{negocio.servico}</h3>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{t(`${P}deals.kind.deal`)}</Badge>
            {negocio.fecho && <EtiquetaFecho fecho={negocio.fecho} />}
            {faseAtual && <Badge variant="secondary">{t(`${P}phases.${faseAtual}`)}</Badge>}
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[15px]">
            <dt className="text-muted-foreground">{t(`${P}detail.value`)}</dt>
            <dd className="font-semibold tabular-nums text-foreground">{valor}</dd>
            <dt className="text-muted-foreground">{t(`${P}detail.rep`)}</dt>
            <dd className="text-foreground">{negocio.comercial}</dd>
          </dl>
          {negocio.fecho === "proposta" && <p className="text-sm text-muted-foreground">{t("pessoasPagina.neg.fecho.note.proposta")}</p>}
        </div>
        {/* Um negócio aberto com processo (a ficha real) tem o guia do passo seguinte: as fases, o passo, o botão que o faz e «Perder negócio». */}
        {item && comGuia && comPasso ? (
          <GuiaDoNegocio
            negocio={negocio} hoje={hoje} item={item} fases={fases} podeEditar={podeEditar} pessoa={pessoa} atividade={atividade}
            acaoPerder={podeEditar ? <BotaoPerderNegocio negocio={negocio} hoje={hoje} className="self-start" /> : undefined}
          />
        ) : (
          <Seccao titulo={t(`${P}phases.title`)} nivel={4}><div className="space-y-3"><FaixaFasesNegocio fases={fases} /><FasesDoNegocioLista fases={fases} /></div></Seccao>
        )}
        {perda && <PerdaDoNegocio negocio={negocio} fase={perda.fase} motivo={perda.motivo} podeAnular={podeEditar} />}
        <AlertasNegocio negocio={negocio} />
        {/* Um negócio ganho ou perdido não tem passo a fazer (criar documentos incluído): reabre-se primeiro. Sem processo (o exemplo) fica só o texto do passo. */}
        {comPasso && !(item && comGuia) && <PassoDoNegocio negocio={negocio} hoje={hoje} item={item} />}
        {comPasso && !(item && comGuia) && podeEditar && (
          <div className="flex flex-wrap items-start gap-3">
            <BotaoPerderNegocio negocio={negocio} hoje={hoje} className="self-start" />
          </div>
        )}
        <BlocoFechoNegocio negocio={negocio} />
        {/* Mudar o tipo de fecho: só na ficha real, com permissão de editar e com o negócio aberto. */}
        <MudarFechoNegocio negocio={negocio} aoSemBotao={() => titulo.current?.focus()} />
        {/* Editar o título, as notas e o comercial, e mandar para o lixo: só na ficha real, com a permissão certa. */}
        <AcoesEdicaoNegocio negocio={negocio} aoApagado={aoApagado ?? aoVoltar} />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-semibold text-muted-foreground">{t(`${P}detail.more`)}</p>
        <SeccaoRecolhivel titulo={t("businessGoals.journey.title")} resumo={t(`${P}detail.journeyHint`)} aberta={aberta === "percurso"}>
          <PercursoNegocio negocio={negocio} detalhe={detalhe} />
        </SeccaoRecolhivel>
        <SeccaoRecolhivel titulo={t(`${P}linked.title`)} resumo={resumoLigados} aberta={aberta === "registos"}>
          <RegistosLigadosNegocio negocio={negocio} aberto={estaAberto(negocio)} />
        </SeccaoRecolhivel>
        <SeccaoRecolhivel titulo={t(`${P}deal.quotes`)} resumo={resumoOrcamentos} aberta={aberta === "orcamentos"}>
          {podeCriar && (
            <Button type="button" variant="outline" className={cn("mb-3 min-h-11 gap-2", FOCO)} onClick={() => setCriando(true)}>
              <FilePlus2 className="h-4 w-4" aria-hidden="true" />
              {t("businessGoals.actions.createQuote")}
            </Button>
          )}
          {nOrcamentos > 0 && <AbrirDocumento tipo="orcamento" negocioId={negocio.id} />}
          <OrcamentosPainel negocio={negocio} detalhe={detalhe} />
        </SeccaoRecolhivel>
        {negocio.proposta && (
          <SeccaoRecolhivel titulo={t(`${P}deal.proposal`)} resumo={t(`businessGoals.proposal.${negocio.proposta.estado}`)} aberta={aberta === "proposta"}>
            <AbrirDocumento tipo="proposta" negocioId={negocio.id} />
            <PropostaPainel negocio={negocio} detalhe={detalhe} hoje={hoje} />
            <CondicoesDaProposta negocio={negocio} hoje={hoje} />
          </SeccaoRecolhivel>
        )}
        {negocio.contrato && (
          <SeccaoRecolhivel titulo={t(`${P}deal.contract`)} resumo={t(`businessGoals.contract.${negocio.contrato.estado}`)} aberta={aberta === "contrato"}>
            <AbrirDocumento tipo="contrato" negocioId={negocio.id} />
            <ContratoPainel negocio={negocio} detalhe={detalhe} />
          </SeccaoRecolhivel>
        )}
      </div>
      {emExemplo && <NovoOrcamentoDialogo negocio={criando ? negocio : null} hoje={hoje} aoFechar={() => setCriando(false)} />}
    </div>
  );
}
