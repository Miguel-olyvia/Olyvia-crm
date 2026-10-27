// Proposta de 09/10/2026: o Hoje com menos ruído. Uma frase diz quanto há;
// a coisa mais urgente vem primeiro, com o único botão primário; o resto é
// uma lista simples. Sem pastilhas, sem gradientes, sem maiúsculas.
// 27/10: no computador o Hoje usa a largura toda, em três colunas: o trabalho (o mais urgente e o resto), o que está à espera de alguém
// (avisos, compromissos, pagamentos a rever, inventário) e a agenda da semana. Com duas colunas, a 2.ª junta as duas últimas. O telemóvel
// fica como estava (uma coluna, a mesma ordem). As colunas contam com a largura que o Hoje tem (largura.ts), não com a da janela.
import { Suspense, lazy, useState, type ReactNode } from "react";
import { format } from "date-fns";
import { pt } from "date-fns/locale";
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PAPEIS, aberto, eur, minhas, pct, tot } from "./motor";
import { agenda, alertasDia } from "./Hoje";
import { IconeFase, Progresso, fazer, type Ctx } from "./pecas";
import { aDescoberto } from "./planoObra";
import { useInventario } from "./inventario/loja";
import { contadores as contadoresInv } from "./inventario/contadores";
import { DESTINO_LINHA, resumoInventario } from "./v2/hojeArmazem";
import { useLargura } from "./largura";
import type { AmbitoAgenda } from "./equipa/pontes";

// 22/10: "A minha agenda" (a semana da pessoa do RH deste papel, a mesma da RH › Agenda; equipa/MinhaAgenda.tsx), carregada à parte
const MinhaAgenda = lazy(() => import("./equipa/MinhaAgenda"));

// A largura do Hoje a partir da qual cabem duas e três colunas
const DUAS = 760, TRES = 1120;

const CAIXA = "divide-y divide-border rounded-2xl border border-border bg-card px-4 shadow-[var(--shadow-sm)] sm:px-5";
// 27/10: no computador cada tópico vive num cartão com uma sombra suave; as listas lá dentro ficam sem caixa própria
const PAINEL = "rounded-3xl border border-border/60 bg-card p-6 shadow-[0_1px_2px_rgba(76,29,149,0.04),0_12px_32px_-12px_rgba(76,29,149,0.14)]";
const LISTA_PAINEL = "-mx-2 divide-y divide-border";
const LINHA = "group flex min-h-16 w-full items-center gap-4 rounded-xl py-3 text-left transition-colors hover:bg-muted/50 sm:px-2";
const Seta = () => <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" aria-hidden="true" />;

/** 16/10: o que o Armazém tem no Inventário novo (o mesmo resumo do Hoje da V2). */
function InventarioArmazem({ A, go, className = "mt-12" }: Pick<Ctx, "A" | "go"> & { className?: string }) {
  const linhas = resumoInventario(contadoresInv(useInventario()));
  return (
    <section aria-labelledby="hoje-inv" className={className}>
      <h2 id="hoje-inv" className="text-xl font-semibold tracking-tight">Inventário</h2>
      {linhas.length === 0
        ? <p className="mt-3 text-[15px] text-muted-foreground">Nada pendente no Inventário.</p>
        : <ul className="mt-3 grid gap-1">{linhas.map((l) => (
          <li key={l.id} className="text-[15px]">
            {/* 26/10: cada linha abre a lista já filtrada, com "Voltar a Hoje" */}
            <button type="button" onClick={go(() => A.abrirInvLista(DESTINO_LINHA[l.id].aba, DESTINO_LINHA[l.id].f))} className="inline-flex min-h-10 items-center gap-1 text-left underline-offset-4 hover:text-primary hover:underline">
              <span className="font-semibold tabular-nums">{l.n}</span> {l.texto}
            </button>
          </li>
        ))}</ul>}
      <Button variant="outline" className="mt-3 min-h-11" onClick={go(() => A.nav("inventario"))}>Abrir o Inventário</Button>
    </section>
  );
}

/** Um bloco de uma coluna: o título, uma linha de explicação e o conteúdo. */
function Bloco({ id, titulo, nota, n, children, className = PAINEL }: { id: string; titulo: string; nota?: string; n?: number; children: ReactNode; className?: string }) {
  return (
    <section aria-labelledby={id} className={className}>
      <h2 id={id} className="flex items-baseline gap-2 text-lg font-semibold">
        {titulo}{n ? <span className="text-[15px] font-normal tabular-nums text-muted-foreground">{n}</span> : null}
      </h2>
      {nota && <p className="mt-0.5 text-[15px] text-muted-foreground">{nota}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Os números do topo, no computador: um número grande e o que é. */
function Numero({ v, l, tom }: { v: string; l: string; tom?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-5 py-4 shadow-[var(--shadow-sm)]">
      <p className={cn("whitespace-nowrap text-2xl font-semibold tabular-nums text-foreground", tom)}>{v}</p>
      <p className="mt-0.5 text-[15px] text-muted-foreground">{l}</p>
    </div>
  );
}

const saudacao = (h: number) => (h < 12 ? "Bom dia" : h < 20 ? "Boa tarde" : "Boa noite");

export function HojeSimples({ S, A, run, go }: Ctx) {
  const r = S.role, agora = new Date();
  // o mais urgente primeiro: atrasados, depois aprovações, depois o resto
  // 27/10: sem o que está à espera do cliente (não é trabalho de ninguém; conta em "À espera de alguém")
  const L = minhas(S, r).filter((x) => !x.p.wait).sort((a, b) => Number(!!b.d.atraso) - Number(!!a.d.atraso) || Number(!!b.dir) - Number(!!a.dir));
  const [primeiro, ...resto] = L;
  const ag = agenda(S, r);
  const atrasados = L.filter((x) => x.d.atraso && x.d.fase === 0).length + ag.filter((x) => x.atrasado).length;
  const ab = aberto(S), emNeg = ab.filter((d) => d.fase === 3 && d.orc);
  const descoberto = aDescoberto(S);
  const al = alertasDia(S, A, r);
  const [ref, w] = useLargura<HTMLDivElement>(0);
  const cols = w >= TRES ? 3 : w >= DUAS ? 2 : 1;
  const [ambito, setAmbito] = useState<AmbitoAgenda>("minha");
  // 27/10: o "Depois" mostra 6; o resto atrás de «Ver mais»
  const [verResto, setVerResto] = useState(false);
  const verDescoberto = (r === "comercial" || r === "direcao" || r === "financeiro") && descoberto.length > 0;
  const emProposta = eur(emNeg.reduce((a, d) => a + tot(d, S).pf, 0));
  const margem = pct(emNeg.length ? emNeg.reduce((a, d) => a + tot(d, S).m, 0) / emNeg.length : 0);

  const frase = L.length === 0
    ? "Não tem nada pendente. Mude de papel no menu para ver o trabalho dos outros."
    : `Tem ${L.length} ${L.length === 1 ? "coisa" : "coisas"} para fazer${atrasados ? `, ${atrasados} com atraso` : ""}.`;

  const exemplo = (
    <button type="button" onClick={go(() => A.abrir(1050))} className="mt-3 min-h-10 text-left text-[15px] font-medium text-primary underline-offset-4 hover:underline">
      Ver um exemplo
    </button>
  );

  const comecar = primeiro && (
    <section aria-labelledby="comecar" className={cn("rounded-2xl border border-primary/25 bg-card p-6 shadow-[var(--shadow-md)] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200", cols === 1 && "mt-10")}>
      <div className="flex items-center justify-between gap-4">
        <h2 id="comecar" className="text-sm font-medium text-primary">Comece por aqui</h2>
        <Progresso fase={primeiro.d.fase} className="w-28" />
      </div>
      <div className="mt-3 flex items-start gap-4">
        <IconeFase fase={primeiro.d.fase} tam="lg" />
        <div className="min-w-0">
          <p className="text-xl font-semibold text-foreground">{primeiro.dir ? "Aprovar a exceção à margem" : primeiro.p.t}</p>
          <p className="mt-1 text-base text-muted-foreground">
            {primeiro.d.nome} · {primeiro.d.servico}
            {primeiro.d.atraso && primeiro.d.fase === 0 && <span className="text-destructive"> · atrasado 2 dias</span>}
          </p>
          {primeiro.p.sub && <p className="mt-1 text-base text-muted-foreground">{primeiro.p.sub}</p>}
        </div>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        {primeiro.dir
          ? <><Button size="lg" onClick={go(() => A.aprovar(primeiro.d.id))}>Aprovar</Button><Button size="lg" variant="outline" onClick={go(() => A.recusarAprov(primeiro.d.id))}>Recusar</Button></>
          : primeiro.p.btn && <Button size="lg" onClick={go(() => fazer(A, primeiro.p.act!, primeiro.d.id, primeiro.p.arg))}>{primeiro.p.btn}</Button>}
        <Button size="lg" variant="ghost" onClick={go(() => A.abrir(primeiro.d.id))}>Abrir o negócio</Button>
      </div>
    </section>
  );

  // No computador, cada linha do "Depois" tem também o botão do passo (como no "Comece por aqui"), sem ter de abrir o negócio
  const depois = resto.length > 0 && (
    <section aria-labelledby="depois" className={cols === 1 ? "mt-12" : cn("mt-8", PAINEL)}>
      <h2 id="depois" className="flex items-baseline gap-2 text-lg font-semibold">
        Depois{cols > 1 && <span className="text-[15px] font-normal tabular-nums text-muted-foreground">{resto.length}</span>}
      </h2>
      <ul className={cn("mt-3", cols === 1 ? CAIXA : LISTA_PAINEL)}>
        {(verResto ? resto : resto.slice(0, 6)).map(({ d, p, dir }) => {
          // com o botão ao lado, o passo já lá está escrito: a linha diz de quem é
          const comBotao = cols > 1 && (dir || !!p.btn);
          return (
          <li key={d.id + ":" + p.t} className={cn(cols > 1 && "flex items-center gap-3")}>
            <button type="button" onClick={go(() => A.abrir(d.id))} className={cn(LINHA, cols > 1 && "min-w-0 flex-1")}>
              <IconeFase fase={d.fase} />
              <span className="min-w-0 flex-1">
                <span className="block text-base font-medium text-foreground">{comBotao ? d.nome : dir ? "Aprovar a exceção à margem" : p.t}</span>
                <span className="block text-[15px] text-muted-foreground">
                  {comBotao ? d.servico : `${d.nome} · ${d.servico}`}{cols > 1 && d.atraso && d.fase === 0 && <span className="text-destructive"> · atrasado 2 dias</span>}
                </span>
              </span>
              {cols === 1 && <Seta />}
            </button>
            {cols > 1 && (dir
              ? <Button variant="ghost" className="shrink-0" onClick={go(() => A.aprovar(d.id))}>Aprovar a margem</Button>
              : p.btn
                ? <Button variant="ghost" className="shrink-0" onClick={go(() => fazer(A, p.act!, d.id, p.arg))}>{p.btn}</Button>
                : <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />)}
          </li>
          );
        })}
      </ul>
      {resto.length > 6 && (
        <Button variant="ghost" className="mt-2 min-h-11 text-[15px]" aria-expanded={verResto} onClick={() => setVerResto(!verResto)}>
          {verResto ? "Ver menos" : `Ver mais (${resto.length - 6})`}
        </Button>
      )}
    </section>
  );

  // 14/10: os orçamentos que, com as condições de pagamento escolhidas, deixam a obra a descoberto
  const pagamentos = verDescoberto && (
    <section aria-labelledby="pag-rever" className={cols === 1 ? "mt-12" : PAINEL}>
      <h2 id="pag-rever" className="text-xl font-semibold tracking-tight">Pagamentos a rever</h2>
      <p className="mt-1 text-[15px] text-muted-foreground">A obra gasta antes de receber.</p>
      <ul className={cn("mt-3", cols === 1 ? CAIXA : LISTA_PAINEL)}>
        {descoberto.map(({ d, pior, pagamento }) => (
          <li key={d.id}>
            <button type="button" onClick={go(() => A.abrir(d.id))} className={LINHA}>
              <AlertTriangle className="h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-base font-medium text-foreground">A descoberto até {eur(pior)} €</span>
                <span className="block text-[15px] text-muted-foreground">{d.nome} · {d.servico} · {pagamento}</span>
              </span>
              <Seta />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );

  // 27/10 (só no computador): os avisos do papel (o que está parado à espera de alguém), cada um abre o negócio ou a lista já filtrada
  const avisos = (
    <Bloco id="hoje-avisos" titulo="À espera de alguém">
      {al.length === 0
        ? <p className="flex items-center gap-2 text-[15px] text-muted-foreground"><CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />Nada parado. Está tudo a andar.</p>
        : <ul className={LISTA_PAINEL}>{al.map((a) => (
          <li key={a.id}>
            <button type="button" onClick={go(a.abrir)} className={LINHA}>
              <span className="grid h-9 min-w-9 shrink-0 place-items-center rounded-lg bg-warning/15 px-2 text-base font-semibold tabular-nums text-warning">{a.n}</span>
              <span className="min-w-0 flex-1 text-base font-medium text-foreground">{a.t}</span>
              <Seta />
            </button>
          </li>
        ))}</ul>}
    </Bloco>
  );

  // 27/10 (só no computador): as visitas marcadas, as obras em curso e as faturas por confirmar, tirados dos negócios (Hoje.tsx: agenda)
  const compromissos = ag.length > 0 && (
    <Bloco id="hoje-compromissos" titulo="Compromissos" n={ag.length}>
      <ul className={LISTA_PAINEL}>{ag.map((c) => (
        <li key={c.id}>
          <button type="button" onClick={go(() => A.abrir(c.d.id))} className={LINHA}>
            <span className="w-[4.5rem] shrink-0 self-start pt-0.5 text-right">
              <span className={cn("block text-base font-semibold tabular-nums", c.atrasado ? "text-destructive" : "text-foreground")}>{c.hora}</span>
              {c.dia && <span className={cn("block text-xs", c.atrasado ? "text-destructive" : "text-muted-foreground")}>{c.dia}</span>}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-medium text-foreground">{c.titulo}</span>
              <span className="flex flex-wrap items-center gap-x-1 text-[15px] text-muted-foreground">
                {c.quem}{c.onde && <><span aria-hidden="true">·</span><MapPin className="h-3.5 w-3.5" aria-hidden="true" />{c.onde}</>}
                {c.atrasado && <span className="text-destructive"> · ficou por registar</span>}
              </span>
            </span>
            <span className="shrink-0 text-[15px] font-medium text-primary">{c.acao}</span>
          </button>
        </li>
      ))}</ul>
    </Bloco>
  );

  // 23/10: um só bloco de agenda, o mesmo da RH › Agenda (antes havia aqui outra "Agenda", tirada dos negócios por outra regra,
  // que mostrava outra coisa); quem tem equipa escolhe "A minha" ou "A equipa"
  const agendaEl = (className: string) => (
    <Suspense fallback={<p className={cn(className, "text-[15px] text-muted-foreground")} role="status">A carregar a agenda…</p>}>
      <MinhaAgenda S={S} irObra={(id) => run(() => A.abrirPlano(id))} irNegocio={(id) => run(() => A.abrir(id))} id="hs-minha-agenda" className={className}
        ambito={ambito} aoMudarAmbito={setAmbito} estreita={cols === 3} plana={cols > 1} />
    </Suspense>
  );

  const cabecalho = (
    <header className={cn(cols === 3 && r === "direcao" ? "grid grid-cols-[minmax(0,1fr)_minmax(0,50rem)] items-end gap-10" : "grid grid-cols-[minmax(0,1fr)_minmax(0,40rem)] items-end gap-10")}>
      <div className="min-w-0">
        <p className="text-[15px] text-muted-foreground first-letter:uppercase">{format(agora, "EEEE, d 'de' MMMM", { locale: pt })}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">{saudacao(agora.getHours())}, {PAPEIS[r].nome}</h1>
        {/* 27/10: com colunas, os números do topo já dizem quanto há */}
        {cols === 1 && <p className="mt-2 text-lg text-muted-foreground">{frase}</p>}
        {exemplo}
        {r === "direcao" && cols === 1 && (
          <p className="mt-2 text-[15px] text-muted-foreground">
            {ab.length} negócios abertos · {emProposta} € sem IVA em proposta · margem média {margem}
          </p>
        )}
      </div>
      {cols > 1 && (
        <div className={cn("grid gap-3", r === "direcao" ? "grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.5fr)]" : "grid-cols-3", cols === 2 && "mt-6")}>
          <Numero v={String(L.length)} l="para fazer" />
          <Numero v={String(atrasados)} l="com atraso" tom={atrasados ? "text-destructive" : undefined} />
          {r === "direcao"
            ? <><Numero v={margem} l="margem média" /><Numero v={emProposta + " €"} l="em proposta, sem IVA" /></>
            : <Numero v={String(al.reduce((a, x) => a + x.n, 0))} l="à espera de alguém" />}
        </div>
      )}
    </header>
  );

  const nada = !primeiro && (
    <div className="rounded-2xl border border-dashed border-border bg-card/60 p-8 text-center">
      <CalendarClock className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <p className="mt-3 text-lg font-medium text-foreground">Nada para fazer agora</p>
    </div>
  );
  const espera = (
    <div className="grid min-w-0 content-start gap-8">
      {avisos}
      {compromissos}
      {pagamentos}
      {r === "armazem" && <InventarioArmazem A={A} go={go} className={PAINEL} />}
    </div>
  );
  // A agenda da equipa é uma grelha larga: com ela escolhida, sai da coluna e fica por baixo, a toda a largura
  const equipaLarga = ambito === "equipa";

  // O mesmo elemento de fora em todas as larguras: é ele que se mede (largura.ts mede o 1.º que encontra)
  return (
    <div ref={ref} className={cols === 1 ? "mx-auto w-full max-w-3xl px-4 pb-24 pt-8 sm:px-8 sm:pt-12" : "mx-auto w-full max-w-[1600px] px-6 pb-24 pt-8 xl:px-10 xl:pt-10"}>
      {cabecalho}
      {cols === 1 ? (
        <>
          {comecar}
          {depois}
          {pagamentos}
          {r === "armazem" && <InventarioArmazem A={A} go={go} />}
          {agendaEl("mt-12")}
        </>
      ) : (
        <>
          <div className={cn("mt-10 grid items-start gap-x-8 gap-y-10", cols === 3 && !equipaLarga ? "grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.9fr)]" : "grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]")}>
            <div className="min-w-0">{comecar}{nada}{depois}</div>
            {cols === 3 && !equipaLarga
              ? <>{espera}<div className="sticky top-6 min-w-0">{agendaEl(PAINEL)}</div></>
              : <div className="grid min-w-0 content-start gap-8">{espera}{!equipaLarga && agendaEl(PAINEL)}</div>}
          </div>
          {equipaLarga && agendaEl(cn("mt-8", PAINEL))}
        </>
      )}
    </div>
  );
}
