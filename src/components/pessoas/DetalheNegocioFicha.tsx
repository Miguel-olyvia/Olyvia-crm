// O detalhe de um negócio dentro da ficha: "← Voltar aos negócios", o título, a ligação "Ver no quadro" (só para os
// negócios do quadro) e secções (não abas): próximo passo e prazo, orçamentos e, se existirem, proposta e contrato. Reutiliza
// os painéis de Negócio e metas, com os detalhes de exemplo (ou nenhuns).
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ExternalLink, FilePlus2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
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
import { PropostaPainel } from "@/components/negocio-metas/PropostaPainel";
import { SaudeTag } from "@/components/negocio-metas/SaudeTag";
import { passoDoNegocio } from "./etapaPessoa";
import { estaAberto } from "./juntarPessoas";
import { Prazo } from "./SeccoesResumo";

const P = "pessoasPagina.";

interface DetalheNegocioFichaProps {
  negocio: NegocioMes;
  hoje: string;
  /** O negócio existe no quadro de Negócio e metas: só então há "Ver no quadro". */
  noQuadro: boolean;
  aoVoltar: () => void;
}

/** Próximo passo e prazo de um negócio: o passo, a explicação, o prazo e a saúde. */
/** Só os negócios abertos têm próximo passo: num ganho ou perdido não há nada a fazer. */
function PassoDoNegocio({ negocio, hoje }: { negocio: NegocioMes; hoje: string }) {
  const { t } = useTranslation();
  const id = passoDoNegocio(negocio);
  return (
    <Seccao titulo={t(`${P}deal.next`)} nivel={4}>
      <div className="space-y-1">
        <p className="text-[15px] font-medium text-foreground">{t(`${P}next.${id}`)}</p>
        <p className="text-[15px] text-muted-foreground">{t(`${P}next.${id}.hint`)}</p>
        <Prazo prazo={negocio.proximoPrazo} hoje={hoje} />
        <SaudeTag negocio={negocio} hoje={hoje} />
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

export function DetalheNegocioFicha({ negocio, hoje, noQuadro, aoVoltar }: DetalheNegocioFichaProps) {
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
  return (
    <div className="space-y-6">
      <Button type="button" variant="ghost" className={cn("-ml-3 min-h-11 gap-2", FOCO)} onClick={aoVoltar}>
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t(`${P}deal.back`)}
      </Button>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <h3 ref={titulo} tabIndex={-1} className="text-lg font-semibold text-foreground outline-none">
          {negocio.servico} · {formatarMeta("euro", valorDoNegocio(negocio))}
        </h3>
        {noQuadro && (
          <Link
            to={`/negocio-metas?open=${encodeURIComponent(negocio.id)}`}
            className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-sm text-[15px] text-primary underline underline-offset-2 dark:text-violet-300", FOCO)}
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            {t(`${P}deal.board`)}
          </Link>
        )}
      </div>
      {estaAberto(negocio) && !perda && <BotaoPerderNegocio negocio={negocio} hoje={hoje} className="self-start" />}
      {perda && <PerdaDoNegocio negocio={negocio} fase={perda.fase} motivo={perda.motivo} />}
      {estaAberto(negocio) && <PassoDoNegocio negocio={negocio} hoje={hoje} />}
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
