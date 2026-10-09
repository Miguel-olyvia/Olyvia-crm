// Catálogo, Clientes, Marketing e Definições na proposta simples.
import { useMemo, useState } from "react";
import { ArrowRight, ChevronDown, Minus, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CATALOGO, OFICIOS, normal } from "./catalogo";
import { ESTR, custoUn, eur, nfmt, pct, type Servico } from "./motor";
import { numero, type Ctx } from "./pecas";

const Interruptor = ({ on, onClick, titulo, texto }: { on: boolean; onClick: () => void; titulo: string; texto: string }) => (
  <button type="button" role="switch" aria-checked={on} onClick={onClick} className="flex w-full items-center justify-between gap-4 py-4 text-left">
    <span><span className="block text-[15px] font-medium">{titulo}</span><span className="block text-[15px] text-muted-foreground">{texto}</span></span>
    <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-primary" : "bg-input")}>
      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
    </span>
  </button>
);

function Numero({ id, rot, v, un, onSet }: { id: string; rot: string; v: number; un: string; onSet: (n: number) => void }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-medium">{rot}</span>
      <span className="flex items-center gap-2">
        <input id={id} key={v} type="number" inputMode="decimal" step="any" min="0" defaultValue={v}
          className="h-11 w-28 rounded-lg border border-input bg-card px-3 text-right text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25"
          onBlur={(e) => { const n = numero(e.target.value); if (!isNaN(n) && n >= 0 && n !== v) onSet(n); }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
        <span className="text-sm text-muted-foreground">{un}</span>
      </span>
    </label>
  );
}

export function CatalogoSimples({ S, run }: Ctx) {
  const [aberto, setAberto] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [of, setOf] = useState<string | null>(null);
  const min = S.cfg.min / 100, alvo = S.cfg.alvo / 100;
  const outros = useMemo(() => {
    const qq = normal(q.trim());
    return CATALOGO.filter((c) => !S.svc[c.id] && (!of || c.cat === of) && (!qq || normal(c.n).includes(qq))).sort((a, b) => b.usos - a.usos);
  }, [q, of, S.svc]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-8 sm:px-8 sm:pt-12">
      <h1 className="text-3xl font-semibold tracking-tight">Catálogo e custos</h1>
      <p className="mt-2 text-lg text-muted-foreground">A receita de cada serviço: horas, custo do técnico e consumíveis. É daqui que o orçamento tira o custo.</p>

      <h2 className="mt-10 text-lg font-semibold">Serviços em uso</h2>
      <p className="mt-1 text-[15px] text-muted-foreground">Mudar a receita avisa os orçamentos ainda não enviados ("O Catálogo mudou").</p>
      <ul className="mt-3 divide-y divide-border border-y border-border">
        {(Object.entries(S.svc) as [string, Servico][]).map(([k, s]) => {
          const c = custoUn(s, S), m = (s.preco - c) / s.preco, ab = aberto === k;
          const mc = m < min ? "text-destructive" : m < alvo - 0.005 ? "text-warning" : "text-muted-foreground";
          return (
            <li key={k}>
              <button type="button" onClick={() => setAberto(ab ? null : k)} aria-expanded={ab} className="flex min-h-16 w-full items-center gap-4 py-3 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px]">{s.n}</span>
                  <span className="block text-sm text-muted-foreground">
                    {s.perfil} · {nfmt(s.h)} h/{s.un}
                    {s.semCusto && <span className="text-warning"> · técnico sem custo por hora</span>}
                    {s.stale && <span className="text-warning"> · consumível com preço antigo</span>}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-[15px] tabular-nums">{eur(s.preco)} €/{s.un}</span>
                  <span className={cn("block text-sm", mc)}>custo {eur(c)} € · margem {pct(m)}</span>
                </span>
                <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", ab && "rotate-180")} aria-hidden="true" />
              </button>
              {ab && (
                <div className="mb-3 grid grid-cols-2 gap-4 rounded-xl bg-muted/50 p-4 sm:grid-cols-4 animate-in fade-in-0 slide-in-from-top-1">
                  <Numero id={`h-${k}`} rot="Horas" v={s.h} un={`h/${s.un}`} onSet={(n) => run(() => { s.h = n; })} />
                  <Numero id={`eh-${k}`} rot="Técnico" v={s.eh} un="€/h" onSet={(n) => run(() => { s.eh = n; s.semCusto = false; })} />
                  <Numero id={`c-${k}`} rot="Consumíveis" v={s.cons} un={`€/${s.un}`} onSet={(n) => run(() => { s.cons = n; s.stale = null; })} />
                  <Numero id={`p-${k}`} rot="Preço de tabela" v={s.preco} un={`€/${s.un}`} onSet={(n) => run(() => { s.preco = n; })} />
                  <p className="col-span-full text-sm text-muted-foreground">
                    Custo = {nfmt(s.h)} h × {eur(s.eh)} € + {eur(s.eq)} € de equipamento + {eur(s.cons)} € de consumíveis{S.cfg.estrutura ? ` + ${nfmt(s.h)} h × ${eur(ESTR)} € de estrutura` : ""} = {eur(c)} €/{s.un}.
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <h2 className="mt-12 text-lg font-semibold">Catálogo da Mudelar</h2>
      <p className="mt-1 text-[15px] text-muted-foreground">Os serviços vendidos à parte dos pacotes, com as horas validadas. Entram em uso quando se juntam numa visita.</p>
      <label className="relative mt-4 block">
        <span className="sr-only">Procurar no Catálogo</span>
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar serviço"
          className="h-11 w-full rounded-lg border border-input bg-card pl-10 pr-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" />
      </label>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Ofício">
        {[null, ...OFICIOS].map((o) => (
          <button key={o || "t"} type="button" aria-pressed={of === o} onClick={() => setOf(o)}
            className={cn("min-h-9 rounded-full border px-3 text-sm", of === o ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card")}>{o || "Todos"}</button>
        ))}
      </div>
      <ul className="mt-3 divide-y divide-border border-y border-border">
        {outros.map((c) => (
          <li key={c.id} className="flex min-h-14 items-center justify-between gap-3 py-2.5">
            <span className="min-w-0"><span className="block text-[15px]">{c.n}</span><span className="block text-sm text-muted-foreground">{c.cat} · {nfmt(c.hu)} h/{c.un}{c.hf ? ` + ${nfmt(c.hf)} h fixas` : ""}</span></span>
            {c.usos > 0 && <span className="shrink-0 text-sm text-muted-foreground">em {c.usos} orçamentos</span>}
          </li>
        ))}
        {!outros.length && <li className="py-3 text-[15px] text-muted-foreground">Nada com esse nome.</li>}
      </ul>
    </div>
  );
}

export function ClientesSimples({ S, A, go }: Ctx) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-8 sm:px-8 sm:pt-12">
      <h1 className="text-3xl font-semibold tracking-tight">Clientes</h1>
      <p className="mt-2 text-lg text-muted-foreground">O cliente é criado sozinho quando o contrato é assinado ou a venda direta é aceite.</p>
      <ul className="mt-8 divide-y divide-border border-y border-border">
        {S.clientes.map((c) => (
          <li key={c.deal}>
            <button type="button" onClick={go(() => A.abrir(c.deal))} className="group flex min-h-16 w-full items-center gap-4 py-3 text-left hover:bg-muted/50 sm:px-2">
              <span className="min-w-0 flex-1"><span className="block text-base font-medium">{c.nome}</span><span className="block text-[15px] text-muted-foreground">{c.local} · {c.tel} · cliente desde {c.desde}</span></span>
              <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MarketingSimples() {
  const C: [string, string, number, number][] = [["Site · pedido de orçamento", "Formulário do site", 31, 9], ["Campanha de outono", 'Meta Ads · formulário "Cozinha nova"', 14, 3], ["Recomendações", "Registadas à mão", 6, 2]];
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-24 pt-8 sm:px-8 sm:pt-12">
      <h1 className="text-3xl font-semibold tracking-tight">Marketing</h1>
      <p className="mt-2 text-lg text-muted-foreground">De onde vêm as leads e quantas viram negócio. Os formulários vivem dentro de cada campanha.</p>
      <ul className="mt-8 divide-y divide-border border-y border-border">
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

      <h2 className="mt-10 text-lg font-semibold">Margens</h2>
      <div className="mt-2 divide-y divide-border border-y border-border">
        <Contador rot="Margem mínima" v={S.cfg.min} onSet={(n) => run(() => { S.cfg.min = Math.min(n, S.cfg.alvo); })} />
        <Contador rot="Margem-alvo" v={S.cfg.alvo} onSet={(n) => run(() => { S.cfg.alvo = Math.max(n, S.cfg.min); })} />
        <Interruptor on={S.cfg.estrutura} onClick={() => run(() => { S.cfg.estrutura = !S.cfg.estrutura; })} titulo={`Somar ${eur(ESTR)} €/h de estrutura ao custo`}
          texto="Decisão em aberto. Pelo método BMG a estrutura fica dentro da margem: somá-la aqui cobra-a duas vezes." />
      </div>
      <p className="mt-2 text-[15px] text-muted-foreground">Abaixo do mínimo, a proposta só sai com aprovação da Direção.</p>

      <h2 className="mt-10 text-lg font-semibold">Aspeto</h2>
      <div className="mt-2 divide-y divide-border border-y border-border">
        <Interruptor on={!!S.leitura} onClick={() => run(() => A.leitura(!S.leitura))} titulo="Leitura fácil" texto="Letra maior, mais espaço entre letras e linhas, fundo creme." />
        <Interruptor on={false} onClick={go(() => A.aspeto("atual"))} titulo="Ver o aspeto atual da Olyvia" texto="Para comparar com esta proposta." />
      </div>

      <h2 className="mt-10 text-lg font-semibold">Demonstração</h2>
      <p className="mt-1 text-[15px] text-muted-foreground">O que se faz fica guardado neste browser.</p>
      <Button variant="outline" size="lg" className="mt-4" onClick={repor}>Repor a demonstração</Button>
    </div>
  );
}
