// 9/11 (Rúben: «o Estúdio é o passo final da visita: quando fecha, a visita já tem toda a informação sobre os serviços etc., e o plano de
// obra, orçamento etc. já está tudo gerado»). O último passo do Estúdio, «Fechar»:
//  · os serviços do Catálogo verdadeiro (servicosDoCatalogo.ts), cada um com a receita: o que se faz, o ofício, as horas, os materiais e
//    os consumíveis; trocar por outro do Catálogo, tirar, juntar outro; os produtos com o par no Catálogo;
//  · o plano da obra (o mesmo que a visita gera ao fechar e que a obra vai ter): o dia de início, a equipa do RH e o mapa de datas;
//  · o orçamento que vai nascer (sem IVA);
//  · «Fechar a visita»: volta ao negócio, leva tudo e fecha a visita (o orçamento e o plano ficam gerados).
import { useCallback, useMemo, useState } from "react";
import { Check, ChevronDown, Hammer, Lock, Plus, Repeat, Search, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { eur, tot, type Estado, type SvcId } from "@/emylia/motor";
import { useCatalogo } from "@/emylia/v2/catalogoStore";
import { MapaDatasObra, inicioPorOmissao } from "@/emylia/MapaDatasObra";
import { materiaisDaReceita, passosDaReceita, planoDaVisita, planoDoEstudio } from "@/emylia/planoDaVisita";
import { simularNoNegocio } from "@/emylia/estudioNoNegocio";
import { podeVerCustos } from "@/emylia/permissoes";
import { useCatalogoDoEstudio } from "./catalogoDoEstudio";
import { juntarExtra, mudarEquipa, mudarExtra, mudarInicio, projetoNoCatalogo, reporServico, servicosParaPlano, trocarServico, type ServicoDoProjeto } from "./servicosDoCatalogo";
import type { Projeto } from "./necessidadesEstudio";

const nfq = (n: number) => n.toLocaleString("pt-PT", { maximumFractionDigits: 2 });
const limpo = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const CARTAO = "space-y-4 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]";

export function PlanoDoEstudio({ p, setP, fechar, semCatalogo }: {
  p: Projeto; setP: React.Dispatch<React.SetStateAction<Projeto>>;
  /** Volta ao negócio; com `true`, fecha a visita. */
  fechar: (fecharVisita: boolean) => void;
  /** O que mostrar sem o Catálogo verdadeiro (o protótipo sem sessão): a ficha de antes. */
  semCatalogo: React.ReactNode;
}) {
  const { S, aLer, erro } = useCatalogoDoEstudio();
  if (!S) {
    return (
      <div className="space-y-4 lg:col-span-2">
        {aLer ? <p role="status" className="text-[15px] text-muted-foreground">A ler o Catálogo da empresa…</p>
          : <p className="rounded-xl bg-muted/60 px-4 py-3 text-[15px] text-muted-foreground">{erro ?? "Sem sessão iniciada, o Estúdio usa o catálogo de teste. Entre na Olyvia para ver os serviços, o plano e o orçamento verdadeiros."}</p>}
        {semCatalogo}
      </div>
    );
  }
  return <ComCatalogo p={p} setP={setP} fechar={fechar} S={S} erro={erro} />;
}

function ComCatalogo({ p, setP, fechar, S, erro }: { p: Projeto; setP: React.Dispatch<React.SetStateAction<Projeto>>; fechar: (f: boolean) => void; S: Estado; erro: string | null }) {
  const K = useCatalogo();
  const produtos = useMemo(() => K.produtos ?? [], [K.produtos]);
  const inicio = inicioPorOmissao(p.catalogo?.inicio);
  const L = useMemo(() => projetoNoCatalogo(p, S, produtos), [p, S, produtos]);
  const negocio = p.negocio !== undefined ? S.deals.find((x) => x.id === p.negocio) : undefined;
  // o plano e o orçamento: com o negócio, os que a visita vai gerar (o negócio com o Estúdio levado); sem ele, só dos serviços do Estúdio
  const calcular = useCallback((ini: string) => {
    const pi = { ...p, catalogo: { ...(p.catalogo ?? {}), inicio: ini } };
    return negocio ? planoDaVisita(simularNoNegocio(negocio, pi, S, produtos).d, S, ini) : planoDoEstudio(servicosParaPlano(L), S, ini, p.negocio, p.catalogo);
  }, [p, S, produtos, negocio, L]);
  const P = useMemo(() => calcular(inicio), [calcular, inicio]);
  const total = P.orc && negocio ? tot({ ...negocio, orc: P.orc }, S).pf : L.servicos.reduce((a, s) => a + s.q * s.preco, 0);

  return (
    <>
      <section aria-labelledby="t-fechar" className="min-w-0 space-y-6">
        <div>
          <h2 id="t-fechar" className="text-2xl font-semibold tracking-tight">Fechar a visita</h2>
          <p className="text-[15px] text-muted-foreground">Os serviços do Catálogo da empresa, o plano da obra com a equipa e as datas, e o orçamento. Ao fechar, fica tudo no negócio.</p>
          {erro && <p className="mt-2 text-sm text-amber-800 dark:text-amber-300">{erro}</p>}
        </div>
        <Servicos p={p} setP={setP} S={S} L={L} />
        <section aria-labelledby="t-plano" className={CARTAO}>
          <div>
            <h3 id="t-plano" className="text-[17px] font-semibold tracking-tight">O plano da obra</h3>
            <p className="text-sm text-muted-foreground">O mesmo que a obra vai ter: as tarefas pela ordem das fases, o técnico livre de cada ofício (sem férias nem outra obra) e as datas em dias úteis.</p>
          </div>
          <MapaDatasObra P={P} inicio={inicio} mudarInicio={(iso) => setP((x) => mudarInicio(x, iso))}
            equipa={{ S, negocio: p.negocio, escolhas: { tecnicos: p.catalogo?.tecnicos, equipa: p.catalogo?.equipa, equipas: p.catalogo?.equipas }, mudar: (e) => setP((x) => mudarEquipa(x, e)), calcular }} />
        </section>
      </section>
      <aside className="space-y-4">
        <div className={CARTAO}>
          <p className="text-sm text-muted-foreground">O orçamento</p>
          <p className="text-3xl font-semibold tabular-nums">{eur(total)} €</p>
          <p className="text-sm text-muted-foreground">sem IVA · {L.servicos.length} {L.servicos.length === 1 ? "serviço" : "serviços"} e {L.produtos.length} {L.produtos.length === 1 ? "produto" : "produtos"}{podeVerCustos() && P.orc && negocio ? ` · margem ${Math.round(tot({ ...negocio, orc: P.orc }, S).m * 100)}%` : ""}</p>
          {P.fim && <p className="text-[15px]">Obra de <b className="font-semibold">{P.dias} {P.dias === 1 ? "dia útil" : "dias úteis"}</b>, pronta a {P.fim.toLocaleDateString("pt-PT", { day: "numeric", month: "long" })}.</p>}
        </div>
        {p.negocio !== undefined ? <>
          <Button type="button" className="min-h-12 w-full text-base" onClick={() => fechar(true)}><Lock className="mr-2 h-5 w-5" aria-hidden="true" />Fechar a visita</Button>
          <p className="text-sm text-muted-foreground">Volta ao negócio com a planta, as medidas, os serviços, os produtos e o plano. A visita fecha e o orçamento fica feito, com estas datas.</p>
          <Button type="button" variant="outline" className="min-h-11 w-full" onClick={() => fechar(false)}>Voltar sem fechar</Button>
        </> : <p className="text-sm text-muted-foreground">Aberto a partir de um negócio, aqui fecha-se a visita.</p>}
      </aside>
    </>
  );
}

/** Os serviços e os produtos do Catálogo: trocar, tirar, repor, juntar. */
function Servicos({ p, setP, S, L }: { p: Projeto; setP: React.Dispatch<React.SetStateAction<Projeto>>; S: Estado; L: ReturnType<typeof projetoNoCatalogo> }) {
  const [procura, setProcura] = useState("");
  const [trocar, setTrocar] = useState<string | null>(null);
  const todos = useMemo(() => Object.entries(S.svc).map(([id, s]) => ({ id: id as SvcId, n: s.n, un: s.un, preco: s.preco })).sort((a, b) => a.n.localeCompare(b.n, "pt")), [S.svc]);
  const achados = (q: string) => { const t = limpo(q.trim()); return t.length < 2 ? [] : todos.filter((x) => limpo(x.n).includes(t)).slice(0, 8); };
  const lista = achados(procura);

  return (
    <section aria-labelledby="t-servicos" className={CARTAO}>
      <div>
        <h3 id="t-servicos" className="text-[17px] font-semibold tracking-tight">Os serviços do Catálogo</h3>
        <p className="text-sm text-muted-foreground">Saem das plantas. Cada um com a receita do Catálogo: quem o faz, as horas, os materiais e os consumíveis.</p>
      </div>
      <ul className="space-y-2">
        {L.servicos.map((s) => (
          <li key={s.chave}>
            <LinhaServico s={s} S={S}
              acoes={s.origem === "produto" ? <span className="text-xs text-muted-foreground">Vem com o produto</span> : <>
                <Button type="button" variant="outline" size="sm" className="min-h-10" aria-expanded={trocar === s.chave} onClick={() => setTrocar(trocar === s.chave ? null : s.chave)}><Repeat className="mr-1 h-4 w-4" aria-hidden="true" />Trocar</Button>
                <Button type="button" variant="ghost" size="sm" className="min-h-10" aria-label={`Tirar ${s.n}`}
                  onClick={() => setP((x) => (s.origem === "extra" ? mudarExtra(x, s.sid, 0) : trocarServico(x, s.chave, null)))}><X className="h-4 w-4" aria-hidden="true" /></Button>
              </>}
              qtd={s.origem === "extra" ? (q) => setP((x) => mudarExtra(x, s.sid, q)) : undefined} />
            {trocar === s.chave && (
              <Procurar rotulo={`Trocar «${s.n}» por`} achados={achados} escolher={(sid) => { setP((x) => (s.origem === "extra" ? juntarExtra(mudarExtra(x, s.sid, 0), sid, s.q) : trocarServico(x, s.chave, sid))); setTrocar(null); }} />
            )}
          </li>
        ))}
      </ul>
      {L.produtos.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Os produtos</h4>
          <ul className="space-y-1.5">
            {L.produtos.map((x) => (
              <li key={x.chave} className="flex items-center justify-between gap-3 rounded-xl bg-muted/50 px-3 py-2 text-[15px]">
                <span className="min-w-0"><b className="font-medium">{x.n}</b> · {nfq(x.q)}<span className="block truncate text-xs text-muted-foreground">De: {x.de.join("; ")}</span></span>
                <Button type="button" variant="ghost" size="sm" className="min-h-10 shrink-0" aria-label={`Tirar ${x.n}`} onClick={() => setP((y) => trocarServico(y, x.chave, null))}><X className="h-4 w-4" aria-hidden="true" /></Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {L.tirados.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">Tirados:
          {L.tirados.map((x) => <button key={x.chave} type="button" className="inline-flex min-h-9 items-center gap-1 rounded-full border border-input px-3 hover:bg-accent" onClick={() => setP((y) => reporServico(y, x.chave))}><Undo2 className="h-3.5 w-3.5" aria-hidden="true" />{x.n}</button>)}
        </p>
      )}
      {L.semPar.length > 0 && <p className="text-sm text-amber-800 dark:text-amber-300">Sem par no Catálogo (junte um serviço abaixo, se for preciso): {L.semPar.join("; ")}.</p>}
      <div className="space-y-2 border-t border-border pt-4">
        <label className="grid gap-1.5 text-sm font-medium">Juntar um serviço do Catálogo
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input type="search" value={procura} onChange={(e) => setProcura(e.target.value)} placeholder="Ex.: pintura, impermeabilização, ponto de luz"
              className="h-11 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-[15px]" />
          </span>
        </label>
        {lista.length > 0 && (
          <ul className="space-y-1">
            {lista.map((x) => (
              <li key={x.id}>
                <button type="button" className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-[15px] hover:bg-accent"
                  onClick={() => { setP((y) => juntarExtra(y, x.id, 1)); setProcura(""); }}>
                  <span className="min-w-0 truncate">{x.n}</span>
                  <span className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">{eur(x.preco)} €/{x.un}<Plus className="h-4 w-4 text-primary" aria-hidden="true" /></span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function LinhaServico({ s, S, acoes, qtd }: { s: ServicoDoProjeto; S: Estado; acoes: React.ReactNode; qtd?: (q: number) => void }) {
  const passos = passosDaReceita(S, s.sid);
  const mats = materiaisDaReceita(S, s.sid, s.q);
  const oficios = [...new Set(passos.map((x) => x.oficio))];
  return (
    <details className="group rounded-xl border border-border p-3">
      <summary className="flex min-h-11 cursor-pointer list-none items-start justify-between gap-3">
        <span className="min-w-0 text-[15px]">
          <b className="font-medium">{s.n}</b> · {nfq(s.q)} {s.un}{s.trocado && <span className="ml-1 rounded-full bg-primary/10 px-2 text-xs text-primary">trocado</span>}
          <span className="block text-xs text-muted-foreground">{eur(s.preco)} €/{s.un}{oficios.length ? ` · ${oficios.join(", ")}` : ""} · {nfq((S.svc[s.sid]?.h ?? 0) * s.q)} h</span>
          <span className="block truncate text-xs text-muted-foreground">De: {s.de.join("; ")}</span>
          {s.unDiferente && <span className="block text-xs text-amber-800 dark:text-amber-300">No Catálogo é por {s.unDiferente}: confirme a quantidade.</span>}
        </span>
        <span className="flex shrink-0 items-center gap-1" onClick={(e) => e.preventDefault()}>{acoes}<ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" /></span>
      </summary>
      <div className="space-y-3 pt-3 text-sm">
        {qtd && (
          <label className="grid max-w-[12rem] gap-1 font-medium">Quantidade ({s.un})
            <input type="number" min={0} step={0.5} defaultValue={s.q} onBlur={(e) => { const n = Number(e.target.value.replace(",", ".")); if (Number.isFinite(n) && n !== s.q) qtd(n); }}
              className="h-11 rounded-lg border border-input bg-background px-3 text-[15px]" />
          </label>
        )}
        {passos.length > 0 && (
          <div>
            <p className="flex items-center gap-1.5 font-medium"><Hammer className="h-4 w-4 text-primary" aria-hidden="true" />O que se faz</p>
            <ul className="mt-1 space-y-0.5 text-muted-foreground">{passos.map((x, i) => <li key={i}>{x.n} · {x.oficio} · {nfq(x.h * s.q)} h</li>)}</ul>
          </div>
        )}
        <div>
          <p className="flex items-center gap-1.5 font-medium"><Check className="h-4 w-4 text-primary" aria-hidden="true" />Materiais e consumíveis</p>
          {mats.length ? <ul className="mt-1 grid gap-1 sm:grid-cols-2">{mats.map((m) => <li key={m.n} className="flex justify-between gap-3 rounded-lg bg-muted/50 px-3 py-1.5"><span className="min-w-0 truncate">{m.n}</span><span className="shrink-0 tabular-nums text-muted-foreground">{nfq(m.q)} {m.un}</span></li>)}</ul>
            : <p className="mt-1 text-muted-foreground">A receita não tem materiais.</p>}
        </div>
      </div>
    </details>
  );
}

function Procurar({ rotulo, achados, escolher }: { rotulo: string; achados: (q: string) => { id: SvcId; n: string; un: string; preco: number }[]; escolher: (sid: SvcId) => void }) {
  const [q, setQ] = useState("");
  const lista = achados(q);
  return (
    <div className={cn("mt-2 space-y-2 rounded-xl border border-primary/30 bg-primary/[0.04] p-3")}>
      <label className="grid gap-1.5 text-sm font-medium">{rotulo}
        <input type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Escreva parte do nome" className="h-11 rounded-lg border border-input bg-background px-3 text-[15px]" />
      </label>
      {lista.map((x) => (
        <button key={x.id} type="button" className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-[15px] hover:bg-accent" onClick={() => escolher(x.id)}>
          <span className="min-w-0 truncate">{x.n}</span><span className="shrink-0 text-sm text-muted-foreground">{eur(x.preco)} €/{x.un}</span>
        </button>
      ))}
    </div>
  );
}
