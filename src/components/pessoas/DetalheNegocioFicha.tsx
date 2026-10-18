// O detalhe de um negócio dentro da ficha: "← Voltar aos negócios", o título e secções (não abas): próximo passo e prazo,
// o percurso (contactos, visitas, levantamento), orçamentos e, se existirem, proposta e contrato. Tudo na página de Pessoas, sem
// ir à de Negócio e metas: só reutiliza os seus painéis, com os detalhes de exemplo (ou nenhuns).
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, FilePlus2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Seccao } from "@/components/ficha-comum/Seccao";
import { BotaoAnularPerda, BotaoPerderNegocio } from "@/components/negocio-metas/BotoesPerda";
import { ContratoPainel } from "@/components/negocio-metas/ContratoPainel";
import { FOCO } from "@/components/negocio-metas/estilos";
import { formatarMeta } from "@/components/negocio-metas/formatoMetas";
import { NovoOrcamentoDialogo } from "@/components/negocio-metas/NovoOrcamentoDialogo";
import { aceitaOrcamentos } from "@/components/negocio-metas/negocioAcoes";
import { detalheDoNegocio, useAlteracoesNegocios } from "@/components/negocio-metas/negociosAlterados";
import { valorDoNegocio, type NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { OrcamentosPainel } from "@/components/negocio-metas/OrcamentosPainel";
import { PercursoNegocio } from "@/components/negocio-metas/PercursoPainel";
import { PropostaPainel } from "@/components/negocio-metas/PropostaPainel";
import { useRegistosPessoa } from "@/components/negocio-metas/registosPessoa";
import { SaudeTag } from "@/components/negocio-metas/SaudeTag";
import { passoDoNegocio } from "./etapaPessoa";
import { fasesDoNegocio } from "./fasesDoNegocio";
import { FasesDoNegocioLista } from "./FasesDoNegocioLista";
import { estaAberto } from "./juntarPessoas";
import { ExplicacaoDoPasso } from "./processo/ExplicacaoDoPasso";
import { passoDoItem } from "./processo/passosProcesso";
import { useAcaoDoPasso } from "./processo/processoContexto";
import type { ItemProcesso } from "./processo/tiposProcesso";
import { trabalhoDoItem } from "./processo/trabalhoDoItem";
import { RegistosLigadosNegocio } from "./RegistosLigadosNegocio";
import { Prazo } from "./SeccoesResumo";

const P = "pessoasPagina.";

interface DetalheNegocioFichaProps {
  negocio: NegocioMes;
  hoje: string;
  aoVoltar: () => void;
  /** O item do processo deste negócio: com ele, o passo seguinte tem o botão que o executa (sem ele, só se lê). */
  item?: ItemProcesso;
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
function PerdaDoNegocio({ negocio, fase, motivo }: { negocio: NegocioMes; fase: string; motivo: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/40 p-3">
      <p className="text-[15px] font-medium text-foreground">
        {t("businessGoals.lose.lostIn", { phase: t(`businessGoals.lose.phase.${fase}`), reason: motivo })}
      </p>
      <BotaoAnularPerda negocio={negocio} />
    </div>
  );
}

export function DetalheNegocioFicha({ negocio, hoje, aoVoltar, item }: DetalheNegocioFichaProps) {
  const { t } = useTranslation();
  const titulo = useRef<HTMLHeadingElement>(null);
  // Ao abrir o detalhe, o foco vai para o título (a lista de onde veio já não existe).
  useEffect(() => titulo.current?.focus(), []);
  const perda = useAlteracoesNegocios().perdidos[negocio.id];
  // Perder (ou anular a perda) troca o botão que tinha o foco: o foco passa para o título, em vez de se perder.
  const estavaPerdido = useRef(perda !== undefined);
  useEffect(() => {
    if (estavaPerdido.current === (perda !== undefined)) return;
    estavaPerdido.current = perda !== undefined;
    titulo.current?.focus();
  }, [perda]);
  const detalhe = detalheDoNegocio(negocio.id);
  const [criando, setCriando] = useState(false);
  const podeCriar = estaAberto(negocio) && aceitaOrcamentos(negocio);
  // As fases deste negócio (as da abordagem só aparecem quando existem) e a atual, que é a etiqueta do cabeçalho.
  const registos = useRegistosPessoa();
  const perdidoAntigo = (negocio as { resultado?: string }).resultado === "perdido";
  const fases = fasesDoNegocio(negocio, registos, perda, perdidoAntigo);
  const faseAtual = (fases.find((f) => f.estado === "atual" || f.estado === "perdida") ?? fases[fases.length - 1])?.id;
  return (
    <div className="space-y-6">
      <Button type="button" variant="ghost" className={cn("-ml-3 min-h-11 gap-2", FOCO)} onClick={aoVoltar}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t(`${P}deal.back`)}
      </Button>
      <div className="space-y-3">
        <h3 ref={titulo} tabIndex={-1} className="text-lg font-semibold text-foreground outline-none">{negocio.servico}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{t(`${P}deals.kind.deal`)}</Badge>
          {faseAtual && <Badge variant="secondary">{t(`${P}phases.${faseAtual}`)}</Badge>}
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[15px]">
          <dt className="text-muted-foreground">{t(`${P}detail.value`)}</dt>
          <dd className="font-semibold tabular-nums text-foreground">{formatarMeta("euro", valorDoNegocio(negocio))}</dd>
          <dt className="text-muted-foreground">{t(`${P}detail.rep`)}</dt>
          <dd className="text-foreground">{negocio.comercial}</dd>
        </dl>
      </div>
      <Seccao titulo={t(`${P}phases.title`)} nivel={4}><FasesDoNegocioLista fases={fases} /></Seccao>
      {perda && <PerdaDoNegocio negocio={negocio} fase={perda.fase} motivo={perda.motivo} />}
      {estaAberto(negocio) && <PassoDoNegocio negocio={negocio} hoje={hoje} item={item} />}
      {estaAberto(negocio) && !perda && <BotaoPerderNegocio negocio={negocio} hoje={hoje} className="self-start" />}
      <Seccao titulo={t("businessGoals.journey.title")} nivel={4}><PercursoNegocio negocio={negocio} detalhe={detalhe} /></Seccao>
      <Seccao titulo={t(`${P}linked.title`)} nivel={4}><RegistosLigadosNegocio negocio={negocio} aberto={estaAberto(negocio)} /></Seccao>
      <Seccao titulo={t(`${P}deal.quotes`)} nivel={4}>
        {podeCriar && (
          <Button type="button" variant="outline" className={cn("mb-3 min-h-11 gap-2", FOCO)} onClick={() => setCriando(true)}>
            <FilePlus2 className="h-4 w-4" aria-hidden="true" />
            {t("businessGoals.actions.createQuote")}
          </Button>
        )}
        <OrcamentosPainel negocio={negocio} detalhe={detalhe} />
      </Seccao>
      <NovoOrcamentoDialogo negocio={criando ? negocio : null} hoje={hoje} aoFechar={() => setCriando(false)} />
      {negocio.proposta && <Seccao titulo={t(`${P}deal.proposal`)} nivel={4}><PropostaPainel negocio={negocio} detalhe={detalhe} hoje={hoje} /></Seccao>}
      {negocio.contrato && <Seccao titulo={t(`${P}deal.contract`)} nivel={4}><ContratoPainel negocio={negocio} detalhe={detalhe} /></Seccao>}
    </div>
  );
}
