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
import { OrcamentoSimples } from "@/emylia/OrcamentoSimples";
import { ContratoDoc, Partilhar, PropostaDoc } from "@/emylia/DocsCliente";
import { DocumentosSimples } from "@/emylia/FasesSimples";
import { Campos } from "@/emylia/CamposFase";
import { FINANCEIRO, PROPOSTA, efetivo, nomeGrupo } from "@/emylia/campos";
import { BotaoAcessoPortal, EstadoAcessoPortal, temPortal } from "@/emylia/AcessoPortalNegocio";
import { modoReal } from "@/emylia/acessosPortal";
import { PortalCliente } from "@/emylia/PortalCliente";
import { eur0, pct, tot, type Negocio } from "@/emylia/motor";
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
import { HistoricoDoNegocio, PainelPosContrato } from "./PainelPosContrato";
import { FaseDaEmylia } from "./FaseDaEmylia";
import { podeMontarObra } from "./protegerObra";
import { SoParaLer } from "./SoParaLer";
import { usePermissoesPosContrato } from "./permissoesPosContrato";
import { AvisoQuestionario } from "./visitaConfiguravel/AvisoQuestionario";
import { useCtxComEfeitos } from "./visitaConfiguravel/useCtxComEfeitos";
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
export function Avisos({ avisos }: { avisos: readonly AvisoEmylia[] }) {
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

/** Os campos da fase, só para ler, como a página os mostra numa fase feita (Validade, Prazo de execução, Condições de pagamento…). */
function CamposLidos({ ctx, d, grupos }: { ctx: Ctx; d: Negocio; grupos: Parameters<typeof efetivo>[1][] }) {
  return (
    <>
      {grupos.map((g0) => efetivo(ctx.S.campos, g0)).filter((g) => !g.oculto).map((g) => (
        <div key={g.titulo}>
          <h3 className="mb-3 text-[17px] font-semibold tracking-tight">{nomeGrupo(g)}</h3>
          <Campos grupo={g} d={d} A={ctx.A} run={ctx.run} ro simples />
        </div>
      ))}
    </>
  );
}

/** Uma fase feita, para ler: o mesmo que a Emylia mostra numa fase feita (NegocioSimples): os documentos e os campos. Sem o documento na base, diz-se. */
function FaseLida({ ctx, d, fase }: { ctx: Ctx; d: Negocio; fase: FaseEmylia }) {
  const { t } = useTranslation();
  const o = d.orc;
  if (fase === "negocio") {
    // a fase Negócio já feita: os três passos, como a Emylia os mostra numa fase feita (Orçamento, Proposta, Contrato)
    const titulo = (k: string): ReactNode => <h3 className="mb-3 text-[17px] font-semibold tracking-tight">{t(`${P}phases.${k}`)}</h3>;
    return (
      <div className="space-y-8">
        <div>{titulo("orcamento")}{o ? <OrcamentoSimples {...ctx} d={d} /> : <EstadoHonesto titulo={t(`${N}semOrcamento`)} />}</div>
        <div>{titulo("proposta")}{o
          ? <Partilhar ctx={ctx} d={d} tipo="proposta" estado={o.aceite ? `aceite ${o.aceite}` : "enviada"}><PropostaDoc S={ctx.S} d={d} /></Partilhar>
          : <EstadoHonesto titulo={t(`${N}semProposta`)} />}</div>
        <div>{titulo("contrato")}{!o || o.vendaDireta
          ? <EstadoHonesto titulo={t(`${N}semContrato`)}>{o?.vendaDireta ? t(`${N}vendaDireta`) : undefined}</EstadoHonesto>
          : <Partilhar ctx={ctx} d={d} tipo="contrato" estado={o.contrato === "assinado" ? "assinado" : "enviado"}><ContratoDoc S={ctx.S} d={d} /></Partilhar>}</div>
        <CamposLidos ctx={ctx} d={d} grupos={o?.vendaDireta ? PROPOSTA.slice(0, 1) : PROPOSTA} />
      </div>
    );
  }
  if (fase === "financeiro") {
    return <div className="space-y-8"><DocumentosSimples {...ctx} d={d} /><CamposLidos ctx={ctx} d={d} grupos={FINANCEIRO} /></div>;
  }
  return <EstadoHonesto titulo={t(`${N}obraNaoAcabou`)} />;
}

/**
 * O que a Emylia mostra no cabeçalho do negócio e que a ficha do Pipeline ainda não tinha, só com o que existe nos dados (nada se inventa): o email, a morada,
 * o WhatsApp, «€ x s/ IVA · margem y%», o estado da conta do cliente no portal, «Ver como o cliente», o acesso ao portal e o aviso de contrato anulado.
 */
export function CabecalhoDoNegocio({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const { t } = useTranslation();
  const [portal, setPortal] = useState(false);
  const email = (d.f.email || (d.tel.includes("@") ? d.tel : "")).trim();
  const morada = d.f.morada ? [d.f.morada, d.f.cp, d.f.localidade].filter(Boolean).join(", ") : d.local;
  const digitos = (d.tel.includes("@") ? "" : d.tel).replace(/[^\d+]/g, "");
  // o WhatsApp quer o número com o indicativo e sem «+»: um número português de 9 algarismos leva o 351
  const wa = digitos.replace(/^\+/, "").replace(/^00/, "").replace(/^(9\d{8}|2\d{8})$/, "351$1");
  const T = d.orc ? tot(d, ctx.S) : null;
  const verCliente = !!(d.orc?.enviada || d.orc?.versoes?.length);
  const comPortal = modoReal() && temPortal(d);
  const botao = "inline-flex min-h-11 items-center gap-2 rounded-lg border border-input px-3 text-[15px] text-foreground hover:bg-muted";
  return (
    <>
      {d.anulado && (
        <div role="status" className="rounded-xl border border-destructive/30 bg-destructive/[0.04] p-4 text-[15px]">
          <b className="font-semibold">{t(d.orc?.vendaDireta ? `${N}anulada.venda` : `${N}anulada.contrato`)}</b>
          <span className="text-muted-foreground"> · {d.anulado.por} · {d.anulado.q}</span>
          <span className="block">{d.anulado.motivo}</span>
        </div>
      )}
      {(email || morada || wa || T) && (
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-[15px]">
          {email && <div className="flex gap-2"><dt className="text-muted-foreground">{t(`${N}ponte.rotulo.email`)}</dt><dd className="break-all"><a href={`mailto:${email}`} className="underline-offset-4 hover:underline">{email}</a></dd></div>}
          {wa && <div className="flex gap-2"><dt className="text-muted-foreground">WhatsApp</dt><dd><a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">{d.tel}</a></dd></div>}
          {morada && <div className="flex gap-2"><dt className="text-muted-foreground">{t(`${N}ponte.rotulo.moradaObra`)}</dt><dd><a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(morada)}`} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">{morada}</a></dd></div>}
          {T && <div className="font-semibold tabular-nums">{eur0(T.pf)} € s/ IVA · {t(`${N}margem`)} {pct(T.m)}</div>}
        </dl>
      )}
      {(verCliente || comPortal) && (
        <div className="flex flex-wrap gap-2">
          {verCliente && <button type="button" className={botao} onClick={() => setPortal(true)}>{t(`${N}verComoCliente`)}</button>}
          {/* o acesso ao portal só com a organização real ligada (como a página): sem ela seria um acesso de demonstração a parecer real */}
          {comPortal && <BotaoAcessoPortal ctx={ctx} d={d} className={botao} />}
        </div>
      )}
      {comPortal && <div className="empty:hidden"><EstadoAcessoPortal ctx={ctx} d={d} /></div>}
      {portal && <PortalCliente ctx={ctx} d={d} fechar={() => setPortal(false)} previa />}
    </>
  );
}

/** O nome da fase da Emylia no ecrã: a fase Negócio tem o nome da barra (os passos dela é que se chamam Orçamento, Proposta e Contrato). */
const chaveDaFase = (f: FaseEmylia): string => (f === "negocio" ? "pessoasPagina.guia.fase.negocio" : `${P}phases.${f}`);

export function NegocioEmyliaDoGuia({ fase, atual, e, org, podeEditar, feitas, faseVista, aoVerFase, aoVoltarAoAtual, nivel, extra, abordagem, aPassar = false, repetirGravacao }: NegocioEmyliaDoGuiaProps) {
  const { t } = useTranslation();
  const Titulo = nivel;
  const pode = usePermissoesPosContrato(org, e.ctx?.S ?? null, podeEditar);
  const verFeita = faseVista !== null;
  const { d } = e;
  // as ações do orçamento mantêm as linhas do levantamento configurável (os efeitos que a organização definiu); sem configuração é o ctx de sempre
  const ctx = useCtxComEfeitos(e.ctx);
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
  else corpo = <PainelPosContrato ctx={ctx} d={d} podeGravar={pode.gravar} />;

  const mostrarEstado = d !== undefined && !e.docsCrm && !verFeita;
  // o que vem por cima dos passos no centro: a fase, o cabeçalho do negócio, o estado da gravação, os avisos do motor e a ponte da abordagem
  const topo = (
    <>
      <p className="text-sm text-muted-foreground">{verFeita ? t(`${N}faseFeita`) : t(`${N}negocio`)}</p>
      <Titulo tabIndex={-1} className="text-2xl font-bold leading-tight tracking-tight text-foreground outline-none md:text-[28px]">{t(chaveDaFase(fase))}</Titulo>
      {d && ctx && !e.docsCrm && <CabecalhoDoNegocio ctx={ctx} d={d} />}
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
      {d && !e.docsCrm && !verFeita && <AvisoQuestionario />}
      {d && !e.docsCrm && pode.falhou && (
        <div role="alert" className="space-y-2 rounded-xl border border-destructive/30 p-3 text-[15px]">
          <p className="text-destructive">{t(`${N}permissoesFalharam`)}</p>
          {botaoTentar(pode.repetir, t(`${N}tentar`))}
        </div>
      )}
      {d && !e.docsCrm && !pode.falhou && !pode.gravar && !verFeita && <EstadoHonesto titulo={t(`${N}soLeitura.titulo`)}>{t(`${N}soLeitura.texto`)}</EstadoHonesto>}
      {!verFeita && fase === "negocio" && <PonteDaAbordagem d={d} abordagem={abordagem} />}
    </>
  );
  const fasesFeitas = <FasesFeitasNav feitas={feitas} faseVista={faseVista} aoVerFase={aoVerFase} />;

  // Negócio, Financeiro e a Obra com plano: o MESMO ecrã da ficha de /negocios (lista de passos à esquerda, «Passo n de N», campos e botões da Emylia)
  if (d && ctx && !e.docsCrm && !verFeita && (fase === "negocio" || fase === "financeiro" || (fase === "obra" && podeMontarObra(d)))) {
    return (
      <FaseDaEmylia
        key={`${fase}:${d.fase}`} ctx={ctx} d={d} soLeitura={soLeitura} topo={topo} fasesFeitas={fasesFeitas} extra={extra}
        depois={fase === "negocio" ? <HistoricoDoNegocio d={d} /> : <PainelPosContrato ctx={ctx} d={d} podeGravar={pode.gravar} />}
      />
    );
  }
  return (
    <>
      <div className={cn("md:self-start", LATERAL_FIXA)}>
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <p className="text-sm font-medium text-muted-foreground">{t(chaveDaFase(verFeita ? fase : atual))}</p>
          {fasesFeitas}
        </div>
      </div>
      <div role="region" aria-label={t(`${P}guia.centro`)} tabIndex={0} data-guia-centro="" className={cn(CENTRO_QUE_ROLA, FOCO)}>
        <div className="pn pg-root space-y-4 py-1 md:px-2">
          {topo}
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
