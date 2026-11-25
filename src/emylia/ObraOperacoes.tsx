// As Operações no V1 (15/10/2026, refeitas): a lista de obras.
// · Lista: por estado (por arrancar, em curso, concluídas), com a fase, o progresso, a equipa, o próximo marco e os alertas.
// · A conversa com o cliente e os problemas dele, para o separador «Cliente» do Estúdio da obra (ConversaDoClienteNaObra).
// 20/11 (auditoria 19/11): a página antiga da obra (PaginaObra) saiu. Desde 19/11 as Operações abrem o Estúdio da obra
// (OperacoesSimples.tsx, estudioObra/); a conversa com o cliente ficou aqui porque o Estúdio a usa.
import { AtualizarMicrotarefas } from "./estudioObra/AtualizarMicrotarefas";
import { useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronRight, FileWarning, MapPin, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { TECS, aberto, conflitos, type Negocio } from "./motor";
import { COR_FASE } from "./planoObra";
import { FASES_OBRA } from "./fasesObra";
import { faltaParaArrancar, ocupacaoDosTecnicos, rotuloDia } from "./preparacaoObra";
import { modoDa, propostasDosAgentes } from "./estudioObra/agentes";
import { fimDe } from "./ajustesPlano";
import { equipaDaObra, estadoDe, iniciais, porValidar, progresso } from "./obraOps";
import type { Ctx } from "./pecas";
import { semEnvioNaConversa } from "./permissoes";
import { useInventario } from "./inventario/loja";
import { resumoEcNegocio } from "./inventario/ponteNegocios";
import { Conversa } from "./ConversaObra";
import { orgDoModoReal } from "./acessosPortal";
import { fotoDaEquipa, useConversaReal } from "./real/conversaReal";
import { AcaoMensagemCliente, ProblemasDoCliente, type ConversaDaObra } from "./ProblemasObra";

const ESTADO_PLANO: Record<string, string> = {
  "por aprovar": "plano por aprovar", aprovado: "pronta a arrancar", "em curso": "em curso", "concluída": "concluída",
};
const CARTAO = "rounded-2xl border border-border bg-card shadow-[var(--shadow-sm)]";
const H2 = "text-xl font-semibold tracking-tight"; // 27/10: um degrau acima, para o título se destacar da secção
const NOTA = "text-[15px] text-muted-foreground";
const COR_TEC = ["#7c5ce0", "#0e7490", "#b45309", "#be185d", "#15803d", "#4338ca"];
const corTec = (id: string | null) => COR_TEC[Math.max(0, TECS.findIndex((x) => x.id === id)) % COR_TEC.length];

function Avatar({ id, n, tam = "h-8 w-8" }: { id: string | null; n: string; tam?: string }) {
  return <span className={cn("grid shrink-0 place-items-center rounded-full text-[11px] font-semibold text-white ring-2 ring-card", tam)} style={{ background: corTec(id) }} title={n} aria-hidden="true">{iniciais(n)}</span>;
}

/* ================================================================== a lista de obras */
export function ListaObras(ctx: Ctx) {
  const { S, A, go } = ctx;
  // os materiais vivem no Inventário: a lista redesenha quando lá muda alguma coisa
  const db = useInventario();
  // 16/10: a obra aparece com o contrato assinado (o plano, por aprovar depois do pagamento)
  const obras = aberto(S).filter((x) => x.obra.plano && x.fase >= 4);
  const grupos: [string, Negocio[]][] = [
    ["Em curso", obras.filter((o) => o.obra.plano!.estado === "em curso")],
    ["Por arrancar", obras.filter((o) => o.obra.plano!.estado === "por aprovar" || o.obra.plano!.estado === "aprovado")],
    ["Concluídas", obras.filter((o) => o.obra.plano!.estado === "concluída")],
  ];
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-8 sm:px-8 sm:pt-12">
      <h1 className="text-3xl font-semibold tracking-tight">Operações</h1>
      {/* 25/11: as microtarefas das obras passam às do Catálogo (só nomes e as novas) */}
      <AtualizarMicrotarefas ctx={ctx} obras={obras} />
      {!obras.length && <p className={cn(NOTA, "mt-8")}>Ainda não há obras. Aparecem quando o cliente assina o contrato.</p>}
      {grupos.filter(([, L]) => L.length).map(([titulo, L]) => {
        // 27/10: as concluídas num grupo fechado, para a lista ficar no que ainda está a andar
        const fechado = titulo === "Concluídas";
        const lista = (
          <ul className="mt-2 space-y-3">
            {L.map((o) => {
              const p = o.obra.plano!, fim = fimDe(p.tasks), eq = equipaDaObra(p), pv = porValidar(p).length;
              const corr = p.tasks.filter((t) => estadoDe(t) === "corrigir").length, nc = conflitos(p).length;
              const r = o.obra.ec?.ref ? resumoEcNegocio(db, o.obra.ec.ref) : null, faltaMat = !!r && !r.pronta;
              // a data mais tarde das encomendas a fornecedor ainda por receber
              const prev = r?.pos.filter((x) => x.fase !== "recebida" && x.fase !== "cancelada").map((x) => x.prevista).filter(Boolean).sort().at(-1);
              const tHoje = p.estado === "em curso" ? p.tasks.find((t) => t.dia <= p.dia && p.dia < t.dia + t.dur) : null;
              const fase = tHoje?.fase ?? p.tasks[0]?.fase;
              const pr = progresso(p);
              const F = faltaParaArrancar(o, db, S);
              // 21/10 (revisto): a próxima ação em destaque quando é do Filipe; senão, à espera de quê (sem repetir o estado)
              const Fa = F.filter((f) => !/plano/.test(f));
              const [marco, acao]: [string, boolean] = p.estado === "por aprovar" ? (o.fin.pago ? ["Aprovar o plano", true] : ["À espera do pagamento do sinal", false])
                : p.estado === "aprovado" ? (Fa.length ? [`Para arrancar falta ${Fa.join(", ")}`, false] : [`Arrancar a obra · ${rotuloDia(p, 0)}`, true])
                : p.estado === "em curso" ? [pv ? `Validar ${pv === 1 ? "1 tarefa" : `${pv} tarefas`}` : `Dia ${p.dia + 1} de ${fim} · acaba a ${rotuloDia(p, fim - 1)}`, !!pv]
                : [o.obra.auto?.estado === "assinado" ? "Recebida pelo cliente" : o.obra.auto ? "Auto de receção por assinar" : `Acabou a ${rotuloDia(p, fim - 1)}`, false];
              // 25/11 (agentes, etapa 2): o que os agentes desta obra pedem, sem abrir o Estúdio
              let pedem = 0, comPrazo = 0;
              try {
                for (const x of propostasDosAgentes(o, S, ocupacaoDosTecnicos(S, o.id), r)) { const m = modoDa(x, o.obra.agentes); if (m === "pede") pedem++; else if (m === "prazo") comPrazo++; }
              } catch { /* sem agentes nesta obra */ }
              const alertas: [ReactNode, string][] = [
                ...(pedem ? [[<span key="ag" aria-hidden="true" className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-50 motion-reduce:hidden" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" /></span>, `os agentes pedem ${pedem} ${pedem === 1 ? "decisão" : "decisões"}`] as [ReactNode, string]] : []),
                ...(comPrazo ? [[<span key="ap" aria-hidden="true" className="inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />, `${comPrazo} ${comPrazo === 1 ? "aplica-se sozinha" : "aplicam-se sozinhas"} se ninguém recusar`] as [ReactNode, string]] : []),
                ...(nc ? [[<AlertTriangle key="c" className="h-4 w-4 text-warning" aria-hidden="true" />, `${nc} conflito de férias`] as [ReactNode, string]] : []),
                ...(faltaMat && p.estado !== "concluída" ? [[<Truck key="m" className="h-4 w-4 text-warning" aria-hidden="true" />, prev ? `material previsto a ${prev.slice(8, 10)}/${prev.slice(5, 7)}` : "material por chegar"] as [ReactNode, string]] : []),
                ...(corr ? [[<FileWarning key="r" className="h-4 w-4 text-destructive" aria-hidden="true" />, `${corr} a corrigir`] as [ReactNode, string]] : []),
              ];
              return (
                <li key={o.id}>
                  <button type="button" onClick={go(() => A.abrirPlano(o.id))}
                    className={cn(CARTAO, "group block w-full p-4 text-left transition-[border-color,box-shadow] hover:border-foreground/30 sm:p-5")}>
                    <span className="flex items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block text-base font-semibold">{o.nome} <span className="font-normal text-muted-foreground">· {o.servico}</span></span>
                        <span className="flex items-center gap-1 text-[15px] text-muted-foreground"><MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{o.f.morada || o.local}</span>
                      </span>
                      <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </span>
                    <span className="mt-3 flex items-center gap-3">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true"><span className="block h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${Math.round(pr * 100)}%` }} /></span>
                      <span className="text-sm tabular-nums text-muted-foreground">{Math.round(pr * 100)}%</span>
                    </span>
                    <span className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                      <span className="text-[15px]">
                        {p.estado === "concluída" ? <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />Concluída</span>
                          : fase ? <><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: COR_FASE[fase] }} aria-hidden="true" />{p.estado === "em curso" ? "Fase " : "Começa pela fase "}{fase} · {FASES_OBRA[fase - 1].curto}</> : ESTADO_PLANO[p.estado]}
                        <span className={cn("block text-sm", acao ? "font-medium text-primary" : "text-muted-foreground")}>{marco}{acao && <ArrowRight className="ml-1 inline h-3.5 w-3.5" aria-hidden="true" />}</span>
                      </span>
                      <span className="flex -space-x-2" aria-label={`Equipa: ${eq.map((m) => m.n).join(", ")}`}>{eq.slice(0, 5).map((m) => <Avatar key={m.id} id={m.id} n={m.n} />)}</span>
                    </span>
                    {alertas.length > 0 && (
                      <span className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-sm">
                        {alertas.map(([I, t]) => <span key={t} className="inline-flex items-center gap-1.5">{I}{t}</span>)}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        );
        return fechado ? (
          <details key={titulo} className="group/concl mt-8">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open/concl:rotate-90" aria-hidden="true" />{titulo} <span className="font-normal text-muted-foreground">· {L.length}</span>
            </summary>
            {lista}
          </details>
        ) : (
          <section key={titulo} aria-label={titulo} className="mt-8">
            <h2 className="text-lg font-semibold tracking-tight">{titulo} <span className="font-normal text-muted-foreground">· {L.length}</span></h2>
            {lista}
          </section>
        );
      })}
    </div>
  );
}
/** A conversa da obra para a página: a da base (com a base ligada) ou a do estado local (o protótipo), com as fotografias e a escrita. */
function useConversaObra(ctx: Ctx, d: Negocio) {
  const { A, run } = ctx;
  // 30/10 (2.0): com a base ligada a conversa é a da base, a mesma do portal do cliente (o autor é o utilizador com sessão); no protótipo de
  // sempre continua a do estado local do negócio.
  // 09/11 (20270111100000): com a leitura reduzida (sem pessoas.view) não se lê a conversa (neg_mensagens_ler recusa) nem se mostra
  const reduzida = !!ctx.leituraReduzida;
  const org = reduzida ? null : orgDoModoReal();
  const real = useConversaReal(org, d.id);
  const fotoDe = useMemo(() => (org ? fotoDaEquipa(org) : undefined), [org]);
  const msgs = reduzida ? [] : org ? real.msgs : (d.obra.chat ?? []);
  const marcarLidas = () => (org ? void real.marcarComoLidas() : run(() => A.lerChat(d.id)));
  const enviar = (t: string): void | Promise<boolean> => (org ? real.enviar(t) : run(() => A.mensagemObra(d.id, "empresa", t)));
  // 3/11: a resposta a um problema do cliente: devolve se seguiu (no protótipo, segue sempre)
  const responder = async (t: string): Promise<boolean> => (org ? real.enviar(t) : (run(() => A.mensagemObra(d.id, "empresa", t)), true));
  const c: ConversaDaObra & { org: string | null; erro: string | null; marcarLidas: () => void; enviar: typeof enviar } = { msgs, fotoDe, responder, org, erro: real.erro, marcarLidas, enviar };
  return c;
}

/** 19/11 (Rúben: «as Operações da obra têm de ser o Estúdio da obra, não o outro antigo»): a conversa com o cliente e os problemas que
 *  ele reporta nela, no separador «Cliente» do Estúdio da obra (antes só na página antiga da obra). Com a leitura reduzida, nada. */
/** 23/11 (permissões): `soLer` (sem negocios.obra.planear, ex.: o técnico): lê a conversa e os problemas, sem escrever nem marcar como lidas. */
export function ConversaDoClienteNaObra({ ctx, d, soLer }: { ctx: Ctx; d: Negocio; soLer?: boolean }) {
  const conversa = useConversaObra(ctx, d);
  const [aberto, setAberto] = useState<string | null>(null);
  if (ctx.leituraReduzida) return null;
  const abrir = (k: string) => { setAberto(k); window.setTimeout(() => document.getElementById("obra-problemas")?.scrollIntoView({ behavior: "smooth", block: "start" }), 60); };
  return (
    <div className="lg:col-span-2 [&>section:first-child]:mt-0">
      <ProblemasDoCliente ctx={ctx} d={d} conversa={conversa} abrir={aberto} setAbrir={setAberto} soLer={soLer} />
      <ConversaNaObra ctx={ctx} d={d} conversa={conversa} abrirProblema={abrir} soLer={soLer} />
    </div>
  );
}

/** 21/10: a conversa com o cliente (o mesmo fio do portal do cliente). Ao abrir, as mensagens do cliente ficam lidas. */
function ConversaNaObra({ ctx, d, conversa, abrirProblema, soLer }: { ctx: Ctx; d: Negocio; conversa: ReturnType<typeof useConversaObra>; abrirProblema: (k: string) => void; soLer?: boolean }) {
  const { org, msgs, marcarLidas, enviar } = conversa, porLer = msgs.filter((m) => m.de === "cliente" && !m.lida).length;
  // 9/11 (Lote 1, I): com conta real, escrever ao cliente pede pessoas.edit (neg_mensagem_enviar); sem ela a caixa fica desligada.
  // Sem conta real, como sempre.
  const semEnvio = semEnvioNaConversa();
  return (
    <section id="obra-chat" aria-labelledby="obra-chat-t" className={cn(CARTAO, "mt-4 scroll-mt-16 p-5", porLer > 0 && "border-warning/50")}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="obra-chat-t" className={H2}>Conversa com o cliente <span className="font-normal text-muted-foreground">· {d.nome}</span>
          {porLer > 0 && <span className="ml-2 rounded-full bg-warning px-2 py-0.5 align-middle text-xs font-semibold text-white">{porLer} por ler</span>}</h2>
        {porLer > 0 && !soLer && <button type="button" onClick={marcarLidas} className="min-h-10 text-sm font-medium text-primary underline-offset-4 hover:underline">Marcar {porLer === 1 ? "1 mensagem" : `${porLer} mensagens`} como lida{porLer === 1 ? "" : "s"}</button>}
      </div>
      <div className="mt-3">
        <Conversa msgs={msgs} eu="empresa" enviar={enviar} semEnvio={semEnvio} soLer={soLer} vazio="Ainda sem mensagens. Escreva ao cliente: ele vê no portal." fotoDe={conversa.fotoDe}
          acao={(m, i) => <AcaoMensagemCliente ctx={ctx} d={d} m={m} chave={m.id ?? `local-${i}`} abrir={abrirProblema} />}
          rapidas={["Bom dia! A equipa já está na obra.", "Já pode ver as fotografias de hoje no portal.", "Vou confirmar e respondo ainda hoje."]} />
        {org && conversa.erro && <p role="alert" className="mt-2 text-[15px] text-destructive">{conversa.erro}</p>}
      </div>
    </section>
  );
}
