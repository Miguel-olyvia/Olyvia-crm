// Catálogo, Marketing e Definições na proposta simples (os Clientes do V1 estão em ClientesV1.tsx).
import { ArrowRight, Minus, Plus, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ESTR, eur, pct } from "./motor";
import type { Ctx } from "./pecas";
import { CatalogoV1 } from "./CatalogoV1";
import { DemolicaoV2 } from "./v2/DemolicaoV2";
import { RecursosFrotaAgenda } from "./frota/RecursosFrotaAgenda";

const Interruptor = ({ on, onClick, titulo, texto }: { on: boolean; onClick: () => void; titulo: string; texto: string }) => (
  <button type="button" role="switch" aria-checked={on} onClick={onClick} className="flex w-full items-center justify-between gap-4 py-4 text-left">
    <span><span className="block text-[15px] font-medium">{titulo}</span><span className="block text-[15px] text-muted-foreground">{texto}</span></span>
    <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-primary" : "bg-input")}>
      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
    </span>
  </button>
);

/** O Catálogo do V1: desde 14/10/2026 é o CatalogoV1 (cinco secções e a ficha do serviço). */
export function CatalogoSimples(ctx: Ctx) {
  return <CatalogoV1 {...ctx} />;
}

export function MarketingSimples() {
  const C: [string, string, number, number][] = [["Site · pedido de orçamento", "Formulário do site", 31, 9], ["Campanha de outono", 'Meta Ads · formulário "Cozinha nova"', 14, 3], ["Recomendações", "Registadas à mão", 6, 2]];
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-8 sm:px-8 sm:pt-12">
      <h1 className="text-3xl font-semibold tracking-tight">Marketing</h1>
      <p className="mt-2 text-lg text-muted-foreground">De onde vêm as leads e quantas viram negócio. Os formulários vivem dentro de cada campanha.</p>
      <ul className="mt-8 divide-y divide-border rounded-2xl border border-border bg-card px-4 shadow-[var(--shadow-sm)] sm:px-5">
        {C.map(([n, s, l, g]) => (
          <li key={n} className="grid gap-2 py-4">
            <span className="flex items-baseline justify-between gap-3"><span className="text-base font-medium">{n}</span><span className="text-[15px] tabular-nums">{g} de {l} ganhos · {pct(g / l)}</span></span>
            <span className="text-[15px] text-muted-foreground">{s}</span>
            <span className="h-2 rounded-full bg-muted" aria-hidden="true"><span className="block h-full rounded-full bg-primary/70" style={{ width: `${(g / l) * 100}%` }} /></span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Contador({ rot, v, onSet }: { rot: string; v: number; onSet: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <span className="text-[15px] font-medium" id={"c-" + rot}>{rot}</span>
      <div role="group" aria-labelledby={"c-" + rot} className="inline-flex items-center rounded-lg border border-input bg-card p-0.5">
        <button type="button" aria-label="Menos" className="grid h-11 w-11 place-items-center rounded-lg hover:bg-muted" onClick={() => onSet(Math.max(0, v - 1))}><Minus className="h-4 w-4" /></button>
        <output className="w-16 text-center text-[17px] font-medium tabular-nums">{v}%</output>
        <button type="button" aria-label="Mais" className="grid h-11 w-11 place-items-center rounded-lg hover:bg-muted" onClick={() => onSet(Math.min(90, v + 1))}><Plus className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

export function DefinicoesSimples({ S, A, go, run, repor }: Ctx) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-8 sm:px-8 sm:pt-12">
      <h1 className="text-3xl font-semibold tracking-tight">Definições</h1>
      <p className="mt-2 text-lg text-muted-foreground">Só as regras que mexem no orçamento e no aspeto deste protótipo.</p>

      <button type="button" onClick={go(() => A.nav("campos"))}
        className="mt-8 flex w-full items-center gap-4 rounded-2xl border border-primary/30 bg-card p-5 text-left shadow-[var(--shadow-sm)] transition-colors hover:border-primary">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-violet-100 text-violet-700" aria-hidden="true"><SlidersHorizontal className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold">Campos e formulários</span>
          <span className="block text-[15px] text-muted-foreground">O que se pergunta em cada fase, à medida do seu setor: nomes, opções, obrigatórios e campos novos.</span>
        </span>
        <ArrowRight className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      </button>

      <h2 className="mt-10 text-lg font-semibold">Margens</h2>
      <div className="mt-2 divide-y divide-border rounded-2xl border border-border bg-card px-4 shadow-[var(--shadow-sm)] sm:px-5">
        <Contador rot="Margem mínima" v={S.cfg.min} onSet={(n) => run(() => { S.cfg.min = Math.min(n, S.cfg.alvo); })} />
        <Contador rot="Margem-alvo" v={S.cfg.alvo} onSet={(n) => run(() => { S.cfg.alvo = Math.max(n, S.cfg.min); })} />
        <Interruptor on={S.cfg.estrutura} onClick={() => run(() => { S.cfg.estrutura = !S.cfg.estrutura; })} titulo={`Somar ${eur(ESTR)} €/h de estrutura ao custo`}
          texto="Decisão em aberto. Pelo método BMG a estrutura fica dentro da margem: somá-la aqui cobra-a duas vezes." />
      </div>
      <p className="mt-2 text-[15px] text-muted-foreground">Abaixo do mínimo, a proposta só sai com aprovação da Direção.</p>

      <h2 className="mt-10 text-lg font-semibold">Demolição e entulho</h2>
      <p className="mt-1 text-[15px] text-muted-foreground">Os valores com que se calcula a demolição e a remoção de entulho no orçamento. Só a Direção os muda.</p>
      {/* a tabela dos artigos precisa de mais largura do que a coluna: no ecrã largo, o bloco alarga centrado */}
      <div className="relative mt-3 lg:left-1/2 lg:w-[min(64rem,calc(100vw-22rem))] lg:-translate-x-1/2"><DemolicaoV2 S={S} mudarPapel={() => run(() => A.role("direcao"))} /></div>

      {/* 16/10: as viaturas da Frota como recursos da agenda (como em Definições › Agenda da V2); "Abrir na Frota" abre a viatura */}
      <section id="agenda-recursos" aria-labelledby="def-agenda" className="scroll-mt-16">
        <h2 id="def-agenda" className="mt-10 text-lg font-semibold">Agenda · Recursos</h2>
        <RecursosFrotaAgenda />
      </section>

      <h2 className="mt-10 text-lg font-semibold">Aspeto</h2>
      <div className="mt-2 divide-y divide-border rounded-2xl border border-border bg-card px-4 shadow-[var(--shadow-sm)] sm:px-5">
        <Interruptor on={!!S.leitura} onClick={() => run(() => A.leitura(!S.leitura))} titulo="Leitura fácil" texto="Letra maior, mais espaço entre letras e linhas, fundo creme." />
        <Interruptor on={false} onClick={go(() => A.aspeto("atual"))} titulo="Ver o aspeto atual da Olyvia" texto="Para comparar com esta proposta." />
      </div>

      <h2 className="mt-10 text-lg font-semibold">Demonstração</h2>
      <p className="mt-1 text-[15px] text-muted-foreground">O que se faz fica guardado neste browser.</p>
      <Button variant="outline" size="lg" className="mt-4" onClick={repor}>Repor a demonstração</Button>
    </div>
  );
}
