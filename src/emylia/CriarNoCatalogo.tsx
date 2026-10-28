// Criar no Catálogo (27/10/2026): o ecrã. Abre no lugar da lista (como a ficha do serviço), com o tipo escolhido em cartões
// (Serviço, Produto, Equipamento, Consumível, Técnico), o formulário à esquerda e a pré-visualização à direita, que mostra já
// o custo, o preço e a margem enquanto se escreve. As regras e as contas estão em criarCatalogo.ts.
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Check, Circle, Drill, Droplet, HardHat, Package, Plus, Search, Trash2, Wrench, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { eur, nfmt, pct, type Estado, type MedKey, type SvcId } from "./motor";
import { numero } from "./pecas";
import { CATALOGO_TODO, type LinhaCat } from "./catalogo";
import { EX0, caminho, oficios, opcoesArvore, type Catalogo } from "./v2/catalogoModelo";
import { lerCatalogo, mudarCatalogo } from "./v2/catalogoStore";
import { anoPerfil, aplicarTodos, horaPerfil, perfilDoServico, type Custos, type ModoPreco } from "./v2/custosModelo";
import { lerCustos, mudarCustos } from "./v2/custosStore";
import { ICONES_SERVICO, ILUSTRACOES, IconeServico, Ilustracao, ilustracaoDoProduto, type IconeServicoKey, type IlustracaoKey } from "./ilustracoes";
import { ORIGENS_MEDIDA, UNIDADES_SERVICO, iconeDoServico, quebraEquip } from "./fichaServico";
import {
  TIPOS_CRIAR, consumiveisComCriados, criarConsumivel, criarEquip, criarProdutoCompleto, criarServico, criarTecnico, faltasConsumivel,
  faltasEquip, faltasProduto, faltasServico, faltasTecnico, horaTecnicoNovo, oficioESub, precoVendaProduto, previsaoServico,
  type NovoServico, type TipoCriar,
} from "./criarCatalogo";

const NOTA = "text-[15px] text-muted-foreground";
const CAMPO = "h-11 w-full rounded-lg border border-input bg-card px-3 text-[15px] outline-none transition-shadow focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25";
const CARTAO = "rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-sm)] sm:p-5";
const CHIP = (on: boolean) => cn("inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3.5 text-[15px] transition-all", on ? "border-primary bg-primary/10 font-medium text-foreground" : "border-input bg-card text-muted-foreground hover:bg-muted hover:text-foreground");
const ICONE_TIPO: Record<TipoCriar, LucideIcon> = { servico: Wrench, produto: Package, equipamento: Drill, consumivel: Droplet, tecnico: HardHat };
const COR_TIPO: Record<TipoCriar, string> = {
  servico: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300", produto: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  equipamento: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300", consumivel: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  tecnico: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
};
const LINHAS: [LinhaCat, string][] = [["wc", "Casa de banho"], ["coz", "Cozinha"], ["geral", "Geral"]];
const UN_CONS = ["un", "kg", "l", "m", "m²", "rolo", "emb.", "saco"];
/** Número escrito à portuguesa (vírgula); vazio dá NaN. */
const n = (s: string) => (s.trim() ? numero(s) : NaN);
const n0 = (s: string) => { const x = n(s); return isNaN(x) ? 0 : x; };

/* ------------------------------------------------------------------ peças do formulário */
function Campo({ rot, dica, children, className }: { rot: string; dica?: string; children: (id: string) => ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={cn("grid content-start gap-1.5", className)}>
      <label htmlFor={id} className="text-[15px] font-medium">{rot}</label>
      {children(id)}
      {dica && <span className="text-sm text-muted-foreground">{dica}</span>}
    </div>
  );
}
function Num({ id, v, set, suf, rot, ph = "0" }: { id?: string; v: string; set: (s: string) => void; suf?: string; rot?: string; ph?: string }) {
  return (
    <span className="relative block">
      <input id={id} aria-label={rot} type="text" inputMode="decimal" value={v} placeholder={ph} onChange={(e) => set(e.target.value.replace(/[^\d,.-]/g, ""))}
        className={cn(CAMPO, "text-right tabular-nums", suf ? "pr-14" : "")} />
      {suf && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">{suf}</span>}
    </span>
  );
}
function Chips<T extends string | null>({ rot, opcoes, v, set }: { rot: string; opcoes: readonly (readonly [T, string])[]; v: T; set: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={rot} className="flex flex-wrap gap-2">
      {opcoes.map(([k, t]) => (
        <button key={String(k)} type="button" role="radio" aria-checked={v === k} onClick={() => set(k)} className={CHIP(v === k)}>
          {v === k && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}{t}
        </button>
      ))}
    </div>
  );
}
function Secao({ i, titulo, texto, children }: { i: number; titulo: string; texto?: string; children: ReactNode }) {
  return (
    <section aria-label={titulo} className={cn(CARTAO, "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:fill-mode-both motion-safe:duration-300")} style={{ animationDelay: `${i * 60}ms` }}>
      <h2 className="flex items-center gap-3 text-lg font-semibold">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary tabular-nums" aria-hidden="true">{i}</span>{titulo}
      </h2>
      {texto && <p className={cn(NOTA, "mt-1 pl-10")}>{texto}</p>}
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  );
}
/** Procurar e juntar: escreve-se, aparecem até 8 resultados, Enter ou toque junta. */
function Procurar({ rot, ph, opcoes, onEscolher }: { rot: string; ph: string; opcoes: { v: string; t: string; sub?: string }[]; onEscolher: (v: string) => void }) {
  const [q, setQ] = useState("");
  const [aberto, setAberto] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const lid = useId();
  const L = useMemo(() => {
    const qq = q.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    return (qq ? opcoes.filter((o) => `${o.t} ${o.sub ?? ""}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(qq)) : opcoes).slice(0, 8);
  }, [opcoes, q]);
  const escolher = (v: string) => { onEscolher(v); setQ(""); setAberto(false); setAtivo(0); };
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3.5 top-[22px] h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input type="search" role="combobox" aria-label={rot} aria-expanded={aberto && L.length > 0} aria-controls={lid} aria-autocomplete="list"
        aria-activedescendant={aberto && L[ativo] ? `${lid}-${ativo}` : undefined} value={q} placeholder={ph}
        onChange={(e) => { setQ(e.target.value); setAberto(true); setAtivo(0); }} onFocus={() => setAberto(true)} onBlur={() => window.setTimeout(() => setAberto(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setAberto(true); setAtivo((a) => Math.min(L.length - 1, a + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setAtivo((a) => Math.max(0, a - 1)); }
          else if (e.key === "Enter" && aberto && L[ativo]) { e.preventDefault(); escolher(L[ativo].v); }
          else if (e.key === "Escape") setAberto(false);
        }}
        className={cn(CAMPO, "pl-10")} />
      {aberto && L.length > 0 && (
        <ul id={lid} role="listbox" aria-label={rot} className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-xl border border-border bg-popover p-1 shadow-lg motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95">
          {L.map((o, i) => (
            <li key={o.v} id={`${lid}-${i}`} role="option" aria-selected={i === ativo} onMouseDown={(e) => { e.preventDefault(); escolher(o.v); }} onMouseEnter={() => setAtivo(i)}
              className={cn("flex cursor-pointer items-baseline justify-between gap-3 rounded-lg px-3 py-2.5 text-[15px]", i === ativo && "bg-muted")}>
              <span className="min-w-0 truncate">{o.t}</span>{o.sub && <span className="shrink-0 text-sm text-muted-foreground tabular-nums">{o.sub}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
const Retirar = ({ rot, onClick }: { rot: string; onClick: () => void }) => (
  <button type="button" aria-label={rot} onClick={onClick} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive">
    <Trash2 className="h-4 w-4" aria-hidden="true" />
  </button>
);

/* ------------------------------------------------------------------ pré-visualização */
/** O que falta, como uma lista que se vai riscando; e o botão de criar. */
function Pronto({ itens, faltas, botao, onCriar }: { itens: string[]; faltas: string[]; botao: string; onCriar: () => void }) {
  const ok = !faltas.length;
  return (
    <div className="mt-5 border-t border-border pt-4">
      {!ok && (
        <ul aria-label="O que falta" className="grid gap-1.5">
          {itens.map((t) => {
            const falta = faltas.find((f) => f.startsWith(t) || f.includes(t));
            return (
              <li key={t} className={cn("flex items-start gap-2 text-[15px] transition-colors", falta ? "text-foreground" : "text-muted-foreground line-through decoration-muted-foreground/40")}>
                {falta ? <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /> : <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />}
                {falta ?? t}
              </li>
            );
          })}
          {faltas.filter((f) => !itens.some((t) => f.startsWith(t) || f.includes(t))).map((f) => (
            <li key={f} className="flex items-start gap-2 text-[15px]"><Circle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />{f}</li>
          ))}
        </ul>
      )}
      <Button className="mt-4 h-12 w-full text-base" disabled={!ok} onClick={onCriar}><Plus className="mr-1 h-5 w-5" aria-hidden="true" />{botao}</Button>
      {ok && <p className={cn(NOTA, "mt-2 text-center")}>Tudo pronto.</p>}
    </div>
  );
}
function BarraMargem({ m, min, alvo }: { m: number; min: number; alvo: number }) {
  const esc = Math.max(alvo * 1.5, 60) / 100, w = Math.max(0, Math.min(1, m / esc));
  const cor = m < min / 100 - 0.005 ? "bg-destructive" : m < alvo / 100 - 0.005 ? "bg-warning" : "bg-success";
  return (
    <div className="relative mt-2 h-2.5 rounded-full bg-muted" aria-hidden="true">
      <span className={cn("absolute inset-y-0 left-0 rounded-full transition-all duration-500", cor)} style={{ width: `${w * 100}%` }} />
      <span className="absolute -top-1 w-0.5 rounded bg-foreground/40" style={{ left: `${(min / 100 / esc) * 100}%`, height: 18 }} title={`Mínimo ${min}%`} />
      <span className="absolute -top-1 w-0.5 rounded bg-foreground/70" style={{ left: `${(alvo / 100 / esc) * 100}%`, height: 18 }} title={`Alvo ${alvo}%`} />
    </div>
  );
}
function Partes({ partes }: { partes: { n: string; v: number; cor: string }[] }) {
  const tot = partes.reduce((a, p) => a + p.v, 0);
  return (
    <div className="mt-4">
      <div className="flex h-3 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        {tot > 0 && partes.map((p) => <span key={p.n} className={cn("h-full transition-all duration-500", p.cor)} style={{ width: `${(p.v / tot) * 100}%` }} />)}
      </div>
      <ul className="mt-3 grid gap-1">
        {partes.map((p) => (
          <li key={p.n} className="flex items-center justify-between gap-3 text-[15px]">
            <span className="flex items-center gap-2"><span className={cn("h-2.5 w-2.5 rounded-full", p.cor)} aria-hidden="true" />{p.n}</span>
            <span className="tabular-nums text-muted-foreground">{eur(p.v)} €</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
const Previa = ({ children }: { children: ReactNode }) => (
  <aside aria-label="Pré-visualização" className="lg:sticky lg:top-6">
    <p className="mb-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">Como vai ficar</p>
    <div className={cn(CARTAO, "ring-1 ring-primary/10")}>{children}</div>
  </aside>
);
const Grande = ({ v, un, legenda }: { v: string; un: string; legenda?: string }) => (
  <div className="mt-4">
    <p className="text-3xl font-semibold tracking-tight tabular-nums">{v}<span className="ml-1 text-lg font-normal text-muted-foreground">{un}</span></p>
    {legenda && <p className={NOTA}>{legenda}</p>}
  </div>
);

/* ------------------------------------------------------------------ serviço */
interface PassoF { n: string; perfil: string; h: string; auto: boolean }
interface ConsF { n: string; un: string; preco: number; fornecedor: string; data: string; q: string; opcional: boolean }
function FormServico({ S, C, K, onCriado }: { S: Estado; C: Custos; K: Catalogo; onCriado: (id: string, nome: string) => void }) {
  const ofs = useMemo(() => oficios(K.arvore), [K.arvore]);
  const [nome, setNome] = useState("");
  const [of, setOf] = useState(ofs[0]?.id ?? "");
  const [sub, setSub] = useState("");
  const subs = K.arvore.filter((x) => x.pai === of);
  const no = sub || of;
  const oficio = oficioESub(K, no)?.oficio ?? "";
  const [un, setUn] = useState("un");
  const [medida, setMedida] = useState<MedKey | null>(null);
  const [medidaTocada, setMedidaTocada] = useState(false);
  const [linhas, setLinhas] = useState<LinhaCat[]>(["geral"]);
  const [mo, setMo] = useState<PassoF[]>([{ n: "Execução", perfil: perfilDoServico(C, ofs[0]?.n ?? ""), h: "1", auto: true }]);
  const [eq, setEq] = useState<{ equip: string; h: string }[]>([]);
  const [cons, setCons] = useState<ConsF[]>([]);
  const [modo, setModo] = useState<ModoPreco>("margem");
  const [margem, setMargem] = useState(S.cfg.alvo);
  const [tabela, setTabela] = useState("");
  const [icone, setIcone] = useState<IconeServicoKey | null>(null);
  const [verIcones, setVerIcones] = useState(false);

  // o técnico dos passos acompanha o ofício enquanto não for escolhido à mão
  useEffect(() => { const p = perfilDoServico(C, oficio); setMo((L) => L.map((x) => (x.auto ? { ...x, perfil: p || x.perfil } : x))); }, [oficio]); // eslint-disable-line react-hooks/exhaustive-deps
  // a medida acompanha a unidade enquanto não for escolhida à mão (m² → pavimento, pt → pontos, pç/mód → vasos)
  useEffect(() => { if (!medidaTocada) setMedida(un === "m²" ? "pav" : un === "pt" ? "pts" : un === "pç" || un === "mód" ? "pcs" : null); }, [un, medidaTocada]);

  const consTodos = useMemo(() => consumiveisComCriados(S, C, K), [S, C, K]);
  const o: NovoServico = {
    n: nome, no, un, medida, linhas,
    mo: mo.map((p) => ({ n: p.n, perfil: p.perfil, h: n0(p.h) })), equip: eq.map((e) => ({ equip: e.equip, h: n0(e.h) })),
    cons: cons.map((c) => ({ n: c.n, q: n0(c.q), un: c.un, preco: c.preco, fornecedor: c.fornecedor, data: c.data, opcional: c.opcional })),
    modo, precoTabela: n0(tabela), margem, ...(icone ? { icone } : {}),
  };
  const pv = previsaoServico(o, C, S.cfg.estrutura);
  const faltas = faltasServico(K, o);
  const iconeV = icone ?? iconeDoServico(K, "", nome, oficio);
  const qEx = medida ? EX0[medida] || 0 : 2;
  const exemplo = medida ? `${nfmt(qEx)} ${ORIGENS_MEDIDA.find((x) => x.k === medida)!.t.replace(/^Pontos/, "pontos").replace(/^Vasos/, "vasos")}` : `${nfmt(qEx)} ${un}`;

  const criar = () => {
    const r = criarServico(lerCatalogo(), lerCustos(), o);
    if (!r.ok) return;
    mudarCustos(() => r.C);
    mudarCatalogo(() => r.K);
    onCriado(r.id, nome.trim());
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid min-w-0 content-start gap-5">
        <Secao i={1} titulo="O que é">
          <Campo rot="Nome do serviço">{(id) => <input id={id} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Instalação de base de duche extraplana" className={CAMPO} autoFocus />}</Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rot="Ofício">{(id) => (
              <select id={id} value={of} onChange={(e) => { setOf(e.target.value); setSub(""); }} className={CAMPO}>
                {ofs.map((x) => <option key={x.id} value={x.id}>{x.n}</option>)}
              </select>
            )}</Campo>
            <Campo rot="Subcategoria" dica={subs.length ? undefined : "Este ofício não tem subcategorias."}>{(id) => (
              <select id={id} value={sub} onChange={(e) => setSub(e.target.value)} disabled={!subs.length} className={cn(CAMPO, "disabled:opacity-50")}>
                <option value="">Sem subcategoria</option>
                {subs.map((x) => <option key={x.id} value={x.id}>{x.n}</option>)}
              </select>
            )}</Campo>
          </div>
          <div className="grid gap-1.5">
            <span className="text-[15px] font-medium">Ícone</span>
            <div className="flex flex-wrap items-center gap-2">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><IconeServico k={iconeV} /></span>
              <button type="button" aria-expanded={verIcones} onClick={() => setVerIcones((v) => !v)} className="inline-flex min-h-11 items-center text-[15px] font-medium text-primary underline-offset-4 hover:underline">
                {verIcones ? "Fechar" : icone ? "Trocar o ícone" : "Escolhido pelo nome. Trocar"}
              </button>
            </div>
            {verIcones && (
              <div role="radiogroup" aria-label="Ícone do serviço" className="mt-1 grid grid-cols-6 gap-1.5 sm:grid-cols-9 motion-safe:animate-in motion-safe:fade-in-0">
                {ICONES_SERVICO.map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={iconeV === k} aria-label={k} onClick={() => { setIcone(k); setVerIcones(false); }}
                    className={cn("grid h-11 place-items-center rounded-lg border transition-all hover:scale-105", iconeV === k ? "border-primary bg-primary/10 text-primary" : "border-transparent text-foreground/70 hover:bg-muted")}>
                    <IconeServico k={k} />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid gap-1.5"><span className="text-[15px] font-medium">Onde aparece</span>
            <div role="group" aria-label="Onde aparece" className="flex flex-wrap gap-2">
              {LINHAS.map(([k, t]) => {
                const on = linhas.includes(k);
                return <button key={k} type="button" aria-pressed={on} onClick={() => setLinhas((L) => (on ? L.filter((x) => x !== k) : [...L, k]))} className={CHIP(on)}>{on && <Check className="h-4 w-4 text-primary" aria-hidden="true" />}{t}</button>;
              })}
            </div>
          </div>
        </Secao>

        <Secao i={2} titulo="Medida" texto="A unidade em que se vende e de onde vem a quantidade na visita.">
          <div className="grid gap-1.5"><span className="text-[15px] font-medium">Unidade</span><Chips rot="Unidade" opcoes={UNIDADES_SERVICO.map((u) => [u, u] as const)} v={un} set={setUn} /></div>
          <div className="grid gap-1.5"><span className="text-[15px] font-medium">A quantidade vem de</span>
            <Chips rot="A quantidade vem de" opcoes={ORIGENS_MEDIDA.map((x) => [x.k, x.t] as const)} v={medida} set={(v) => { setMedida(v); setMedidaTocada(true); }} />
          </div>
        </Secao>

        <Secao i={3} titulo="Quem faz" texto={`Os passos de mão de obra por ${un}. O €/h é o do técnico (a média dos técnicos do RH).`}>
          <ul className="grid gap-3">
            {mo.map((p, i) => {
              const eh = horaPerfil(C, p.perfil).eh;
              return (
                <li key={i} className="grid gap-2 rounded-xl bg-muted/50 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem_auto] sm:items-end motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1">
                  <Campo rot="Passo">{(id) => <input id={id} value={p.n} onChange={(e) => setMo((L) => L.map((x, j) => (j === i ? { ...x, n: e.target.value } : x)))} className={CAMPO} />}</Campo>
                  <Campo rot="Técnico">{(id) => (
                    <select id={id} value={p.perfil} onChange={(e) => setMo((L) => L.map((x, j) => (j === i ? { ...x, perfil: e.target.value, auto: false } : x)))} className={CAMPO}>
                      <option value="">Escolher…</option>
                      {C.perfis.map((x) => <option key={x.id} value={x.id}>{x.n}</option>)}
                    </select>
                  )}</Campo>
                  <Campo rot="Horas">{(id) => <Num id={id} v={p.h} set={(v) => setMo((L) => L.map((x, j) => (j === i ? { ...x, h: v } : x)))} suf="h" />}</Campo>
                  <Retirar rot={`Retirar o passo ${p.n || i + 1}`} onClick={() => setMo((L) => L.filter((_, j) => j !== i))} />
                  <p className="text-sm text-muted-foreground tabular-nums sm:col-span-4">{eh == null ? "Este técnico não tem €/h: a mão de obra conta 0 €." : `${nfmt(n0(p.h))} h × ${eur(eh)} €/h = ${eur(n0(p.h) * eh)} €`}</p>
                </li>
              );
            })}
          </ul>
          <Button variant="outline" className="min-h-11 justify-self-start text-[15px]" onClick={() => setMo((L) => [...L, { n: "", perfil: perfilDoServico(C, oficio), h: "", auto: true }])}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />Juntar um passo
          </Button>
        </Secao>

        <Secao i={4} titulo="Equipamentos e consumíveis" texto={`O que se gasta por ${un}. Os opcionais não entram no custo.`}>
          <div className="grid gap-2">
            <span className="text-[15px] font-medium">Equipamentos</span>
            <Procurar rot="Juntar equipamento" ph="Procurar equipamento" opcoes={C.equip.filter((e) => !eq.some((x) => x.equip === e.id)).map((e) => ({ v: e.id, t: e.n, sub: `${eur(quebraEquip(e).total)} €/h` }))}
              onEscolher={(v) => setEq((L) => [...L, { equip: v, h: "0,5" }])} />
            {eq.length > 0 && (
              <ul className="grid gap-2">
                {eq.map((x, i) => {
                  const e = C.equip.find((y) => y.id === x.equip), eh = e ? quebraEquip(e).total : 0;
                  return (
                    <li key={x.equip} className="flex flex-wrap items-center gap-3 rounded-xl bg-muted/50 p-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1">
                      <span className="min-w-0 flex-1"><span className="block text-[15px] font-medium">{e?.n ?? x.equip}</span><span className="block text-sm text-muted-foreground tabular-nums">{eur(eh)} €/h · {eur(n0(x.h) * eh)} € por {un}</span></span>
                      <span className="w-28"><Num rot={`Horas de ${e?.n}`} v={x.h} set={(v) => setEq((L) => L.map((y, j) => (j === i ? { ...y, h: v } : y)))} suf="h" /></span>
                      <Retirar rot={`Retirar ${e?.n}`} onClick={() => setEq((L) => L.filter((_, j) => j !== i))} />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="grid gap-2">
            <span className="text-[15px] font-medium">Consumíveis</span>
            <Procurar rot="Juntar consumível" ph="Procurar consumível" opcoes={consTodos.filter((c) => !cons.some((x) => x.n === c.n)).map((c) => ({ v: c.n, t: c.n, sub: `${eur(c.preco)} €/${c.un}` }))}
              onEscolher={(v) => { const c = consTodos.find((x) => x.n === v); if (c) setCons((L) => [...L, { n: c.n, un: c.un, preco: c.preco, fornecedor: c.fornecedor, data: c.data, q: "1", opcional: false }]); }} />
            {cons.length > 0 && (
              <ul className="grid gap-2">
                {cons.map((c, i) => (
                  <li key={c.n} className="flex flex-wrap items-center gap-3 rounded-xl bg-muted/50 p-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1">
                    <span className="min-w-0 flex-1"><span className="block text-[15px] font-medium">{c.n}</span><span className="block text-sm text-muted-foreground tabular-nums">{eur(c.preco)} €/{c.un} · {eur(n0(c.q) * c.preco)} € por {un}</span></span>
                    <button type="button" role="switch" aria-checked={c.opcional} aria-label={`Opcional: ${c.n}`} onClick={() => setCons((L) => L.map((y, j) => (j === i ? { ...y, opcional: !y.opcional } : y)))}
                      className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
                      <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", c.opcional ? "bg-primary" : "bg-input")}><span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", c.opcional ? "left-[22px]" : "left-0.5")} /></span>Opcional
                    </button>
                    <span className="w-28"><Num rot={`Quantidade de ${c.n}`} v={c.q} set={(v) => setCons((L) => L.map((y, j) => (j === i ? { ...y, q: v } : y)))} suf={c.un} /></span>
                    <Retirar rot={`Retirar ${c.n}`} onClick={() => setCons((L) => L.filter((_, j) => j !== i))} />
                  </li>
                ))}
              </ul>
            )}
            <p className="text-sm text-muted-foreground">Falta um consumível? Crie-o primeiro no separador Consumível, lá em cima.</p>
          </div>
        </Secao>

        <Secao i={5} titulo="Preço">
          <Chips<ModoPreco> rot="Como se faz o preço" opcoes={[["margem", "Custo + margem"], ["tabela", "Preço de tabela"]] as const} v={modo} set={setModo} />
          {modo === "margem" ? (
            <div className="grid gap-2">
              <label className="flex items-baseline justify-between text-[15px] font-medium" htmlFor="criar-margem">Margem sobre o preço <span className="tabular-nums text-primary">{margem}%</span></label>
              <input id="criar-margem" type="range" min={0} max={80} step={1} value={margem} onChange={(e) => setMargem(Number(e.target.value))} className="h-11 w-full accent-[hsl(var(--primary))]" />
              <span className="text-sm text-muted-foreground">Mínimo {S.cfg.min}% · alvo {S.cfg.alvo}% (Definições)</span>
            </div>
          ) : (
            <Campo rot={`Preço de tabela por ${un} (sem IVA)`}>{(id) => <Num id={id} v={tabela} set={setTabela} suf={`€/${un}`} />}</Campo>
          )}
        </Secao>
      </div>

      <Previa>
        <div className="flex items-start gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary transition-transform motion-safe:animate-in motion-safe:zoom-in-90" key={iconeV}><IconeServico k={iconeV} /></span>
          <span className="min-w-0">
            <span className={cn("block text-base font-semibold", !nome.trim() && "text-muted-foreground")}>{nome.trim() || "Serviço novo"}</span>
            <span className={cn(NOTA, "block")}>{caminho(K.arvore, no)} · por {un}</span>
          </span>
        </div>
        <Grande v={eur(pv.preco)} un={`€/${un}`} legenda={`custo ${eur(pv.c.total)} € · margem ${pct(pv.m)}`} />
        <BarraMargem m={pv.m} min={S.cfg.min} alvo={S.cfg.alvo} />
        <Partes partes={[
          { n: "Mão de obra", v: pv.c.mo, cor: "bg-sky-500" }, { n: "Equipamentos", v: pv.c.eq, cor: "bg-violet-500" }, { n: "Consumíveis", v: pv.c.cons, cor: "bg-emerald-500" },
          ...(S.cfg.estrutura ? [{ n: "Estrutura", v: pv.c.estr, cor: "bg-slate-400" }] : []),
        ]} />
        <p className={cn(NOTA, "mt-4 rounded-xl bg-muted/60 p-3")} data-testid="exemplo-criar">Num exemplo com {exemplo}: <span className="font-medium text-foreground tabular-nums">{eur(pv.preco * qEx)} €</span> ao cliente, {nfmt(qEx * pv.c.h)} h de trabalho.</p>
        <Pronto itens={["Escreva o nome", "Escolha o ofício", "Ponha pelo menos um passo", "Escreva o preço"]} faltas={faltas} botao="Criar o serviço" onCriar={criar} />
      </Previa>
    </div>
  );
}

/* ------------------------------------------------------------------ produto */
function FormProduto({ S, K, onCriado }: { S: Estado; K: Catalogo; onCriado: (id: string, nome: string) => void }) {
  const [nome, setNome] = useState(""), [marca, setMarca] = useState(""), [sku, setSku] = useState(""), [forn, setForn] = useState("");
  const [un, setUn] = useState("un"), [custo, setCusto] = useState(""), [pvp, setPvp] = useState(""), [no, setNo] = useState(""), [desc, setDesc] = useState("");
  const [servico, setServico] = useState<SvcId | null>(null);
  const [img, setImg] = useState<IlustracaoKey | null>(null);
  const [verImg, setVerImg] = useState(false);
  const servicos = useMemo(() => {
    const m = new Map<string, { v: string; t: string; sub: string }>();
    for (const [sid, s] of Object.entries(S.svc)) m.set(sid, { v: sid, t: s.n, sub: s.perfil });
    for (const c of CATALOGO_TODO) if (!m.has(c.id)) m.set(c.id, { v: c.id, t: c.n, sub: c.cat });
    return [...m.values()];
  }, [S.svc, K]); // eslint-disable-line react-hooks/exhaustive-deps
  const nomeSvc = servico ? servicos.find((x) => x.v === servico)?.t ?? servico : null;
  const o = { n: nome, custo: n(custo), un, marca, fornecedor: forn, no: no || null, sku, pvp: pvp.trim() ? n(pvp) : null, desc, servico, ...(img ? { img } : {}) };
  const faltas = faltasProduto(K, o);
  const venda = precoVendaProduto(n0(custo), o.pvp, S.cfg.alvo), m = venda > 0 ? (venda - n0(custo)) / venda : 0;
  const imgV = img ?? ilustracaoDoProduto({ n: nome }, no ? caminho(K.arvore, no) : null);
  const unidades = [...new Set(["un", "m²", "ml", "conj.", "cx", ...K.unidades])].slice(0, 10);
  const criar = () => {
    const r = criarProdutoCompleto(lerCatalogo(), o);
    if (!r.ok) return;
    mudarCatalogo(() => r.K);
    onCriado(r.id, nome.trim());
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid min-w-0 content-start gap-5">
        <Secao i={1} titulo="O produto">
          <Campo rot="Nome do produto">{(id) => <input id={id} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Sanita suspensa Rimless" className={CAMPO} autoFocus />}</Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rot="Marca">{(id) => <><input id={id} list="criar-marcas" value={marca} onChange={(e) => setMarca(e.target.value)} className={CAMPO} /><datalist id="criar-marcas">{K.marcas.map((x) => <option key={x} value={x} />)}</datalist></>}</Campo>
            <Campo rot="Referência" dica="A do fornecedor, se houver.">{(id) => <input id={id} value={sku} onChange={(e) => setSku(e.target.value)} className={CAMPO} />}</Campo>
          </div>
          <Campo rot="Onde fica">{(id) => (
            <select id={id} value={no} onChange={(e) => setNo(e.target.value)} className={CAMPO}>
              <option value="">Sem classificação</option>
              {opcoesArvore(K.arvore).map((x) => <option key={x.v} value={x.v}>{x.t}</option>)}
            </select>
          )}</Campo>
          <Campo rot="Descrição" dica="Uma linha, para o comercial e a proposta.">{(id) => <input id={id} value={desc} onChange={(e) => setDesc(e.target.value)} className={CAMPO} />}</Campo>
          <div className="grid gap-1.5">
            <span className="text-[15px] font-medium">Imagem</span>
            <button type="button" aria-expanded={verImg} onClick={() => setVerImg((v) => !v)} className="inline-flex min-h-11 items-center justify-self-start text-[15px] font-medium text-primary underline-offset-4 hover:underline">
              {verImg ? "Fechar" : img ? "Trocar a imagem" : "Escolhida pelo nome. Trocar"}
            </button>
            {verImg && (
              <div role="radiogroup" aria-label="Imagem do produto" className="grid grid-cols-4 gap-1.5 sm:grid-cols-8 motion-safe:animate-in motion-safe:fade-in-0">
                {ILUSTRACOES.map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={imgV === k} aria-label={k} onClick={() => { setImg(k); setVerImg(false); }}
                    className={cn("grid place-items-center rounded-lg border p-1 transition-all hover:scale-105", imgV === k ? "border-primary bg-primary/10" : "border-transparent hover:bg-muted")}>
                    <Ilustracao k={k} className="h-12 w-12" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </Secao>
        <Secao i={2} titulo="Compra e venda">
          <div className="grid gap-1.5"><span className="text-[15px] font-medium">Unidade</span><Chips rot="Unidade do produto" opcoes={unidades.map((u) => [u, u] as const)} v={un} set={setUn} /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rot="Custo de compra">{(id) => <Num id={id} v={custo} set={setCusto} suf={`€/${un}`} />}</Campo>
            <Campo rot="PVP (opcional)" dica={`Sem PVP, vende-se ao custo com a margem-alvo de ${S.cfg.alvo}%.`}>{(id) => <Num id={id} v={pvp} set={setPvp} suf={`€/${un}`} ph="" />}</Campo>
          </div>
          <Campo rot="Fornecedor">{(id) => <><input id={id} list="criar-forn" value={forn} onChange={(e) => setForn(e.target.value)} className={CAMPO} /><datalist id="criar-forn">{K.fornecedores.map((x) => <option key={x} value={x} />)}</datalist></>}</Campo>
        </Secao>
        <Secao i={3} titulo="O serviço que traz" texto="Escolhido na visita, o produto junta este serviço ao orçamento (ex.: a sanita traz a instalação). Sem serviço, só se vende.">
          {servico ? (
            <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-3">
              <Wrench className="h-4 w-4 text-primary" aria-hidden="true" /><span className="min-w-0 flex-1 text-[15px] font-medium">{nomeSvc}</span>
              <Retirar rot="Tirar o serviço" onClick={() => setServico(null)} />
            </div>
          ) : (
            <Procurar rot="Serviço que traz" ph="Procurar serviço" opcoes={servicos} onEscolher={(v) => setServico(v)} />
          )}
        </Secao>
      </div>
      <Previa>
        <div className="flex items-center gap-3">
          <span key={imgV} className="motion-safe:animate-in motion-safe:zoom-in-90"><Ilustracao k={imgV} /></span>
          <span className="min-w-0">
            <span className={cn("block text-base font-semibold", !nome.trim() && "text-muted-foreground")}>{nome.trim() || "Produto novo"}</span>
            <span className={cn(NOTA, "block")}>{[marca.trim(), sku.trim() ? `ref. ${sku.trim()}` : "", caminho(K.arvore, no || null)].filter(Boolean).join(" · ")}</span>
          </span>
        </div>
        {desc.trim() && <p className={cn(NOTA, "mt-2")}>{desc.trim()}</p>}
        <Grande v={eur(venda)} un={`€/${un}`} legenda={`${o.pvp != null && o.pvp > 0 ? "PVP" : `custo + ${S.cfg.alvo}%`} · custo ${eur(n0(custo))} € · margem ${pct(m)}`} />
        <BarraMargem m={m} min={S.cfg.min} alvo={S.cfg.alvo} />
        {nomeSvc && <p className="mt-4 flex items-center gap-2 text-[15px] font-medium text-primary"><Wrench className="h-4 w-4" aria-hidden="true" />Traz: {nomeSvc}</p>}
        <Pronto itens={["Escreva o nome", "Escreva o custo"]} faltas={faltas} botao="Criar o produto" onCriar={criar} />
      </Previa>
    </div>
  );
}

/* ------------------------------------------------------------------ equipamento */
function FormEquip({ C, onCriado }: { C: Custos; onCriado: (id: string, nome: string) => void }) {
  const [nome, setNome] = useState(""), [compra, setCompra] = useState(""), [residual, setResidual] = useState("0"), [vida, setVida] = useState("1000"), [manut, setManut] = useState("0"), [uso, setUso] = useState("600");
  const o = { n: nome, compra: n(compra), residual: n0(residual), vida: n(vida), manutAno: n0(manut), usoAno: n0(uso) };
  const faltas = faltasEquip(C, o);
  const q = quebraEquip({ id: "", ...o, compra: n0(compra), vida: n0(vida) });
  const criar = () => { const r = criarEquip(lerCustos(), o); if (!r.ok) return; mudarCustos(() => r.C); onCriado(r.id, nome.trim()); };
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid min-w-0 content-start gap-5">
        <Secao i={1} titulo="O equipamento">
          <Campo rot="Nome do equipamento">{(id) => <input id={id} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Serra de esquadria 254 mm" className={CAMPO} autoFocus />}</Campo>
        </Secao>
        <Secao i={2} titulo="Compra e uso" texto="O €/h: (compra − valor residual) ÷ vida útil + manutenção do ano ÷ horas de uso do ano.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rot="Preço de compra">{(id) => <Num id={id} v={compra} set={setCompra} suf="€" />}</Campo>
            <Campo rot="Valor residual" dica="O que vale no fim da vida útil.">{(id) => <Num id={id} v={residual} set={setResidual} suf="€" />}</Campo>
            <Campo rot="Vida útil">{(id) => <Num id={id} v={vida} set={setVida} suf="h" />}</Campo>
            <Campo rot="Manutenção">{(id) => <Num id={id} v={manut} set={setManut} suf="€/ano" />}</Campo>
            <Campo rot="Uso" dica="Horas por ano.">{(id) => <Num id={id} v={uso} set={setUso} suf="h/ano" />}</Campo>
          </div>
        </Secao>
      </div>
      <Previa>
        <div className="flex items-center gap-3">
          <span className={cn("grid h-12 w-12 place-items-center rounded-xl", COR_TIPO.equipamento)}><Drill className="h-5 w-5" aria-hidden="true" /></span>
          <span className={cn("text-base font-semibold", !nome.trim() && "text-muted-foreground")}>{nome.trim() || "Equipamento novo"}</span>
        </div>
        <Grande v={eur(q.total)} un="€/h" legenda="o que entra no custo por cada hora de uso" />
        <Partes partes={[{ n: "Depreciação", v: q.deprec, cor: "bg-violet-500" }, { n: "Manutenção", v: q.manut, cor: "bg-amber-500" }]} />
        <p className={cn(NOTA, "mt-4 rounded-xl bg-muted/60 p-3 tabular-nums")}>{q.texto}</p>
        <Pronto itens={["Escreva o nome", "Escreva o preço de compra", "A vida útil"]} faltas={faltas} botao="Criar o equipamento" onCriar={criar} />
      </Previa>
    </div>
  );
}

/* ------------------------------------------------------------------ consumível */
function FormConsumivel({ S, C, K, onCriado }: { S: Estado; C: Custos; K: Catalogo; onCriado: (id: string, nome: string) => void }) {
  const [nome, setNome] = useState(""), [un, setUn] = useState("un"), [preco, setPreco] = useState(""), [forn, setForn] = useState(""), [opcional, setOpcional] = useState(false);
  const existentes = useMemo(() => consumiveisComCriados(S, C, K), [S, C, K]);
  const o = { n: nome, un, preco: n(preco), fornecedor: forn, opcional };
  const faltas = faltasConsumivel(existentes, o);
  const criar = () => { const r = criarConsumivel(lerCatalogo(), existentes, o); if (!r.ok) return; mudarCatalogo(() => r.K); onCriado(r.id, nome.trim()); };
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid min-w-0 content-start gap-5">
        <Secao i={1} titulo="O consumível">
          <Campo rot="Nome do consumível">{(id) => <input id={id} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Silicone sanitário transparente" className={CAMPO} autoFocus />}</Campo>
          <div className="grid gap-1.5"><span className="text-[15px] font-medium">Unidade</span><Chips rot="Unidade do consumível" opcoes={UN_CONS.map((u) => [u, u] as const)} v={un} set={setUn} /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rot="Preço">{(id) => <Num id={id} v={preco} set={setPreco} suf={`€/${un}`} />}</Campo>
            <Campo rot="Fornecedor">{(id) => <><input id={id} list="criar-forn-c" value={forn} onChange={(e) => setForn(e.target.value)} className={CAMPO} /><datalist id="criar-forn-c">{K.fornecedores.map((x) => <option key={x} value={x} />)}</datalist></>}</Campo>
          </div>
          <button type="button" role="switch" aria-checked={opcional} onClick={() => setOpcional((v) => !v)} className="flex w-full items-center justify-between gap-4 text-left">
            <span><span className="block text-[15px] font-medium">Opcional por omissão</span><span className="block text-sm text-muted-foreground">Ao juntá-lo a um serviço, não entra no custo até alguém o ligar.</span></span>
            <span className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors", opcional ? "bg-primary" : "bg-input")}><span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", opcional ? "left-[22px]" : "left-0.5")} /></span>
          </button>
        </Secao>
      </div>
      <Previa>
        <div className="flex items-center gap-3">
          <span className={cn("grid h-12 w-12 place-items-center rounded-xl", COR_TIPO.consumivel)}><Droplet className="h-5 w-5" aria-hidden="true" /></span>
          <span className="min-w-0"><span className={cn("block text-base font-semibold", !nome.trim() && "text-muted-foreground")}>{nome.trim() || "Consumível novo"}</span>
            <span className={cn(NOTA, "block")}>{forn.trim() || "Fornecedor por escolher"}{opcional ? " · opcional" : ""}</span></span>
        </div>
        <Grande v={eur(n0(preco))} un={`€/${un}`} legenda="preço de hoje: fica desatualizado ao fim de uns meses" />
        <p className={cn(NOTA, "mt-4 rounded-xl bg-muted/60 p-3")}>Depois junta-se aos serviços na receita (aqui no Criar ou na ficha do serviço).</p>
        <Pronto itens={["Escreva o nome", "Escreva o preço"]} faltas={faltas} botao="Criar o consumível" onCriar={criar} />
      </Previa>
    </div>
  );
}

/* ------------------------------------------------------------------ técnico */
function FormTecnico({ S, C, onCriado }: { S: Estado; C: Custos; onCriado: (id: string, nome: string) => void }) {
  const direcao = S.role === "direcao";
  const [nome, setNome] = useState(""), [salario, setSalario] = useState("");
  const o = { n: nome, salario: direcao && salario.trim() ? n(salario) : null };
  const faltas = faltasTecnico(C, o);
  const eh = horaTecnicoNovo(C, o), ano = anoPerfil({ id: "", n: nome, salario: o.salario ?? 0 }, C.par);
  const criar = () => { const r = criarTecnico(lerCustos(), o); if (!r.ok) return; mudarCustos(() => r.C); onCriado(r.id, nome.trim()); };
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid min-w-0 content-start gap-5">
        <Secao i={1} titulo="O tipo de técnico" texto="Um ofício para os passos das receitas (ex.: Estucador). As pessoas ligam-se a ele em Recursos Humanos (exemplo) › Pessoas › ficha › Detalhes laborais › Ofícios de obra.">
          <Campo rot="Nome">{(id) => <input id={id} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Estucador" className={CAMPO} autoFocus />}</Campo>
          {direcao
            ? <Campo rot="Salário base (opcional)" dica="Só conta enquanto não houver técnicos do RH com este perfil.">{(id) => <Num id={id} v={salario} set={setSalario} suf="€/mês" ph="" />}</Campo>
            : <p className={NOTA}>O salário só a Direção o põe. Sem salário e sem técnicos no RH, a mão de obra deste perfil conta 0 €.</p>}
        </Secao>
      </div>
      <Previa>
        <div className="flex items-center gap-3">
          <span className={cn("grid h-12 w-12 place-items-center rounded-xl", COR_TIPO.tecnico)}><HardHat className="h-5 w-5" aria-hidden="true" /></span>
          <span className={cn("text-base font-semibold", !nome.trim() && "text-muted-foreground")}>{nome.trim() || "Técnico novo"}</span>
        </div>
        <Grande v={eh == null ? "—" : eur(eh)} un="€/h" legenda={eh == null ? "sem €/h até ter salário ou técnicos no RH" : "pelo salário, até haver técnicos no RH"} />
        {eh != null && (
          <p className={cn(NOTA, "mt-4 rounded-xl bg-muted/60 p-3 tabular-nums")}>
            {eur(o.salario ?? 0)} € × {nfmt(C.par.meses)} meses + TSU {nfmt(C.par.tsu)}% + seguros {eur(C.par.segurosAno)} € = {eur(ano.total)} € por ano, a dividir por {nfmt(C.par.horasAno)} h.
          </p>
        )}
        <Pronto itens={["Escreva o nome"]} faltas={faltas} botao="Criar o técnico" onCriar={criar} />
      </Previa>
    </div>
  );
}

/* ------------------------------------------------------------------ a página */
export function CriarNoCatalogo({ S, C, K, run, tipo, setTipo, voltar, onCriado }: {
  S: Estado; C: Custos; K: Catalogo; run: (fn: () => void) => void; tipo: TipoCriar; setTipo: (t: TipoCriar) => void; voltar: () => void;
  onCriado: (t: TipoCriar, id: string, nome: string) => void;
}) {
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => { titulo.current?.focus(); }, []);
  const feito = (t: TipoCriar) => (id: string, nome: string) => {
    // equipamentos e técnicos mexem no custo dos serviços em uso
    if (t === "equipamento" || t === "tecnico") run(() => aplicarTodos(S, lerCustos()));
    onCriado(t, id, nome);
  };
  return (
    <div>
      <button type="button" onClick={voltar} className="inline-flex min-h-11 items-center gap-1.5 text-[15px] font-medium text-muted-foreground transition-colors hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />Voltar ao Catálogo
      </button>
      <h1 ref={titulo} tabIndex={-1} className="mt-2 text-3xl font-semibold tracking-tight outline-none">Criar no Catálogo</h1>
      <p className="mt-2 text-lg text-muted-foreground">Escolha o que quer criar. À direita vê já como fica, com o custo e o preço.</p>
      <div role="radiogroup" aria-label="O que criar" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {TIPOS_CRIAR.map((x, i) => {
          const I = ICONE_TIPO[x.k], on = tipo === x.k;
          return (
            <button key={x.k} type="button" role="radio" aria-checked={on} onClick={() => setTipo(x.k)}
              className={cn("group relative flex flex-col items-start gap-2 rounded-2xl border bg-card p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:fill-mode-both",
                on ? "border-primary shadow-md ring-2 ring-primary/20" : "border-border shadow-[var(--shadow-sm)]")} style={{ animationDelay: `${i * 40}ms` }}>
              <span className={cn("grid h-10 w-10 place-items-center rounded-xl transition-transform group-hover:scale-110", COR_TIPO[x.k])}><I className="h-5 w-5" aria-hidden="true" /></span>
              <span className="text-base font-semibold">{x.t}</span>
              <span className="text-sm leading-snug text-muted-foreground">{x.d}</span>
              {on && <span className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground motion-safe:animate-in motion-safe:zoom-in-50"><Check className="h-4 w-4" aria-hidden="true" /></span>}
            </button>
          );
        })}
      </div>
      <div key={tipo} className="mt-8 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300">
        {tipo === "servico" && <FormServico S={S} C={C} K={K} onCriado={feito("servico")} />}
        {tipo === "produto" && <FormProduto S={S} K={K} onCriado={feito("produto")} />}
        {tipo === "equipamento" && <FormEquip C={C} onCriado={feito("equipamento")} />}
        {tipo === "consumivel" && <FormConsumivel S={S} C={C} K={K} onCriado={feito("consumivel")} />}
        {tipo === "tecnico" && <FormTecnico S={S} C={C} onCriado={feito("tecnico")} />}
      </div>
    </div>
  );
}
