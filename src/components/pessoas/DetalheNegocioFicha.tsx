// O detalhe de um negócio dentro da ficha: "← Voltar aos negócios", o título, a ligação "Ver no quadro" (só para os
// negócios do quadro) e secções (não abas): próximo passo e prazo, orçamentos e, se existirem, proposta e contrato. Reutiliza
// os painéis de Negócio e metas, com os detalhes de exemplo (ou nenhuns).
import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Seccao } from "@/components/ficha-comum/Seccao";
import { ContratoPainel } from "@/components/negocio-metas/ContratoPainel";
import { FOCO } from "@/components/negocio-metas/estilos";
import { formatarMeta } from "@/components/negocio-metas/formatoMetas";
import { DETALHES_EXEMPLO } from "@/components/negocio-metas/negocioDetalhesExemplo";
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

export function DetalheNegocioFicha({ negocio, hoje, noQuadro, aoVoltar }: DetalheNegocioFichaProps) {
  const { t } = useTranslation();
  const titulo = useRef<HTMLHeadingElement>(null);
  // Ao abrir o detalhe, o foco vai para o título (a lista de onde veio já não existe).
  useEffect(() => titulo.current?.focus(), []);
  const detalhe = DETALHES_EXEMPLO[negocio.id] ?? null;
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
      {estaAberto(negocio) && <PassoDoNegocio negocio={negocio} hoje={hoje} />}
      <Seccao titulo={t(`${P}deal.quotes`)} nivel={4}><OrcamentosPainel negocio={negocio} detalhe={detalhe} /></Seccao>
      {negocio.proposta && <Seccao titulo={t(`${P}deal.proposal`)} nivel={4}><PropostaPainel negocio={negocio} detalhe={detalhe} hoje={hoje} /></Seccao>}
      {negocio.contrato && <Seccao titulo={t(`${P}deal.contract`)} nivel={4}><ContratoPainel negocio={negocio} detalhe={detalhe} /></Seccao>}
    </div>
  );
}
