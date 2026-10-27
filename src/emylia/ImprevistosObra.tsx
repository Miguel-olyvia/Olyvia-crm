// Os imprevistos a meio da obra (21/10/2026), no ecrã (a lógica está em imprevistos.ts e no motor):
// · RegistarImprevisto: o técnico (no Hoje) ou o gestor (na página da obra) dizem o que encontraram, onde, com fotografia, a gravidade e as
//   tarefas afetadas. Uma só porta para os problemas: «só avisar o responsável» fica no diário, sem mexer no plano.
// · ImprevistosNaObra: o gestor vê cada imprevisto com UM próximo passo: fazer a proposta ao cliente, esperar pela resposta, ou decidir
//   quando o cliente não aceitou. A proposta é uma adenda (serviços do Catálogo e/ou uma linha livre com horas, preço e materiais).
import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Camera, Check, Minus, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CATALOGO_TODO } from "./catalogo";
import { eur, nfmt, servicoDoCatalogo, type MatTarefa, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { SeletorPesquisa } from "./pecasFicha";
import { EditorMateriais } from "./PlanoInterativo";
import { Miniaturas } from "./AcompanhamentoObra";
import { nomeCurtoTarefa } from "./obraOps";
import { lerFoto } from "./ObraOperacoes";
import { diasAdenda, estadoAdenda, faturasAdenda, nomeParcela, precoSugeridoLivre, previsaoLinha, totaisAdenda, totaisLinhas, type LinhaAdenda } from "./adendas";
import { AcoesAdenda } from "./TrabalhosAMais";
import { DECISOES, GRAVIDADES, imprevistosDe, paradasPor, tarefasAfetaveis, type Gravidade, type Imprevisto, type LinhaLivre } from "./imprevistos";

const chip = (on: boolean) => cn("inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-[15px] transition-colors", on ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card hover:border-foreground/40");
const ENTRADA = "h-12 w-full rounded-xl border border-input bg-background px-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring";
const OFICIOS = ["Canalização", "Eletricidade", "Revestimentos", "Carpintaria", "Pintura", "Demolições"];

/* ================================================================== registar */
type Escolha = Gravidade | "aviso";
export function RegistarImprevisto({ ctx, d, ti, fechar }: { ctx: Ctx; d: Negocio; ti?: number; fechar: () => void }) {
  const { A, run } = ctx;
  const p = d.obra.plano!;
  const afetaveis = tarefasAfetaveis(p);
  const [texto, setTexto] = useState("");
  const [onde, setOnde] = useState("");
  const [foto, setFoto] = useState<string | null>(null);
  const [grav, setGrav] = useState<Escolha>("impede");
  const [tarefas, setTarefas] = useState<number[]>(ti != null && afetaveis.includes(ti) ? [ti] : []);
  const [dias, setDias] = useState(1);
  const input = useRef<HTMLInputElement>(null);
  const juntar = async (f?: File | null) => { if (!f) return; try { setFoto(await lerFoto(f)); } catch { /* sem leitura */ } };
  const falta = [!texto.trim() && "o que encontrou", grav !== "aviso" && !tarefas.length && "as tarefas afetadas"].filter(Boolean) as string[];
  const enviar = () => run(() => {
    if (grav === "aviso") A.ocorrencia(d.id, (ti != null ? `${p.tasks[ti].nome}: ` : "") + texto.trim() + (onde.trim() ? ` (${onde.trim()})` : ""));
    else A.registarImprevisto(d.id, { texto, onde, grav, tarefas, dias, ...(foto ? { foto } : {}) });
    fechar();
  });
  return (
    <div role="group" aria-label="Registar imprevisto" className="space-y-5 rounded-2xl border border-border bg-card p-4 animate-in fade-in-0 slide-in-from-top-1 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="flex items-center gap-2 text-base font-semibold"><AlertTriangle className="h-5 w-5 text-warning" aria-hidden="true" />Registar imprevisto</p>
        <button type="button" onClick={fechar} aria-label="Fechar" className="grid h-10 w-10 place-items-center rounded-lg text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      <label className="block space-y-1.5">
        <span className="text-[15px] font-medium">O que encontrou?</span>
        <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={2} placeholder="Ex.: cano de esgoto podre por baixo da base de duche"
          className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </label>
      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="block space-y-1.5">
          <span className="text-[15px] font-medium">Onde? <span className="font-normal text-muted-foreground">(opcional)</span></span>
          <input value={onde} onChange={(e) => setOnde(e.target.value)} placeholder="Ex.: parede do fundo" className={ENTRADA} />
        </label>
        <div>
          <input ref={input} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Fotografia do imprevisto" onChange={(e) => void juntar(e.target.files?.[0])} />
          {foto
            ? <div className="flex items-center gap-2"><Miniaturas fotos={[foto]} tam="h-12 w-16" /><button type="button" onClick={() => setFoto(null)} className="min-h-11 text-sm text-muted-foreground hover:text-foreground">Tirar</button></div>
            : <Button variant="outline" className="min-h-12" onClick={() => input.current?.click()}><Camera className="mr-1.5 h-4 w-4" aria-hidden="true" />Fotografia</Button>}
        </div>
      </div>
      <fieldset>
        <legend className="text-[15px] font-medium">Que efeito tem?</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {[...GRAVIDADES, { k: "aviso" as const, t: "Só avisar", sub: "Fica no diário; o plano não muda" }].map((g) => (
            <button key={g.k} type="button" aria-pressed={grav === g.k} onClick={() => setGrav(g.k)}
              className={cn("min-h-11 rounded-xl border p-3 text-left transition-colors", grav === g.k ? "border-primary bg-primary/[0.06] ring-1 ring-primary" : "border-input hover:border-foreground/40")}>
              <span className="block text-[15px] font-medium">{g.t}</span><span className="block text-sm text-muted-foreground">{g.sub}</span>
            </button>
          ))}
        </div>
      </fieldset>
      {grav !== "aviso" && (
        <fieldset>
          <legend className="text-[15px] font-medium">Que tarefas afeta?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {afetaveis.map((i) => {
              const on = tarefas.includes(i);
              return <button key={i} type="button" aria-pressed={on} onClick={() => setTarefas((T) => (on ? T.filter((x) => x !== i) : [...T, i]))} className={chip(on)}>{on && <Check className="h-4 w-4" aria-hidden="true" />}{p.tasks[i].nome}</button>;
            })}
          </div>
        </fieldset>
      )}
      {grav === "atrasa" && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[15px] font-medium">Atrasa</span>
          <span role="group" aria-label="Dias de atraso" className="inline-flex items-center rounded-lg border border-input">
            <button type="button" aria-label="Menos um dia" disabled={dias <= 1} onClick={() => setDias(dias - 1)} className="grid h-11 w-11 place-items-center hover:bg-muted disabled:opacity-40"><Minus className="h-4 w-4" /></button>
            <span className="min-w-[4.5rem] text-center text-[15px] tabular-nums">{dias} {dias === 1 ? "dia" : "dias"}</span>
            <button type="button" aria-label="Mais um dia" disabled={dias >= 15} onClick={() => setDias(dias + 1)} className="grid h-11 w-11 place-items-center hover:bg-muted disabled:opacity-40"><Plus className="h-4 w-4" /></button>
          </span>
        </div>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        {falta.length > 0 && <p className="text-sm text-muted-foreground sm:mr-auto">Falta {falta.join(" e ")}.</p>}
        <Button variant="ghost" size="lg" onClick={fechar}>Cancelar</Button>
        <Button size="lg" disabled={falta.length > 0} onClick={enviar}>{grav === "aviso" ? "Avisar o responsável" : "Registar o imprevisto"}</Button>
      </div>
    </div>
  );
}

/* ================================================================== o gestor: cada imprevisto com um próximo passo */
const ESTADO: Record<Imprevisto["estado"], [string, string]> = {
  aberto: ["por propor ao cliente", "bg-destructive/10 text-destructive"], proposta: ["à espera do cliente", "bg-warning/15"],
  recusado: ["o cliente não aceitou", "bg-destructive/10 text-destructive"], aprovado: ["aprovado pelo cliente", "bg-success/15"], fechado: ["fechado", "bg-muted text-muted-foreground"],
};
export function ImprevistosNaObra({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const L = imprevistosDe(d).filter((i) => i.estado !== "fechado");
  if (!L.length) return null;
  return <div className="space-y-3">{L.map((im) => <CartaoImprevisto key={im.id} ctx={ctx} d={d} im={im} />)}</div>;
}

function CartaoImprevisto({ ctx, d, im }: { ctx: Ctx; d: Negocio; im: Imprevisto }) {
  const { S, A, run, go } = ctx;
  const [propor, setPropor] = useState(false);
  const [nota, setNota] = useState("");
  const pode = S.role === "operacoes";
  const par = paradasPor(d.obra.plano, im.id), a = im.adenda ? d.adendas?.find((x) => x.n === im.adenda) : undefined;
  return (
    <article aria-label={`Imprevisto ${im.id}`} className={cn("rounded-xl border p-4", im.estado === "aberto" || im.estado === "recusado" ? "border-destructive/40 bg-destructive/[0.04]" : "border-border")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          {im.foto && <Miniaturas fotos={[im.foto]} tam="h-14 w-20" />}
          <div className="min-w-0">
            <p className="text-base font-semibold">{im.texto}</p>
            <p className="text-sm text-muted-foreground">{im.quem.split(" ")[0]} · {im.q}{im.onde ? ` · ${im.onde}` : ""} · {im.grav === "impede" ? (par.length ? `parad${par.length === 1 ? "a" : "as"}: ${par.map((t) => nomeCurtoTarefa(t.nome)).join(", ")}` : "impedia de continuar") : `atrasou ${im.atraso} ${im.atraso === 1 ? "dia" : "dias"}`}</p>
          </div>
        </div>
        <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-sm font-medium", ESTADO[im.estado][1])}>{ESTADO[im.estado][0]}</span>
      </div>

      {im.estado === "aberto" && !propor && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {pode ? <Button className="min-h-11" onClick={() => setPropor(true)}>Fazer a proposta ao cliente</Button> : <p className="text-sm text-muted-foreground">O gestor da obra faz a proposta ao cliente.</p>}
          {pode && <button type="button" onClick={go(() => A.decidirImprevisto(d.id, im.id, "seguir", "sem custo para o cliente"))} className="min-h-11 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Resolver sem custo para o cliente</button>}
        </div>
      )}
      {im.estado === "aberto" && propor && <PropostaImprevisto ctx={ctx} d={d} im={im} fechar={() => setPropor(false)} />}
      {im.estado === "proposta" && a && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[15px]">
          {/* 21/10: a adenda do imprevisto segue o percurso da proposta (verificação, aceitação, contrato da adenda, assinatura) */}
          {/* 27/10: o estado já está na pastilha do cartão; aqui só a adenda, o valor e os dias */}
          <span>Adenda {a.n} · {eur(totaisAdenda(a).total)} € · +{diasAdenda(a.linhas)} {diasAdenda(a.linhas) === 1 ? "dia" : "dias"}{a.estado === "rascunho" ? ` · ${estadoAdenda(a).t}` : ""}</span>
          <div className="w-full"><AcoesAdenda ctx={ctx} d={d} a={a} /></div>
        </div>
      )}
      {im.estado === "recusado" && (
        <div className="mt-3 space-y-3">
          <p className="text-[15px]">{a?.recusa ? <>O cliente: «{a.recusa}». </> : null}O que fazer?</p>
          {pode ? <>
            <input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Nota (opcional)" aria-label="Nota da decisão" className={ENTRADA} />
            <div className="grid gap-2 sm:grid-cols-3">
              {DECISOES.map((x) => (
                <button key={x.k} type="button" onClick={() => { run(() => A.decidirImprevisto(d.id, im.id, x.k, nota)); setNota(""); }} className="min-h-11 rounded-xl border border-input p-3 text-left hover:border-foreground/40">
                  <span className="block text-[15px] font-medium">{x.t}</span><span className="block text-sm text-muted-foreground">{x.sub}</span>
                </button>
              ))}
            </div>
          </> : <p className="text-sm text-muted-foreground">O gestor da obra decide.</p>}
        </div>
      )}
      {im.estado === "aprovado" && a && (
        <p className="mt-2 text-[15px] text-muted-foreground">Aprovado ({a.n}): o trabalho entrou no plano. Faturas: {faturasAdenda(a).length ? faturasAdenda(a).map((f) => `${nomeParcela(f.i)} ${f.n}, ${f.recibo ? `paga (${f.recibo.n})` : "por pagar"}`).join(" · ") : "por emitir (Financeiro)"}.</p>
      )}
      {im.decisao && im.estado !== "aprovado" && <p className="mt-2 text-sm text-muted-foreground">Decisão: {im.decisao}</p>}
    </article>
  );
}

/* ================================================================== a proposta: serviços do Catálogo e/ou uma linha livre */
function PropostaImprevisto({ ctx, d, im, fechar }: { ctx: Ctx; d: Negocio; im: Imprevisto; fechar: () => void }) {
  const { S, A, run } = ctx;
  const [itens, setItens] = useState<{ sid: string; q: number }[]>([]);
  // 21/10: o preço sugerido da linha livre tem a margem alvo (a adenda verifica-se como o orçamento antes de ir ao cliente)
  const [livre, setLivre] = useState<LinhaLivre | null>({ n: im.texto.replace(/^./, (c) => c.toUpperCase()), h: 4, preco: precoSugeridoLivre(S, 4), perfil: "Canalização", mats: [] });
  const opcoes = useMemo(() => {
    const vistos = new Set<string>(), out: { v: string; t: string; sub: string; valor: string }[] = [];
    for (const [sid, s] of Object.entries(S.svc)) { if (sid.startsWith("livre-")) continue; vistos.add(sid); out.push({ v: sid, t: s.n, sub: s.perfil, valor: `${eur(s.preco)} €/${s.un}` }); }
    for (const c of CATALOGO_TODO) if (!vistos.has(c.id)) { const s = servicoDoCatalogo(c.id, S); if (s) out.push({ v: c.id, t: c.n, sub: c.cat, valor: `${eur(s.preco)} €/${s.un}` }); }
    return out;
  }, [S.svc]);
  const linhas: LinhaAdenda[] = itens.flatMap((x) => { const l = previsaoLinha(S, x.sid, x.q); return l ? [l] : []; });
  const livres = livre && livre.n.trim() && livre.h > 0 ? [livre] : [];
  const todas: LinhaAdenda[] = [...linhas, ...livres.map((x): LinhaAdenda => ({ sid: "livre", n: x.n, un: "vg", q: 1, pu: x.preco, h: x.h, perfil: x.perfil, livre: true, mats: x.mats }))];
  // 21/10: o IVA por taxa: 6% na mão de obra, 23% nos materiais da linha livre
  const T = totaisLinhas(todas), dd = todas.length ? diasAdenda(todas) : 0;
  const mudar = (m: Partial<LinhaLivre>) => setLivre((L) => (L ? { ...L, ...m } : L));
  return (
    <div className="mt-4 space-y-5 border-t border-border pt-4 animate-in fade-in-0 slide-in-from-top-1">
      <p className="text-[15px]">O trabalho extra vai ao cliente como uma adenda ao contrato, com o percurso da proposta: a Olyvia verifica as margens, o cliente aceita (ou pede alterações, ou recusa) e assina o contrato da adenda no portal. Assinada, entra no plano e o Financeiro fatura-a nas parcelas do contrato.</p>
      <div>
        <p className="text-[15px] font-medium">Serviços do Catálogo</p>
        {linhas.length > 0 && (
          <ul className="mt-2 divide-y divide-border">
            {linhas.map((x) => (
              <li key={x.sid} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <span className="min-w-0 flex-1 text-[15px]">{x.n}<span className="block text-sm tabular-nums text-muted-foreground">{eur(x.pu)} €/{x.un}</span></span>
                <label className="flex items-center gap-1.5"><span className="sr-only">Quantidade de {x.n}</span>
                  <input type="number" inputMode="decimal" min={0} step="any" value={itens.find((y) => y.sid === x.sid)?.q || ""} onChange={(e) => setItens((I) => I.map((y) => (y.sid === x.sid ? { ...y, q: Math.max(0, Number(e.target.value.replace(",", ".")) || 0) } : y)))}
                    className="h-11 w-20 rounded-lg border border-input bg-background px-2 text-center tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                  <span className="text-sm text-muted-foreground">{x.un}</span></label>
                <button type="button" aria-label={`Tirar ${x.n}`} onClick={() => setItens((I) => I.filter((y) => y.sid !== x.sid))} className="grid h-11 w-11 place-items-center rounded-lg text-muted-foreground hover:bg-muted"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        )}
        <SeletorPesquisa rotulo="Juntar um serviço" placeholder="Serviço do Catálogo" max={12} opcoes={opcoes.filter((o) => !itens.some((x) => x.sid === o.v))}
          onEscolher={(v) => setItens((I) => [...I, { sid: v, q: 1 }])} className="mt-1"
          gatilho={<span className="inline-flex items-center gap-1.5 px-1 font-medium text-primary"><Plus className="h-4 w-4" aria-hidden="true" />Juntar um serviço</span>} />
      </div>
      <div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[15px] font-medium">Linha livre</p>
          {livre ? <button type="button" onClick={() => setLivre(null)} className="min-h-10 text-sm text-muted-foreground hover:text-foreground">Tirar</button>
            : <button type="button" onClick={() => setLivre({ n: im.texto, h: 4, preco: precoSugeridoLivre(S, 4), perfil: "Canalização", mats: [] })} className="min-h-10 text-sm font-medium text-primary">Juntar uma linha livre</button>}
        </div>
        {livre && (
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 sm:col-span-2"><span className="text-sm text-muted-foreground">O trabalho</span><input value={livre.n} onChange={(e) => mudar({ n: e.target.value })} className={ENTRADA} /></label>
            <label className="block space-y-1"><span className="text-sm text-muted-foreground">Horas (estimativa)</span><input type="number" inputMode="decimal" min={0.5} step={0.5} value={livre.h || ""} onChange={(e) => mudar({ h: Math.max(0, Number(e.target.value.replace(",", ".")) || 0) })} className={ENTRADA} /></label>
            <label className="block space-y-1"><span className="text-sm text-muted-foreground">Preço sem IVA (€)</span><input type="number" inputMode="decimal" min={0} step={1} value={livre.preco || ""} onChange={(e) => mudar({ preco: Math.max(0, Number(e.target.value.replace(",", ".")) || 0) })} className={ENTRADA} /></label>
            <div className="sm:col-span-2">
              <p className="text-sm text-muted-foreground">Ofício</p>
              <div className="mt-1.5 flex flex-wrap gap-2">{OFICIOS.map((o) => <button key={o} type="button" aria-pressed={livre.perfil === o} onClick={() => mudar({ perfil: o })} className={chip(livre.perfil === o)}>{o}</button>)}</div>
            </div>
            <div className="sm:col-span-2">
              <p className="mb-1.5 text-sm text-muted-foreground">Materiais</p>
              <EditorMateriais mats={livre.mats} mudar={(m: MatTarefa[]) => mudar({ mats: m })} />
            </div>
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/50 p-3 text-sm">
        <div><p className="text-muted-foreground">Sem IVA</p><p className="text-[15px] font-semibold tabular-nums">+{eur(T.base)} €</p></div>
        <div><p className="text-muted-foreground">Com IVA {T.mat > 0 ? "(6% e 23%)" : "(6%)"}</p><p className="text-[15px] font-semibold tabular-nums">+{eur(T.total)} €</p></div>
        <div><p className="text-muted-foreground">Prazo</p><p className="text-[15px] font-semibold tabular-nums">+{nfmt(dd)} {dd === 1 ? "dia" : "dias"}</p></div>
      </div>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" size="lg" onClick={fechar}>Cancelar</Button>
        <Button size="lg" disabled={!todas.length || todas.some((x) => !(x.q > 0))} onClick={() => { run(() => A.proporImprevisto(d.id, im.id, itens, livres)); fechar(); }}>Enviar ao cliente para aprovar</Button>
      </div>
    </div>
  );
}
