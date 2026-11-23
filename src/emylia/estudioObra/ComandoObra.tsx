// 12/11/2026 (Rúben: «melhorar muito a gestão da obra… go all in, crazy innovation mode, deixa isto WOW», «sem limites»). As peças vivas do
// Estúdio da obra (a lógica está em previsaoObra.ts):
//  · Pulso: os números da obra, cada um um botão que leva ao sítio dele, com o anel do feito, o fim provável e a margem ao vivo;
//  · ComandoHoje: quem está na obra hoje e o que faz, «Precisa de ti» (cada coisa num toque) e o que vem a seguir (entregas, amanhã);
//  · PrevisaoViva: as horas planeadas contra as reais (gráfico), o fim provável com a confiança, a margem ao vivo em degraus e o caminho
//    crítico;
//  · AgendaEquipa: a semana de cada pessoa em blocos (esta obra, outra obra com o nome, férias, livre); arrastar uma tarefa para outra pessoa;
//  · DiarioObra: o antes e o depois com um deslizador, as fotografias e o diário;
//  · PontoDaSemana: o resumo para o cliente, escrito sozinho, para rever e publicar no portal;
//  · Entregas: a linha do tempo dos materiais (chega hoje, amanhã, a dd/mm).
import { useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowUpRight, CalendarCheck, Camera, Check, ChevronLeft, ChevronRight, Euro, FileText, HardHat, Inbox, Package, Rocket, Send, Sparkles, Truck, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TECS, eur, linhaCalc, nfmt, type Estado, type Negocio, type Plano } from "../motor";
import type { Ctx } from "../pecas";
import { COR_FASE, FASES_OBRA } from "../fasesObra";
import { custoObra } from "../custoObra";
import { faseDosMateriais } from "../planoObra";
import { LINHA_DEMOLICAO } from "../entulho";
import { dataCurta } from "../planoObra";
import { blocosForaDaObra, obrasDosTecnicos } from "../preparacaoObra";
import { materiaisPorFase, progresso } from "../obraOps";
import { porEncomendarDe } from "../encomendasAjuste";
import { imprevistosDe, pedidoDeAtraso, textoPedidoAtraso } from "../imprevistos";
import { emCurso, valorContrato } from "../adendas";
import { ausenteNoRh } from "../equipa/tecnicos";
import { AvatarTec, Miniaturas, nomeTec } from "../AcompanhamentoObra";
import { FotoObra } from "../fotosDaObra";
import { Contagem, MOLA, useReduzir } from "../movimento";
import { podeNeg, podeVerCustos } from "../permissoes";
import { derrapagem, estadoVivo, nomeCurtoTarefa, rotuloVivo } from "./planoVivo";
import { CaminhoCritico, ICONE_DA_FASE } from "./CaminhoCritico";
import { AutoRececaoDoc } from "../AutoRececao";
import { NaFrente } from "../NaFrente";
import { diasComRegistos, resumoDoDia } from "./resumoDoDia";
import { PlantaVista } from "@/pages/prototipo-estudio/PlantaVista";
import { projetoDoNegocio } from "@/pages/prototipo-estudio/daVisita";
import { sairam } from "@/pages/prototipo-estudio/necessidadesEstudio";
import { lerInventario, useInventario } from "../inventario/loja";
import { resumoEcNegocio } from "../inventario/ponteNegocios";
import { antesEDepois, caminhoCritico, diarioDaObra, fotografiasDaObra, hojeNaObra, margemAoVivo, pontoDaSemana, previsao, type MargemViva, type Previsao } from "./previsaoObra";

const primeiro = (n: string) => n.split(" ")[0];
const pct = (x: number) => `${Math.round(x * 1000) / 10}%`.replace(".", ",");
const quandoDe = (dias: Date[]) => (k: number) => (dias[k] ? dataCurta(dias[k]) : `dia ${k + 1}`);

/** O que o Estúdio liga às peças (para cada coisa se fazer num toque). */
export interface Ir {
  tarefa: (ti: number) => void; aba: (a: "plano" | "execucao" | "diario" | "materiais" | "equipa" | "cliente" | "fecho") => void;
  replanear: () => void; imprevisto: (id?: string) => void; previsao: () => void; comando: () => void; outra: (o: Negocio) => void;
}

/* ================================================================== o pulso */
/** 19/11 (Rúben: o técnico terminar uma tarefa tem de contar no Estúdio): as terminadas são as validadas e as que o técnico deu por
 *  feitas no Hoje (à espera da validação). */
export function terminadasDe(p: Plano): string {
  const v = p.tasks.map((t) => estadoVivo(t, p)), pv = v.filter((x) => x === "feita").length, n = v.filter((x) => x === "validada").length + pv;
  return `${n} de ${p.tasks.length} ${p.tasks.length === 1 ? "terminada" : "terminadas"}${pv ? ` · ${pv} por validar` : ""}`;
}
/** 23/11 (Rúben: «mega next-level»): o primeiro dia de trabalho do plano e a primeira tarefa (antes do arranque, para a contagem). */
export function arranqueDe(p: Plano): { dia: number; ti: number } | null {
  const L = p.tasks.map((t, ti) => ({ t, ti })).sort((a, b) => a.t.dia - b.t.dia || a.ti - b.ti);
  return L.length ? { dia: L[0].t.dia, ti: L[0].ti } : null;
}
/** Ainda nada começou: nenhuma tarefa com registo e o dia de hoje antes da primeira. */
export function antesDoArranque(p: Plano): boolean {
  const a = arranqueDe(p);
  return !!a && p.tasks.every((t) => !t.exec) && (p.estado !== "em curso" || p.dia < a.dia);
}
const dd = (n: number) => `${n} ${n === 1 ? "dia útil" : "dias úteis"}`;

export function Pulso({ d, S, dias, prev, margem, precisa, ir }: { d: Negocio; S: Estado; dias: Date[]; prev: Previsao; margem: MargemViva | null; precisa: number; ir: Ir }) {
  const reduzir = useReduzir();
  const p = d.obra.plano!, quando = quandoDe(dias);
  const ims = imprevistosDe(d), abertos = ims.filter((i) => i.estado !== "fechado" && i.estado !== "aprovado");
  const val = (() => { try { return valorContrato(d, S); } catch { return null; } })();
  // o fim do contrato: o do plano que veio do orçamento (sem a derrapagem); sem ele, o do plano
  const fimContrato = prev.fimPlano - derrapagem(p), dif = prev.fimProvavel - fimContrato;
  // 23/11 (permissões): a margem e o valor só para quem vê os custos do orçamento (quotes.view_costs, a mesma regra do servidor)
  const verCustos = podeVerCustos();
  const antes = antesDoArranque(p), a = arranqueDe(p), feito = progresso(p);
  const faltam = a ? Math.max(0, a.dia - (p.estado === "em curso" ? p.dia : 0)) : 0;
  const ta = a ? p.tasks[a.ti] : null;
  const desvioPp = margem ? (margem.margemViva - margem.margemOrc) * 100 : 0;
  const secundario = "inline-flex min-h-10 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";
  return (
    <section aria-label="O pulso da obra" className="space-y-3">
      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr]">
        {/* o número herói: a contagem até ao arranque, ou o dia da obra e o feito */}
        <motion.button type="button" onClick={() => (antes && a ? ir.tarefa(a.ti) : ir.aba("execucao"))} whileTap={reduzir ? undefined : { scale: 0.99 }}
          aria-label={antes ? `Começa daqui a ${dd(faltam)}: abrir a primeira tarefa` : `Feito: ${Math.round(feito * 100)}%, dia ${p.dia + 1} de ${prev.fimPlano}`}
          className="relative flex items-center gap-4 overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-[#432791] p-5 text-left text-white shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
          <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          {antes ? (
            <>
              <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white/15 text-3xl font-bold tabular-nums">{faltam}</span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-white/75">{faltam ? "Começa daqui a" : "Começa hoje"}</span>
                <span className="block text-2xl font-semibold leading-tight">{faltam ? dd(faltam) : quando(a!.dia)}</span>
                {ta && <span className="mt-0.5 block text-sm text-white/85">{quando(a!.dia)} · {primeiro(nomeTec(ta.tec))} · {nomeCurtoTarefa(ta.nome)}</span>}
              </span>
            </>
          ) : (
            <>
              <span className="relative grid h-16 w-16 shrink-0 place-items-center">
                <svg viewBox="0 0 48 48" className="absolute inset-0 h-16 w-16 -rotate-90" aria-hidden="true">
                  <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="5" />
                  <motion.circle cx="24" cy="24" r="20" fill="none" stroke="white" strokeWidth="5" strokeLinecap="round" strokeDasharray={2 * Math.PI * 20}
                    initial={reduzir ? false : { strokeDashoffset: 2 * Math.PI * 20 }} animate={{ strokeDashoffset: 2 * Math.PI * 20 * (1 - Math.max(0, Math.min(1, feito))) }} transition={{ duration: 0.9 }} />
                </svg>
                <span className="text-sm font-bold tabular-nums"><Contagem valor={Math.round(feito * 100)} fmt={(n) => `${Math.round(n)}%`} de={0} /></span>
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-white/75">{p.estado === "concluída" ? "Obra concluída" : "Feito"}</span>
                <span className="block text-2xl font-semibold leading-tight">Dia {Math.min(p.dia + 1, prev.fimPlano)} de {prev.fimPlano}</span>
                <span className="mt-0.5 block text-sm text-white/85">{terminadasDe(p)}</span>
              </span>
            </>
          )}
        </motion.button>
        {/* o fim provável contra o do contrato */}
        <button type="button" onClick={ir.previsao} aria-label={`Fim provável: ${quando(prev.fimProvavel - 1)}`}
          className="rounded-3xl border border-border bg-card p-4 text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarCheck className="h-4 w-4 text-primary" aria-hidden="true" />Fim provável</span>
          <span className="mt-1 block text-xl font-semibold tabular-nums">{quando(prev.fimProvavel - 1)}</span>
          <span className={cn("mt-0.5 block text-sm", dif > 0 ? "font-medium text-destructive" : dif < 0 ? "font-medium text-success" : "text-muted-foreground")}>
            {dif === 0 ? "No dia do contrato" : dif > 0 ? `${dd(dif)} depois do contrato` : `${dd(-dif)} antes do contrato`}
          </span>
          <span className="block text-xs text-muted-foreground">Contrato: {quando(fimContrato - 1)} · confiança {prev.confianca}</span>
        </button>
        {/* a margem com o desvio */}
        {verCustos ? (
          <button type="button" onClick={ir.previsao} aria-label={`Margem ao vivo: ${margem ? pct(margem.margemViva) : "sem orçamento"}`}
            className="rounded-3xl border border-border bg-card p-4 text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Euro className="h-4 w-4 text-primary" aria-hidden="true" />Margem ao vivo</span>
            <span className="mt-1 block text-xl font-semibold tabular-nums">{margem ? pct(margem.margemViva) : "—"}</span>
            {margem && <span className={cn("mt-0.5 block text-sm", desvioPp < -0.05 ? "font-medium text-destructive" : desvioPp > 0.05 ? "font-medium text-success" : "text-muted-foreground")}>
              {Math.abs(desvioPp) < 0.05 ? "Igual ao orçamento" : `${desvioPp > 0 ? "+" : "−"}${nfmt(Math.round(Math.abs(desvioPp) * 10) / 10)} pp face ao orçamento`}
            </span>}
            {margem && <span className="block text-xs text-muted-foreground">Orçamento: {pct(margem.margemOrc)} · {eur(margem.valor - margem.custoVivo)} € de margem</span>}
            {/* 23/11 (revisão: «cada coisa num sítio só»): os desvios estão aqui; o Plano já não repete a margem */}
            {margem && ([["Mão de obra até hoje", -margem.desvioMO], ["O resto, a este ritmo", -margem.projecao], ["Materiais a mais", -margem.materiais], ["Atrasos e erros nossos", -(margem.nossos ?? 0)]] as [string, number][]).filter(([, v]) => Math.abs(v) > 0.5).map(([l, v]) => (
              <span key={l} className="mt-0.5 flex justify-between gap-2 text-xs"><span>{l}</span><span className={cn("tabular-nums", v < 0 ? "text-destructive" : "text-success")}>{v > 0 ? "+" : ""}{eur(v)} €</span></span>
            ))}
          </button>
        ) : <div className="hidden lg:block" />}
      </div>
      {/* o resto, secundário e sem cortes */}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => ir.imprevisto()} className={cn(secundario, abertos.length && "border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200")}>
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />Imprevistos: <b className="font-semibold tabular-nums">{abertos.length ? `${abertos.length} em aberto` : ims.length ? `${ims.length} tratados` : "nenhum"}</b>
        </button>
        {verCustos && val && (
          <button type="button" onClick={() => ir.aba("cliente")} className={secundario}>
            <Euro className="h-4 w-4" aria-hidden="true" />Valor da obra: <b className="font-semibold tabular-nums">{eur(val.total)} €</b>
            <span className="text-muted-foreground">{val.adendas ? `com ${eur(val.adendas)} € de adendas` : "com IVA"}</span>
          </button>
        )}
        {(d.adendas ?? []).filter((x) => x.estado === "rascunho").length > 0 && <span className={cn(secundario, "cursor-default")}>{(d.adendas ?? []).filter((x) => x.estado === "rascunho").length} adendas por disparar</span>}
        {(d.adendas ?? []).filter((x) => emCurso(x) && x.estado !== "rascunho").length > 0 && <span className={cn(secundario, "cursor-default")}>{(d.adendas ?? []).filter((x) => emCurso(x) && x.estado !== "rascunho").length} à espera do cliente</span>}
      </div>
    </section>
  );
}
/* ================================================================== 23/11: a obra antes do arranque */
// Rúben («mega next-level»): antes da primeira tarefa, «Na obra hoje» dizia «Ninguém tem trabalho marcado para hoje». Agora: a contagem, a
// primeira tarefa e a lista do arranque com o estado de cada ponto; o primeiro que falta é o próximo passo (com o toque que o resolve).
export interface PontoArranque { k: string; t: string; sub: string; ok: boolean; acao?: { rot: string; fn: () => void }; escolhas?: { op: string[]; fn: (v: string) => void } }
const OPCOES_CHAVES = ["O cliente abre", "Chave entregue", "Código", "Porteiro"];
export function pontosDoArranque(ctx: Ctx, d: Negocio, ir: Ir, dataInicio: string): PontoArranque[] {
  const { A, run } = ctx;
  const p = d.obra.plano!, inv = d.obra.ec?.ref ? resumoEcNegocio(lerInventario(), d.obra.ec.ref) : null;
  const mats = materiaisPorFase(d, inv).flatMap((g) => g.itens), okM = mats.filter((m) => ["na obra", "na carrinha", "reservado", "recebido"].includes(m.estado)).length;
  const semTec = p.tasks.filter((t) => !t.tec).length, pessoas = new Set(p.tasks.map((t) => t.tec).filter(Boolean)).size;
  const condo = (d.f.condominio ?? "").toLowerCase() === "sim", chaves = d.f.chaves ?? "", avisado = d.f.aviso_inicio ?? "";
  return [
    { k: "materiais", t: mats.length ? `Materiais: ${okM} de ${mats.length} garantidos` : "Materiais: sem encomenda", sub: okM === mats.length && mats.length ? "Tudo no armazém ou a caminho da obra." : "Veja o que falta e encomende.", ok: !!mats.length && okM === mats.length, acao: { rot: "Ver materiais", fn: () => ir.aba("materiais") } },
    { k: "equipa", t: semTec ? `Equipa: ${semTec} ${semTec === 1 ? "tarefa sem técnico" : "tarefas sem técnico"}` : `Equipa marcada: ${pessoas} ${pessoas === 1 ? "pessoa" : "pessoas"}`, sub: semTec ? "Escolha quem faz cada tarefa." : "Todas as tarefas têm quem as faça.", ok: !semTec, acao: { rot: "Ver equipa", fn: () => ir.aba("equipa") } },
    { k: "condominio", t: condo ? "Condomínio avisado" : "Avisar o condomínio", sub: condo ? "O aviso está na entrada do prédio." : "Horário das obras e contacto do responsável, na entrada do prédio.", ok: condo, acao: condo ? undefined : { rot: "Já está avisado", fn: () => run(() => A.campo(d.id, "condominio", "Sim")) } },
    { k: "cliente", t: avisado ? `Cliente avisado da data · ${avisado}` : "Avisar o cliente da data de início", sub: avisado ? `Sabe que começa a ${dataInicio}.` : `Começa a ${dataInicio}: confirme com o cliente e marque aqui.`, ok: !!avisado, acao: avisado ? undefined : { rot: "Já está avisado", fn: () => run(() => A.campo(d.id, "aviso_inicio", agoraCurto())) } },
    { k: "chaves", t: chaves ? `Acesso: ${chaves}` : "Acesso à casa e chave", sub: chaves ? "A equipa sabe como entrar." : "Como é que a equipa entra no primeiro dia?", ok: !!chaves, escolhas: chaves ? undefined : { op: OPCOES_CHAVES, fn: (v) => run(() => A.campo(d.id, "chaves", v)) } },
  ];
}
const agoraCurto = () => { const x = new Date(); return `${String(x.getDate()).padStart(2, "0")}/${String(x.getMonth() + 1).padStart(2, "0")}`; };

function Arranque({ ctx, d, dias, ir }: { ctx: Ctx; d: Negocio; dias: Date[]; ir: Ir }) {
  useInventario(); // redesenha quando a encomenda da base chega (os materiais da lista)
  const p = d.obra.plano!, quando = quandoDe(dias), a = arranqueDe(p)!;
  const faltam = Math.max(0, a.dia - (p.estado === "em curso" ? p.dia : 0)), ta = p.tasks[a.ti];
  const planeia = podeNeg(ctx.S.role, "obra.planear");
  const L = pontosDoArranque(ctx, d, ir, quando(a.dia)), proximo = L.find((x) => !x.ok), feitos = L.filter((x) => x.ok).length;
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-sm font-semibold"><Rocket className="h-4 w-4 text-primary" aria-hidden="true" />Arranque · {quando(a.dia)}</p>
      <button type="button" onClick={() => ir.tarefa(a.ti)} className="flex w-full items-center gap-3 rounded-2xl bg-primary/[0.06] p-2.5 text-left hover:bg-primary/10" title={ta.nome}>
        <AvatarTec id={ta.tec} tam="h-9 w-9" />
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-muted-foreground">{faltam ? `Daqui a ${faltam} ${faltam === 1 ? "dia útil" : "dias úteis"}` : "Hoje"} · primeira tarefa</span>
          <span className="block truncate text-sm font-medium">{primeiro(nomeTec(ta.tec))} · {nomeCurtoTarefa(ta.nome)}</span>
        </span>
      </button>
      <section aria-label="Lista do arranque" className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Pronto a arrancar: {feitos} de {L.length}</p>
        <ul className="space-y-1">
          {L.map((x) => (
            <li key={x.k} className={cn("rounded-xl px-2.5 py-2", x === proximo ? "bg-amber-50 ring-1 ring-amber-300 dark:bg-amber-950/30 dark:ring-amber-700" : "")}>
              <div className="flex items-start gap-2">
                <span aria-hidden="true" className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full", x.ok ? "bg-success text-white" : "border-2 border-muted-foreground/40")}>{x.ok && <Check className="h-3 w-3" />}</span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-sm", x.ok ? "text-foreground" : "font-medium")}>{x.t}</span>
                  {!x.ok && <span className="block text-xs text-muted-foreground">{x === proximo ? `Próximo passo · ${x.sub}` : x.sub}</span>}
                </span>
                {planeia && !x.ok && x.acao && <Button type="button" size="sm" variant={x === proximo ? "default" : "outline"} className="min-h-9 shrink-0 rounded-full" onClick={x.acao.fn}>{x.acao.rot}</Button>}
              </div>
              {planeia && !x.ok && x.escolhas && (
                <div className="mt-1.5 flex flex-wrap gap-1.5 pl-7">
                  {x.escolhas.op.map((o) => <button key={o} type="button" onClick={() => x.escolhas!.fn(o)} className="min-h-9 rounded-full border border-input bg-card px-3 text-sm hover:border-primary/50">{o}</button>)}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ================================================================== o comando de hoje */
export interface Pedido { k: string; t: string; sub?: string; rot: string; fn: () => void; nivel: "critico" | "atencao" }
/** O que precisa do gestor, com o toque que resolve cada coisa. */
export function precisaDeTi(ctx: Ctx, d: Negocio, ir: Ir): Pedido[] {
  const { S, A, run } = ctx;
  const p = d.obra.plano!, L: Pedido[] = [];
  if (!podeNeg(S.role, "obra.planear") || p.estado !== "em curso") return L;
  p.tasks.forEach((t, ti) => { if (estadoVivo(t, p) === "feita") L.push({ k: "v" + ti, t: `Validar ${t.nome.toLowerCase()}`, sub: `${primeiro(nomeTec(t.tec))} deu-a por feita, com ${t.exec?.fotos.length ?? 0} ${t.exec?.fotos.length === 1 ? "fotografia" : "fotografias"}`, rot: "Validar", fn: () => run(() => A.validarTarefa(d.id, ti)), nivel: "atencao" }); });
  for (const im of imprevistosDe(d)) {
    // 23/11: o pedido de atraso do técnico: aceitar ou recusar no imprevisto
    if (pedidoDeAtraso(im)) { L.push({ k: "i" + im.id, t: textoPedidoAtraso(im), sub: "Aceite (o plano anda e o cliente é avisado) ou recuse", rot: "Decidir", fn: () => ir.imprevisto(im.id), nivel: "critico" }); continue; }
    if (im.estado === "aberto") L.push({ k: "i" + im.id, t: `Imprevisto: ${im.texto}`, sub: "Falta a proposta ao cliente (ou resolver sem custo)", rot: "Tratar", fn: () => ir.imprevisto(im.id), nivel: "critico" });
    if (im.estado === "recusado") L.push({ k: "i" + im.id, t: `O cliente recusou: ${im.texto}`, sub: "Decida o que fazer", rot: "Decidir", fn: () => ir.imprevisto(im.id), nivel: "critico" });
  }
  const atr = p.tasks.filter((t) => estadoVivo(t, p) === "atrasada");
  if (atr.length) L.push({ k: "atr", t: `${atr.length} ${atr.length === 1 ? "tarefa atrasada" : "tarefas atrasadas"}`, sub: atr.map((t) => t.nome).join(", "), rot: "Pôr em dia", fn: ir.replanear, nivel: "critico" });
  // devia ter começado e ainda não tem nada do técnico
  p.tasks.forEach((t, ti) => { if (estadoVivo(t, p) === "hoje" && t.dia < p.dia && !t.exec) L.push({ k: "c" + ti, t: `${t.nome} ainda não começou`, sub: `Era para ${t.dia === p.dia - 1 ? "ontem" : "dias atrás"} · ${primeiro(nomeTec(t.tec))}`, rot: "Ver", fn: () => ir.tarefa(ti), nivel: "atencao" }); });
  const porLer = (d.obra.chat ?? []).filter((m) => m.de === "cliente" && !m.lida).length;
  if (porLer) L.push({ k: "chat", t: `${porLer} ${porLer === 1 ? "mensagem do cliente" : "mensagens do cliente"}`, sub: (d.obra.chat ?? []).filter((m) => m.de === "cliente" && !m.lida).slice(-1)[0]?.t, rot: "Responder", fn: () => ir.aba("cliente"), nivel: "atencao" });
  const pend = porEncomendarDe(d);
  if (pend.length) L.push({ k: "mat", t: `${pend.length} ${pend.length === 1 ? "material por encomendar" : "materiais por encomendar"}`, sub: pend.slice(0, 3).map((x) => x.m.n).join(", "), rot: "Encomendar", fn: () => run(() => A.encomendarMateriais(d.id)), nivel: "atencao" });
  const pausadas = p.tasks.map((t, ti) => ({ t, ti })).filter(({ t }) => estadoVivo(t, p) === "pausada");
  for (const { t, ti } of pausadas) L.push({ k: "p" + ti, t: `${t.nome} está pausada`, sub: t.exec?.pausa?.motivo, rot: "Retomar", fn: () => run(() => A.retomarTarefa(d.id, ti)), nivel: "atencao" });
  return L.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === "critico" ? -1 : 1));
}

export function ComandoHoje({ ctx, d, dias, pedidos, ir, comandoRef }: { ctx: Ctx; d: Negocio; dias: Date[]; pedidos: Pedido[]; ir: Ir; comandoRef: React.RefObject<HTMLElement> }) {
  const reduzir = useReduzir();
  const p = d.obra.plano!, H = hojeNaObra(p), quando = quandoDe(dias);
  const [feitos, setFeitos] = useState<string[]>([]);
  const vivo = p.estado === "em curso";
  // o que vem a seguir: as entregas de material e as tarefas de amanhã
  const entregas = materiaisPorFase(d).flatMap((g) => g.itens).filter((m) => m.estado === "a chegar" || m.estado === "encomendado" || m.estado === "por encomendar" || m.estado === "em falta").slice(0, 3);
  // 23/11 (revisão: «A seguir devia mostrar os próximos dias úteis»): os próximos 3 dias com trabalho a começar (antes do arranque, os do
  // arranque), cada um com quem e o quê
  const desde = antesDoArranque(p) ? (arranqueDe(p)?.dia ?? 0) : p.dia + 1;
  const proximos: { k: number; L: { t: (typeof p.tasks)[number]; ti: number }[] }[] = [];
  for (let k = desde; k < desde + 60 && proximos.length < 3; k++) {
    const L = p.tasks.map((t, ti) => ({ t, ti })).filter(({ t }) => t.dia === k);
    if (L.length) proximos.push({ k, L });
  }
  const visiveis = pedidos.filter((x) => !feitos.includes(x.k));
  return (
    <section ref={comandoRef} aria-label="Hoje na obra" className="scroll-mt-4 overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
      <div className="relative grid grid-cols-1 gap-0 lg:grid-cols-[1.1fr_1.3fr_1fr]">
        <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        {/* quem está na obra */}
        <div className="relative min-w-0 space-y-3 border-b border-border p-4 lg:border-b-0 lg:border-r">
          {antesDoArranque(p) && arranqueDe(p) ? <Arranque ctx={ctx} d={d} dias={dias} ir={ir} /> : <>
          <p className="flex items-center gap-2 text-sm font-semibold"><HardHat className="h-4 w-4 text-primary" aria-hidden="true" />{vivo ? `Na obra hoje · ${quando(p.dia)}` : "A obra ainda não arrancou"}</p>
          {vivo && !H.pessoas.length && <p className="text-sm text-muted-foreground">Ninguém tem trabalho marcado para hoje.</p>}
          <ul className="space-y-2">
            {H.pessoas.map(({ tec, tarefas }, i) => (
              <motion.li key={tec ?? "sem"} initial={reduzir ? false : { opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: reduzir ? 0 : 0.05 * i }}
                className="flex items-start gap-3 rounded-2xl bg-muted/40 p-2.5">
                <span className="relative"><AvatarTec id={tec} tam="h-9 w-9" />
                  {tarefas.some(({ t }) => t.exec) && <span aria-hidden="true" className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60 motion-reduce:hidden" /><span className="relative inline-flex h-3 w-3 rounded-full border-2 border-card bg-success" /></span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{nomeTec(tec)}</span>
                  {tarefas.map(({ t, ti }) => (
                    <button key={ti} type="button" onClick={() => ir.tarefa(ti)} className="mt-0.5 flex w-full items-center gap-2 text-left text-sm text-muted-foreground hover:text-foreground">
                      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: COR_FASE[t.fase ?? 1] }} /><span className="truncate">{t.nome}</span><span className="ml-auto shrink-0 text-xs">{rotuloVivo(t, p)}</span>
                    </button>
                  ))}
                </span>
              </motion.li>
            ))}
          </ul>
          {(H.acabaram.length > 0 || H.atrasadas.length > 0) && (
            <div className="flex flex-wrap gap-1.5 text-xs">
              {H.acabaram.map(({ t, ti }) => <button key={"a" + ti} type="button" onClick={() => ir.tarefa(ti)} className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-1 text-success"><Check className="h-3 w-3" aria-hidden="true" />{t.nome}</button>)}
              {H.atrasadas.map(({ t, ti }) => <button key={"x" + ti} type="button" onClick={() => ir.tarefa(ti)} className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-1 text-destructive"><AlertTriangle className="h-3 w-3" aria-hidden="true" />{t.nome}</button>)}
            </div>
          )}
          </>}
        </div>
        {/* precisa de ti */}
        <div className="relative min-w-0 space-y-2 border-b border-border p-4 lg:border-b-0 lg:border-r">
          <p className="flex items-center gap-2 text-sm font-semibold"><Zap className="h-4 w-4 text-amber-600" aria-hidden="true" />Precisa de ti {visiveis.length > 0 && <span className="rounded-full bg-amber-100 px-2 text-xs text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">{visiveis.length}</span>}</p>
          <AnimatePresence initial={false} mode="popLayout">
            {!visiveis.length ? (
              <motion.p key="ok" initial={reduzir ? false : { opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="flex items-center gap-2 rounded-2xl bg-success/10 px-3 py-3 text-sm text-success">
                <Sparkles className="h-4 w-4" aria-hidden="true" />Nada à espera de ti. A obra anda sozinha.
              </motion.p>
            ) : visiveis.slice(0, 5).map((x) => (
              <motion.div key={x.k} layout={!reduzir} initial={reduzir ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
                className={cn("flex items-center gap-3 rounded-2xl border px-3 py-2", x.nivel === "critico" ? "border-destructive/30 bg-destructive/[0.04]" : "border-border bg-background")}>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{x.t}</span>{x.sub && <span className="block truncate text-xs text-muted-foreground">{x.sub}</span>}</span>
                <Button type="button" size="sm" variant="outline" className="min-h-9 shrink-0 rounded-full" onClick={() => { x.fn(); if (x.k.startsWith("v") || x.k === "mat" || x.k.startsWith("p")) setFeitos((L) => [...L, x.k]); }}>{x.rot}</Button>
              </motion.div>
            ))}
          </AnimatePresence>
          {visiveis.length > 5 && <p className="text-xs text-muted-foreground">e mais {visiveis.length - 5}</p>}
        </div>
        {/* a seguir */}
        <div className="relative min-w-0 space-y-3 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold"><Truck className="h-4 w-4 text-primary" aria-hidden="true" />A seguir</p>
          {entregas.length ? (
            <ul className="space-y-1.5">{entregas.map((m, k) => (
              <li key={k} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate"><Package className="mr-1.5 inline h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />{m.n}</span>
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", m.quando ? "bg-primary/10 text-primary" : "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200")}>{m.quando ? `chega a ${m.quando}` : m.estado}</span>
              </li>
            ))}</ul>
          ) : <p className="flex items-center gap-1.5 text-sm text-success"><Check className="h-4 w-4" aria-hidden="true" />Os materiais estão todos garantidos.</p>}
          {proximos.length > 0 && (
            <ol className="space-y-2.5">
              {proximos.map(({ k, L }) => (
                <li key={k}>
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{k === p.dia + 1 && !antesDoArranque(p) ? "Amanhã · " : ""}{quando(k)}</p>
                  {L.map(({ t, ti }) => (
                    <button key={ti} type="button" onClick={() => ir.tarefa(ti)} title={t.nome} className="mt-1 flex w-full items-center gap-2 rounded-xl px-1 py-0.5 text-left text-sm hover:bg-muted">
                      <AvatarTec id={t.tec} tam="h-6 w-6" /><span className="min-w-0 truncate"><b className="font-medium">{primeiro(nomeTec(t.tec))}</b> · {nomeCurtoTarefa(t.nome)}</span>
                      {t.dur > 1 && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{t.dur} dias</span>}
                    </button>
                  ))}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}

/* ================================================================== 23/11: o custo ao vivo por fase */
// Revisão de 23/11 («continua a melhorar»): no lugar da margem repetida, o custo de cada fase da obra: a mão de obra prevista contra a real
// (as horas registadas × o custo da hora de quem as fez, custoObra.ts) e os materiais do orçamento dessa fase. Liga à margem do cabeçalho:
// o desvio total é o mesmo «Mão de obra até hoje».
export function custoPorFase(d: Negocio, S: Estado) {
  const K = custoObra(d, S);
  const mat = new Map<number, number>();
  for (const l of d.orc?.linhas ?? []) {
    if (l.t !== "mat") continue;
    const f = l.d === LINHA_DEMOLICAO ? 1 : faseDosMateriais(l.d);
    mat.set(f, (mat.get(f) ?? 0) + (linhaCalc(l, S).custo || 0));
  }
  return FASES_OBRA.map((f) => {
    const mo = K.fases.find((x) => x.fase === f.n), ls = K.linhas.filter((l) => (l.fase ?? 0) === f.n);
    const comReal = ls.filter((l) => l.real != null);
    return { n: f.n, nome: f.curto, moPrev: mo?.prev ?? 0, moReal: mo?.real ?? 0, desvio: mo?.desvio ?? 0, hPrev: ls.reduce((a, l) => a + l.hPrev, 0), hReal: comReal.reduce((a, l) => a + (l.hReal ?? 0), 0), registadas: comReal.length, tarefas: ls.length, mat: mat.get(f.n) ?? 0 };
  }).filter((x) => x.tarefas || x.mat);
}

function CustoPorFase({ d, S }: { d: Negocio; S?: Estado }) {
  const reduzir = useReduzir();
  if (!S || !podeVerCustos() || !d.orc) return <div className="hidden lg:block" />;
  let L: ReturnType<typeof custoPorFase>;
  try { L = custoPorFase(d, S); } catch { return <div className="hidden lg:block" />; }
  const algumReal = L.some((x) => x.registadas > 0), maxPrev = Math.max(1, ...L.map((x) => x.moPrev + x.mat));
  return (
    <section aria-label="O custo por fase" className="min-w-0 space-y-3">
      <div>
        <p className="text-sm font-semibold">O custo por fase</p>
        <p className="text-xs text-muted-foreground">{algumReal ? "A mão de obra real (as horas registadas × o custo da hora) contra a prevista, e os materiais do orçamento." : "Ainda sem horas registadas: o orçado de cada fase, mão de obra e materiais."}</p>
      </div>
      <ul className="space-y-3">
        {L.map((x) => {
          const Ic = ICONE_DA_FASE[x.n] ?? Package, cor = COR_FASE[x.n];
          const prev = x.moPrev + x.mat, vivo = prev + x.desvio;
          return (
            <li key={x.n} className="space-y-1">
              <div className="flex items-center gap-2 text-sm">
                <span aria-hidden="true" className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-white" style={{ background: cor }}><Ic className="h-3.5 w-3.5" /></span>
                <span className="min-w-0 flex-1 font-medium">{x.nome}</span>
                <span className="tabular-nums">{eur(algumReal ? vivo : prev)} €</span>
                {algumReal && Math.abs(x.desvio) > 0.5 && <span className={cn("text-xs tabular-nums", x.desvio > 0 ? "text-destructive" : "text-success")}>{x.desvio > 0 ? "+" : ""}{eur(x.desvio)} €</span>}
              </div>
              <div className="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <motion.div className="h-full" style={{ background: cor }} initial={reduzir ? false : { width: 0 }} animate={{ width: `${(x.moPrev / maxPrev) * 100}%` }} transition={{ duration: 0.6 }} />
                <motion.div className="h-full opacity-40" style={{ background: cor }} initial={reduzir ? false : { width: 0 }} animate={{ width: `${(x.mat / maxPrev) * 100}%` }} transition={{ duration: 0.6 }} />
              </div>
              <p className="text-xs text-muted-foreground">
                Mão de obra {eur(x.moPrev)} € ({nfmt(Math.round(x.hPrev * 10) / 10)} h){x.registadas ? ` · real ${eur(x.moReal)} € em ${nfmt(Math.round(x.hReal * 10) / 10)} h (${x.registadas} de ${x.tarefas} ${x.tarefas === 1 ? "tarefa" : "tarefas"})` : ""} · materiais {eur(x.mat)} €
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ================================================================== a previsão viva */
// 23/11 (Rúben: «mega next-level»): a curva S das horas (o planeado, o real, hoje e a previsão até ao fim provável, com a margem de datas);
// antes do arranque, sem nada real, o calendário das fases. A margem num só indicador: a de hoje contra a do orçamento, e só os desvios
// que existem.
function CalendarioFases({ p, quando }: { p: Plano; quando: (k: number) => string }) {
  const fim = Math.max(1, ...p.tasks.map((t) => t.dia + t.dur));
  const curta = (k: number) => quando(k).replace(/^[^,]+, /, "");
  const fases = FASES_OBRA.map((f) => {
    const ts = p.tasks.filter((t) => (t.fase ?? 1) === f.n);
    return ts.length ? { ...f, ini: Math.min(...ts.map((t) => t.dia)), fim: Math.max(...ts.map((t) => t.dia + t.dur)), n: f.n, nT: ts.length } : null;
  }).filter((x): x is NonNullable<typeof x> => !!x);
  return (
    <div className="min-w-0 space-y-3">
      <div>
        <p className="text-sm font-semibold">As fases da obra</p>
        <p className="text-xs text-muted-foreground">Ainda sem horas registadas: o plano, fase a fase, de {quando(0 + Math.min(...fases.map((f) => f.ini)))} a {quando(fim - 1)}.</p>
      </div>
      <ol className="space-y-2.5">
        {fases.map((f) => {
          const Ic = ICONE_DA_FASE[f.n] ?? Package, cor = COR_FASE[f.n];
          return (
            <li key={f.n} className="grid grid-cols-[9.5rem_1fr] items-center gap-3 sm:grid-cols-[12rem_1fr]">
              <span className="flex min-w-0 items-center gap-2 text-sm">
                <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-white" style={{ background: cor }}><Ic className="h-4 w-4" /></span>
                <span className="min-w-0"><span className="block truncate font-medium">{f.curto}</span><span className="block text-xs tabular-nums text-muted-foreground">{f.fim - f.ini === 1 ? quando(f.ini) : `${curta(f.ini)} – ${curta(f.fim - 1)}`}</span></span>
              </span>
              <span className="relative block h-3 rounded-full bg-muted" aria-hidden="true">
                <span className="absolute inset-y-0 rounded-full" style={{ left: `${(f.ini / fim) * 100}%`, width: `${Math.max(2, ((f.fim - f.ini) / fim) * 100)}%`, background: cor }} />
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function PrevisaoViva({ d, S, dias, prev, margem: _margem, critico, ir, previsaoRef }: { d: Negocio; S?: Estado; dias: Date[]; prev: Previsao; margem: MargemViva | null; critico: Set<number>; ir: Ir; previsaoRef: React.RefObject<HTMLElement> }) {
  const reduzir = useReduzir();
  const p = d.obra.plano!, quando = quandoDe(dias);
  const W = 640, H = 180, n = Math.max(2, prev.planeadas.length, prev.ate), max = Math.max(prev.totalH, ...prev.reais, 1);
  const X = (k: number) => (k / (n - 1)) * W, Y = (h: number) => H - (h / max) * (H - 16) - 4;
  const linha = (L: number[]) => L.map((h, k) => `${k ? "L" : "M"}${X(k).toFixed(1)},${Y(h).toFixed(1)}`).join(" ");
  const hoje = p.estado === "em curso" ? p.dia : -1;
  const [sob, setSob] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const antes = antesDoArranque(p);
  // a previsão: do real de hoje ao total no fim provável, com a margem de datas (de … até)
  const realHoje = prev.reais[prev.reais.length - 1] ?? 0, fimK = Math.min(n - 1, prev.fimProvavel - 1);
  return (
    <section ref={previsaoRef} aria-label="A previsão viva" className="scroll-mt-4 grid grid-cols-1 gap-4 rounded-3xl border border-border bg-card p-4 shadow-sm lg:grid-cols-[1.6fr_1fr] sm:p-5">
      {antes ? <CalendarioFases p={p} quando={quando} /> : (
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">Horas planeadas e reais</p>
            <p className="text-xs text-muted-foreground">Ritmo {prev.ritmo >= 1 ? "a tempo" : "abaixo do plano"}: {Math.round(prev.ritmo * 100)}% · fim provável {quando(prev.fimProvavel - 1)}{prev.ate > prev.de ? ` (entre ${quando(prev.de - 1)} e ${quando(prev.ate - 1)})` : ""}</p>
          </div>
          <ul className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            <li className="flex items-center gap-1.5"><span aria-hidden="true" className="h-0.5 w-4 border-t-2 border-dashed border-muted-foreground" />Planeado</li>
            <li className="flex items-center gap-1.5"><span aria-hidden="true" className="h-1 w-4 rounded bg-primary" />Real</li>
            <li className="flex items-center gap-1.5"><span aria-hidden="true" className="h-0.5 w-4 border-t-2 border-dotted border-primary" />Previsão</li>
          </ul>
        </div>
        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="h-44 w-full touch-none" role="img" aria-label={`Horas: ${nfmt(prev.feitoH)} feitas de ${nfmt(prev.totalH)} previstas; fim provável ${quando(prev.fimProvavel - 1)}`}
          onPointerMove={(e) => { const r = svg.current!.getBoundingClientRect(); const k = Math.round(((e.clientX - r.left) / r.width) * (n - 1)); setSob(Math.max(0, Math.min(n - 1, k))); }} onPointerLeave={() => setSob(null)}>
          {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1={0} x2={W} y1={Y(max * f)} y2={Y(max * f)} stroke="hsl(var(--border))" strokeWidth={1} />)}
          {/* a margem de datas do fim provável */}
          {prev.ate > prev.de && <rect x={X(Math.max(0, prev.de - 1))} y={0} width={Math.max(2, X(Math.min(n - 1, prev.ate - 1)) - X(Math.max(0, prev.de - 1)))} height={H} fill="hsl(var(--primary))" fillOpacity={0.07} />}
          {hoje >= 0 && <><line x1={X(hoje)} x2={X(hoje)} y1={0} y2={H} stroke="hsl(var(--primary))" strokeOpacity={0.45} strokeWidth={2} />
            <text x={Math.min(W - 30, X(hoje) + 4)} y={12} fontSize={11} fill="hsl(var(--primary))">hoje</text></>}
          <motion.path d={linha(prev.planeadas)} fill="none" stroke="hsl(var(--muted-foreground))" strokeWidth={2} strokeDasharray="6 5"
            initial={reduzir ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1 }} />
          {prev.reais.length > 1 && <motion.path d={`${linha(prev.reais)} L${X(prev.reais.length - 1)},${H} L0,${H} Z`} fill="hsl(var(--primary))" fillOpacity={0.08} initial={reduzir ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} />}
          {prev.reais.length > 0 && <motion.path d={linha(prev.reais)} fill="none" stroke="hsl(var(--primary))" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"
            initial={reduzir ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, delay: 0.2 }} />}
          {/* a previsão: do real de hoje ao total, no fim provável */}
          {hoje >= 0 && fimK > hoje && <path d={`M${X(hoje).toFixed(1)},${Y(realHoje).toFixed(1)} L${X(fimK).toFixed(1)},${Y(prev.totalH).toFixed(1)}`} fill="none" stroke="hsl(var(--primary))" strokeWidth={2} strokeDasharray="2 4" strokeLinecap="round" />}
          {hoje >= 0 && fimK > hoje && <circle cx={X(fimK)} cy={Y(prev.totalH)} r={4.5} fill="hsl(var(--card))" stroke="hsl(var(--primary))" strokeWidth={2} />}
          {sob != null && <>
            <line x1={X(sob)} x2={X(sob)} y1={0} y2={H} stroke="hsl(var(--foreground))" strokeOpacity={0.2} />
            <circle cx={X(sob)} cy={Y(prev.planeadas[sob] ?? 0)} r={4} fill="hsl(var(--muted-foreground))" />
            {prev.reais[sob] != null && <circle cx={X(sob)} cy={Y(prev.reais[sob])} r={5} fill="hsl(var(--primary))" />}
          </>}
        </svg>
        <p className="h-5 text-xs tabular-nums text-muted-foreground">{sob != null ? `${quando(sob)}: ${nfmt(prev.planeadas[sob] ?? 0)} h planeadas${prev.reais[sob] != null ? ` · ${nfmt(prev.reais[sob])} h reais` : ""}` : `${nfmt(prev.feitoH)} de ${nfmt(prev.totalH)} h feitas · passe o dedo no gráfico`}</p>
      </div>
      )}
      {/* 23/11 (revisão: «cada coisa num sítio só»): a margem está no cabeçalho; aqui, o custo por fase */}
      <CustoPorFase d={d} S={S} />
      {/* 23/11 (Rúben: «a lista deve ser refeita, muito mais bonita, corrida, com as fases bem identificadas e icons»): a toda a largura */}
      <CaminhoCritico p={p} critico={critico} quando={quando} abrir={ir.tarefa} />
    </section>
  );
}

/* ================================================================== a agenda da equipa */
const SEMANA = ["seg", "ter", "qua", "qui", "sex"];
export function AgendaEquipa({ ctx, d, dias, ir }: { ctx: Ctx; d: Negocio; dias: Date[]; ir: Ir }) {
  const { S, A, run } = ctx;
  const reduzir = useReduzir();
  const p = d.obra.plano!;
  const planeia = podeNeg(S.role, "obra.planear");
  const obras = useMemo(() => obrasDosTecnicos(S, d.id), [S, d.id, S.deals]); // eslint-disable-line react-hooks/exhaustive-deps
  const deFerias = (tec: string, iso: string) => ausenteNoRh(tec, iso) || !!TECS.find((y) => y.id === tec)?.feriasDatas?.includes(iso);
  // a semana: começa na segunda da semana de hoje (ou do início)
  const hoje = p.estado === "em curso" ? p.dia : 0;
  const segundaDe = (k: number) => { let j = k; while (j > 0 && dias[j] && dias[j].getDay() !== 1) j--; return j; };
  const [ini, setIni] = useState(() => segundaDe(hoje));
  const semana = Array.from({ length: 5 }, (_, j) => ini + j).filter((k) => k < dias.length);
  const pessoas = [...new Set(p.tasks.map((t) => t.tec).filter((x): x is string => !!x))];
  const [arr, setArr] = useState<number | null>(null); // a tarefa a ser arrastada
  const [alvo, setAlvo] = useState<string | null>(null);
  const largar = (tec: string, k: number) => {
    const ti = arr; setArr(null); setAlvo(null);
    if (ti == null) return;
    const t = p.tasks[ti];
    run(() => {
      if (t.tec !== tec) A.trocarTec(d.id, ti, tec);
      if (k !== t.dia && !t.exec) A.ajustarTarefa(d.id, ti, { dia: k });
    });
  };
  return (
    <section aria-label="A agenda da equipa" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">A semana de cada pessoa</p>
          <p className="text-xs text-muted-foreground">{planeia ? "Arraste uma tarefa desta obra para outra pessoa ou outro dia. " : ""}Os blocos cinzentos são outras obras (abrem o Estúdio delas).</p>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" aria-label="Semana anterior" disabled={ini <= 0} onClick={() => setIni(Math.max(0, ini - 5))} className="grid h-10 w-10 place-items-center rounded-full border border-input hover:bg-muted disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
          <span className="min-w-[9rem] text-center text-sm tabular-nums">{semana.length ? `${dataCurta(dias[semana[0]])} a ${dataCurta(dias[semana[semana.length - 1]])}` : ""}</span>
          <button type="button" aria-label="Semana seguinte" disabled={ini + 5 >= dias.length} onClick={() => setIni(ini + 5)} className="grid h-10 w-10 place-items-center rounded-full border border-input hover:bg-muted disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[150px_repeat(5,1fr)] border-b border-border text-xs text-muted-foreground">
            <div className="px-3 py-2">Pessoa</div>
            {semana.map((k) => <div key={k} className={cn("px-2 py-2 text-center", k === hoje && p.estado === "em curso" && "font-semibold text-primary")}>{SEMANA[(dias[k].getDay() + 6) % 7] ?? ""} {dias[k].getDate()}{k === hoje && p.estado === "em curso" ? " · hoje" : ""}</div>)}
          </div>
          {pessoas.map((tec) => {
            const fora = blocosForaDaObra(tec, semana.map((k) => dias[k]), obras, deFerias);
            return (
              <div key={tec} className="grid grid-cols-[150px_repeat(5,1fr)] border-b border-border last:border-b-0">
                <div className="flex items-center gap-2 px-3 py-2"><AvatarTec id={tec} tam="h-8 w-8" /><span className="min-w-0"><span className="block truncate text-sm font-medium">{primeiro(nomeTec(tec))}</span><span className="block truncate text-xs text-muted-foreground">{TECS.find((x) => x.id === tec)?.sk}</span></span></div>
                {semana.map((k, j) => {
                  const aqui = p.tasks.map((t, ti) => ({ t, ti })).filter(({ t }) => t.tec === tec && k >= t.dia && k < t.dia + t.dur);
                  const b = fora.find((x) => j >= x.ini && j < x.fim);
                  const chave = `${tec}:${k}`;
                  const ocupadoFora = !!b;
                  return (
                    <div key={k} onDragOver={(e) => { if (arr != null && planeia) { e.preventDefault(); setAlvo(chave); } }} onDragLeave={() => setAlvo((x) => (x === chave ? null : x))} onDrop={(e) => { e.preventDefault(); largar(tec, k); }}
                      className={cn("min-h-[64px] space-y-1 border-l border-border p-1.5 transition-colors", alvo === chave && (ocupadoFora ? "bg-destructive/10" : "bg-primary/10"), k === hoje && p.estado === "em curso" && "bg-primary/[0.03]")}>
                      {b && (b.tipo === "obra"
                        ? <button type="button" onClick={() => ir.outra(b.obra!)} className="flex w-full items-center gap-1 rounded-lg bg-muted-foreground/15 px-2 py-1 text-left text-xs hover:bg-muted-foreground/25" title={`Noutra obra: ${b.obra!.nome}${b.obra!.servico ? ` · ${b.obra!.servico}` : ""}`}>
                            <ArrowUpRight className="h-3 w-3 shrink-0" aria-hidden="true" /><span className="truncate">{b.obra!.nome}{b.obra!.servico ? ` · ${b.obra!.servico}` : ""}</span></button>
                        : <span className="block rounded-lg bg-amber-100 px-2 py-1 text-xs text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">Férias</span>)}
                      {aqui.map(({ t, ti }) => (
                        <motion.button key={ti} type="button" layout={!reduzir} draggable={planeia} onDragStart={() => setArr(ti)} onDragEnd={() => { setArr(null); setAlvo(null); }} onClick={() => ir.tarefa(ti)}
                          className={cn("flex w-full items-center gap-1 rounded-lg px-2 py-1 text-left text-xs font-medium text-white shadow-sm", planeia && "cursor-grab active:cursor-grabbing", arr === ti && "opacity-40")}
                          style={{ background: COR_FASE[t.fase ?? 1] }} title={`${t.nome} · ${rotuloVivo(t, p)}`}>
                          <span className="truncate">{t.nome}</span>
                        </motion.button>
                      ))}
                      {!b && !aqui.length && <span className="block px-1 text-[11px] text-muted-foreground/70">livre</span>}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      {arr != null && <p className="text-xs text-muted-foreground">A largar «{p.tasks[arr]?.nome}»: azul, a pessoa está livre; vermelho, está noutra obra ou de férias.</p>}
    </section>
  );
}

/* ================================================================== o diário */
/** 23/11 (Rúben: «mega next-level»): o resumo do dia, montado dos registos dos técnicos (resumoDoDia.ts), com a escolha do dia. */
function ResumoDoDia({ d, dias }: { d: Negocio; dias: Date[] }) {
  const p = d.obra.plano!, quando = quandoDe(dias);
  const L = useMemo(() => diasComRegistos(p), [p, p.tasks]); // eslint-disable-line react-hooks/exhaustive-deps
  const [k, setK] = useState<number | null>(null);
  const dia = k ?? L[0] ?? null, R = dia != null ? resumoDoDia(p, dia) : null;
  return (
    <section aria-label="O resumo do dia" className="space-y-3 rounded-3xl border border-primary/30 bg-primary/[0.03] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />O resumo do dia</p>
        {L.length > 1 && (
          <div role="group" aria-label="O dia" className="flex flex-wrap gap-1">
            {L.slice(0, 6).map((x) => <button key={x} type="button" aria-pressed={x === dia} onClick={() => setK(x)} className={cn("min-h-9 rounded-full border px-3 text-xs", x === dia ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:border-foreground/40")}>{quando(x)}</button>)}
          </div>
        )}
      </div>
      {!R ? <p className="text-sm text-muted-foreground">O resumo aparece no fim do primeiro dia de trabalho: as horas, as notas e as fotografias que os técnicos registam no Hoje.</p> : (
        <>
          <p className="text-[15px]"><b className="font-semibold">{quando(R.dia)}.</b> {R.frase}</p>
          <ul className="space-y-2">
            {R.linhas.map((x, j) => (
              <li key={j} className="flex gap-2.5 text-sm">
                <AvatarTec id={TECS.find((t) => t.n === x.quem)?.id ?? null} tam="h-7 w-7" />
                <span className="min-w-0 flex-1">
                  <span className="block">{x.t}</span>
                  {x.nota && <span className="block text-muted-foreground">«{x.nota}»</span>}
                  {x.fotos.length > 0 && <span className="mt-1 block"><Miniaturas fotos={x.fotos} tam="h-12 w-16" /></span>}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export function DiarioObra({ d, ir, dias = [] }: { d: Negocio; ir: Ir; dias?: Date[] }) {
  const reduzir = useReduzir();
  const F = diarioDaObra(d), ad = antesEDepois(d), fotos = fotografiasDaObra(d.obra.plano);
  const [corte, setCorte] = useState(50);
  const [n, setN] = useState(12);
  const pr = useMemo(() => projetoDoNegocio(d.f), [d.f.estudio]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-5">
    {d.obra.plano && <ResumoDoDia d={d} dias={dias} />}
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_1.2fr]">
      <div className="min-w-0 space-y-4">
        {ad ? (
          <section aria-label="Antes e depois" className="space-y-2 rounded-3xl border border-border bg-card p-3">
            <p className="px-1 text-sm font-semibold">Antes e depois</p>
            <div className="relative aspect-[4/3] select-none overflow-hidden rounded-2xl bg-muted">
              <FotoObra src={ad.antes} alt="Antes" className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${corte}%)` }}><FotoObra src={ad.depois} alt="Depois" className="h-full w-full object-cover" /></div>
              <div aria-hidden="true" className="absolute inset-y-0 w-1 -translate-x-1/2 bg-white shadow" style={{ left: `${corte}%` }}><span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-foreground shadow">⇆</span></div>
              <span className="absolute left-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white">Antes</span>
              <span className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white">Depois</span>
            </div>
            <input type="range" min={0} max={100} value={corte} onChange={(e) => setCorte(Number(e.target.value))} aria-label="Comparar o antes e o depois" className="w-full accent-[hsl(var(--primary))]" />
          </section>
        ) : <p className="rounded-2xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">O antes e o depois em fotografias aparece quando os técnicos as registarem.</p>}
        {/* 23/11: o antes e o depois também nas plantas do Estúdio, lado a lado */}
        {pr && (
          <section aria-label="As plantas antes e depois" className="space-y-2 rounded-3xl border border-border bg-card p-3">
            <p className="px-1 text-sm font-semibold">As plantas: antes e depois</p>
            <div className="grid grid-cols-2 gap-2">
              <PlantaVista planta={pr.antes} titulo="Antes" />
              <PlantaVista planta={pr.depois} titulo="Depois" fantasmas={sairam(pr)} />
            </div>
          </section>
        )}
        {fotos.length > 0 && (
          <section aria-label="As fotografias" className="space-y-2 rounded-3xl border border-border bg-card p-3">
            <p className="flex items-center gap-1.5 px-1 text-sm font-semibold"><Camera className="h-4 w-4 text-primary" aria-hidden="true" />{fotos.length} {fotos.length === 1 ? "fotografia" : "fotografias"}</p>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
              {fotos.slice(-12).reverse().map((f, k) => (
                <motion.button key={k} type="button" onClick={() => ir.tarefa(f.ti)} title={f.t.nome} initial={reduzir ? false : { opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: reduzir ? 0 : 0.03 * k }}
                  className="group relative aspect-square overflow-hidden rounded-xl bg-muted">
                  <FotoObra src={f.foto} alt={f.t.nome} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                  <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-1.5 py-1 text-[10px] text-white">{f.t.nome}</span>
                </motion.button>
              ))}
            </div>
          </section>
        )}
      </div>
      <section aria-label="O diário da obra" className="min-w-0 space-y-2">
        <p className="text-sm font-semibold">O diário</p>
        {!F.length ? <p className="text-sm text-muted-foreground">Ainda nada no diário.</p> : (
          <ol className="relative space-y-3 border-l-2 border-border pl-5">
            {F.slice(0, n).map((e, k) => (
              <motion.li key={k} className="relative" initial={reduzir ? false : { opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: reduzir ? 0 : Math.min(0.3, 0.03 * k) }}>
                <span aria-hidden="true" className={cn("absolute -left-[27px] top-1.5 h-3 w-3 rounded-full ring-4 ring-background",
                  e.k === "ocorrencia" || e.k === "correcao" ? "bg-destructive" : e.k === "validacao" ? "bg-success" : e.k === "marco" ? "bg-amber-500" : "bg-primary")} />
                <p className="text-[15px]">{e.t}</p>
                <p className="text-xs text-muted-foreground">{e.q} · {e.quem}</p>
                {e.fotos.length > 0 && <div className="mt-1.5"><Miniaturas fotos={e.fotos} tam="h-14 w-20" /></div>}
              </motion.li>
            ))}
          </ol>
        )}
        {F.length > n && <button type="button" onClick={() => setN(n + 12)} className="min-h-10 text-sm font-medium text-primary">Ver mais</button>}
      </section>
    </div>
    </div>
  );
}

/* ================================================================== o ponto da semana */
export function PontoDaSemana({ ctx, d, dias }: { ctx: Ctx; d: Negocio; dias: Date[] }) {
  const { S, A, run } = ctx;
  const p = d.obra.plano!;
  const sugerido = pontoDaSemana(p, quandoDe(dias));
  const [texto, setTexto] = useState(sugerido);
  const [feito, setFeito] = useState(false);
  const fotos = fotografiasDaObra(p).slice(-4).map((f) => f.foto);
  const planeia = podeNeg(S.role, "obra.planear");
  return (
    <section aria-label="O ponto da semana" className="space-y-3 rounded-2xl border border-primary/30 bg-primary/[0.03] p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />O ponto da semana</p>
        {texto !== sugerido && <button type="button" onClick={() => setTexto(sugerido)} className="text-xs text-primary underline-offset-4 hover:underline">Repor o sugerido</button>}
      </div>
      <p className="text-xs text-muted-foreground">Escrito a partir da obra: o que ficou feito, o que está a decorrer e quando acaba. Reveja antes de publicar.</p>
      {/* a pré-visualização: como o cliente vê no portal */}
      <div className="rounded-2xl bg-card p-3 shadow-sm ring-1 ring-border">
        <p className="mb-1 text-xs text-muted-foreground">No portal de {d.nome.split(" ")[0]}</p>
        <textarea value={texto} onChange={(e) => { setTexto(e.target.value); setFeito(false); }} rows={4} aria-label="O ponto da semana" className="w-full resize-y rounded-xl bg-transparent text-[15px] outline-none" />
        {fotos.length > 0 && <div className="mt-2"><Miniaturas fotos={fotos} tam="h-14 w-20" /></div>}
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="outline" className="min-h-10 rounded-full" disabled={!planeia || !texto.trim() || feito} onClick={() => { run(() => A.avisarClienteObra(d.id, texto)); setFeito(true); }}>
          {feito ? <><Check className="mr-1.5 h-4 w-4" aria-hidden="true" />Publicado</> : <><Send className="mr-1.5 h-4 w-4" aria-hidden="true" />Publicar no portal</>}
        </Button>
      </div>
    </section>
  );
}

/* ================================================================== as entregas */
export function Entregas({ d }: { d: Negocio }) {
  const reduzir = useReduzir();
  // 23/11: com o estado da encomenda (a da base, numa encomenda emitida no servidor; senão a do Inventário)
  const db = useInventario();
  const inv = d.obra.ec?.ref ? resumoEcNegocio(db, d.obra.ec.ref) : null;
  const itens = materiaisPorFase(d, inv).flatMap((g) => g.itens.map((m) => ({ ...m, fase: g.fase })));
  const ok = new Set(["na obra", "na carrinha", "reservado", "recebido"]);
  const ordem = [...itens].sort((a, b) => Number(ok.has(a.estado)) - Number(ok.has(b.estado)) || (a.quando ?? "99").localeCompare(b.quando ?? "99"));
  if (!ordem.length) return null;
  return (
    <section aria-label="As entregas" className="space-y-2 rounded-2xl border border-border bg-card p-4">
      <p className="flex items-center gap-1.5 text-sm font-semibold"><Truck className="h-4 w-4 text-primary" aria-hidden="true" />As entregas</p>
      <ol className="relative space-y-2 border-l-2 border-border pl-5">
        {ordem.map((m, k) => (
          <motion.li key={k} className="relative" initial={reduzir ? false : { opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: reduzir ? 0 : 0.03 * k }}>
            <span aria-hidden="true" className={cn("absolute -left-[27px] top-1.5 h-3 w-3 rounded-full ring-4 ring-card", ok.has(m.estado) ? "bg-success" : m.quando ? "bg-primary" : "bg-amber-500")} />
            <p className="text-sm"><span className="font-medium">{m.n}</span> <span className="text-muted-foreground">· {nfmt(m.q)} {m.un} · fase {m.fase}</span></p>
            <p className={cn("text-xs", ok.has(m.estado) ? "text-success" : "text-muted-foreground")}>{ok.has(m.estado) ? `✓ ${m.estado}` : m.quando ? `chega a ${m.quando}${m.forn ? ` · ${m.forn}` : ""}` : m.estado}</p>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}

/* ================================================================== o fecho: as fotografias finais, o auto e a garantia */
export function FechoVivo({ d, ir }: { d: Negocio; ir: Ir }) {
  const p = d.obra.plano!;
  // 23/11 (Rúben: «mega next-level»): o auto de receção antes de existir (um rascunho, só para ver; o verdadeiro nasce ao encerrar)
  const [verAuto, setVerAuto] = useState(false);
  const rascunho: Negocio = d.obra.auto ? d : { ...d, obra: { ...d.obra, auto: { n: "Rascunho", q: "", estado: "por assinar" } } };
  const ultimas = p.tasks.map((t, ti) => ({ t, ti, f: [...(t.exec?.envios ?? [])].reverse().find((e) => e.fotos?.length)?.fotos?.[0] ?? t.exec?.fotos?.[0] })).filter((x) => x.f);
  const auto = d.obra.auto;
  return (
    <section aria-label="A vistoria e a garantia" className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-primary/[0.05] p-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">O auto de receção</p>
          <p className="text-xs text-muted-foreground">{d.obra.auto ? `${d.obra.auto.n} · ${d.obra.auto.estado}` : "Nasce ao encerrar a obra e vai ao portal para o cliente assinar. Veja já como fica: os trabalhos por fase, o antes e o depois, a planta final e a garantia."}</p>
        </div>
        <Button type="button" variant="outline" className="min-h-10 rounded-full" onClick={() => setVerAuto(true)}><FileText className="mr-1.5 h-4 w-4" aria-hidden="true" />{d.obra.auto ? "Ver o auto" : "Pré-visualizar o auto"}</Button>
      </div>
      {verAuto && (
        <NaFrente>
          <div className="fixed inset-0 z-[60] flex justify-center bg-black/40 sm:items-center sm:p-6" onClick={() => setVerAuto(false)}>
            <div role="dialog" aria-modal="true" aria-label="O auto de receção" onClick={(e) => e.stopPropagation()} className="flex h-full w-full max-w-4xl flex-col bg-card shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-2xl">
              <div className="flex items-center justify-between gap-3 border-b border-border p-4">
                <p className="font-semibold">{d.obra.auto ? "O auto de receção" : "O auto de receção (pré-visualização)"}</p>
                <Button type="button" variant="ghost" className="min-h-10" aria-label="Fechar" onClick={() => setVerAuto(false)}><X className="h-4 w-4" /></Button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4"><AutoRececaoDoc d={rascunho} /></div>
            </div>
          </div>
        </NaFrente>
      )}
      <p className="text-sm font-semibold">As fotografias da vistoria</p>
      {ultimas.length ? (
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
          {ultimas.map(({ t, ti, f }) => (
            <button key={ti} type="button" onClick={() => ir.tarefa(ti)} className="group relative aspect-square overflow-hidden rounded-xl bg-muted" title={t.nome}>
              <FotoObra src={f!} alt={t.nome} className="h-full w-full object-cover" />
              <span className="absolute inset-x-0 bottom-0 flex items-center gap-1 truncate bg-gradient-to-t from-black/60 to-transparent px-1.5 py-1 text-[10px] text-white">{estadoVivo(t, p) === "validada" && <Check className="h-3 w-3" aria-hidden="true" />}{t.nome}</span>
            </button>
          ))}
        </div>
      ) : <p className="text-sm text-muted-foreground">Ainda sem fotografias finais.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className={cn("rounded-xl p-3 text-sm", auto?.estado === "assinado" ? "bg-success/10" : "bg-muted/50")}>
          <p className="font-medium">Auto de receção</p>
          <p className="text-muted-foreground">{!auto ? "Vai ao portal do cliente ao encerrar a obra." : auto.estado === "assinado" ? `Assinado ${auto.assinado ?? ""}${auto.reservas ? ` · reservas: ${auto.reservas}` : " · sem reservas"}` : `${auto.n} no portal, por assinar`}</p>
        </div>
        <div className={cn("rounded-xl p-3 text-sm", auto?.estado === "assinado" ? "bg-success/10" : "bg-muted/50")}>
          <p className="font-medium">Garantia</p>
          <p className="text-muted-foreground">{auto?.estado === "assinado" ? `Conta a partir de ${auto.assinado?.split(" ")[0] ?? "a assinatura do auto"}.` : "Começa com o auto de receção assinado."}</p>
        </div>
      </div>
    </section>
  );
}

/** Para o Estúdio: os números que as peças partilham (calculados uma vez por desenho). */
export function obraViva(d: Negocio, S: Estado) {
  const p = d.obra.plano;
  return {
    prev: p ? previsao(p) : null,
    margem: p ? margemAoVivo(d, S) : null,
    critico: p ? caminhoCritico(p) : new Set<number>(),
  };
}
