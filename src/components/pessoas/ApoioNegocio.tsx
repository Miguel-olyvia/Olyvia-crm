// O que o detalhe de um negócio tem para além do passo: as secções recolhíveis (Percurso, Registos ligados, Orçamentos, Proposta e Contrato). No exemplo
// (sem guia) ficam por baixo do estado do negócio; na ficha real (com o guia) já não estão à vista: abrem a pedido nos «Detalhes do negócio», um diálogo
// por cima, a partir do menu «Mais».
import { useState } from "react";
import { FilePlus2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { registosDoNegocio, registosPorLigar, totalDeRegistos } from "@/components/negocio-metas/acoesRegistos";
import { ContratoPainel } from "@/components/negocio-metas/ContratoPainel";
import { useDadosNegocio } from "@/components/negocio-metas/costuraNegocio";
import { FOCO } from "@/components/negocio-metas/estilos";
import { formatarMeta } from "@/components/negocio-metas/formatoMetas";
import { NovoOrcamentoDialogo } from "@/components/negocio-metas/NovoOrcamentoDialogo";
import { aceitaOrcamentos } from "@/components/negocio-metas/negocioAcoes";
import { useDetalheDoNegocio } from "@/components/negocio-metas/negociosAlterados";
import { valorDoNegocio, type NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { OrcamentosPainel } from "@/components/negocio-metas/OrcamentosPainel";
import { PercursoNegocio } from "@/components/negocio-metas/PercursoPainel";
import { PropostaPainel } from "@/components/negocio-metas/PropostaPainel";
import { useRegistosPessoa } from "@/components/negocio-metas/registosPessoa";
import { AbrirDocumento } from "./AbrirDocumento";
import { CondicoesDaProposta } from "./CondicoesDaProposta";
import type { IdFase } from "./fasesDoNegocio";
import { estaAberto } from "./juntarPessoas";
import { RegistosLigadosNegocio } from "./RegistosLigadosNegocio";
import { SeccaoRecolhivel } from "./SeccaoRecolhivel";

const P = "pessoasPagina.";

export type SecaoDetalhe = "percurso" | "registos" | "orcamentos" | "proposta" | "contrato";

/** A secção de detalhes que vem aberta: a da fase em que o negócio está; num negócio ganho ou perdido, o percurso. */
export function secaoAberta(fase: IdFase | undefined, terminado: boolean): SecaoDetalhe {
  if (terminado) return "percurso";
  if (fase === "orcamento") return "orcamentos";
  if (fase === "proposta") return "proposta";
  if (fase === "contrato") return "contrato";
  if (fase === "levantamento") return "registos";
  return "percurso";
}

/** As secções recolhíveis do negócio: só a da fase em que está vem aberta; as outras ficam a uma linha de resumo. */
export function DetalhesRecolhiveis({ negocio, hoje, aberta }: { negocio: NegocioMes; hoje: string; aberta: SecaoDetalhe }) {
  const { t } = useTranslation();
  const detalhe = useDetalheDoNegocio(negocio.id);
  const [criando, setCriando] = useState(false);
  // Só o exemplo tem «Criar orçamento»: o diálogo grava em memória. Na ficha real o orçamento cria-se pelo passo do processo (editor real).
  const emExemplo = useDadosNegocio() === null;
  const podeCriar = emExemplo && estaAberto(negocio) && aceitaOrcamentos(negocio);
  const registos = useRegistosPessoa();
  const ligados = totalDeRegistos(registosDoNegocio(registos, negocio.id));
  const porLigar = totalDeRegistos(registosPorLigar(registos, negocio.pessoaId ?? ""));
  const nOrcamentos = negocio.orcamentos.length;
  const valor = formatarMeta("euro", valorDoNegocio(negocio));
  const resumoOrcamentos = nOrcamentos === 0 ? t(`${P}detail.quotes.none`) : nOrcamentos === 1 ? t(`${P}detail.quotes.one`, { value: valor }) : t(`${P}detail.quotes.many`, { count: nOrcamentos, value: valor });
  const resumoLigados = estaAberto(negocio) ? t(`${P}detail.linkedSummary`, { linked: ligados, toLink: porLigar }) : t(`${P}detail.linkedSummaryClosed`, { linked: ligados });
  return (
    <>
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
    </>
  );
}
