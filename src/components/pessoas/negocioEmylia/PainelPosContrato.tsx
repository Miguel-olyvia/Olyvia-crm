// O que a página /negocios põe à volta dos passos do Financeiro e da Obra, montado no Pipeline: o caminho da obra, os trabalhos a mais, anular o contrato e o histórico
// (os passos em si, com a fatura, o pagamento e o plano, são da FaseDaEmylia). Os componentes e as regras são os da Emylia, sem os alterar, e a gravação é a mesma
// (neg_guardar_negocio, pelo armazém do Ben): o motor regista a fatura, o pagamento e o recibo no próprio negócio. Só o que a Emylia já mostra como não ligado fica como
// ela mostra: na Obra, o plano só vive em memória (e sem plano diz-se). Sem permissão fica em leitura (`fieldset disabled`: o conteúdo continua lido).
import { useState, type ReactNode } from "react";
import "@/emylia/prototipo.css";
import "@/emylia/blocosPagina.css";
import { FASES, type Negocio } from "@/emylia/motor";
import type { Ctx } from "@/emylia/pecas";
import { DocumentosSimples } from "@/emylia/FasesSimples";
import { CaminhoObra } from "@/emylia/CaminhoObra";
import { TrabalhosAMais } from "@/emylia/TrabalhosAMais";
import { ConfirmarAnulacao, oQueAnular, podeAnular } from "@/emylia/AnularContrato";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { EstadoHonesto } from "./EstadoHonesto";
import { podeMontarObra, temPlanoDaObra } from "./protegerObra";
import { SoParaLer } from "./SoParaLer";

const R = "pessoasPagina.real.neg.painel.";

interface PainelPosContratoProps {
  ctx: Ctx;
  d: Negocio;
  /** Pode gravar (permissão da ficha e permissões da base lidas com sucesso). */
  podeGravar: boolean;
}

/** O painel só existe a partir do Financeiro: antes, o guia do Pipeline é o que manda. */
export const temPainelPosContrato = (d: Negocio | undefined): d is Negocio => d !== undefined && d.fase >= 4 && !d.perdido;

function Bloco({ id, titulo, children }: { id: string; titulo: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h3 id={id} className="text-[17px] font-semibold tracking-tight">{titulo}</h3>
      {children}
    </section>
  );
}

/** O histórico do negócio («Últimos acontecimentos» da página de Negócios). */
export function HistoricoDoNegocio({ d }: { d: Negocio }) {
  const { t } = useTranslation();
  return (
    <Bloco id="pn-hist" titulo={t(`${R}historico`)}>
      {d.hist.length === 0 ? <p className="text-[15px] text-muted-foreground">{t(`${R}semHistorico`)}</p> : (
        <ol className="space-y-2">
          {d.hist.slice(0, 8).map((h, i) => (
            <li key={d.hist.length - i} className="text-[15px] leading-snug">{h.t}<span className="block text-sm text-muted-foreground">{h.q}</span></li>
          ))}
        </ol>
      )}
    </Bloco>
  );
}

export function PainelPosContrato({ ctx, d, podeGravar }: PainelPosContratoProps) {
  const { t } = useTranslation();
  const [anular, setAnular] = useState(false);
  const noObra = d.fase >= 5;
  return (
    <div className="pn pg-root space-y-8" aria-label={t(`${R}regiao`, { fase: FASES[d.fase] })} role="region">
      <SoParaLer ativo={!podeGravar}>
        {noObra && (
          <>
            {/* a fase já feita abre em leitura: sempre desligada, mas lida */}
            <SoParaLer ativo>
              <Bloco id="pn-fin-feito" titulo={t(`${R}financeiroFeito`)}><DocumentosSimples {...ctx} d={d} /></Bloco>
            </SoParaLer>
            {podeMontarObra(d)
              ? <EstadoHonesto titulo={t(`${R}planoNoEcra.titulo`)}>{t(`${R}planoNoEcra.texto`)}</EstadoHonesto>
              : <Bloco id="pn-obra" titulo={t(`${R}obra`)}><EstadoHonesto titulo={t(`${R}semPlano.titulo`)}>{t(`${R}semPlano.texto`)}</EstadoHonesto></Bloco>}
          </>
        )}
        {temPlanoDaObra(d) && <CaminhoObra {...ctx} d={d} />}
        <Bloco id="pn-adendas" titulo={t(`${R}adendas`)}>
          <TrabalhosAMais {...ctx} d={d} />
        </Bloco>
        {/* anular o contrato (ou a venda), como no menu «Mais» da página de Negócios: a Emylia diz quando se pode e pede o motivo */}
        {podeAnular(d) && (
          <Bloco id="pn-anular" titulo={t(`${R}anular`)}>
            <Button type="button" variant="outline" aria-expanded={anular} onClick={() => setAnular(!anular)} className={cn("min-h-11 text-destructive", FOCO)}>
              {t(`${R}anularBotao`, { oque: oQueAnular(d) })}
            </Button>
            {anular && <ConfirmarAnulacao ctx={ctx} d={d} fechar={() => setAnular(false)} />}
          </Bloco>
        )}
      </SoParaLer>
      <HistoricoDoNegocio d={d} />
    </div>
  );
}
