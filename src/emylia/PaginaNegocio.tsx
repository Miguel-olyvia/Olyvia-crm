// Página do negócio (09/10/2026): só a fase atual está aberta, um passo de
// cada vez. As fases feitas ficam num resumo; as seguintes aparecem quando
// chega a vez delas. Ao mudar de fase, a nova entra animada.
import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Bath, Building2, CalendarCheck, CalendarClock, Check, ChevronDown, ClipboardList, Euro, FileSignature, FileText, Hammer, Home, Lock, MapPin, Package, Phone, Ruler, Sparkles, Target, User, UserCheck, Wrench, type LucideIcon, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  FASES, LINHAS, PAPEIS, nomeLinha, visitaFeita, visitas,
  acertoDoValorPendente, adendaDoAcerto, margemSemAdenda, retificacaoPorPagar, alertas, bloqueado, camposMedida, mudancasDeValor, conflitos, custoUn, eur, faltaProdutosVisita, medida, medidaEmFalta, porMedida, fatorReal, linhaCalc, nfmt, partes, pct, proximo, quandoEQuem, r2, tot, valorSinal,
  type Estado, type Negocio, type Papel, type SvcId,
  SEM_ORCAMENTO, semOrcamento, semVisitaPelaChamada,
} from "./motor";
import { RegistarChamada } from "./RegistarChamada";
import { VisitasNoEstudio, temVisitaAtiva } from "./VisitasNoEstudio";
import { rotuloVaga, type Vaga } from "./vagaData";
import { AREA, CONTACTO, DECISAO, ESCOLHAS, EXTERIOR, FINANCEIRO, INTERIOR, LEAD, OBRA, PECAS_WC, PROPOSTA, contagem, divisaoPrincipal, divisoesEscolhidas, efetivo, emFalta, grupoVisita, gruposArea, type Def, type Grupo } from "./campos";
import { PlantaDivisao } from "./PlantaDivisao";
import { AgendaDaPropostaCartao } from "./AgendaDaProposta";
import { EstudioNaVisita, FecharVisita } from "./VisitaEstudio";
import { projetoDoNegocio } from "@/pages/prototipo-estudio/daVisita";
import { VisitasLista } from "./Visitas";
import { NovaVersao } from "./VoltarAtras";
import { RetificacaoMedidas } from "./RetificacaoMedidas";
import { estudioMedidasEPrincipal } from "./estudioPlano/EstudioMedidas";
import { AbrirEstudioPlano } from "./estudioPlano/EstudioPlano";
import { AbrirEstudioObra } from "./estudioObra/EstudioObra";
import { planoAprovadoDe, retificacaoAceite } from "./preparacaoObra";
import { AcoesAdenda } from "./TrabalhosAMais";
import { UsarLocalizacao } from "./Localizacao";
import { MoradaDaObra } from "./MoradaDaObra";
import { ServicoDaChamada } from "./ServicoDaChamada";
import { oQueQuerFeito } from "./passosContacto";
import { ComercialDaLead, TextoDaLead, comDadosLead } from "./DadosDaLead";
import { MoradaDeQuemPede } from "./MoradaDeQuemPede";
import { vagasVisita } from "./vagasVisita";
import { orcLinhas } from "./ServicosCatalogo";
import { NecessidadesCliente } from "./NecessidadesVisita";
import { FotosEtapa } from "./FotosEtapa";
import { OrcamentoSimples } from "./OrcamentoSimples";
import { LinhasOrcamento } from "./LinhasOrcamento";
import { ProdutosOrcamento } from "./ProdutosOrcamento";
import { ObraSimples } from "./FasesSimples";
import { ContratoDoc, Partilhar, PropostaDoc } from "./DocsCliente";
import { Assistente, Campos, INPUT, INPUT_G, Legenda, aValidar, passoDeGrupo, resumoGrupos, type Passo } from "./CamposFase";
import { Btn, Campo, fazer, numero, type Ctx } from "./pecas";
import { ConfirmarAnulacao, oQueAnular, podeAnular } from "./AnularContrato";
import { lerInventario, useInventario } from "./inventario/loja";
import { MateriaisObra, contaMateriais, materiaisProntos } from "./MateriaisObra";
import { estadoLinhaNegocio, resumoEcNegocio } from "./inventario/ponteNegocios";
import { BotaoAcessoPortal, EstadoAcessoPortal } from "./AcessoPortalNegocio";
import { usePermPortalDoPasso } from "./permPortalPasso";
import { DocumentosParaCliente } from "./DocumentosParaCliente";
import { Pagamentos, lembrarFoco } from "./Pagamentos";
import { difDoAcerto, linhasPagamentos, resumoPagamentos } from "./listaPagamentos";
import { TelefoneComRascunho } from "./TelefoneIndicativo";
import { opcoesDaVisita, sugerirQuemVai } from "./sugestaoVisita";
import { irParaCampoEmFalta } from "./irParaCampoEmFalta";
import { SEM_PERM, comPermissoesReais, contactoConcluido, passoDe, permEmFaltaDoPasso, podeNeg, podeVerCustos, soAteAoContacto } from "./permissoes";
import { SoLeitura } from "./passosSoLeitura";
import { useModoTeste, useSimularClienteTeste } from "./real/modoTeste";
// FERRAMENTAS-TESTE (temporário, remover antes da main)
import { ambienteDeTeste } from "./FerramentasTeste";

const ICONE_FASE: LucideIcon[] = [Target, Phone, Ruler, FileSignature, Euro, Hammer];
const GRUPOS_FASE: Grupo[][] = [LEAD, CONTACTO, [EXTERIOR, INTERIOR, AREA, ESCOLHAS], PROPOSTA, FINANCEIRO, OBRA];
/** A origem como se mostra: em «Outros», o que se escreveu em «Outra origem». */
const origemDoNegocio = (d: Negocio) => (d.f.origem === "Outros" && d.f.origem_outra?.trim()) || d.f.origem || d.origem;
const QUANDO_ABRE = ["", "abre quando a chamada for registada", "abre quando a visita for marcada", "abre quando o levantamento fechar", "abre quando o cliente aceitar a proposta", "abre quando o pagamento for validado"];

export function PaginaNegocio(ctx: Ctx) {
  const { S, A, go } = ctx;
  const d = S.deals.find((x) => x.id === S.deal)!;
  const p = proximo(d, S), L = LINHAS[d.linha], o = d.orc;
  const T = o ? tot(d, S) : null;
  const cli = S.clientes.find((c) => c.deal === d.id);
  const [abertaFeita, setAbertaFeita] = useState<number | null>(null);
  const [anular, setAnular] = useState(false);
  const atualRef = useRef<HTMLDivElement>(null);
  const faseAntes = useRef(d.fase);

  // ao mudar de fase, desce até à fase nova
  useEffect(() => {
    if (faseAntes.current !== d.fase) {
      faseAntes.current = d.fase;
      setTimeout(() => atualRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    }
  }, [d.fase]);

  const titulo = d.servico + (d.local ? " · " + d.local.split(",").pop()!.trim() : "");
  const progresso = d.perdido ? 0 : Math.min(1, d.fase / (FASES.length - 1));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 pb-16 pt-4 sm:px-6 sm:pt-6">
      <button type="button" onClick={go(() => A.nav("negocios"))} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-primary">
        <ArrowLeft className="h-4 w-4" /> Negócios
      </button>

      {/* Cabeçalho */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">Negócio #{d.id} · {L.n}</p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{titulo}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" />{d.nome}</span>
            <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{d.tel}</span>
            <span>comercial: Rúben</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {T && <span key={eur(T.pf)} className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary animate-in fade-in-0 zoom-in-95"><span className="font-mono font-semibold tabular-nums">{eur(T.pf)} € s/ IVA</span>{/* 11/11 (F4): a margem só com «Ver custos do orçamento» (sem ela os custos vêm a null e dava 100%) */}{podeVerCustos() && <>· margem {pct(T.m)}</>}</span>}
          {/* 23/10 (2.0): reenviar o acesso ao portal sem um documento novo, como na proposta simples */}
          <BotaoAcessoPortal ctx={ctx} d={d} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-sm font-medium hover:bg-muted" />
          {d.fase < 4 && !d.perdido && <Button variant="outline" size="sm" onClick={go(() => A.perder(d.id))}>Marcar perdido</Button>}
          {/* 19/10: com contrato, a Direção anula o contrato (a encomenda no Inventário vai com ele) */}
          {podeAnular(d) && <Button variant="outline" size="sm" aria-expanded={anular} onClick={() => setAnular(!anular)}>Anular {oQueAnular(d)}</Button>}
        </div>
      </header>
      <EstadoAcessoPortal ctx={ctx} d={d} />
      <div className="empty:hidden"><DocumentosParaCliente d={d} /></div>
      {anular && podeAnular(d) && <ConfirmarAnulacao ctx={ctx} d={d} fechar={() => setAnular(false)} />}
      {S.confirmPerda === d.id && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/[0.06] p-3 text-sm animate-in fade-in-0 slide-in-from-top-2">
          <b>Marcar como perdido?</b><span className="text-muted-foreground">Sai do quadro, mas fica no histórico.</span>
          <span className="flex-1" />
          <Button variant="outline" size="sm" onClick={go(() => A.perderNao())}>Cancelar</Button>
          <Button variant="destructive" size="sm" onClick={go(() => A.perderSim(d.id))}>Marcar perdido</Button>
        </div>
      )}

      {/* Barra das fases */}
      <ol className="relative grid grid-cols-6 gap-1 rounded-2xl border border-border/70 bg-card px-2 pb-3 pt-4 shadow-[var(--shadow-sm)]">
        <span aria-hidden="true" className="absolute left-[8.33%] right-[8.33%] top-8 h-0.5 rounded-full bg-border" />
        <span aria-hidden="true" className="absolute left-[8.33%] top-8 h-0.5 rounded-full bg-gradient-to-r from-primary to-accent transition-[width] duration-700 ease-out" style={{ width: `calc(${progresso} * 83.33%)` }} />
        {FASES.map((f, i) => {
          const Ic = ICONE_FASE[i];
          const st = d.fase > i ? "feita" : d.fase === i ? "atual" : "depois";
          return (
            <li key={f} className="relative z-10 flex flex-col items-center gap-1.5 text-center">
              <button type="button" disabled={st === "depois"}
                onClick={() => { if (st === "feita") setAbertaFeita(i); document.getElementById("sec-" + i)?.scrollIntoView({ behavior: "smooth", block: "center" }); }}
                className={cn("grid h-8 w-8 place-items-center rounded-full transition-all duration-500",
                  st === "feita" && "bg-primary text-primary-foreground shadow-md",
                  st === "atual" && "bg-background text-primary ring-2 ring-primary ring-offset-2 ring-offset-card scale-110",
                  st === "depois" && "bg-muted text-muted-foreground")}>
                {st === "feita" ? <Check className="h-4 w-4 animate-in zoom-in-50" /> : <Ic className="h-4 w-4" />}
              </button>
              <span className={cn("text-[11px] leading-tight sm:text-xs", st === "atual" ? "font-semibold text-primary" : st === "feita" ? "text-foreground" : "text-muted-foreground")}>{f}</span>
              {st === "atual" && <span className="absolute top-0 h-8 w-8 animate-ping rounded-full bg-primary/20 [animation-duration:2.2s]" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-3">
          {/* Fases feitas: resumo, abre ao clicar */}
          {FASES.slice(0, d.fase).map((f, i) => (
            <FaseFeita key={f} ctx={ctx} d={d} i={i} aberta={abertaFeita === i} alternar={() => setAbertaFeita(abertaFeita === i ? null : i)} />
          ))}

          {/* Fase atual */}
          <div ref={atualRef} id={"sec-" + d.fase} className="scroll-mt-4">
            <FaseAtual key={d.id + ":" + d.fase + ":" + (d.perdido ? "x" : "")} ctx={ctx} d={d} />
          </div>

          {/* Fases seguintes */}
          {FASES.slice(d.fase + 1).map((f, k) => {
            const i = d.fase + 1 + k, Ic = ICONE_FASE[i];
            return (
              <div key={f} className="flex items-center gap-3 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-muted"><Ic className="h-4 w-4" /></span>
                <span className="font-medium">{f}</span>
                <span className="ml-auto inline-flex items-center gap-1.5 text-xs"><Lock className="h-3.5 w-3.5" />{QUANDO_ABRE[i]}</span>
              </div>
            );
          })}
        </div>

        {/* Lado direito: cliente e histórico */}
        <aside className="space-y-4 lg:sticky lg:top-4">
          <section className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[var(--shadow-sm)]">
            <div aria-hidden="true" className="h-[3px] w-full bg-gradient-to-r from-primary via-primary/40 to-transparent" />
            <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-4 py-3">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em]">Cliente</h2>
              {cli && <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success animate-in zoom-in-50">em Clientes</span>}
            </div>
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 p-4 text-sm">
              <dt className="text-muted-foreground">Nome</dt><dd className="text-right font-medium">{d.nome}</dd>
              <dt className="text-muted-foreground">Telefone</dt><dd className="text-right font-medium">{d.tel}</dd>
              {d.f.email && <><dt className="text-muted-foreground">Email</dt><dd className="truncate text-right">{d.f.email}</dd></>}
              <dt className="text-muted-foreground">Obra</dt><dd className="text-right">{d.f.morada ? `${d.f.morada}, ${d.f.localidade || ""}` : d.local || "—"}</dd>
              {d.f.imovel && <><dt className="text-muted-foreground">Imóvel</dt><dd className="text-right">{d.f.imovel}{d.f.tipologia ? " " + d.f.tipologia : ""}</dd></>}
              <dt className="text-muted-foreground">Origem</dt><dd className="text-right">{origemDoNegocio(d)}</dd>
              {d.f.pref && <><dt className="text-muted-foreground">Contactar</dt><dd className="text-right">{d.f.pref}{d.f.hora ? " · " + d.f.hora.toLowerCase() : ""}</dd></>}
            </dl>
          </section>
          <section className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[var(--shadow-sm)]">
            <div aria-hidden="true" className="h-[3px] w-full bg-gradient-to-r from-info via-info/40 to-transparent" />
            <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-4 py-3">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em]">Histórico <span className="ml-1 font-mono text-sm text-info">{d.hist.length}</span></h2>
            </div>
            <ol className="max-h-[420px] space-y-0.5 overflow-y-auto p-3">
              {d.hist.map((h, i) => (
                <li key={d.hist.length - i} className="flex gap-3 rounded-lg px-1.5 py-1.5 text-sm animate-in fade-in-0 slide-in-from-top-1">
                  <i className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", h.k === "x" ? "bg-destructive" : h.k === "w" ? "bg-warning" : h.t.startsWith("Passou") ? "bg-primary" : "bg-success")} />
                  <span className="min-w-0">{h.t}<small className="block text-xs text-muted-foreground">{quandoEQuem(h)}</small></span>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ uma fase feita */
function FaseFeita({ ctx, d, i, aberta, alternar }: { ctx: Ctx; d: Negocio; i: number; aberta: boolean; alternar: () => void }) {
  const { S } = ctx;
  const Ic = ICONE_FASE[i];
  const gs = (i === 3 && d.orc?.vendaDireta ? PROPOSTA.slice(0, 1) : GRUPOS_FASE[i]).flatMap((g) => (g === AREA ? gruposArea(S.campos, d.f) : [g]));
  const c = contagem(gs, d.f);
  let resumo = resumoGrupos(gs, d.f, 4);
  if (i === 0) resumo = [origemDoNegocio(d), d.f.email || "", d.f.tipo_cliente || ""].filter(Boolean);
  if (i === 1) resumo = [d.f.resultado || "", d.f.orc_cliente || "", d.visita.slot ? "visita " + d.visita.slot : ""].filter(Boolean);
  if (i === 2) resumo = [d.f.tipologia || "", d.f.andar ? d.f.andar + ".º andar" : "", d.f.tem_elevador === "Sim" ? "com elevador" : "", orcLinhas(d, S).length + " serviços", d.visita.fotos + " fotos"].filter(Boolean);
  if (i === 3 && d.orc) { const T = tot(d, S); resumo = [eur(T.pf) + " € s/ IVA", podeVerCustos() ? "margem " + pct(T.m) : "", d.orc.vendaDireta ? "venda direta" : "contrato " + (d.orc.contrato || "por enviar")].filter(Boolean); }
  if (i === 4) resumo = [d.fin.fatura?.n || "", d.fin.recibo?.n || "", d.f.metodo || ""].filter(Boolean);
  return (
    <section id={"sec-" + i} className="scroll-mt-4 overflow-hidden rounded-xl border border-border/70 bg-card animate-in fade-in-0 slide-in-from-top-2 duration-500">
      <button type="button" onClick={alternar} aria-expanded={aberta} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-muted/40">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-success/15 text-success"><Check className="h-4 w-4" /></span>
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold"><Ic className="h-3.5 w-3.5 text-muted-foreground" />{FASES[i]}</span>
          {!aberta && resumo.map((r) => <span key={r} className="truncate rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{r}</span>)}
        </span>
        <span className="hidden font-mono text-xs tabular-nums text-muted-foreground sm:inline">{c.f}/{c.n}</span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-300", aberta && "rotate-180")} />
      </button>
      <div className={cn("grid transition-[grid-template-rows] duration-300 ease-out", aberta ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="min-h-0 overflow-hidden">
          {aberta && (
            <div className="space-y-4 border-t border-border/60 p-4 animate-in fade-in-0">
              {i === 3 && d.orc && <div className="pg estreito"><Orcamento {...ctx} d={d} /></div>}
              {i === 4 && <div className="pg estreito"><Documentos ctx={ctx} d={d} /></div>}
              {gs.map((g) => (
                <div key={g.titulo} className="space-y-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{g.titulo}</h3>
                  <Campos grupo={g} d={d} A={ctx.A} run={ctx.run} ro />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ a fase atual */
/** Os passos da fase atual. `simples` desenha os campos maiores, numa coluna (proposta de 09/10). */
/** Os passos de uma fase do negócio. 4/11: `fase` (por omissão a do negócio) deixa pedir os de outra fase: «Tudo na chamada» junta os da
 *  Lead e os do Contacto na mesma página. */
export function passosDaFase(ctx: Ctx, d: Negocio, simples = false, fase = d.fase): Passo[] {
  const { S, A, run, go } = ctx;
  const o = d.orc, L = LINHAS[d.linha], v = d.visita;
  const fx = { d, A, run, simples };
  const INP = simples ? INPUT_G : INPUT;
  const ROT = simples ? "grid gap-2 text-sm font-medium text-foreground" : "grid gap-1.5 text-xs font-medium text-muted-foreground";
  // os grupos como a empresa os definiu no editor de campos
  const E = (gr: Grupo) => efetivo(S.campos, gr);
  const g = (gr: Grupo, ic: LucideIcon, ro = false) => { const e = E(gr); return passoDeGrupo(e, ic, <Campos grupo={e} {...fx} ro={ro} />, d.f); };

  // 15/10: um passo cujo documento já saiu (a proposta enviada, o contrato gerado) está feito; os campos ficam só de leitura e
  // já não contam como "falta 1 resposta" (senão o negócio abria nesse passo em vez de no que há a fazer, ex.: gerar o contrato)
  const fechadoSe = (p: Passo, sim: boolean): Passo => (sim ? { ...p, conta: undefined, feito: true } : p);
  // 4/11 (Rúben, a gravação «Entrevista Completa»): na Lead («Por contactar») só o que a chamada usa: quem pede (o nome, que se confirma ao
  // atender, e o telefone) e o que pediu (o motivo do contacto). O resto saiu (o levantamento de 4/11).
  const passosDaLead = (): Passo[] => {
    const [gPedido] = LEAD.map(E);
    const real = comDadosLead(d);
    return [
      { ...passoDeGrupo(gPedido, User, (
        // 5/11 (Rúben): tudo a toda a largura da coluna (nada de colunas estreitas); o nome em duas metades, o telefone em meia largura
        <div className={simples ? "grid max-w-2xl gap-6 [&>*]:col-span-full" : "grid gap-3 sm:grid-cols-3"}>
          {real ? (
            <div className={cn("grid gap-5 sm:grid-cols-2", !simples && "sm:col-span-2")}>
              <TextoDaLead ctx={ctx} d={d} k="primeiro" rotulo="Nome próprio" />
              <TextoDaLead ctx={ctx} d={d} k="apelido" rotulo="Apelido" />
            </div>
          ) : <label className={ROT}>Nome<input key={"n" + d.nome} defaultValue={d.nome} className={INP} onBlur={(e) => { const x = e.target.value.trim(); if (x && x !== d.nome) run(() => { d.nome = x; }); }} /></label>}
          {/* 2/11: o telefone com o seletor de indicativo do país. 23/11: sempre: um email que um negócio antigo tenha no contacto não é o
              telefone (o campo começa vazio e o email passa para o email do negócio ao gravar o telefone, TelefoneComRascunho) */}
          <div className={cn(ROT, simples && "sm:max-w-sm")}><label htmlFor={`quem-tel-${d.id}`}>Telefone</label><TelefoneComRascunho key={"t" + d.tel} id={`quem-tel-${d.id}`} d={d} run={run} classe={INP} /></div>
          <MoradaDeQuemPede ctx={ctx} d={d} />
          <Campos grupo={gPedido} {...fx} />
        </div>
      ), d.f), id: "quem", titulo: "Quem pede", personalizado: false, resumo: [d.nome, d.tel, d.f.pedido || ""].filter(Boolean) },
    ];
  };
  // 11/11 (fim de contacto): o passo final da assistente comercial
  const passoPassarAoComercial = (): Passo => {
    const feito = contactoConcluido(d);
    return {
      id: "comercial", titulo: "Passar ao comercial", icone: UserCheck, feito, resumo: feito ? ["Contacto concluído"] : [], corpo: (
        <div className="space-y-3">
          <p className="text-[15px] text-muted-foreground">{feito
            ? "Contacto concluído. O negócio está com o comercial, que marca a visita."
            : "Acabada a chamada, o negócio passa ao comercial, que marca a visita. Fica em Contacto e deixa de poder ser mudado por aqui. Quando a visita for marcada, o negócio e a lead passam para o comercial da visita."}</p>
          {!feito && <Button size="lg" className="min-h-11" onClick={go(() => A.passarAoComercial(d.id))}><UserCheck className="mr-1.5 h-4 w-4" aria-hidden="true" />Passar ao comercial</Button>}
        </div>
      ),
    };
  };
  // 11/11: na fase Negócio ou mais à frente sem orçamento (as versões apagadas na base), só o aviso: nenhum passo de orçamento
  if (fase === d.fase && semOrcamento(d)) return [{ id: "sem-orcamento", titulo: "Sem orçamento", icone: FileText, feito: false, semAvancar: true, resumo: [],
    corpo: <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[15px] text-amber-900">{SEM_ORCAMENTO}</p> }];
  // 16/11 (o fluxo em vigor): proposta assinada → contrato gerado e assinado (a venda direta fica só com a proposta) → o Financeiro (a fatura
  // e o pagamento) → na Obra, as medidas e o plano. O passo do contrato vem logo a seguir à proposta aceite, no Financeiro (fase 4), e
  // fica à vista na Obra. Já não espera pelo pagamento, pelas medidas nem pelo plano.
  const passoContratoPrincipal = (): Passo | null => {
    if (!o?.aceite || o.vendaDireta) return null;
    if (!simples) return g(PROPOSTA[1], FileSignature, !!o.contrato);
    const estado = o.contrato === "assinado" ? "assinado" : o.contrato === "enviado" ? "à espera da assinatura" : "pronto a gerar";
    return { ...g(PROPOSTA[1], FileSignature, !!o.contrato), conta: undefined, feito: o.contrato === "assinado", semAvancar: true, resumo: [estado],
      corpo: (
        <div className="space-y-10">
          <Campos grupo={E(PROPOSTA[1])} {...fx} ro={!!o.contrato} />
          {/* 11/11: gerar (ou esperar pela assinatura) aqui mesmo, antes do texto do contrato */}
          {o.contrato !== "assinado" && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/[0.04] p-4">
              <p className="text-[15px]">{o.contrato === "enviado" ? "O contrato está no portal do cliente, por assinar. Assinado, segue a fatura e o pagamento." : "O contrato vai ao portal do cliente, por assinar. Assinado, segue a fatura e o pagamento."}</p>
              <BotaoFase ctx={ctx} d={d} tamanho="default" />
            </div>
          )}
          <Partilhar ctx={ctx} d={d} tipo="contrato" estado={estado}>
            <ContratoDoc S={S} d={d} />
          </Partilhar>
        </div>
      ) };
  };
  let passos: Passo[] = [];
  if (fase === 0) {
    passos = [
      // 4/11 (Rúben: «refazer a primeira fase da lead para ter todos os campos, separados por steps que façam sentido com os campos da Olyvia
      // original»): quem é, como falar com o cliente, como chegou, o pedido e quem acompanha. As perguntas vêm dos grupos da Lead (com os
      // ajustes da empresa; um campo novo fica no passo do grupo dele); o que é da pessoa (nome próprio, apelido, empresa, fonte, notas,
      // respostas do formulário, comercial) grava-se nela (DadosDaLead.tsx), só na página real.
      ...passosDaLead(),
    ];
  } else if (fase === 1) {
    // 12/11: «O que o cliente quer» só tem textos longos (opcionais): a contagem era {n:0,f:0} e o passo nunca ficava feito. Fica feito com
    // o tipo de serviço confirmado na chamada e pelo menos um serviço do Catálogo (passosContacto.ts); os textos continuam opcionais.
    const pQuer = g(CONTACTO[1], ClipboardList);
    passos = [
      // 27/10: no contacto ainda não se está no local: a localização fica para a visita (Exterior)
      // 28/10 (Rúben): a morada da obra também se preenche pela localização do dispositivo (quem está no local)
      // 4/11 (Rúben): na Qualificação, o tipo de serviço que veio da lead confirma-se (ou troca-se) na chamada: ServicoDaChamada.tsx
      // 4/11 (Rúben, o levantamento da chamada): Chamada (e quem liga), O que o cliente quer (o tipo de serviço e o que quer fazer), a Morada
      // da obra, a Qualificação e Marcar a visita. «Preparar a visita» saiu (nada disso se pergunta na chamada).
      { ...g(CONTACTO[0], Phone), corpo: <div className="space-y-5"><Campos grupo={E(CONTACTO[0])} {...fx} />{comDadosLead(d) && <ComercialDaLead ctx={ctx} d={d} />}</div> },
      { ...pQuer, conta: undefined, feito: oQueQuerFeito(d, S, pQuer.conta), corpo: <div className="space-y-4"><ServicoDaChamada ctx={ctx} d={d} /><Campos grupo={E(CONTACTO[1])} {...fx} /></div>,
        resumo: [nomeLinha(d), ...resumoGrupos([E(CONTACTO[1])], d.f)].filter(Boolean) },
      // 4/11 (Rúben): a morada que a lead já trazia propõe-se primeiro (validar, editar ou outra): MoradaDaObra.tsx
      { ...g(CONTACTO[2], MapPin), corpo: <MoradaDaObra ctx={ctx} d={d}><Campos grupo={E(CONTACTO[2])} {...fx} /></MoradaDaObra> },
      { ...g(CONTACTO[3], Sparkles) },
      // 11/11 (fim de contacto): a assistente comercial (contacto.registar sem nenhuma permissão além do contacto) não marca a visita:
      // o último passo é «Passar ao comercial» (A.passarAoComercial), e o negócio fica em Contacto, pronto para o comercial
      // 11/11: o passo «vaga» é a agenda do CRM (VisitasDoCrm: tipo, dia, os comerciais livres, hora e morada); marcar a visita passa o
      // negócio a Visita e a lead e o negócio para o comercial escolhido (20270114310000)
      ...(soAteAoContacto() ? [passoPassarAoComercial()] : [{ id: "vaga", titulo: "Marcar a visita com o comercial", icone: CalendarClock,
        feito: !!v.slot, resumo: v.slot ? [v.slot] : [], corpo: semVisitaPelaChamada(d) && !v.slot ? (
        // 19/11 (auditoria): sem «Atendeu · interessado» não se marca a visita; diz-se porquê (o motor também recusa)
        <p role="note" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[15px] text-amber-900">{semVisitaPelaChamada(d)}</p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Vagas em {d.f.localidade || (d.local || "").split(",").pop() || "—"}. Em cada vaga, quem está livre e mais perto.</p>
          {/* 2/11 (reunião): a sugestão de quem vai, pela agenda (livre a essa hora) e pela proximidade (visitas perto nesse dia) */}
          {/* 19/11 (auditoria): a vaga vai com a data completa (o ano), não só com o texto */}
          <div className="flex flex-wrap gap-2">
            {vagasVisita().map((s) => {
              const sg = sugerirQuemVai(S.deals, d, s, opcoesDaVisita()), rotulo = rotuloVaga(s);
              return (
                <button key={s.data + s.hora} type="button" onClick={go(() => A.marcarVisita(d.id, s, sg?.quem))} title={sg ? `${sg.nome}: ${sg.motivo}${sg.ocupados.length ? ` · ocupados: ${sg.ocupados.join(", ")}` : ""}` : undefined}
                  className="rounded-xl border border-border bg-card px-3 py-2 text-left text-sm font-medium transition hover:-translate-y-0.5 hover:border-primary hover:bg-primary/5 hover:text-primary hover:shadow-[var(--shadow-sm)]">
                  <span className="block"><CalendarClock className="mr-1.5 inline h-4 w-4" />{rotulo}</span>
                  {sg && <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{sg.nome} · {sg.motivo}</span>}
                </button>
              );
            })}
          </div>
          <OutraData INP={INP} ROT={ROT} marcar={(vaga) => go(() => A.marcarVisita(d.id, vaga, sugerirQuemVai(S.deals, d, vaga, opcoesDaVisita())?.quem))()} />
        </div>
      ) } as Passo]),
    ];
    // 11/11 (20270113130000): os passos do Contacto pedem negocios.contacto.registar. Sem ela (ex.: um comercial que só marca visitas)
    // abrem só de leitura, com a permissão em falta; «Marcar a visita» continua (pede visita.gerir, e o servidor deixa-o gravar sem
    // mexer nos dados do Contacto)
    if (comPermissoesReais() && !podeNeg(S.role, "contacto.registar")) {
      passos = passos.map((p) => (p.id === "vaga" || p.id === "comercial" ? p : { ...p, corpo: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{SEM_PERM["contacto.registar"].sub}</p>
          <fieldset disabled className="m-0 min-w-0 border-0 p-0">{p.corpo}</fieldset>
        </div>
      ) }));
    }
  } else if (fase === 2) {
    // 11/11 (20270114320000): sem negocios.visita.preencher (quem só gere as visitas), a Visita fica só de leitura menos as visitas
    const semPreencher = comPermissoesReais() && !podeNeg(S.role, "visita.preencher");
    const CM = camposMedida(L), GA = gruposArea(S.campos, d.f).map(E);
    const medOk = CM.filter(([k]) => !medidaEmFalta(v.med, k)).length;
    const nMed = CM.length;
    const gv = visitas(d).map(grupoVisita), cv = contagem(gv, d.f);
    const corpoMedidas = (comPlanta: boolean) => (
        <div className="space-y-2">
          {/* 5/11 (Rúben, a visita real): a planta da folha, no ecrã; dá os m² do chão e das paredes */}
          {comPlanta && simples && (CM.some(([k]) => k === "pav") || CM.some(([k]) => k === "par")) && (
            <details className="group mb-6 rounded-2xl border border-border bg-card p-4" open={!!d.f.planta || undefined}>
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-semibold">
                Desenhar a planta{divisaoPrincipal(d.f) ? ` da ${divisaoPrincipal(d.f)!.toLowerCase()}` : ""}
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div className="pt-4"><PlantaDivisao ctx={ctx} d={d} divisao={divisaoPrincipal(d.f) ?? undefined} /></div>
            </details>
          )}
          <p className={simples ? "text-[15px] text-muted-foreground" : "text-xs text-muted-foreground"}>Todas obrigatórias. Água quente pode ser 0.</p>
          <div className={simples ? "grid max-w-xl gap-5 sm:grid-cols-2" : "grid gap-3 sm:grid-cols-5"}>
            {CM.map(([k, l]) => {
              const falta = medidaEmFalta(v.med, k), val = medida(v.med, k);
              return (
              <label key={k} className={cn(simples ? ROT : "grid gap-1.5 rounded-xl text-xs font-medium text-muted-foreground transition-all", !simples && falta && CM.find(([x]) => medidaEmFalta(v.med, x))?.[0] === k && "rounded-lg bg-primary/[0.04] ring-2 ring-primary/40 ring-offset-[6px] ring-offset-card")}>
                {l}
                <input key={k + val} type="number" min="0" step="0.5" defaultValue={val || ""} id={`med-${k}-${d.id}`}
                  className={cn(INP, aValidar(d, "medidas") && falta && "border-destructive ring-1 ring-destructive/40")}
                  aria-invalid={(aValidar(d, "medidas") && falta) || undefined}
                  onBlur={(e) => { const n = numero(e.target.value), x = isNaN(n) ? 0 : n; if (x !== val) run(() => porMedida(v.med, k, x)); }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
              </label>
              );
            })}
          </div>
          {/* notas livres sobre as medidas (opcional): ex. "parede do fundo com 2,4 m até ao teto falso" */}
          <div className="pt-4">
            <Campos grupo={{ titulo: "", campos: [{ k: "obs_medidas", l: "Observações", t: "texto_longo", opcional: true }] }} {...fx} />
          </div>
        </div>
    );
    const resumoMedidas = CM.filter(([k]) => medida(v.med, k) > 0).map(([k, l]) => `${l.replace(/ \(.*\)/, "")} ${nfmt(medida(v.med, k))}`);
    const comWC = d.linha === "wc" || divisoesEscolhidas(d.f).includes("Casa de banho");
    // 6/11: a cozinha também segue o Estúdio. 17/11 (Rúben, num negócio de «Remodelação geral» com os passos antigos: «já não devia
    // existir nada disto… passou tudo para o Estúdio, só era exterior, interior e Estúdio»): todas as visitas seguem o Estúdio
    const comEstudio = true;
    const passoNec: Passo = { id: "nec", titulo: "Necessidades do cliente", icone: ClipboardList, feito: orcLinhas(d, S).length > 0 && medOk === nMed && !faltaProdutosVisita(d, S).length && (!simples || E(ESCOLHAS).oculto || !emFalta([E(ESCOLHAS)], d.f).length),
      resumo: [...orcLinhas(d, S).map((sid) => S.svc[sid]?.n ?? sid), ...(v.prod ?? []).map((p) => p.n)], corpo: <NecessidadesCliente {...ctx} d={d} simples={simples} /> };
    passos = [
      { id: "visitas", titulo: "Visitas", icone: CalendarClock, conta: { f: cv.f + (visitaFeita(d) || visitas(d).some((n) => d.f[`v${n}_estado`] !== "Cancelada") ? 1 : 0), n: cv.n + 1 }, // a visita fica feita sozinha: só falta se todas estão canceladas
        resumo: [`${visitas(d).length} ${visitas(d).length === 1 ? "visita" : "visitas"}`, visitaFeita(d) ? "feita" : "por fazer"],
        corpo: <VisitasLista ctx={ctx} d={d} simples={simples} /> },
      // 27/10 (Rúben): os passos com fotografias não passam sozinhos ao seguinte (saltavam antes de se poder tirar a foto)
      { ...g(EXTERIOR, Building2), semAvancar: true, corpo: (
        <div className="space-y-6">
          {/* 27/10: a morada já está no cabeçalho; aqui só a confirmação no local */}
          <UsarLocalizacao ctx={ctx} d={d} texto="Confirmar a morada pela localização" />
          <Campos grupo={E(EXTERIOR)} {...fx} />
          <FotosEtapa ctx={ctx} d={d} etapa="exterior" simples={simples} />
        </div>
      ) },
      { ...g(INTERIOR, Home), semAvancar: true, corpo: <div className="space-y-6"><Campos grupo={E(INTERIOR)} {...fx} /><FotosEtapa ctx={ctx} d={d} etapa="interior" simples={simples} /></div> },
      // várias divisões: um grupo de campos por divisão (gruposArea), contados todos no passo
      // 27/10: as fotografias contam como uma resposta do passo: feita com fotografias ou com "o cliente não quis"
      { ...g(AREA, Wrench), semAvancar: true, conta: (({ f, n }) => ({ f: f + (v.fotos > 0 || d.f.diag_cliente_recusou_fotos === "Sim" ? 1 : 0), n: n + 1 }))(contagem(GA, d.f)), corpo: <div className="space-y-6">{GA.map((ga) => <Campos key={ga.titulo} grupo={ga} {...fx} />)}<FotosEtapa ctx={ctx} d={d} etapa="area" simples={simples} /></div> },
      // 28/10: uma linha sem medidas (a "geral": as quantidades escrevem-se em cada serviço) não mostra um passo vazio
      ...(nMed === 0 ? [] : [{ id: "medidas", titulo: "Medidas da área", icone: Ruler, conta: { f: medOk, n: nMed }, resumo: resumoMedidas, corpo: corpoMedidas(true) }]),
      // na versão Atual simples, as "Escolhas do cliente" respondem-se dentro das Necessidades (seleção guiada, 14/10/2026)
      passoNec,
      ...(simples ? [] : [g(ESCOLHAS, Sparkles)]),
      // 5/11 (Rúben, a visita real): a folha da visita, peça a peça (só com casa de banho), e o prazo e a decisão do cliente
      ...(comWC ? [g(PECAS_WC, Bath)] : []),
      g(DECISAO, CalendarCheck),
    ];
    // 6/11 (Rúben: «o Estúdio já está a fazer praticamente tudo»): numa casa de banho, depois do interior e da área vem o Estúdio; as
    // medidas, as necessidades e as peças saem dele e ficam dobradas no fecho, com o prazo e a decisão e o plano de obra estimado
    if (simples && comEstudio) {
      const pr = projetoDoNegocio(d.f);
      const ePecas = E(PECAS_WC), eDecisao = E(DECISAO);
      // 9/11 (Rúben: «o fluxo simplificado, com tudo preenchido automaticamente: apenas exterior, interior, depois o Estúdio»): sem
      // «Visitas» nem «Área de intervenção» na lista; a área (a gravação preenche-a) e o fecho ficam dentro do passo Estúdio, dobrados
      const ate = passos.findIndex((x) => x.id === "medidas" || x.id === "nec");
      const areaId = E(AREA).titulo, passoArea = passos.find((x) => x.id === areaId);
      const faltaArea = (aValidar(d, AREA.titulo) ? emFalta(GA, d.f).length : 0) + (aValidar(d, "fotos") && !(v.fotos > 0) && d.f.diag_cliente_recusou_fotos !== "Sim" ? 1 : 0);
      const faltaMed = aValidar(d, "medidas") ? nMed - medOk : 0;
      // 15/11 (Rúben, teste A-Z): o campo «o cliente fornece produtos» (ESCOLHAS) entra no portão da visita, mas faltava na conta do bloco
      // — com os serviços já escolhidos o acordeão «Necessidades» não acendia nem abria, e o «Fechar levantamento» só dava um aviso que
      // parecia não fazer nada. Conta-se aqui também, como na lista de passos, para o bloco acender e abrir no campo em falta.
      const faltaNec = (aValidar(d, "nec") ? (orcLinhas(d, S).length ? 0 : 1) + faltaProdutosVisita(d, S).length : 0)
        + (aValidar(d, ESCOLHAS.titulo) && !E(ESCOLHAS).oculto ? emFalta([E(ESCOLHAS)], d.f).length : 0);
      // 19/11 (auditoria): o passo «Visitas» saiu da lista; com a única visita cancelada o levantamento não fecha. As visitas ficam no topo
      // do Estúdio (remarcar, cancelar, marcar outra) e o bloco acende quando falta uma que conte.
      const faltaVisitas = !temVisitaAtiva(d) && (aValidar(d, "visitas") || visitas(d).length > 0) ? 1 : 0;
      passos = [
        ...passos.slice(0, ate).filter((x) => x.id !== "visitas" && x.id !== areaId),
        { id: "estudio", titulo: "Estúdio", icone: Sparkles,
          feito: !!pr && Object.keys(pr.escolhas).length + (pr.porColocar ?? []).length + (pr.servicos ?? []).length > 0 && medOk === nMed && passoNec.feito === true && temVisitaAtiva(d),
          falta: faltaVisitas + faltaArea + faltaMed + faltaNec || undefined,
          resumo: [pr ? "projeto guardado" : "por abrir", d.f.duracao_obra ? `obra: ${d.f.duracao_obra}` : ""].filter(Boolean),
          // 20/11 (permissões ecrã/servidor): sem negocios.visita.preencher, só o bloco das visitas fica fora do fieldset desativado (a
          // assistente comercial marca, remarca e cancela; o resto do Estúdio fica só de leitura, como o servidor, v_so_agenda)
          corpo: <div className="space-y-10"><VisitasNoEstudio ctx={ctx} d={d} falta={faltaVisitas} /><SoLeitura ativo={semPreencher}><div className="space-y-10"><EstudioNaVisita ctx={ctx} d={d} /><FecharVisita ctx={ctx} d={d} decisao={<Campos grupo={eDecisao} {...fx} />} blocos={[
            ...(passoArea ? [{ id: "area", titulo: passoArea.titulo, resumo: passoArea.resumo.join(" · ") || "por preencher", corpo: passoArea.corpo, falta: faltaArea }] : []),
            ...(nMed === 0 ? [] : [{ id: "medidas", titulo: "Medidas da área", resumo: resumoMedidas.join(" · ") || "por preencher", corpo: corpoMedidas(false), falta: faltaMed }]),
            { id: "nec", titulo: "Necessidades do cliente", resumo: passoNec.resumo.join(" · ") || "por juntar", corpo: passoNec.corpo, falta: faltaNec },
            ...(ePecas.oculto || !comWC ? [] : [{ id: "pecas", titulo: "Peças da casa de banho", resumo: ((n) => (n ? `${n} ${n === 1 ? "resposta" : "respostas"}` : "por responder"))(ePecas.campos.filter((c) => !!d.f[c.k]?.trim()).length), corpo: <Campos grupo={ePecas} {...fx} /> }]),
          ]} /></div></SoLeitura></div> },
      ];
    }
    // 11/11: a Visita (Exterior, Interior, Estúdio, Fim) é do comercial: sem negocios.visita.preencher (a assistente comercial, que só
    // marca) fica só de leitura, com a permissão em falta; o servidor recusa o mesmo (neg_guardar_negocio, 20270114320000). As visitas da
    // agenda (o passo «visitas», VisitasDoCrm) seguem negocios.visita.gerir.
    // 20/11: o passo «estudio» já traz o seu fieldset (fora dele, as visitas); aqui só ganha o aviso
    if (semPreencher) {
      passos = passos.map((p) => (p.id === "visitas" ? p : { ...p, corpo: (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{SEM_PERM["visita.preencher"].sub}</p>
          {p.id === "estudio" ? p.corpo : <SoLeitura ativo>{p.corpo}</SoLeitura>}
        </div>
      ) }));
    }
  } else if (fase === 3 && o) {
    passos = [
      // 27/10 (Rúben): enviada a proposta, o orçamento fica fechado (só de leitura) até o cliente aceitar; o cadeado diz porquê
      { id: "orc", titulo: "Orçamento", icone: o.enviada && !o.aceite && !o.vendaDireta ? Lock : FileText, feito: !!o.enviada || (o.verif && !bloqueado(d, S)),
        resumo: o.enviada && !o.aceite && !o.vendaDireta ? ["fechado até o cliente aceitar"] : [eur(tot(d, S).pf) + " € s/ IVA", ...(podeVerCustos() ? ["margem " + pct(tot(d, S).m)] : [])],
        corpo: simples ? <OrcamentoSimples {...ctx} d={d} /> : <div className="pg estreito"><Orcamento {...ctx} d={d} /></div> },
      simples ? fechadoSe({ ...g(PROPOSTA[0], FileSignature, !!o.enviada), corpo: (
        <div className="space-y-10">
          <Campos grupo={E(PROPOSTA[0])} {...fx} ro={!!o.enviada} />
          <Partilhar ctx={ctx} d={d} tipo="proposta" estado={o.aceite ? `aceite ${o.aceite}` : o.enviada ? `enviada ${o.enviada} · à espera do cliente` : "ainda não enviada"}>
            <PropostaDoc S={S} d={d} />
          </Partilhar>
          {/* 9/11 (Rúben: «enviámos a proposta sem querer»): aceite, mas com o contrato por assinar, a proposta ainda se refaz (novaVersao);
              a versão aceite fica guardada como substituída. Aqui, e não no Contrato: na ficha do Pipeline o Contrato mostra só a minuta. */}
          {o.aceite && o.contrato !== "assinado" && !d.fin.fatura && (
            <div className="space-y-3 rounded-2xl border border-border bg-muted/40 p-4">
              <p className="text-[15px]">Precisa de mudar a proposta? Enquanto não há fatura, faz-se uma nova versão: a aceite fica guardada.</p>
              <NovaVersao ctx={ctx} d={d} texto="Refazer a proposta (nova versão)" />
            </div>
          )}
        </div>
      ) }, !!o.enviada) : g(PROPOSTA[0], FileSignature, !!o.enviada),
      // 12/11: aceite, o negócio passa a Financeiro. 16/11: o contrato é o primeiro passo de lá (passoContratoPrincipal)
    ];
  } else if (fase === 4 && simples) {
    // 10/11 (Rúben: «não queremos muitos passos, queremos certezas»). 18/11: o passo só com o número da fatura, a referência e o «Ok, já
    // foi paga». 20/11 (auditoria F10): o passo é a lista «Pagamentos» (Pagamentos.tsx), a mesma da Obra: as parcelas do contrato, as das
    // adendas e a nota de crédito, cada uma com um só botão (registar o número → «Ok, já foi paga» → paga)
    const L = linhasPagamentos(S, d), pc0 = L.find((x) => x.tipo === "contrato");
    const pContrato = passoContratoPrincipal();
    passos = [
      // 16/11: com contrato, primeiro o contrato assinado; depois a fatura e o pagamento
      ...(pContrato ? [pContrato] : []),
      { id: "fatura", titulo: "Pagamentos", icone: Euro, feito: d.fin.pago, semAvancar: true,
        resumo: [pc0 ? (pc0.numero ? `${pc0.numero} · ${pc0.estado === "paga" ? "paga" : "por pagar"}` : "por registar") : ""],
        corpo: <Pagamentos ctx={ctx} d={d} /> },
    ];
  } else if (fase === 4) {
    const pContrato = passoContratoPrincipal();
    passos = [
      ...(pContrato ? [pContrato] : []), // 16/11: o contrato antes da fatura
      // 20/11 (auditoria F12): sem o ramo DocumentosSimples (aqui nunca é simples: esse é o caso de cima)
      { id: "docs", titulo: "Fatura e recibo", icone: Euro, feito: !!d.fin.recibo, resumo: [d.fin.fatura?.n || "fatura por registar"], corpo: <div className="pg estreito"><Documentos ctx={ctx} d={d} /></div> },
      // 3/11 (Rúben): o Pagamento não se preenche à mão. 20/11 (auditoria F10): é a lista «Pagamentos», a mesma do aspeto simples e da Obra.
      // Os outros grupos (dados de faturação, fatura) continuam como a empresa os definiu.
      ...FINANCEIRO.map((gr) => gr === FINANCEIRO[2]
        ? { id: gr.titulo, titulo: E(gr).nome || gr.titulo, icone: Euro, feito: d.fin.pago,
            resumo: [d.fin.pago ? "validado" : d.f.comprovativo ? "o cliente diz que pagou" : "à espera do cliente"],
            corpo: <Pagamentos ctx={ctx} d={d} /> }
        : g(gr, Euro)),
    ];
  } else if (fase === 5) {
    // 12/11 (Rúben: «a validação das medidas das obras e a validação do plano da obra só vêm depois do Financeiro»): na Obra, depois do
    // pagamento, o supervisor retifica as medidas e as Operações aprovam o plano (ao mesmo tempo). 16/11: o contrato já vem assinado (ou é
    // venda direta, que também retifica as medidas); se a retificação mudar o valor, volta ao Financeiro (AcertoDoValor, no passo da obra).
    const semObraAMedir = !!d.orc?.vendaDireta;
    const passoRetif: Passo = { id: "retificacao", titulo: simples ? "Medidas" : "Retificação de medidas", icone: Ruler, feito: retificacaoAceite(d), semAvancar: true,
      principalNoCorpo: estudioMedidasEPrincipal(ctx, d),
      resumo: [d.f.retif_aceite ? `aceites a ${d.f.retif_aceite.split("-").reverse().join("/")}` : "por fazer"],
      corpo: <RetificacaoMedidas ctx={ctx} d={d} /> };
    const passoContrato = passoContratoPrincipal();
    const verAcerto = acertoDoValorPendente(d) || (!!adendaDoAcerto(d) && retificacaoPorPagar(d));
    passos = [
      passoRetif,
      // 21/10 (Ruben): no aspeto simples, o plano e os materiais são dois passos (antes, um só "Plano e materiais" parecia só o plano)
      // 12/11: com o plano aprovado e o contrato por assinar, o passo conta como feito (a página segue para o Contrato); assinado, é a obra
      { id: "obra", titulo: simples ? "Plano da obra" : "Plano, materiais e resultado", icone: simples ? CalendarClock : Hammer,
        // 18/11 (Rúben: «o plano da obra não ficou fechado, devia ter ficado»): aprovado é feito, com o contrato assinado ou não
        feito: d.obra.plano?.estado === "concluída" || (!semObraAMedir && planoAprovadoDe(d) && !!o?.aceite), resumo: [d.obra.plano?.estado || ""],
        // 9/11 (Rúben): o Estúdio do plano, por cima do negócio (o calendário por técnico, os alertas e aprovar)
        // 12/11: o contrato assinado com o valor mudado: o acerto (a adenda) à vista também aqui, onde a página abre
        corpo: simples ? <div className="space-y-6">{verAcerto && <AcertoDoValor ctx={ctx} d={d} />}{d.obra.plano && d.obra.plano.estado !== "por aprovar" ? <AbrirEstudioObra ctx={ctx} d={d} /> : <AbrirEstudioPlano ctx={ctx} d={d} />}<ObraSimples {...ctx} d={d} /></div> : <div className="pg estreito"><ObraResumo {...ctx} d={d} /></div> },
      ...(passoContrato ? [passoContrato] : []),
      ...(simples ? [(() => {
        const r = d.obra.ec?.ref ? resumoEcNegocio(lerInventario(), d.obra.ec.ref) : null, c = contaMateriais(d, r);
        return { id: "materiais", titulo: "Materiais", icone: Package, feito: materiaisProntos(d, r), resumo: [c ? `${c.ok} de ${c.n} garantidos` : "por encomendar"],
          corpo: <MateriaisObra {...ctx} d={d} /> };
      })()] : []),
      g(OBRA[0], Hammer), g(OBRA[1], Check),
      // 19/11 (Rúben): as parcelas do contrato a seguir à 1.ª (a do arranque, a do fim antes da entrega), no Financeiro. 20/11 (auditoria
      // F10): a lista «Pagamentos», a mesma do Financeiro, com as adendas e a nota de crédito; aparece quando há mais do que a 1.ª paga
      ...(o ? (() => {
        const L = linhasPagamentos(S, d), R = resumoPagamentos(L);
        if (L.length < 2 && R.feitas === R.total) return [];
        return [{ id: "parcelas", titulo: "Pagamentos", icone: Euro, feito: R.feitas === R.total, semAvancar: true, resumo: [R.texto], corpo: <Pagamentos ctx={ctx} d={d} /> }];
      })() : []),
    ];
  }
  // os grupos que a empresa escondeu não aparecem
  passos = passos.filter((ps) => { const gr = [...LEAD, ...CONTACTO, EXTERIOR, INTERIOR, AREA, ESCOLHAS, ...PROPOSTA, ...FINANCEIRO, ...OBRA].find((x) => x.titulo === ps.id); return !gr || !E(gr).oculto; });
  // depois de tentar passar de fase: quantos campos faltam em cada passo
  const TODOS: Grupo[] = [...LEAD, ...CONTACTO, EXTERIOR, INTERIOR, AREA, ESCOLHAS, ...PROPOSTA, ...FINANCEIRO, ...OBRA];
  for (const ps of passos) {
    const gr = TODOS.find((x) => x.titulo === ps.id);
    if (gr && aValidar(d, gr.titulo)) ps.falta = emFalta(gr === AREA ? gruposArea(S.campos, d.f).map(E) : [E(gr)], d.f).length;
    if (ps.id === "visitas") ps.falta = visitas(d).reduce((a, n) => a + (aValidar(d, `Visita ${n}`) ? emFalta([grupoVisita(n)], d.f).length : 0), 0) + (aValidar(d, "visitas") && !visitaFeita(d) ? 1 : 0) || undefined;
    if (ps.id === "medidas" && aValidar(d, "medidas")) ps.falta = camposMedida(L).filter(([k]) => medidaEmFalta(v.med, k)).length;
    if (ps.id === "nec" && aValidar(d, "nec")) ps.falta = (orcLinhas(d, S).length ? 0 : 1) + faltaProdutosVisita(d, S).length || undefined;
    if (ps.id === "nec" && simples && aValidar(d, ESCOLHAS.titulo) && !E(ESCOLHAS).oculto) ps.falta = (ps.falta || 0) + emFalta([E(ESCOLHAS)], d.f).length || undefined;
    // as fotografias contam no total; o aviso fica na área de intervenção (onde está "o cliente não quis")
    if (ps.id === AREA.titulo && aValidar(d, "fotos") && !(v.fotos > 0) && d.f.diag_cliente_recusou_fotos !== "Sim") ps.falta = (ps.falta || 0) + 1;
  }
  return passos;
}

/** 20/11 (auditoria F10): o passo que o sinal do Hoje abre (-1: nenhum). «Registar a fatura» de uma adenda (alvoFaturaAdenda) e do contrato
 *  (sec-4) levam à lista «Pagamentos»: na Obra o passo «parcelas», no Financeiro o «fatura». */
export function passoDoPulso(pulse: string | null | undefined, passos: Pick<Passo, "id">[]): number {
  if (!pulse || !(pulse.startsWith("ft-ad:") || pulse === "sec-4")) return -1;
  lembrarFoco(pulse);
  const i = passos.findIndex((x) => x.id === "parcelas");
  return i >= 0 ? i : passos.findIndex((x) => x.id === "fatura");
}

// 6/11: PERM_DO_PASSO e permEmFaltaDoPasso passaram para permissoes.ts (o CaminhoObra também os usa, sem carregar esta página)
export { permEmFaltaDoPasso };

/** O botão do próximo passo do negócio (ou o simulador do cliente). 20/11: `variante` «outline» quando outro botão é o principal do ecrã
 *  (na Visita, «Começar a gravar» ou «Terminar e preencher» antes de «Fechar levantamento»: principalDaVisita.ts). */
export function BotaoFase({ ctx, d, tamanho = "lg", variante }: { ctx: Ctx; d: Negocio; tamanho?: "lg" | "default"; variante?: "default" | "outline" }) {
  const { S, A, go } = ctx;
  const idSemPerm = useId();
  // 9/11 (Lote 1, B): o passo é do papel atual OU quem entrou tem as permissões que ele pede (passoDe, só com conta real)
  const p = proximo(d, S), meu = passoDe(S.role, p.who, p.act);
  const falta = meu && p.btn ? permEmFaltaDoPasso(S, p.act) : null;
  // 9/11: o super admin, numa base de teste, age pelo cliente (aceitar a proposta, assinar o contrato)
  const teste = useModoTeste();
  // FERRAMENTAS-TESTE (temporário, remover antes da main): com o botão novo, o antigo do super admin não se repete
  const simCli = useSimularClienteTeste();
  // 04/11/2026: enviar a proposta / o contrato ao portal pede também a permissão real de quem está ligado (permPortalPasso.tsx)
  const portal = usePermPortalDoPasso(p.act, meu && !!p.btn && !falta);
  if (falta) return (
    <div className="grid justify-items-start gap-1 sm:justify-items-end">
      <Button size={tamanho} variant={variante} disabled aria-describedby={idSemPerm}>{p.btn}</Button>
      <p id={idSemPerm} className="max-w-sm text-sm text-muted-foreground sm:text-right">{SEM_PERM[falta].sub}</p>
    </div>
  );
  // 19/11 (auditoria): «Registar chamada» pede o resultado da chamada (sem valor por omissão) e, para voltar a ligar, o dia
  if (p.act === "contactar" && meu) return <RegistarChamada ctx={ctx} d={d} tamanho={tamanho} />;
  // 15/10: o cliente pediu alterações no portal: o botão abre a nova versão já com o que ele pediu
  if (p.act === "pedidoCliente" && meu) return <NovaVersao ctx={ctx} d={d} texto={p.btn} />;
  // 20/11 (auditoria F10): a fatura do Eticadata regista-se só na lista «Pagamentos»: o botão (A.registarFaturaErp sem número) abre-a
  // com o cursor no campo do número
  if (p.btn && meu && !portal.pode) return (
    <div className="grid justify-items-start gap-1 sm:justify-items-end">
      <Button size={tamanho} variant={variante} disabled aria-describedby={portal.semPermissao ? idSemPerm : undefined}>{p.btn}<ArrowRight className="ml-2 h-4 w-4" /></Button>
      {portal.semPermissao && <p id={idSemPerm} className="max-w-sm text-sm text-muted-foreground sm:text-right">{portal.motivo}</p>}
    </div>
  );
  if (p.btn) return meu
    ? <Button size={tamanho} variant={variante} onClick={go(() => fazer(A, p.act!, d.id, p.arg))}>{p.btn}<ArrowRight className="ml-2 h-4 w-4" /></Button>
    : (
      <div className="grid justify-items-start gap-1 sm:justify-items-end">
        <Button size={tamanho} variant={variante} disabled>{p.btn}</Button>
        <button type="button" className="text-sm font-medium text-primary underline-offset-4 hover:underline" onClick={go(() => A.role(p.who as Papel))}>Mudar para {PAPEIS[p.who as Papel].n}</button>
      </div>
    );
  // 27/10 (Rúben): sem o "Simular o cliente": quem aceita, recusa e assina é o cliente, no portal (o link da proposta)
  if (p.sim) return (
    <div className="grid justify-items-start gap-2 sm:justify-items-end">
      {/* FERRAMENTAS-TESTE (temporário, remover antes da main): o botão de teste ao lado do texto, para os perfis normais */}
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <span className="text-sm text-muted-foreground">À espera do cliente no portal</span>
        {(p.sim === "aceitar" || p.sim === "assinar") && <BotaoTesteSimularCliente d={d} acao={p.sim} tamanho={tamanho} />}
      </div>
      {teste && !simCli && (p.sim === "aceitar" || p.sim === "assinar") && <BotaoTesteCliente d={d} acao={p.sim} tamanho={tamanho} />}
    </div>
  );
  if (p.wait && p.who === "direcao") return <Button variant="outline" size={tamanho} onClick={go(() => A.role("direcao"))}>Mudar para Direção</Button>;
  return null;
}
export const temBotaoFase = (ctx: Ctx, d: Negocio) => { const p = proximo(d, ctx.S); return !!(p.btn || p.sim || (p.wait && p.who === "direcao")); };

function FaseAtual({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const { S } = ctx;
  // 9/11 (Lote 1, B): o passo é do papel atual OU quem entrou tem as permissões que ele pede (passoDe, só com conta real)
  const p = proximo(d, S), meu = passoDe(S.role, p.who, p.act);
  const passos = passosDaFase(ctx, d);
  const primeiro = Math.max(0, passos.findIndex((x) => (x.conta ? x.conta.f < x.conta.n : !x.feito)));
  const [ativo, setAtivo] = useState(primeiro);
  // tentou passar de fase com campos em falta: abre o primeiro passo com falta e põe o cursor no campo
  useEffect(() => {
    if (S.pulse !== "falta") return;
    const i = passos.findIndex((x) => (x.falta || 0) > 0);
    if (i >= 0 && i !== ativo) setAtivo(i);
    irParaCampoEmFalta();
  });
  // 20/11 (auditoria F10): o «Registar a fatura» do Hoje (a da adenda ou a do contrato) abre o passo «Pagamentos», onde se escreve o número
  useEffect(() => {
    const i = passoDoPulso(S.pulse, passos);
    if (i >= 0 && i !== ativo) setAtivo(i);
  });
  const total = passos.reduce((a, x) => a + (x.conta ? x.conta.n : 1), 0);
  const feitos = passos.reduce((a, x) => a + (x.conta ? x.conta.f : x.feito ? 1 : 0), 0);
  const Ic = ICONE_FASE[d.fase];

  const botao = temBotaoFase(ctx, d) ? <BotaoFase ctx={ctx} d={d} /> : null;

  return (
    <section className="overflow-hidden rounded-2xl border border-primary/30 bg-card shadow-[var(--shadow-md)] animate-in fade-in-0 slide-in-from-bottom-6 duration-700">
      <div aria-hidden="true" className="h-1 w-full bg-gradient-to-r from-primary via-accent to-primary/30" />
      <div className="flex flex-wrap items-center gap-3 border-b border-border/60 bg-gradient-to-r from-primary/[0.07] to-transparent px-4 py-3 sm:px-5">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground shadow-md"><Ic className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Fase {d.fase + 1} de 6</p>
          <h2 className="text-lg font-bold leading-tight">{FASES[d.fase]}</h2>
        </div>
        <div className="w-full sm:w-48">
          <div className="flex justify-between text-[11px] text-muted-foreground"><span>{feitos} de {total} preenchidos</span><span className="font-mono">{total ? Math.round((feitos / total) * 100) : 0}%</span></div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-[width] duration-700 ease-out" style={{ width: `${total ? (feitos / total) * 100 : 0}%` }} /></div>
        </div>
      </div>

      {/* Próximo passo */}
      <div className={cn("flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3 sm:px-5", p.done ? "bg-success/10" : "bg-muted/30")}>
        <div className="min-w-0">
          <p className={cn("text-[11px] font-semibold uppercase tracking-[0.14em]", p.done ? "text-success" : "text-primary")}>
            {p.done ? "Concluído" : "Próximo passo"}{p.who && p.who !== "cliente" && !p.done ? " · " + PAPEIS[p.who].n.split("·").pop()!.trim() : ""}
          </p>
          <p className="font-semibold">{p.t}</p>
          {p.sub && <p className="text-sm text-muted-foreground">{p.sub}</p>}
        </div>
        {botao}
      </div>

      <div className="space-y-3 p-4 sm:p-5">
        {d.fase === 2 && <Legenda />}
        {passos.length > 0 && (
          <Assistente passos={passos} ativo={ativo} setAtivo={setAtivo} fim={
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 to-accent/5 p-4">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground animate-in zoom-in-50"><Sparkles className="h-4 w-4" /></span>
                <div><p className="font-semibold">Fase {FASES[d.fase]} pronta</p><p className="text-sm text-muted-foreground">{p.t}</p></div>
              </div>
              {botao && <div className="relative">{meu && <span className="absolute inset-0 animate-ping rounded-md bg-primary/30 [animation-duration:1.8s]" aria-hidden="true" />}<div className="relative">{botao}</div></div>}
            </div>
          } />
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ peças da fase */
export function Documentos({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  // 19/10: os documentos levam IVA (a fatura é da 1.ª tranche, o sinal, como no portal); os ecrãs internos é que mostram sem IVA
  const sinal = d.orc ? valorSinal(d, ctx.S) : null, tranche = `${d.f.tranche || "1.ª tranche"} · com IVA`;
  return (
    <div className="withside">
      <div className="tw"><table><thead><tr><th>Documento</th><th>Estado</th><th className="n">Valor c/ IVA</th></tr></thead><tbody>
        <tr>
          <td>{d.fin.fatura ? d.fin.fatura.n : "Fatura"}<small>{d.fin.fatura ? "emitida " + d.fin.fatura.q + " · enviada ao portal do cliente" : "por emitir · só o Financeiro emite"}</small></td>
          <td>{d.fin.pago ? <span className="pill ok">Paga</span> : d.fin.fatura ? <span className="pill warn">Por pagar</span> : <span className="pill mut">Por emitir</span>}</td>
          <td className="n">{sinal != null ? <>{eur(sinal)}<small>{tranche}</small></> : ""}</td>
        </tr>
        <tr>
          <td>{d.fin.recibo ? d.fin.recibo.n : "Recibo"}<small>{d.fin.recibo ? "emitido " + d.fin.recibo.q : "emitido ao validar o pagamento"}</small></td>
          <td>{d.fin.recibo ? <span className="pill ok">Emitido</span> : <span className="pill mut">Ainda não</span>}</td>
          <td className="n">{d.fin.pago && sinal != null ? <>{eur(sinal)}<small>{tranche}</small></> : ""}</td>
        </tr>
      </tbody></table></div>
      <div className="card">
        <h3>Ao validar o pagamento</h3>
        <div className="trig">
          <div><i className={d.fin.recibo ? "on" : ""}>1</i><span><b>Inventário</b><small>a encomenda de cliente é emitida sozinha: reserva o stock (FIFO) e o que falta vai numa encomenda ao fornecedor, por aprovar</small></span></div>
          <div><i className={d.fin.recibo ? "on" : ""}>2</i><span><b>Operações</b><small>aprovam o plano da obra (gerado no contrato) e arrancam com os materiais no armazém</small></span></div>
          <div><i className={d.fin.recibo ? "on" : ""}>3</i><span><b>Cliente</b><small>recebe o recibo no portal</small></span></div>
        </div>
        <span className="sub">Por agora a validação é interna. Quando o portal aceitar pagamentos, passa a ser automática.</span>
      </div>
    </div>
  );
}

export function Orcamento({ S, A, go, run, d, podeVerCatalogo }: Ctx & { d: Negocio }) {
  const o = d.orc!, T = tot(d, S), locked = !!o.enviada;
  const pt = partes(d, S), mw = Math.max(0, Math.min(1, T.m / 0.5));
  const mcls = T.m < S.cfg.min / 100 ? "bad" : T.m < S.cfg.alvo / 100 - 0.005 ? "warn" : "ok";
  const mudou = () => { d.orc!.aprov = null; d.fresh = false; };
  const AL = o.verif && !locked ? alertas(d, S) : [];
  const nX = AL.filter((a) => a.k === "x").length, nW = AL.filter((a) => a.k === "w").length;
  const okLinhas = ["Nenhuma linha abaixo do custo", "Todas as linhas têm custo no Catálogo"].filter((_, i) => !AL.some((a) => (i === 0 ? a.t.startsWith("Preço abaixo") : false)));

  return (
    <>
      <div className="row">
        <span className="sub">Orçamento v1 · modelo "{o.modelo}" · medidas da visita</span>
        <label className="row" style={{ gap: 6, fontSize: 12.5 }}>
          <input type="checkbox" checked={o.vendaDireta} disabled={locked}
            onChange={(e) => { const val = e.target.checked; run(() => A.vendaDireta(d.id, val)); }} />
          {" "}Venda direta (sem contrato)
        </label>
      </div>
      <div className="withside">
        <div className="stack">
          <LinhasOrcamento ctx={{ S, A, go, run, podeVerCatalogo }} d={d} />
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-[var(--shadow-sm)]">
            <label className="flex items-center gap-2 text-sm">Desconto
              <Campo id={`desc-${d.id}`} ariaLabel="Desconto em percentagem" value={nfmt(o.desconto)} readOnly={locked}
                onCommit={(v) => run(() => { const n = numero(v); o.desconto = isNaN(n) ? 0 : Math.max(0, Math.min(50, n)); mudou(); })} /> %
            </label>
            <span className="text-sm text-muted-foreground">{nfmt(T.h)} h · custo {eur(T.custo)} €</span>
            <span className="text-base font-semibold tabular-nums">Total sem IVA {eur(T.pf)} € {podeVerCustos() && <span className="ml-1 text-sm font-medium text-muted-foreground">margem {pct(T.m)}</span>}</span>
          </div>
          <ProdutosOrcamento S={S} A={A} run={run} d={d} />
          {/* 12/11: a agenda dos técnicos para a obra (bloqueia o envio sem ninguém livre) */}
          {!locked && <AgendaDaPropostaCartao S={S} A={A} run={run} d={d} />}
          {o.verif && !locked && (
            <div className={"card " + (S.pulse === "verif" ? "sec pulse" : "")} id="verif" style={{ borderColor: "var(--pri-line)" }}>
              <h3>Verificar antes de enviar <span>{nX} bloqueio(s) · {nW} aviso(s)</span></h3>
              <div className="al">
                {AL.map((a, k) => (
                  <div key={k} className={a.k}>
                    <i>!</i><span><b>{a.t}</b><small>{a.d}</small></span>
                    <span className="acts">
                      {a.sug != null && <Btn cls="sm" onClick={go(() => A.sugerido(d.id, a.i!, a.sug!))}>Usar {eur(a.sug)} €</Btn>}
                      {a.go && podeVerCatalogo !== false && <Btn cls="sec sm" onClick={go(() => A.nav(a.go!))}>Abrir Catálogo</Btn>}
                      {a.key && <Btn cls="sec sm" onClick={go(() => A.vistoAviso(d.id, a.key!))}>Visto</Btn>}
                    </span>
                  </div>
                ))}
                {okLinhas.map((t) => <div key={t} className="o"><i>✓</i><span><b>{t}</b></span><span /></div>)}
              </div>
              {bloqueado(d, S) && AL.filter((a) => a.k === "x").every((a) => a.aprov) && (
                o.aprov === "pedida"
                  ? <div className="note">Pedido de aprovação enviado à Direção. Fica registado quem aprovou.</div>
                  : <div className="row"><span className="sub">Quer mesmo enviar assim? É preciso aprovação.</span><Btn cls="sec sm" onClick={go(() => A.pedirAprov(d.id))}>Pedir aprovação à Direção</Btn></div>
              )}
              {o.aprov === "ok" && <div className="note" style={{ background: "var(--ok-bg)", color: "var(--ok)" }}>Exceção aprovada pela Direção.</div>}
            </div>
          )}
          {locked && (
            <div className="kv">
              <span>Proposta</span><b>enviada {o.enviada}{o.aceite ? " · aceite " + o.aceite : ""}</b>
              {o.vendaDireta
                ? <><span>Contrato</span><b>venda direta, não há</b></>
                : <><span>Contrato</span><b>{o.contrato === "assinado" ? "assinado" : o.contrato === "enviado" ? "enviado, à espera da assinatura" : "por enviar"}</b></>}
            </div>
          )}
        </div>
        <div className="card">
          <h3>Margem <span className={"pill " + mcls}>{pct(T.m)}</span></h3>
          <div className="meter">
            <i style={{ width: mw * 100 + "%", background: mcls === "ok" ? "var(--ok)" : mcls === "warn" ? "var(--amber)" : "var(--bad)" }} />
            <b style={{ left: S.cfg.min * 2 + "%" }} title="mínimo" /><b style={{ left: S.cfg.alvo * 2 + "%" }} title="alvo" />
          </div>
          <div className="sub">mínimo {S.cfg.min}% · alvo {S.cfg.alvo}% · em Definições</div>
          <div className="kv">
            <span>Mão de obra</span><b>{eur(pt.mo)} €</b><span>Equipamentos</span><b>{eur(pt.eq)} €</b><span>Consumíveis</span><b>{eur(pt.cons)} €</b>
            {S.cfg.estrutura && <><span>Estrutura</span><b>{eur(pt.estr)} €</b></>}
            <span>Materiais</span><b>{eur(pt.mat)} €</b>
            <span className="tot">Custo total</span><b className="tot">{eur(T.custo)} €</b>
            <span className="tot">Lucro previsto</span><b className="tot">{eur(T.pf - T.custo)} €</b>
          </div>
        </div>
      </div>
    </>
  );
}

function ObraResumo({ S, A, go, d }: Ctx & { d: Negocio }) {
  const pl = d.obra.plano!, T = tot(d, S);
  // os materiais lidos ao vivo do Inventário (as obras antigas do exemplo já os têm na obra)
  const db = useInventario();
  const r = d.obra.ec?.ref ? resumoEcNegocio(db, d.obra.ec.ref) : null;
  const matOk = !!r?.pronta || (!!d.obra.ec && !d.obra.ec.ref);
  const est = { "por aprovar": "warn", aprovado: "pri", "em curso": "pri", "concluída": "ok" }[pl.estado];
  const R = d.obra.real;
  const mx = R ? Math.max(...R.tasks.map((t) => Math.max(t.prev, t.real))) : 1;
  return (
    <>
      <div className="g2">
        <div className="card">
          <h3>Plano da obra <span className={"pill " + est}>{pl.estado}</span></h3>
          <div className="kv"><span>Fases</span><b>{pl.tasks.length}</b><span>Horas previstas</span><b>{nfmt(pl.tasks.reduce((a, t) => a + t.h, 0))} h</b><span>Conflitos</span><b>{conflitos(pl).length}</b></div>
          <Btn cls="sec sm" onClick={go(() => A.abrirPlano(d.id))}>Abrir nas Operações</Btn>
        </div>
        <div className="card">
          <h3>Materiais <span className={"pill " + (matOk ? "ok" : "warn")}>{r ? (r.pronta ? "prontos" : r.rotulo.toLowerCase()) : d.obra.ec ? "na obra" : "—"}</span></h3>
          <div className="kv">
            {r ? r.linhas.slice(0, 4).map((l) => { const st = estadoLinhaNegocio(l); return <Fragment key={l.id}><span>{l.n}</span><b>{(st.ok ? "✓ " : "") + nfmt(l.q) + " " + l.un + " · " + st.t}</b></Fragment>; })
              : (d.obra.mats || []).slice(0, 4).map((x) => <Fragment key={x.n}><span>{x.n}</span><b>{"✓ " + nfmt(x.q) + " " + x.un}</b></Fragment>)}
          </div>
          <Btn cls="sec sm" onClick={go(() => A.abrirInv(d.id))}>Abrir no Inventário</Btn>
        </div>
      </div>
      {R && (
        <div className="withside">
          <div className="card">
            <h3>Previsto contra real <span>horas de equipa</span></h3>
            <div className="bars">
              {R.tasks.map((t) => (
                <div className="b" key={t.nome}>
                  <span>{t.nome}</span>
                  <div className="tr"><i style={{ width: (t.prev / mx) * 100 + "%" }} /><i className={"r " + (t.real > t.prev * 1.05 ? "over" : "")} style={{ width: (t.real / mx) * 100 + "%" }} /></div>
                  <em>{nfmt(t.real)} h<small>prev. {nfmt(t.prev)}</small></em>
                </div>
              ))}
            </div>
            <div className="legend"><span><i style={{ background: "var(--pri-line)" }} />previsto</span><span><i style={{ background: "var(--pri)" }} />real</span><span><i style={{ background: "var(--amber)" }} />acima do previsto</span></div>
          </div>
          <div className="card">
            <h3>O que se aprende</h3>
            <div className="kv">
              <span>Custo previsto</span><b>{eur(T.custo)} €</b><span>Custo real</span><b>{eur(R.custoReal)} €</b>
              <span className="tot">Margem orçada</span><b className="tot">{pct(T.m)}</b><span className="tot">Margem real</span><b className="tot">{pct(R.m)}</b>
            </div>
            {d.obra.aprendido
              ? <span className="pill ok">Receita do revestimento atualizada</span>
              : <>
                <span className="sub">O revestimento levou mais 23% do que a receita prevê. Proposta: subir de {nfmt(S.svc.revest.h)} para {nfmt(r2(S.svc.revest.h * fatorReal("revest")))} h/m² no Catálogo.</span>
                <Btn cls="sm" onClick={go(() => A.aprender(d.id))}>Atualizar a receita</Btn>
              </>}
          </div>
        </div>
      )}
    </>
  );
}

/** 21/10: o passo Contrato antes de o cliente aceitar a proposta: fechado, com o porquê e o estado da proposta. */
/** 9/11: o botão do modo de teste (só o super admin, numa base de teste): o que o cliente faz no portal, pelo mesmo caminho. */
export function BotaoTesteCliente({ d, acao, tamanho = "default" }: { d: Negocio; acao: "aceitar" | "assinar"; tamanho?: "lg" | "default" }) {
  const teste = useModoTeste();
  const [aFazer, setAFazer] = useState(false);
  if (!teste) return null;
  const fazerTeste = () => { setAFazer(true); void (acao === "aceitar" ? teste.aceitarProposta(d) : teste.assinarContrato(d)).finally(() => setAFazer(false)); };
  return (
    <Button type="button" variant="outline" size={tamanho} className="border-dashed border-amber-500 text-amber-800 hover:bg-amber-50" disabled={aFazer} onClick={fazerTeste}>
      <FlaskConical className="mr-2 h-4 w-4" aria-hidden="true" />{aFazer ? "A fazer pelo cliente…" : acao === "aceitar" ? "Aceitar a proposta pelo cliente (teste)" : "Assinar o contrato pelo cliente (teste)"}
    </Button>
  );
}

// FERRAMENTAS-TESTE (temporário, remover antes da main)
// 11/11 (Rafael), 19/11 só o super admin (auditoria): no passo «À espera do cliente», o super admin aceita a proposta / assina o
// contrato como o cliente, pela Edge Function client-portal-action («simular_cliente»), o mesmo caminho do painel de teste. Só aparece no
// ambiente de testes (testarh, localhost ou VITE_FERRAMENTAS_TESTE=1) E quando a base diz que sim
// (fn_modo_teste_simular_cliente_para_mim: modo de teste ligado E super admin, migração 20270123500000); em produção o modo de teste está desligado.
const ambienteDoBotaoTeste = () => ambienteDeTeste(import.meta.env.VITE_FERRAMENTAS_TESTE as string | undefined, typeof window === "undefined" ? undefined : window.location.hostname);
export function BotaoTesteSimularCliente({ d, acao, tamanho = "default", ambiente = ambienteDoBotaoTeste }: { d: Negocio; acao: "aceitar" | "assinar"; tamanho?: "lg" | "default"; /** para os testes */ ambiente?: () => boolean }) {
  const teste = useSimularClienteTeste();
  const [aFazer, setAFazer] = useState(false);
  if (!teste || !ambiente()) return null;
  const fazerTeste = () => { setAFazer(true); void (acao === "aceitar" ? teste.aceitarProposta(d) : teste.assinarContrato(d)).finally(() => setAFazer(false)); };
  return (
    <Button type="button" size={tamanho} data-testid="botao-teste-simular-cliente"
      className="border-2 border-dashed border-amber-500 bg-amber-100 font-semibold text-amber-950 hover:bg-amber-200" disabled={aFazer} onClick={fazerTeste}>
      <FlaskConical className="mr-2 h-4 w-4" aria-hidden="true" />{aFazer ? (acao === "aceitar" ? "A aceitar…" : "A assinar…") : acao === "aceitar" ? "TESTE: aceitar como o cliente" : "TESTE: assinar como o cliente"}
    </Button>
  );
}

/** Marcar a visita noutro dia e hora que não as vagas sugeridas. 19/11 (auditoria): a vaga vai com a data completa (antes, slotDe deitava fora o ano). */
function OutraData({ INP, ROT, marcar }: { INP: string; ROT: string; marcar: (vaga: Vaga) => void }) {
  const [dia, setDia] = useState(""), [hora, setHora] = useState("10:00");
  return (
    <div className="flex flex-wrap items-end gap-3 pt-2">
      <label className={ROT}>Outro dia<input type="date" value={dia} onChange={(e) => setDia(e.target.value)} className={cn(INP, "w-44")} /></label>
      <label className={ROT}>Hora<input type="time" step={900} value={hora} onChange={(e) => setHora(e.target.value)} className={cn(INP, "w-28")} /></label>
      <Button type="button" variant="outline" disabled={!dia || !hora} onClick={() => marcar({ data: dia, hora })}><CalendarClock className="mr-1.5 h-4 w-4" />Marcar visita</Button>
    </div>
  );
}

/** 19/11 (auditoria): «Seguir sem adenda» com a margem abaixo do mínimo (margemSemAdenda) espera pela Direção: diz-se antes de carregar,
 *  e o pedido fica à vista; a Direção aprova ou recusa aqui. */
function SemAdendaDirecao({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const M = margemSemAdenda(d, ctx.S), pedida = d.f.acerto_sem_adenda_aprov === "pedida", direcao = podeNeg(ctx.S.role, "margin.approve");
  if (!M?.abaixo && !pedida) return null;
  const margem = M ? `Sem adenda, a margem fica em ${pct(M.m)} com as medidas novas (mínimo ${ctx.S.cfg.min}%).` : "";
  if (!pedida) return <p className="text-sm text-muted-foreground">{margem} {direcao ? "Seguir sem adenda fica como decisão da Direção." : "Seguir sem adenda pede a aprovação da Direção."}</p>;
  return (
    <div className="space-y-2 rounded-xl bg-warning/10 px-3 py-2 text-[15px]" role="status">
      <p>{margem} À espera da Direção para seguir sem adenda.</p>
      {direcao
        ? <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" className="min-h-10" onClick={() => ctx.run(() => { ctx.A.aprovarSemAdenda(d.id); })}>Aprovar sem adenda</Button>
            <Button type="button" size="sm" variant="outline" className="min-h-10" onClick={() => ctx.run(() => { ctx.A.recusarSemAdenda(d.id); })}>Recusar</Button>
          </div>
        : <button type="button" className="text-sm font-medium text-primary underline-offset-4 hover:underline" onClick={() => ctx.run(() => ctx.A.role("direcao"))}>Mudar para {PAPEIS.direcao.n}</button>}
    </div>
  );
}

/** 12/11 (Rúben: as medidas e o plano depois do Financeiro; se mudarem o valor, «adenda»): com o contrato assinado, o que mudou o valor, os
 *  euros, e a adenda do acerto (preparar, ou seguir sem ela). Preparada, mostra a adenda com as ações dela (verificar, enviar...). */
function AcertoDoValor({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const R = mudancasDeValor(d), pode = podeNeg(ctx.S.role, "orcamento.editar"), a = adendaDoAcerto(d);
  // 11/11: os euros que mudam (as medidas e o plano), para o comercial negociar com o número à frente; só o que as medidas e o plano
  // mudam (os «acertos» do orçamento refeito não entram: a adenda não os leva). 20/11: a mesma conta da nota de crédito (listaPagamentos.ts)
  const dif = difDoAcerto(ctx.S, d);
  // 17/11 (fluxo de 16/11): se a retificação baixa o valor, não há adenda: o Financeiro emite a nota de crédito no programa certificado e
  // regista-a aqui (A.registarNotaCredito, finance.invoice); o comercial pode ainda seguir sem acerto
  const baixa = !a && dif < -0.004;
  if (baixa) return <NotaDeCredito ctx={ctx} d={d} R={R} dif={dif} podeComercial={pode} />;
  return (
    <section aria-labelledby="acerto-t" className="space-y-3 rounded-2xl border border-amber-300/70 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="acerto-t" className="text-[17px] font-semibold tracking-tight">{a ? `Acerto do valor: adenda ${a.n}` : "O valor mudou: o acerto faz-se numa adenda"}</h3>
        {Math.abs(dif) > 0.004 && <p className="text-lg font-semibold tabular-nums">{dif > 0 ? "+" : "−"}{eur(Math.abs(dif))} € <span className="text-sm font-normal text-muted-foreground">s/ IVA</span></p>}
      </div>
      <ul className="list-disc space-y-0.5 pl-5 text-[15px]">{R.map((x) => <li key={x}>{x}</li>)}</ul>
      {a ? <AcoesAdenda ctx={ctx} d={d} a={a} /> : <>
        <p className="text-[15px] text-muted-foreground">
          O contrato e a fatura paga ficam como estão. A adenda leva o que as medidas do local e o plano juntam ao valor; o que desce não se desconta sozinho.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" className="min-h-11" disabled={!pode} onClick={() => ctx.run(() => { ctx.A.adendaDoValor(d.id); })}>Preparar a adenda</Button>
          <Button type="button" variant="ghost" className="min-h-11" disabled={!pode || d.f.acerto_sem_adenda_aprov === "pedida"} onClick={() => ctx.run(() => { ctx.A.semAdendaDoValor(d.id); })}>Seguir sem adenda</Button>
        </div>
        <SemAdendaDirecao ctx={ctx} d={d} />
        {!pode && <p className="text-sm text-muted-foreground">Quem prepara a adenda é o comercial. <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => ctx.run(() => ctx.A.role("comercial"))}>Mudar para {PAPEIS.comercial.n}</button></p>}
      </>}
    </section>
  );
}

/** 17/11 (teste do fluxo de 16/11): a retificação baixou o valor. O Financeiro emite a nota de crédito no programa certificado e regista o
 *  número (finance.invoice); com ela registada, o plano aprova-se e a encomenda de cliente segue. 20/11 (auditoria F10): o número
 *  regista-se na lista «Pagamentos» (Pagamentos.tsx), como as faturas; aqui fica o porquê e o «Seguir sem acerto» do comercial. */
export function NotaDeCredito({ ctx, d, R, dif, podeComercial }: { ctx: Ctx; d: Negocio; R: string[]; dif: number; podeComercial: boolean }) {
  return (
    <section aria-labelledby="nota-credito-t" className="space-y-3 rounded-2xl border border-amber-300/70 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="nota-credito-t" className="text-[17px] font-semibold tracking-tight">O valor baixou: nota de crédito</h3>
        <p className="text-lg font-semibold tabular-nums">−{eur(Math.abs(dif))} € <span className="text-sm font-normal text-muted-foreground">s/ IVA</span></p>
      </div>
      <ul className="list-disc space-y-0.5 pl-5 text-[15px]">{R.map((x) => <li key={x}>{x}</li>)}</ul>
      <p className="text-[15px] text-muted-foreground">O Financeiro emite a nota de crédito no programa de faturação certificado e regista o número em «Pagamentos». Depois, aprova-se o plano e segue a encomenda de cliente.</p>
      {podeComercial && <Button type="button" variant="ghost" className="min-h-11" disabled={d.f.acerto_sem_adenda_aprov === "pedida"} onClick={() => ctx.run(() => { ctx.A.semAdendaDoValor(d.id); })}>Seguir sem acerto</Button>}
      <SemAdendaDirecao ctx={ctx} d={d} />
    </section>
  );
}
