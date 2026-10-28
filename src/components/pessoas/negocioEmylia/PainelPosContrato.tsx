// O conteúdo do negócio da Emylia depois do contrato, montado no Pipeline: Financeiro (fatura, pagamento, prestações, adendas) e Obra (plano,
// caminho, trabalhos a mais). Os componentes são os da Emylia, sem os alterar; o que a base ainda não faz (as fases 2 a 5 do plano do Ben) diz-se
// em texto (EstadoHonesto) e os botões que dependiam disso não aparecem. Sem permissão fica em leitura: um `fieldset disabled` desliga os controlos
// de escrita e deixa o resto lido pelo leitor de ecrã (nunca `inert`). O estado da gravação, os avisos e as permissões são do wrapper (NegocioEmyliaDoGuia).
import type { ReactNode } from "react";
import "@/emylia/prototipo.css";
import "@/emylia/blocosPagina.css";
import { FASES, type Negocio } from "@/emylia/motor";
import type { Ctx } from "@/emylia/pecas";
import { DocumentosSimples, ObraSimples } from "@/emylia/FasesSimples";
import { CaminhoObra } from "@/emylia/CaminhoObra";
import { TrabalhosAMais } from "@/emylia/TrabalhosAMais";
import { BotaoFase, temBotaoFase } from "@/emylia/PaginaNegocio";
import { useTranslation } from "@/hooks/useTranslation";
import { EstadoHonesto } from "./EstadoHonesto";
import { podeMontarObra, proximoSeguro, temPlanoDaObra } from "./protegerObra";

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

/** Só leitura sem esconder: os controlos de escrita ficam desligados e o conteúdo continua à vista e lido. */
export function SoParaLer({ ativo, children }: { ativo: boolean; children: ReactNode }) {
  return <fieldset disabled={ativo} className="m-0 min-w-0 space-y-8 border-0 p-0">{children}</fieldset>;
}

export function PainelPosContrato({ ctx, d, podeGravar }: PainelPosContratoProps) {
  const { t } = useTranslation();
  const noFinanceiro = d.fase === 4;
  const noObra = d.fase >= 5;
  const p = proximoSeguro(d, ctx.S);
  const comBotao = (noFinanceiro || podeMontarObra(d)) && temBotaoFase(ctx, d) && !p.wait;
  return (
    <div className="pn pg-root space-y-8" aria-label={t(`${R}regiao`, { fase: FASES[d.fase] })} role="region">
      <SoParaLer ativo={!podeGravar}>
        {noFinanceiro && (
          <Bloco id="pn-fin" titulo={t(`${R}fatura`)}>
            <DocumentosSimples {...ctx} d={d} />
            {comBotao && <BotaoFase ctx={ctx} d={d} tamanho="default" />}
            <EstadoHonesto titulo={t(`${R}encomenda.titulo`)}>{t(`${R}encomenda.texto`)}</EstadoHonesto>
          </Bloco>
        )}
        {noObra && (
          <>
            {/* a fase já feita abre em leitura: sempre desligada, mas lida */}
            <SoParaLer ativo>
              <Bloco id="pn-fin-feito" titulo={t(`${R}financeiroFeito`)}><DocumentosSimples {...ctx} d={d} /></Bloco>
            </SoParaLer>
            <Bloco id="pn-obra" titulo={t(`${R}obra`)}>
              {podeMontarObra(d) ? (
                <>
                  <EstadoHonesto titulo={t(`${R}planoNoEcra.titulo`)}>{t(`${R}planoNoEcra.texto`)}</EstadoHonesto>
                  <ObraSimples {...ctx} d={d} />
                  {temPlanoDaObra(d) && <CaminhoObra {...ctx} d={d} />}
                  {comBotao && <BotaoFase ctx={ctx} d={d} tamanho="default" />}
                </>
              ) : <EstadoHonesto titulo={t(`${R}semPlano.titulo`)}>{t(`${R}semPlano.texto`)}</EstadoHonesto>}
            </Bloco>
          </>
        )}
        <Bloco id="pn-adendas" titulo={t(`${R}adendas`)}>
          <TrabalhosAMais {...ctx} d={d} />
        </Bloco>
      </SoParaLer>
      <Bloco id="pn-anular" titulo={t(`${R}anular`)}><EstadoHonesto titulo={t(`${R}anular.titulo`)}>{t(`${R}anular.texto`)}</EstadoHonesto></Bloco>
      <Bloco id="pn-hist" titulo={t(`${R}historico`)}>
        {d.hist.length === 0 ? <p className="text-[15px] text-muted-foreground">{t(`${R}semHistorico`)}</p> : (
          <ol className="space-y-2">
            {d.hist.slice(0, 8).map((h, i) => (
              <li key={d.hist.length - i} className="text-[15px] leading-snug">{h.t}<span className="block text-sm text-muted-foreground">{h.q}</span></li>
            ))}
          </ol>
        )}
      </Bloco>
    </div>
  );
}
