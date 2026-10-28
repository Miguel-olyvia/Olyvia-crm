// A fase Visita da ficha do Pipeline com a lógica da Emylia (a mesma do passo Visita de /negocios): as escolhas mexem no orçamento ao vivo («+ X € no orçamento · motivo»),
// a lista de passos à esquerda tem o progresso (Visitas, Exterior, Interior, Área, Medidas, Necessidades) e «Fechar o levantamento» é o botão da Emylia. O
// levantamento continua CONFIGURÁVEL: as perguntas do questionário da organização entram como passos (as ligadas a um campo da Emylia aparecem como esse campo) e cada
// resposta aplica o efeito que a organização configurou (visitaConfiguravel/). Lê e grava pelo armazém (neg_ler_negocios, neg_guardar_negocio); nada por outro caminho.
// FONTE DAS RESPOSTAS (por decidir, não resolvido): aqui as respostas configuráveis ficam só em negocio_respostas (cfg_<pergunta>, neg_guardar_negocio); o levantamento da
// ficha (VisitaDoGuia, neg_guardar_levantamento) NÃO é escrito nem lido por este ecrã, por isso os dois armazéns podem discordar consoante o ecrã por onde se entra.
// Só entra quando o negócio existe na Emylia e não tem documentos do CRM; senão a ficha mostra o assistente de sempre (VisitaDoGuia).
import type { ReactNode } from "react";
import "@/emylia/prototipo.css";
import "@/emylia/blocosPagina.css";
import { Button } from "@/components/ui/button";
import { useQuestionario } from "@/components/negocio-metas/QuestionarioContexto";
import { FOCO } from "@/components/negocio-metas/estilos";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { FasesFeitasNav } from "../GuiaColuna";
import { CENTRO_QUE_ROLA, LATERAL_FIXA } from "../layoutGuia";
import type { FaseFeita } from "../processo/passoGuiado";
import { EstadoHonesto } from "./EstadoHonesto";
import { FaseDaEmylia } from "./FaseDaEmylia";
import { Avisos, CabecalhoDoNegocio } from "./NegocioEmyliaDoGuia";
import { usePermissoesPosContrato } from "./permissoesPosContrato";
import type { NegocioEmylia } from "./useNegocioEmylia";
import { comPassosConfiguraveis } from "./visitaConfiguravel/passosVisitaConfiguravel";
import { AvisoQuestionario } from "./visitaConfiguravel/AvisoQuestionario";
import { useCtxComEfeitos } from "./visitaConfiguravel/useCtxComEfeitos";

const N = "pessoasPagina.real.neg.";
/** A fase da Emylia em que se faz a visita (o motor chama-lhe Visita). */
const FASE_VISITA = 2;

interface VisitaDaEmyliaProps {
  e: NegocioEmylia;
  org: string | null;
  /** `pessoas.edit` neste negócio (o mesmo que o guia usa). */
  podeEditar: boolean;
  faseRotuloChave: string;
  feitas: readonly FaseFeita[];
  aoVerFase: (id: string) => void;
  nivel: "h2" | "h3";
  extra?: ReactNode;
  /** Tentar outra vez a gravação que falhou. */
  repetirGravacao?: () => void;
}

/**
 * A visita faz-se na Emylia: a organização está a ser lida (o ecrã diz-o) ou o negócio existe, é só da base (sem documentos do CRM), não está perdido e ainda
 * é da visita. Com a leitura em erro, ou sem o negócio, fica o assistente de sempre (VisitaDoGuia), que não depende da Emylia.
 */
export const podeFazerVisitaNaEmylia = (e: NegocioEmylia): boolean => {
  if (e.leitura.k === "a-ler") return true;
  return e.leitura.k === "pronto" && e.d !== undefined && e.ctx !== null && !e.docsCrm && !e.d.perdido && e.d.fase <= FASE_VISITA;
};

export function VisitaDaEmylia({ e, org, podeEditar, faseRotuloChave, feitas, aoVerFase, nivel, extra, repetirGravacao }: VisitaDaEmyliaProps) {
  const { t } = useTranslation();
  const Titulo = nivel;
  const pode = usePermissoesPosContrato(org, e.ctx?.S ?? null, podeEditar);
  const { questionario, estado } = useQuestionario();
  const ctx = useCtxComEfeitos(e.ctx);
  const d = e.d;
  const botao = (aoClicar: () => void, rotulo: string): ReactNode => (
    <button type="button" onClick={aoClicar} className={cn("min-h-11 rounded-lg border border-input px-4 font-medium", FOCO)}>{rotulo}</button>
  );
  const fasesFeitas = <FasesFeitasNav feitas={feitas} faseVista={null} aoVerFase={aoVerFase} />;
  const soLeitura = e.docsCrm || !pode.gravar;
  const topo = (
    <>
      <p className="text-sm text-muted-foreground">{t(`${N}negocio`)}</p>
      <Titulo tabIndex={-1} className="text-2xl font-bold leading-tight tracking-tight text-foreground outline-none md:text-[28px]">{t(faseRotuloChave)}</Titulo>
      {d && ctx && <CabecalhoDoNegocio ctx={ctx} d={d} />}
      <div role="status" aria-live="polite" className="space-y-2 text-sm empty:hidden">
        {e.gravacao.k === "a-gravar" && <p className="text-muted-foreground">{t(`${N}aGravar`)}</p>}
        {e.gravacao.k === "gravado" && e.gravacao.n > 0 && <p className="text-muted-foreground">{t(`${N}gravado`)}</p>}
      </div>
      {e.gravacao.k === "erro" && (
        <div role="alert" className="space-y-2 rounded-xl border border-destructive/30 p-3 text-[15px]">
          <p className="text-destructive">{t(`${N}naoGravou`, { erro: e.gravacao.t })}</p>
          {repetirGravacao && botao(repetirGravacao, t(`${N}gravarOutraVez`))}
        </div>
      )}
      <AvisoQuestionario />
      <Avisos avisos={e.avisos} />
      {pode.falhou && (
        <div role="alert" className="space-y-2 rounded-xl border border-destructive/30 p-3 text-[15px]">
          <p className="text-destructive">{t(`${N}permissoesFalharam`)}</p>
          {botao(pode.repetir, t(`${N}tentar`))}
        </div>
      )}
      {!pode.falhou && !pode.gravar && <EstadoHonesto titulo={t(`${N}soLeitura.titulo`)}>{t(`${N}soLeitura.texto`)}</EstadoHonesto>}
    </>
  );

  if (!d || !ctx) {
    // a organização ainda está a ser lida: diz-se, no mesmo sítio onde vão os passos (nada de exemplo a parecer real)
    return (
      <>
        <div className={cn("md:self-start", LATERAL_FIXA)}>
          <div className="rounded-xl border border-border bg-card p-3 shadow-sm">{fasesFeitas}</div>
        </div>
        <div role="region" aria-label={t("pessoasPagina.guia.centro")} tabIndex={0} data-guia-centro="" className={cn(CENTRO_QUE_ROLA, FOCO)}>
          <div className="pn pg-root space-y-4 py-1 md:px-2">
            {topo}
            <p role="status" className="text-[15px] text-muted-foreground">{t(`${N}aLer`)}</p>
            {extra}
          </div>
        </div>
      </>
    );
  }
  // com o negócio ainda no contacto, a visita só passa para a Emylia quando a pessoa o decide (abrir a ficha nunca grava nada)
  if (d.fase < FASE_VISITA) {
    return (
      <>
        <div className={cn("md:self-start", LATERAL_FIXA)}>
          <div className="rounded-xl border border-border bg-card p-3 shadow-sm">{fasesFeitas}</div>
        </div>
        <div role="region" aria-label={t("pessoasPagina.guia.centro")} tabIndex={0} data-guia-centro="" className={cn(CENTRO_QUE_ROLA, FOCO)}>
          <div className="pn pg-root space-y-4 py-1 md:px-2">
            {topo}
            <EstadoHonesto titulo={t(`${N}visita.comecar.titulo`)}>
              {t(`${N}visita.comecar.texto`)}{" "}
              <Button type="button" size="lg" disabled={soLeitura} onClick={() => ctx.run(() => { if (d.fase < FASE_VISITA) ctx.A.marcarVisita(d.id); })}>
                {t(`${N}visita.comecar.botao`)}
              </Button>
            </EstadoHonesto>
            {extra}
          </div>
        </div>
      </>
    );
  }
  return (
    <FaseDaEmylia
      key={`visita:${d.fase}`} ctx={ctx} d={d} soLeitura={soLeitura} topo={topo} fasesFeitas={fasesFeitas} extra={extra}
      ajustarPassos={(passos) => comPassosConfiguraveis(passos, ctx, d, estado === "pronto" ? questionario : null)}
    />
  );
}
