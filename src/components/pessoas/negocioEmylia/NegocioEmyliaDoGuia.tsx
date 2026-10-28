// O Negócio, o Financeiro e a Obra da Emylia DENTRO da ficha do Pipeline: ocupa o lugar da coluna e do centro do guia (como o assistente da Visita), com a
// mesma barra única de fases e as mesmas «Fases feitas» da ficha. Os componentes e as regras são os da Emylia, sem os editar: os passos da fase
// (passosDaFase), o botão do passo seguinte (BotaoFase, que corre o motor: os gates de cada fase são os dele), as peças do orçamento, da proposta, do
// contrato, da fatura e da obra. Lê e grava pelo armazém (neg_ler_negocios, neg_guardar_negocio). Nada de exemplo: sem o negócio lido, ou com documentos
// do CRM, diz-se em texto. Só leitura = `fieldset disabled` nos controlos de escrita: o conteúdo continua lido pelo leitor de ecrã e os passos navegam-se.
// O estado da gravação e os avisos do motor (porque é que um clique foi recusado) têm a sua região viva aqui.
import { useState, type ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import "@/emylia/prototipo.css";
import "@/emylia/blocosPagina.css";
import { BotaoFase, passosDaFase, temBotaoFase } from "@/emylia/PaginaNegocio";
import { OrcamentoSimples } from "@/emylia/OrcamentoSimples";
import { PedidoDoCliente } from "@/emylia/PedidoDoCliente";
import { ContratoDoc, Partilhar, PropostaDoc } from "@/emylia/DocsCliente";
import { DocumentosSimples } from "@/emylia/FasesSimples";
import { proximo, type Negocio } from "@/emylia/motor";
import type { Ctx } from "@/emylia/pecas";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { FasesFeitasNav } from "../GuiaColuna";
import { CENTRO_QUE_ROLA, LATERAL_FIXA } from "../layoutGuia";
import type { FaseFeita } from "../processo/passoGuiado";
import type { AvisoEmylia } from "./armazemNegocioEmylia";
import { EstadoHonesto } from "./EstadoHonesto";
import type { FaseEmylia } from "./faseEmylia";
import { PainelPosContrato, SoParaLer } from "./PainelPosContrato";
import { usePermissoesPosContrato } from "./permissoesPosContrato";
import { linhasDaPonte, type FactosDaAbordagem } from "./ponteDaAbordagem";
import type { NegocioEmylia } from "./useNegocioEmylia";

const P = "pessoasPagina.";
const N = "pessoasPagina.real.neg.";

interface NegocioEmyliaDoGuiaProps {
  /** A fase que se vê: a atual ou uma fase feita da Emylia. */
  fase: FaseEmylia;
  atual: FaseEmylia;
  e: NegocioEmylia;
  org: string | null;
  /** `pessoas.edit` neste negócio (o mesmo que o guia usa). */
  podeEditar: boolean;
  feitas: readonly FaseFeita[];
  /** A fase feita que se vê; `null` quando se vê a atual. */
  faseVista: string | null;
  aoVerFase: (id: string) => void;
  aoVoltarAoAtual: () => void;
  nivel: "h2" | "h3";
  extra?: ReactNode;
  /** O que a abordagem tem, para dizer o que chega ao negócio. */
  abordagem: FactosDaAbordagem;
  /** O negócio está a passar de Visita a Negócio (a gravar a fase 3). */
  aPassar?: boolean;
  /** Tentar outra vez a passagem ou a gravação que falhou. */
  repetirGravacao?: () => void;
}

function PonteDaAbordagem({ d, abordagem }: { d: Negocio | undefined; abordagem: FactosDaAbordagem }) {
  const { t } = useTranslation();
  return (
    <details className="rounded-xl border border-border bg-card p-3 text-[15px]">
      <summary className="cursor-pointer font-medium text-foreground">{t(`${N}ponte.titulo`)}</summary>
      <ul className="mt-2 space-y-1">
        {linhasDaPonte(d, abordagem).map((l) => (
          <li key={l.id} className="flex flex-wrap gap-x-2">
            <span className="font-medium">{t(`${N}ponte.rotulo.${l.id}`)}</span>
            <span className="text-muted-foreground">
              {t(`${N}ponte.estado.${l.estado}`)}
              {l.estado === "soNoCrm" ? ` · ${l.id === "email" ? t(`${N}ponte.detalhe.email`) : t(`${N}ponte.detalhe.contado`, { n: l.n ?? 0 })}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Os avisos do motor (porque é que uma ação foi recusada, o que ficou feito): uma região viva; os maus avisam logo (alert). */
function Avisos({ avisos }: { avisos: readonly AvisoEmylia[] }) {
  const { t } = useTranslation();
  if (avisos.length === 0) return null;
  return (
    <div aria-label={t(`${N}avisos`)} className="space-y-2">
      {avisos.map((a) => (
        <div key={a.id} role={a.kind === "bad" ? "alert" : "status"} className={cn("rounded-lg border p-3 text-[15px]", a.kind === "bad" ? "border-destructive/40 bg-destructive/5" : "border-border bg-muted/40")}>
          <p className="font-medium text-foreground">{a.msg}</p>
          {a.sub && <p className="text-muted-foreground">{a.sub}</p>}
        </div>
      ))}
    </div>
  );
}

/** O negócio no Negócio (Orçamento, Proposta, Contrato): os passos da Emylia, um de cada vez, e o botão do passo seguinte no fim. */
function PassosDoNegocio({ ctx, d, soLeitura }: { ctx: Ctx; d: Negocio; soLeitura: boolean }) {
  const { t } = useTranslation();
  const passos = passosDaFase(ctx, d, true);
  const comFim = temBotaoFase(ctx, d);
  const primeiro = Math.max(0, passos.findIndex((p) => (p.conta ? p.conta.f < p.conta.n : !p.feito)));
  // só conta a escolha do utilizador: o resto deriva (o motor avança e o passo por fazer muda sem arrastar quem está a ler outro)
  const [escolhido, setEscolhido] = useState<number | null>(null);
  const ativo = escolhido ?? primeiro;
  const fim = ativo >= passos.length;
  const atual = passos[Math.min(ativo, passos.length - 1)];
  const p = proximo(d, ctx.S);
  const classe = (i: number): string => cn("flex min-h-11 w-full items-center rounded-lg px-3 text-left text-[15px] hover:bg-muted", FOCO, i === ativo && "bg-muted font-semibold");
  return (
    <div className="grid gap-4 lg:grid-cols-[200px_minmax(0,1fr)]">
      <nav aria-label={t(`${N}passos`)}>
        <ul className="m-0 list-none space-y-0.5 p-0">
          {passos.map((x, i) => (
            <li key={x.id}><button type="button" aria-current={i === ativo ? "step" : undefined} className={classe(i)} onClick={() => setEscolhido(i)}>{x.titulo}</button></li>
          ))}
          {comFim && <li><button type="button" aria-current={fim ? "step" : undefined} className={classe(passos.length)} onClick={() => setEscolhido(passos.length)}>{t(`${N}fim`)}</button></li>}
        </ul>
      </nav>
      <SoParaLer ativo={soLeitura}>
        <div className="min-w-0 space-y-4">
          <PedidoDoCliente ctx={ctx} d={d} />
          {!fim && atual ? <div id="passo-corpo">{atual.corpo}</div> : (
            <div className="space-y-3">
              <p className="text-lg font-semibold">{p.t}</p>
              {p.sub && <p className="text-muted-foreground">{p.sub}</p>}
              {comFim && <BotaoFase ctx={ctx} d={d} />}
            </div>
          )}
          {!fim && comFim && <div className="border-t border-border/60 pt-3"><BotaoFase ctx={ctx} d={d} tamanho="default" /></div>}
        </div>
      </SoParaLer>
    </div>
  );
}

/** Uma fase feita, para ler: o mesmo documento que a Emylia mostra numa fase feita (NegocioSimples). Sem o documento na base, diz-se. */
function FaseLida({ ctx, d, fase }: { ctx: Ctx; d: Negocio; fase: FaseEmylia }) {
  const { t } = useTranslation();
  const o = d.orc;
  if (fase === "orcamento") return o ? <OrcamentoSimples {...ctx} d={d} /> : <EstadoHonesto titulo={t(`${N}semOrcamento`)} />;
  if (fase === "proposta") {
    return o ? <Partilhar ctx={ctx} d={d} tipo="proposta" estado={o.aceite ? `aceite ${o.aceite}` : "enviada"}><PropostaDoc S={ctx.S} d={d} /></Partilhar> : <EstadoHonesto titulo={t(`${N}semProposta`)} />;
  }
  if (fase === "contrato") {
    if (!o || o.vendaDireta) return <EstadoHonesto titulo={t(`${N}semContrato`)}>{o?.vendaDireta ? t(`${N}vendaDireta`) : undefined}</EstadoHonesto>;
    return <Partilhar ctx={ctx} d={d} tipo="contrato" estado={o.contrato === "assinado" ? "assinado" : "enviado"}><ContratoDoc S={ctx.S} d={d} /></Partilhar>;
  }
  if (fase === "financeiro") return <DocumentosSimples {...ctx} d={d} />;
  return <EstadoHonesto titulo={t(`${N}obraNaoAcabou`)} />;
}

export function NegocioEmyliaDoGuia({ fase, atual, e, org, podeEditar, feitas, faseVista, aoVerFase, aoVoltarAoAtual, nivel, extra, abordagem, aPassar = false, repetirGravacao }: NegocioEmyliaDoGuiaProps) {
  const { t } = useTranslation();
  const Titulo = nivel;
  const pode = usePermissoesPosContrato(org, e.ctx?.S ?? null, podeEditar);
  const verFeita = faseVista !== null;
  const { d, ctx } = e;
  const soLeitura = e.docsCrm || !pode.gravar;
  const botaoTentar = (aoClicar: () => void, rotulo: string): ReactNode => (
    <button type="button" onClick={aoClicar} className={cn("min-h-11 rounded-lg border border-input px-4 font-medium", FOCO)}>{rotulo}</button>
  );
  let corpo: ReactNode;
  if (e.leitura.k === "a-ler") corpo = <p role="status" className="text-[15px] text-muted-foreground">{t(`${N}aLer`)}</p>;
  else if (e.leitura.k === "erro") {
    corpo = (
      <div role="alert" className="space-y-2 rounded-xl border border-destructive/30 p-4 text-[15px]">
        <p className="text-destructive">{t(`${N}erroLer`, { erro: e.leitura.t })}</p>
        {botaoTentar(() => { e.reler(); }, t(`${N}tentar`))}
      </div>
    );
  } else if (!d || !ctx) {
    corpo = (
      <EstadoHonesto titulo={t(`${N}porLer.titulo`)}>
        {t(`${N}porLer.texto`)} {botaoTentar(() => { e.reler(); }, t(`${N}tentar`))}
      </EstadoHonesto>
    );
  } else if (e.docsCrm) corpo = <EstadoHonesto titulo={t(`${N}crm.titulo`)}>{t(`${N}crm.texto`)}</EstadoHonesto>;
  else if (verFeita) corpo = <SoParaLer ativo><FaseLida ctx={ctx} d={d} fase={fase} /></SoParaLer>;
  else if (fase === "financeiro" || fase === "obra") corpo = <PainelPosContrato ctx={ctx} d={d} podeGravar={pode.gravar} />;
  else corpo = <PassosDoNegocio key={d.fase} ctx={ctx} d={d} soLeitura={soLeitura} />;

  const mostrarEstado = d !== undefined && !e.docsCrm && !verFeita;
  return (
    <>
      <div className={cn("md:self-start", LATERAL_FIXA)}>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">{t(`${P}phases.${verFeita ? fase : atual}`)}</p>
          <FasesFeitasNav feitas={feitas} faseVista={faseVista} aoVerFase={aoVerFase} />
        </div>
      </div>
      <div role="region" aria-label={t(`${P}guia.centro`)} tabIndex={0} data-guia-centro="" className={cn(CENTRO_QUE_ROLA, FOCO)}>
        <div className="pn pg-root space-y-4 py-1 md:px-2">
          <p className="text-sm text-muted-foreground">{verFeita ? t(`${N}faseFeita`) : t(`${N}negocio`)}</p>
          <Titulo tabIndex={-1} className="text-2xl font-bold leading-tight tracking-tight text-foreground outline-none md:text-[28px]">{t(`${P}phases.${fase}`)}</Titulo>
          {/* o estado da gravação e os avisos do motor: regiões vivas, sempre à vista (o motor diz porque recusou um clique) */}
          <div role="status" aria-live="polite" className="space-y-2 text-sm empty:hidden">
            {aPassar && e.gravacao.k !== "erro" && <p className="text-muted-foreground">{t(`${N}aPassar`)}</p>}
            {mostrarEstado && e.gravacao.k === "a-gravar" && <p className="text-muted-foreground">{t(`${N}aGravar`)}</p>}
            {mostrarEstado && e.gravacao.k === "gravado" && e.gravacao.n > 0 && <p className="text-muted-foreground">{t(`${N}gravado`)}</p>}
          </div>
          {mostrarEstado && e.gravacao.k === "erro" && (
            <div role="alert" className="space-y-2 rounded-xl border border-destructive/30 p-3 text-[15px]">
              <p className="text-destructive">{t(`${N}naoGravou`, { erro: e.gravacao.t })}</p>
              {repetirGravacao && botaoTentar(repetirGravacao, t(`${N}gravarOutraVez`))}
            </div>
          )}
          <Avisos avisos={e.avisos} />
          {d && !e.docsCrm && pode.falhou && (
            <div role="alert" className="space-y-2 rounded-xl border border-destructive/30 p-3 text-[15px]">
              <p className="text-destructive">{t(`${N}permissoesFalharam`)}</p>
              {botaoTentar(pode.repetir, t(`${N}tentar`))}
            </div>
          )}
          {d && !e.docsCrm && !pode.falhou && !pode.gravar && !verFeita && <EstadoHonesto titulo={t(`${N}soLeitura.titulo`)}>{t(`${N}soLeitura.texto`)}</EstadoHonesto>}
          {!verFeita && fase === "orcamento" && <PonteDaAbordagem d={d} abordagem={abordagem} />}
          {corpo}
          {verFeita && (
            <div className="border-t border-border/60 pt-4">
              <Button type="button" className={cn("min-h-11 gap-2 rounded-lg px-6 font-semibold", FOCO)} onClick={aoVoltarAoAtual}>
                {t(`${P}guia.anterior.voltar`)}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          )}
          {!verFeita && extra}
        </div>
      </div>
    </>
  );
}
