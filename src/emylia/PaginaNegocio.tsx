// Página do negócio (09/10/2026): só a fase atual está aberta, um passo de
// cada vez. As fases feitas ficam num resumo; as seguintes aparecem quando
// chega a vez delas. Ao mudar de fase, a nova entra animada.
import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Bath, Building2, CalendarCheck, CalendarClock, Check, ChevronDown, ClipboardList, Euro, FileSignature, FileText, Hammer, Home, Lock, MapPin, Package, Phone, Ruler, Sparkles, Target, User, Wrench, type LucideIcon, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  FASES, LINHAS, PAPEIS, nomeLinha, visitaFeita, visitas,
  alertas, bloqueado, camposMedida, mudancasDeValor, impactoDasMedidas, impactoDoPlano, medidasRetificadas, conflitos, custoUn, eur, faltaProdutosVisita, medida, medidaEmFalta, porMedida, fatorReal, linhaCalc, nfmt, partes, pct, proximo, quandoEQuem, r2, tot, valorSinal,
  type Estado, type Negocio, type Papel, type SvcId,
} from "./motor";
import { AREA, CONTACTO, DECISAO, ESCOLHAS, EXTERIOR, FINANCEIRO, INTERIOR, LEAD, OBRA, PECAS_WC, PROPOSTA, contagem, divisaoPrincipal, divisoesEscolhidas, efetivo, emFalta, grupoVisita, gruposArea, type Def, type Grupo } from "./campos";
import { PlantaDivisao } from "./PlantaDivisao";
import { EstudioNaVisita, FecharVisita } from "./VisitaEstudio";
import { projetoDoNegocio } from "@/pages/prototipo-estudio/daVisita";
import { VisitasLista } from "./Visitas";
import { NovaVersao } from "./VoltarAtras";
import { RetificacaoMedidas } from "./RetificacaoMedidas";
import { AbrirEstudioPlano } from "./estudioPlano/EstudioPlano";
import { motivoOcupado, ocupacaoDosTecnicos, planoAprovadoDe, retificacaoAceite, rotuloDia } from "./preparacaoObra";
import { EstadoFaturaErp, RegistarFaturaErp } from "./FaturaErp";
import { UsarLocalizacao } from "./Localizacao";
import { MoradaDaObra } from "./MoradaDaObra";
import { ServicoDaChamada } from "./ServicoDaChamada";
import { ComercialDaLead, TextoDaLead, comDadosLead } from "./DadosDaLead";
import { MoradaDeQuemPede } from "./MoradaDeQuemPede";
import { vagasVisita } from "./vagasVisita";
import { orcLinhas } from "./ServicosCatalogo";
import { NecessidadesCliente } from "./NecessidadesVisita";
import { FotosEtapa } from "./FotosEtapa";
import { OrcamentoSimples } from "./OrcamentoSimples";
import { LinhasOrcamento } from "./LinhasOrcamento";
import { ProdutosOrcamento } from "./ProdutosOrcamento";
import { DocumentosSimples, ObraSimples } from "./FasesSimples";
import { ContratoDoc, Partilhar, PropostaDoc, tranches, totais } from "./DocsCliente";
import { Assistente, Campos, INPUT, INPUT_G, Legenda, aValidar, passoDeGrupo, resumoGrupos, type Passo } from "./CamposFase";
import { Btn, Campo, fazer, numero, type Ctx } from "./pecas";
import { ConfirmarAnulacao, oQueAnular, podeAnular } from "./AnularContrato";
import { lerInventario, useInventario } from "./inventario/loja";
import { MateriaisObra, contaMateriais, materiaisProntos } from "./MateriaisObra";
import { estadoLinhaNegocio, resumoEcNegocio } from "./inventario/ponteNegocios";
import { BotaoAcessoPortal, EstadoAcessoPortal } from "./AcessoPortalNegocio";
import { usePermPortalDoPasso } from "./permPortalPasso";
import { DocumentosParaCliente } from "./DocumentosParaCliente";
import { PagamentoDoCliente } from "./PagamentoDoCliente";
import { TelefoneComRascunho } from "./TelefoneIndicativo";
import { opcoesDaVisita, sugerirQuemVai } from "./sugestaoVisita";
import { irParaCampoEmFalta } from "./irParaCampoEmFalta";
import { SEM_PERM, passoDe, permEmFaltaDoPasso, podeNeg } from "./permissoes";
import { useModoTeste } from "./real/modoTeste";

const ICONE_FASE: LucideIcon[] = [Target, Phone, Ruler, FileSignature, Euro, Hammer];
const GRUPOS_FASE: Grupo[][] = [LEAD, CONTACTO, [EXTERIOR, INTERIOR, AREA, ESCOLHAS], PROPOSTA, FINANCEIRO, OBRA];
/** A origem como se mostra: em «Outros», o que se escreveu em «Outra origem». */
const origemDoNegocio = (d: Negocio) => (d.f.origem === "Outros" && d.f.origem_outra?.trim()) || d.f.origem || d.origem;
const QUANDO_ABRE = ["", "abre quando a chamada for registada", "abre quando a visita for marcada", "abre quando o levantamento fechar", "abre quando o contrato for assinado", "abre quando o pagamento for validado"];

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
          {T && <span key={eur(T.pf)} className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-sm text-primary animate-in fade-in-0 zoom-in-95"><span className="font-mono font-semibold tabular-nums">{eur(T.pf)} € s/ IVA</span>· margem {pct(T.m)}</span>}
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
  if (i === 3 && d.orc) { const T = tot(d, S); resumo = [eur(T.pf) + " € s/ IVA", "margem " + pct(T.m), d.orc.vendaDireta ? "venda direta" : "contrato " + (d.orc.contrato || "por enviar")]; }
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
          {/* 2/11: o telefone com o seletor de indicativo do país (um email escrito no contacto continua como estava) */}
          {d.tel.includes("@") ? <label className={ROT}>Telefone<input key={"t" + d.tel} defaultValue={d.tel} className={INP} onBlur={(e) => { const x = e.target.value.trim(); if (x && x !== d.tel) run(() => { d.tel = x; }); }} /></label>
            : <div className={cn(ROT, simples && "sm:max-w-sm")}><label htmlFor={`quem-tel-${d.id}`}>Telefone</label><TelefoneComRascunho key={"t" + d.tel} id={`quem-tel-${d.id}`} d={d} run={run} classe={INP} /></div>}
          <MoradaDeQuemPede ctx={ctx} d={d} />
          <Campos grupo={gPedido} {...fx} />
        </div>
      ), d.f), id: "quem", titulo: "Quem pede", personalizado: false, resumo: [d.nome, d.tel, d.f.pedido || ""].filter(Boolean) },
    ];
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
    passos = [
      // 27/10: no contacto ainda não se está no local: a localização fica para a visita (Exterior)
      // 28/10 (Rúben): a morada da obra também se preenche pela localização do dispositivo (quem está no local)
      // 4/11 (Rúben): na Qualificação, o tipo de serviço que veio da lead confirma-se (ou troca-se) na chamada: ServicoDaChamada.tsx
      // 4/11 (Rúben, o levantamento da chamada): Chamada (e quem liga), O que o cliente quer (o tipo de serviço e o que quer fazer), a Morada
      // da obra, a Qualificação e Marcar a visita. «Preparar a visita» saiu (nada disso se pergunta na chamada).
      { ...g(CONTACTO[0], Phone), corpo: <div className="space-y-5"><Campos grupo={E(CONTACTO[0])} {...fx} />{comDadosLead(d) && <ComercialDaLead ctx={ctx} d={d} />}</div> },
      { ...g(CONTACTO[1], ClipboardList), corpo: <div className="space-y-4"><ServicoDaChamada ctx={ctx} d={d} /><Campos grupo={E(CONTACTO[1])} {...fx} /></div>,
        resumo: [nomeLinha(d), ...resumoGrupos([E(CONTACTO[1])], d.f)].filter(Boolean) },
      // 4/11 (Rúben): a morada que a lead já trazia propõe-se primeiro (validar, editar ou outra): MoradaDaObra.tsx
      { ...g(CONTACTO[2], MapPin), corpo: <MoradaDaObra ctx={ctx} d={d}><Campos grupo={E(CONTACTO[2])} {...fx} /></MoradaDaObra> },
      { ...g(CONTACTO[3], Sparkles) },
      { id: "vaga", titulo: "Marcar a visita", icone: CalendarClock, feito: !!v.slot, resumo: v.slot ? [v.slot] : [], corpo: (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Vagas em {d.f.localidade || (d.local || "").split(",").pop() || "—"}. Em cada vaga, quem está livre e mais perto.</p>
          {/* 2/11 (reunião): a sugestão de quem vai, pela agenda (livre a essa hora) e pela proximidade (visitas perto nesse dia) */}
          <div className="flex flex-wrap gap-2">
            {vagasVisita().map((s) => {
              const sg = sugerirQuemVai(S.deals, d, s, opcoesDaVisita());
              return (
                <button key={s} type="button" onClick={go(() => A.marcarVisita(d.id, s, sg?.quem))} title={sg ? `${sg.nome}: ${sg.motivo}${sg.ocupados.length ? ` · ocupados: ${sg.ocupados.join(", ")}` : ""}` : undefined}
                  className="rounded-xl border border-border bg-card px-3 py-2 text-left text-sm font-medium transition hover:-translate-y-0.5 hover:border-primary hover:bg-primary/5 hover:text-primary hover:shadow-[var(--shadow-sm)]">
                  <span className="block"><CalendarClock className="mr-1.5 inline h-4 w-4" />{s}</span>
                  {sg && <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{sg.nome} · {sg.motivo}</span>}
                </button>
              );
            })}
          </div>
          <OutraData INP={INP} ROT={ROT} marcar={(slot) => go(() => A.marcarVisita(d.id, slot, sugerirQuemVai(S.deals, d, slot, opcoesDaVisita())?.quem))()} />
        </div>
      ) },
    ];
  } else if (fase === 2) {
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
    // 6/11: a cozinha também segue o Estúdio
    const comEstudio = comWC || d.linha === "coz" || divisoesEscolhidas(d.f).includes("Cozinha");
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
      const faltaNec = aValidar(d, "nec") ? (orcLinhas(d, S).length ? 0 : 1) + faltaProdutosVisita(d, S).length : 0;
      passos = [
        ...passos.slice(0, ate).filter((x) => x.id !== "visitas" && x.id !== areaId),
        { id: "estudio", titulo: "Estúdio", icone: Sparkles,
          feito: !!pr && Object.keys(pr.escolhas).length + (pr.porColocar ?? []).length + (pr.servicos ?? []).length > 0 && medOk === nMed && passoNec.feito === true,
          falta: faltaArea + faltaMed + faltaNec || undefined,
          resumo: [pr ? "projeto guardado" : "por abrir", d.f.duracao_obra ? `obra: ${d.f.duracao_obra}` : ""].filter(Boolean),
          corpo: <div className="space-y-10"><EstudioNaVisita ctx={ctx} d={d} /><FecharVisita ctx={ctx} d={d} decisao={<Campos grupo={eDecisao} {...fx} />} blocos={[
            ...(passoArea ? [{ id: "area", titulo: passoArea.titulo, resumo: passoArea.resumo.join(" · ") || "por preencher", corpo: passoArea.corpo, falta: faltaArea }] : []),
            ...(nMed === 0 ? [] : [{ id: "medidas", titulo: "Medidas da área", resumo: resumoMedidas.join(" · ") || "por preencher", corpo: corpoMedidas(false), falta: faltaMed }]),
            { id: "nec", titulo: "Necessidades do cliente", resumo: passoNec.resumo.join(" · ") || "por juntar", corpo: passoNec.corpo, falta: faltaNec },
            ...(ePecas.oculto || !comWC ? [] : [{ id: "pecas", titulo: "Peças da casa de banho", resumo: ((n) => (n ? `${n} ${n === 1 ? "resposta" : "respostas"}` : "por responder"))(ePecas.campos.filter((c) => !!d.f[c.k]?.trim()).length), corpo: <Campos grupo={ePecas} {...fx} /> }]),
          ]} /></div> },
      ];
    }
  } else if (fase === 3 && o) {
    const passoMedidas = (): Passo => ({ id: "retificacao", titulo: simples ? "Medidas" : "Retificação de medidas", icone: Ruler, feito: retificacaoAceite(d), semAvancar: true,
      resumo: [d.f.retif_aceite ? `aceites a ${d.f.retif_aceite.split("-").reverse().join("/")}` : "o supervisor confirma no local"],
      corpo: <RetificacaoMedidas ctx={ctx} d={d} /> });
    const passoPlanoAntes = (): Passo => ({ id: "plano", titulo: "Plano da obra", icone: CalendarClock, feito: planoAprovadoDe(d), semAvancar: true,
      resumo: [planoAprovadoDe(d) ? "aprovado" : !d.obra.plano ? "por gerar" : retificacaoAceite(d) ? "por aprovar" : "depois das medidas"],
      corpo: (
        <div className="space-y-6">
          <p className="rounded-xl bg-muted/60 px-4 py-3 text-[15px] text-muted-foreground">
            {planoAprovadoDe(d) ? "Plano aprovado. Segue o contrato." : retificacaoAceite(d) ? "As Operações ajustam e aprovam o plano no Estúdio. Aprovado, segue o contrato." : "Primeiro, o supervisor aceita as medidas. Depois as Operações aprovam o plano e segue o contrato."}
          </p>
          {!d.obra.plano && retificacaoAceite(d) && <Button type="button" className="min-h-11" onClick={() => ctx.run(() => ctx.A.gerarPlano(d.id))}><CalendarClock className="mr-1.5 h-4 w-4" aria-hidden="true" />Gerar o plano</Button>}
          {d.obra.plano && <ResumoDoPlano ctx={ctx} d={d} />}
          <AbrirEstudioPlano ctx={ctx} d={d} />
        </div>
      ) });
    passos = [
      // 27/10 (Rúben): enviada a proposta, o orçamento fica fechado (só de leitura) até o cliente aceitar; o cadeado diz porquê
      { id: "orc", titulo: "Orçamento", icone: o.enviada && !o.aceite && !o.vendaDireta ? Lock : FileText, feito: !!o.enviada || (o.verif && !bloqueado(d, S)),
        resumo: o.enviada && !o.aceite && !o.vendaDireta ? ["fechado até o cliente aceitar"] : [eur(tot(d, S).pf) + " € s/ IVA", "margem " + pct(tot(d, S).m)],
        corpo: simples ? <OrcamentoSimples {...ctx} d={d} /> : <div className="pg estreito"><Orcamento {...ctx} d={d} /></div> },
      simples ? fechadoSe({ ...g(PROPOSTA[0], FileSignature, !!o.enviada), corpo: (
        <div className="space-y-10">
          <Campos grupo={E(PROPOSTA[0])} {...fx} ro={!!o.enviada} />
          <Partilhar ctx={ctx} d={d} tipo="proposta" estado={o.aceite ? `aceite ${o.aceite}` : o.enviada ? `enviada ${o.enviada} · à espera do cliente` : "ainda não enviada"}>
            <PropostaDoc S={S} d={d} />
          </Partilhar>
          {/* 9/11 (Rúben: «enviámos a proposta sem querer»): aceite, mas com o contrato por assinar, a proposta ainda se refaz (novaVersao);
              a versão aceite fica guardada como substituída. Aqui, e não no Contrato: na ficha do Pipeline o Contrato mostra só a minuta. */}
          {o.aceite && o.contrato !== "assinado" && (
            <div className="space-y-3 rounded-2xl border border-border bg-muted/40 p-4">
              <p className="text-[15px]">Precisa de mudar a proposta? Enquanto o contrato não está assinado, faz-se uma nova versão: a aceite fica guardada.</p>
              <NovaVersao ctx={ctx} d={d} texto="Refazer a proposta (nova versão)" />
            </div>
          )}
        </div>
      ) }, !!o.enviada) : g(PROPOSTA[0], FileSignature, !!o.enviada),
      // 10/11 (Rúben: «medidas antes da fatura»; «o contrato fica depois do plano da obra ser aprovado e antes do pagamento»): aceite a
      // proposta, aqui no Negócio: o supervisor retifica as medidas, as Operações aprovam o plano e assina-se o contrato; assinado, o
      // Financeiro. Refeita a proposta (as medidas ou o plano mudaram o valor), as medidas e o plano ficam feitos: saltam-se.
      // 11/11 (Rúben: «fácil, intuitivo»): com a proposta enviada, o caminho que falta já se vê (fechado, com o cadeado, até o cliente aceitar)
      ...((o.enviada || o.aceite || d.f.retif_aceite) && !o.vendaDireta
        ? [passoMedidas(), passoPlanoAntes()].map((x) => (o.aceite || d.f.retif_aceite ? x : { ...x, bloqueado: true, resumo: ["depois de o cliente aceitar"] }))
        : []),
      // 21/10: o contrato só abre depois de o cliente aceitar a proposta (no portal ou registado pelo comercial).
      // 11/11: feito só com o contrato assinado (antes, os campos preenchidos davam-no por feito); a ação está aqui dentro
      ...(o.vendaDireta || (!o.enviada && !o.contrato) ? [] : [simples ? { ...g(PROPOSTA[1], FileSignature, !!o.contrato), conta: undefined, feito: o.contrato === "assinado", semAvancar: true,
        bloqueado: !o.aceite && !o.contrato,
        resumo: [o.contrato === "assinado" ? "assinado" : o.contrato === "enviado" ? "à espera da assinatura" : !o.aceite ? "depois de o cliente aceitar" : !planoAprovadoDe(d) ? "depois do plano" : mudancasDeValor(d).length ? "proposta nova primeiro" : "pronto a gerar"],
        corpo: (
        <div className="space-y-10">
          {!o.contrato && !planoAprovadoDe(d) && <p className="rounded-xl bg-muted/60 px-4 py-3 text-[15px] text-muted-foreground">O contrato gera-se depois de as medidas serem aceites e de as Operações aprovarem o plano.</p>}
          {/* 10/11: com o valor mudado, só o que mudou e o botão; o contrato vem depois da proposta nova aceite */}
          {!o.contrato && planoAprovadoDe(d) && mudancasDeValor(d).length > 0 ? <RefazerComMudancas ctx={ctx} d={d} /> : <>
            <Campos grupo={E(PROPOSTA[1])} {...fx} ro={!!o.contrato} />
            {/* 11/11: gerar (ou esperar pela assinatura) aqui mesmo, antes do texto do contrato */}
            {o.aceite && planoAprovadoDe(d) && o.contrato !== "assinado" && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/[0.04] p-4">
                <p className="text-[15px]">{o.contrato === "enviado" ? "O contrato está no portal do cliente, por assinar. Assinado, segue a fatura." : "Tudo pronto: o contrato vai ao portal do cliente, por assinar."}</p>
                <BotaoFase ctx={ctx} d={d} tamanho="default" />
              </div>
            )}
            <Partilhar ctx={ctx} d={d} tipo="contrato" estado={o.contrato === "assinado" ? "assinado" : o.contrato === "enviado" ? "à espera da assinatura" : !planoAprovadoDe(d) ? "depois do plano aprovado" : "plano aprovado · pronto a gerar"}>
              <ContratoDoc S={S} d={d} />
            </Partilhar>
          </>}
        </div>
      ) } : g(PROPOSTA[1], FileSignature, !!o.contrato)]),
    ];
  } else if (fase === 4 && simples) {
    // 10/11 (Rúben: «não queremos muitos passos, queremos certezas»): o Financeiro em dois passos. 1) A fatura: o valor a faturar agora,
    // os dados de faturação e da fatura, e o registo do número, tudo no mesmo sítio (o botão diz o que falta, se faltar). 2) O pagamento.
    const TI = totais(d, S), agora = d.orc ? tranches(d, TI.total, S)[0] : null, ft = d.fin.fatura;
    const gF = [FINANCEIRO[0], FINANCEIRO[1]].map(E).filter((x) => !x.oculto);
    const faltamF = emFalta(gF, d.f).length;
    passos = [
      { id: "fatura", titulo: "Fatura", icone: Euro, feito: !!ft, semAvancar: true,
        resumo: [ft ? ft.n : faltamF ? `falta${faltamF === 1 ? " 1 dado" : `m ${faltamF} dados`}` : "por registar"],
        corpo: (
          <div className="space-y-10">
            {agora && !ft && (
              <p className="rounded-2xl bg-primary/[0.06] px-4 py-3 text-[15px]">
                A faturar agora: <span className="font-semibold">{agora.l}</span> ({Math.round(agora.p * 100)}%) · <span className="font-semibold tabular-nums">{eur(agora.v)} €</span> com IVA
              </p>
            )}
            {gF.map((gr) => <Campos key={gr.titulo} grupo={gr} {...fx} ro={!!ft} />)}
            <section aria-label="Registar a fatura" className="space-y-2 rounded-2xl border border-border bg-card p-4">
              <h3 className="text-[17px] font-semibold tracking-tight">{ft ? `Fatura ${ft.n} registada` : "Registar a fatura"}</h3>
              {ft ? <EstadoFaturaErp ctx={ctx} d={d} />
                : <><p className="text-[15px] text-muted-foreground">Emita-a no Eticadata e escreva aqui o número: vai para o portal do cliente, com os dados para pagar.</p>
                  <RegistarFaturaErp ctx={ctx} d={d} aEsquerda /></>}
            </section>
          </div>
        ) },
      { id: FINANCEIRO[2].titulo, titulo: E(FINANCEIRO[2]).nome || FINANCEIRO[2].titulo, icone: Euro, feito: d.fin.pago,
        resumo: [d.fin.pago ? "validado" : !ft ? "depois da fatura" : d.f.comprovativo ? "o cliente diz que pagou" : "à espera do cliente"],
        corpo: <PagamentoDoCliente {...ctx} d={d} /> },
    ];
  } else if (fase === 4) {
    passos = [
      { id: "docs", titulo: "Fatura e recibo", icone: Euro, feito: !!d.fin.recibo, resumo: [d.fin.fatura?.n || "fatura por emitir"], corpo: simples ? <DocumentosSimples {...ctx} d={d} /> : <div className="pg estreito"><Documentos ctx={ctx} d={d} /></div> },
      // 3/11 (Rúben): o Pagamento não se preenche à mão: espera que o cliente diga no portal que pagou e o Financeiro só valida
      // (PagamentoDoCliente.tsx). Os outros grupos (dados de faturação, fatura) continuam como a empresa os definiu.
      ...FINANCEIRO.map((gr) => gr === FINANCEIRO[2]
        ? { id: gr.titulo, titulo: E(gr).nome || gr.titulo, icone: Euro, feito: d.fin.pago,
            resumo: [d.fin.pago ? "validado" : d.f.comprovativo ? "o cliente diz que pagou" : "à espera do cliente"],
            corpo: <PagamentoDoCliente {...ctx} d={d} /> }
        : g(gr, Euro)),
    ];
  } else if (fase === 5) {
    // 9/11 (Rúben, o fluxo novo): na Obra, primeiro o supervisor retifica as medidas; o plano aprova-se depois e só então se assina o contrato
    const semObraAMedir = !!d.orc?.vendaDireta;
    const passoRetif: Passo = { id: "retificacao", titulo: simples ? "Medidas" : "Retificação de medidas", icone: Ruler, feito: retificacaoAceite(d), semAvancar: true,
      resumo: [d.f.retif_aceite ? `aceites a ${d.f.retif_aceite.split("-").reverse().join("/")}` : "por fazer"],
      corpo: <RetificacaoMedidas ctx={ctx} d={d} /> };
    // 10/11: o contrato assina-se no Negócio; aqui só nos negócios antigos que chegaram à Obra sem ele assinado
    const passoContrato: Passo | null = o && !semObraAMedir && simples && o.contrato !== "assinado" ? fechadoSe({ ...g(PROPOSTA[1], FileSignature, !!o.contrato), semAvancar: true, corpo: (
      <div className="space-y-10">
        {!planoAprovadoDe(d) && <p className="rounded-xl bg-muted/60 px-4 py-3 text-[15px] text-muted-foreground">O contrato gera-se depois de as Operações aprovarem o plano (com as medidas retificadas).</p>}
        <Campos grupo={E(PROPOSTA[1])} {...fx} />
        <Partilhar ctx={ctx} d={d} tipo="contrato" estado={o.contrato === "enviado" ? "à espera da assinatura" : planoAprovadoDe(d) ? "plano aprovado · pronto a gerar" : "depois do plano aprovado"}>
          <ContratoDoc S={S} d={d} />
        </Partilhar>
      </div>
    ) }, false) : null;
    passos = [
      // 10/11 (Rúben: «medidas antes da fatura»): as medidas já vêm aceites do Negócio; aqui só nos negócios antigos que chegaram sem elas
      ...(semObraAMedir || retificacaoAceite(d) ? [] : [passoRetif]),
      // 21/10 (Ruben): no aspeto simples, o plano e os materiais são dois passos (antes, um só "Plano e materiais" parecia só o plano)
      { id: "obra", titulo: simples ? "Plano da obra" : "Plano, materiais e resultado", icone: simples ? CalendarClock : Hammer, feito: d.obra.plano?.estado === "concluída", resumo: [d.obra.plano?.estado || ""],
        // 9/11 (Rúben): o Estúdio do plano, por cima do negócio (o calendário por técnico, os alertas e aprovar)
        corpo: simples ? <div className="space-y-6"><AbrirEstudioPlano ctx={ctx} d={d} /><ObraSimples {...ctx} d={d} /></div> : <div className="pg estreito"><ObraResumo {...ctx} d={d} /></div> },
      ...(passoContrato ? [passoContrato] : []),
      ...(simples ? [(() => {
        const r = d.obra.ec?.ref ? resumoEcNegocio(lerInventario(), d.obra.ec.ref) : null, c = contaMateriais(d, r);
        return { id: "materiais", titulo: "Materiais", icone: Package, feito: materiaisProntos(d, r), resumo: [c ? `${c.ok} de ${c.n} garantidos` : "por encomendar"],
          corpo: <MateriaisObra {...ctx} d={d} /> };
      })()] : []),
      g(OBRA[0], Hammer), g(OBRA[1], Check),
    ];
  }
  // os grupos que a empresa escondeu não aparecem
  passos = passos.filter((ps) => { const gr = [...LEAD, ...CONTACTO, EXTERIOR, INTERIOR, AREA, ESCOLHAS, ...PROPOSTA, ...FINANCEIRO, ...OBRA].find((x) => x.titulo === ps.id); return !gr || !E(gr).oculto; });
  // depois de tentar passar de fase: quantos campos faltam em cada passo
  const TODOS: Grupo[] = [...LEAD, ...CONTACTO, EXTERIOR, INTERIOR, AREA, ESCOLHAS, ...PROPOSTA, ...FINANCEIRO, ...OBRA];
  for (const ps of passos) {
    const gr = TODOS.find((x) => x.titulo === ps.id);
    if (gr && aValidar(d, gr.titulo)) ps.falta = emFalta(gr === AREA ? gruposArea(S.campos, d.f).map(E) : [E(gr)], d.f).length;
    if (ps.id === "fatura" && (aValidar(d, FINANCEIRO[0].titulo) || aValidar(d, FINANCEIRO[1].titulo))) ps.falta = emFalta([FINANCEIRO[0], FINANCEIRO[1]].map(E), d.f).length || undefined;
    if (ps.id === "visitas") ps.falta = visitas(d).reduce((a, n) => a + (aValidar(d, `Visita ${n}`) ? emFalta([grupoVisita(n)], d.f).length : 0), 0) + (aValidar(d, "visitas") && !visitaFeita(d) ? 1 : 0) || undefined;
    if (ps.id === "medidas" && aValidar(d, "medidas")) ps.falta = camposMedida(L).filter(([k]) => medidaEmFalta(v.med, k)).length;
    if (ps.id === "nec" && aValidar(d, "nec")) ps.falta = (orcLinhas(d, S).length ? 0 : 1) + faltaProdutosVisita(d, S).length || undefined;
    if (ps.id === "nec" && simples && aValidar(d, ESCOLHAS.titulo) && !E(ESCOLHAS).oculto) ps.falta = (ps.falta || 0) + emFalta([E(ESCOLHAS)], d.f).length || undefined;
    // as fotografias contam no total; o aviso fica na área de intervenção (onde está "o cliente não quis")
    if (ps.id === AREA.titulo && aValidar(d, "fotos") && !(v.fotos > 0) && d.f.diag_cliente_recusou_fotos !== "Sim") ps.falta = (ps.falta || 0) + 1;
  }
  return passos;
}

// 6/11: PERM_DO_PASSO e permEmFaltaDoPasso passaram para permissoes.ts (o CaminhoObra também os usa, sem carregar esta página)
export { permEmFaltaDoPasso };

/** O botão do próximo passo do negócio (ou o simulador do cliente). */
export function BotaoFase({ ctx, d, tamanho = "lg" }: { ctx: Ctx; d: Negocio; tamanho?: "lg" | "default" }) {
  const { S, A, go } = ctx;
  const idSemPerm = useId();
  // 9/11 (Lote 1, B): o passo é do papel atual OU quem entrou tem as permissões que ele pede (passoDe, só com conta real)
  const p = proximo(d, S), meu = passoDe(S.role, p.who, p.act);
  const falta = meu && p.btn ? permEmFaltaDoPasso(S, p.act) : null;
  // 9/11: o super admin, numa base de teste, age pelo cliente (aceitar a proposta, assinar o contrato)
  const teste = useModoTeste();
  // 04/11/2026: enviar a proposta / o contrato ao portal pede também a permissão real de quem está ligado (permPortalPasso.tsx)
  const portal = usePermPortalDoPasso(p.act, meu && !!p.btn && !falta);
  if (falta) return (
    <div className="grid justify-items-start gap-1 sm:justify-items-end">
      <Button size={tamanho} disabled aria-describedby={idSemPerm}>{p.btn}</Button>
      <p id={idSemPerm} className="max-w-sm text-sm text-muted-foreground sm:text-right">{SEM_PERM[falta].sub}</p>
    </div>
  );
  // 15/10: o cliente pediu alterações no portal: o botão abre a nova versão já com o que ele pediu
  if (p.act === "pedidoCliente" && meu) return <NovaVersao ctx={ctx} d={d} texto={p.btn} />;
  // 22/10: a fatura emitida no Eticadata: o número escreve-se aqui e confirma-se no ERP
  if (p.act === "registarFaturaErp" && meu) return <RegistarFaturaErp ctx={ctx} d={d} tamanho={tamanho} />;
  if (p.btn && meu && !portal.pode) return (
    <div className="grid justify-items-start gap-1 sm:justify-items-end">
      <Button size={tamanho} disabled aria-describedby={portal.semPermissao ? idSemPerm : undefined}>{p.btn}<ArrowRight className="ml-2 h-4 w-4" /></Button>
      {portal.semPermissao && <p id={idSemPerm} className="max-w-sm text-sm text-muted-foreground sm:text-right">{portal.motivo}</p>}
    </div>
  );
  if (p.btn) return meu
    ? <Button size={tamanho} onClick={go(() => fazer(A, p.act!, d.id, p.arg))}>{p.btn}<ArrowRight className="ml-2 h-4 w-4" /></Button>
    : (
      <div className="grid justify-items-start gap-1 sm:justify-items-end">
        <Button size={tamanho} disabled>{p.btn}</Button>
        <button type="button" className="text-sm font-medium text-primary underline-offset-4 hover:underline" onClick={go(() => A.role(p.who as Papel))}>Mudar para {PAPEIS[p.who as Papel].n}</button>
      </div>
    );
  // 27/10 (Rúben): sem o "Simular o cliente": quem aceita, recusa e assina é o cliente, no portal (o link da proposta)
  if (p.sim) return (
    <div className="grid justify-items-start gap-2 sm:justify-items-end">
      <span className="text-sm text-muted-foreground">À espera do cliente no portal</span>
      {teste && (p.sim === "aceitar" || p.sim === "assinar") && <BotaoTesteCliente d={d} acao={p.sim} tamanho={tamanho} />}
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
            <span className="text-base font-semibold tabular-nums">Total sem IVA {eur(T.pf)} € <span className="ml-1 text-sm font-medium text-muted-foreground">margem {pct(T.m)}</span></span>
          </div>
          <ProdutosOrcamento S={S} A={A} run={run} d={d} />
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

const DIA_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
/** "2026-10-22" e "14:30" → "qui 22/10 · 14:30", o mesmo formato das vagas. */
export const slotDe = (dia: string, hora: string) => {
  const [a, m, n] = dia.split("-").map(Number);
  return `${DIA_SEMANA[new Date(a, m - 1, n).getDay()]} ${String(n).padStart(2, "0")}/${String(m).padStart(2, "0")} · ${hora}`;
};

/** Marcar a visita noutro dia e hora que não as vagas sugeridas. */
function OutraData({ INP, ROT, marcar }: { INP: string; ROT: string; marcar: (slot: string) => void }) {
  const [dia, setDia] = useState(""), [hora, setHora] = useState("10:00");
  return (
    <div className="flex flex-wrap items-end gap-3 pt-2">
      <label className={ROT}>Outro dia<input type="date" value={dia} onChange={(e) => setDia(e.target.value)} className={cn(INP, "w-44")} /></label>
      <label className={ROT}>Hora<input type="time" step={900} value={hora} onChange={(e) => setHora(e.target.value)} className={cn(INP, "w-28")} /></label>
      <Button type="button" variant="outline" disabled={!dia || !hora} onClick={() => marcar(slotDe(dia, hora))}><CalendarClock className="mr-1.5 h-4 w-4" />Marcar visita</Button>
    </div>
  );
}

/** 10/11 (Rúben: «ajustes ao plano e às medidas: a proposta tem de ser recriada com um novo orçamento, pois impacta valores»): antes do
 *  contrato, o que mudou o valor e o botão que refaz a proposta (versão nova, com as medidas do local). Aceite a versão nova, as medidas e o
 *  plano ficam feitos e segue o contrato. */
function RefazerComMudancas({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const R = mudancasDeValor(d), pode = podeNeg(ctx.S.role, "orcamento.editar");
  // 11/11: os euros que mudam (as medidas e o plano), para o comercial negociar com o número à frente
  const mi = impactoDasMedidas(d, ctx.S, medidasRetificadas(d)), pi = impactoDoPlano(d, ctx.S);
  const dif = (mi?.dif ?? 0) + (pi.semValor ? 0 : pi.valor), atual = mi?.atual ?? tot(d, ctx.S).pf;
  return (
    <section aria-labelledby="refazer-t" className="space-y-3 rounded-2xl border border-amber-300/70 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="refazer-t" className="text-[17px] font-semibold tracking-tight">O valor mudou: a proposta tem de ser refeita</h3>
        {Math.abs(dif) > 0.004 && <p className="text-lg font-semibold tabular-nums">{dif > 0 ? "+" : "−"}{eur(Math.abs(dif))} € <span className="text-sm font-normal text-muted-foreground">s/ IVA · fica {eur(atual + dif)} €</span></p>}
      </div>
      <ul className="list-disc space-y-0.5 pl-5 text-[15px]">{R.map((x) => <li key={x}>{x}</li>)}</ul>
      <p className="text-[15px] text-muted-foreground">
        As medidas do local passam para o orçamento e a proposta aceite fica guardada como versão.{R.some((x) => x.startsWith("Plano")) ? " As horas a mais do plano ajustam-se à mão no orçamento." : ""} O cliente aceita a versão nova; as medidas e o plano não se repetem.
      </p>
      <Button type="button" className="min-h-11" disabled={!pode} onClick={() => ctx.run(() => ctx.A.refazerComMudancas(d.id))}>Refazer a proposta com o orçamento novo</Button>
      {!pode && <p className="text-sm text-muted-foreground">Quem refaz a proposta é o comercial. <button type="button" className="font-medium text-primary underline-offset-4 hover:underline" onClick={() => ctx.run(() => ctx.A.role("comercial"))}>Mudar para {PAPEIS.comercial.n}</button></p>}
    </section>
  );
}

/** 11/11 (Rúben: «fácil e intuitivo»): o plano num relance, no passo, sem abrir o Estúdio: quando começa e acaba, quantas pessoas e tarefas,
 *  e se há alertas (técnicos noutra obra ou de férias). */
function ResumoDoPlano({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const p = d.obra.plano!;
  const fim = Math.max(1, ...p.tasks.map((t) => t.dia + t.dur)), pessoas = new Set(p.tasks.map((t) => t.tec).filter(Boolean)).size;
  // os mesmos alertas do Estúdio: o técnico noutra obra, de férias ou sem técnico
  const ocup = ocupacaoDosTecnicos(ctx.S, d.id);
  const nc = p.tasks.filter((t, i) => !t.tec || motivoOcupado(t.tec, t, p, ocup, p.tasks.filter((_, j) => j !== i)) != null).length;
  const itens: [string, string][] = [
    ["Começa", rotuloDia(p, 0)], ["Fica pronta", rotuloDia(p, fim - 1)], ["Dias úteis", String(fim)], ["Pessoas", String(pessoas)], ["Tarefas", String(p.tasks.length)],
  ];
  return (
    <div className="space-y-2">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {itens.map(([k, v]) => <div key={k} className="rounded-xl bg-muted/60 px-3 py-2"><dt className="text-xs text-muted-foreground">{k}</dt><dd className="text-[15px] font-semibold tabular-nums">{v}</dd></div>)}
      </dl>
      <p className={nc ? "text-sm text-amber-800 dark:text-amber-300" : "text-sm text-success"}>{nc ? `${nc === 1 ? "1 alerta" : `${nc} alertas`} (técnico noutra obra, de férias ou por escolher): resolve${nc === 1 ? "-se" : "m-se"} no Estúdio, num toque.` : "Toda a equipa está livre nos dias das tarefas."}</p>
    </div>
  );
}
