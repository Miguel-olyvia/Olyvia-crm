// Os documentos que o cliente recebe: proposta, contrato, nota de encomenda (14/10) e fatura.
// Cada um aparece como uma folha, com o que é partilhável à volta:
// o link do portal, email, WhatsApp, ver como o cliente e imprimir (PDF).
import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Armchair, Check, Copy, Grid3x3, Hammer, HardHat, Mail, Maximize2, MessageCircle, Minus, Package, Palette, Plug, Plus, Printer, ShieldCheck, UserRound, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LINHAS, PAPEIS, calcMats, eur, linhaCalc, nfmt, tot, type Estado, type Negocio } from "./motor";
import { FASES_OBRA, type FaseObra } from "./fasesObra";
import { LINHA_DEMOLICAO } from "./entulho";
import { ESCOLHAS } from "./campos";
import type { Ctx } from "./pecas";
import { rotuloDia } from "./preparacaoObra";
import { diasAdenda, totalAdenda, type Adenda } from "./adendas";
import { porFase, linhaDeMaterial, quantidade, escolhasVisiveis, fornecidosPeloCliente, type Grupo } from "./propostaConteudo";
import { Ilustracao, ilustracaoDe, type IlustracaoKey } from "./ilustracoes";
import { COR_FASE, dataCurta, deIso, diaDaPrestacao, diasDaObra, faseDosMateriais, iniciosRapidos, planoObra, prestacoes } from "./planoObra";

const EMPRESA = { nome: "Mudelar", sub: "Remodelações de casas de banho e cozinhas", nif: "500 000 000", morada: "Lisboa" };

// IVA na proposta: a mão de obra (os serviços) a 6% e os materiais a 23%.
export { IVA_MAT, IVA_MO } from "./motor";
import { IVA_MAT, IVA_MO } from "./motor";
export function totais(d: Negocio, S: Estado) {
  if (!d.orc) return { mo: 0, mat: 0, ivaMo: 0, ivaMat: 0, base: 0, iva: 0, total: 0 };
  const k = 1 - (d.orc.desconto || 0) / 100; // o desconto reparte-se pelas duas partes
  let mo = 0, mat = 0;
  for (const l of d.orc.linhas) { const p = linhaCalc(l, S).preco * k; if (l.t === "mat") mat += p; else mo += p; }
  const ivaMo = mo * IVA_MO, ivaMat = mat * IVA_MAT;
  return { mo, mat, ivaMo, ivaMat, base: mo + mat, iva: ivaMo + ivaMat, total: mo + mat + ivaMo + ivaMat };
}
/** As linhas de IVA de um valor (o total ou uma tranche), na proporção do orçamento. */
function linhasIva(T: ReturnType<typeof totais>, parte = 1) {
  return [
    { l: "Mão de obra", base: T.mo * parte, taxa: IVA_MO, iva: T.ivaMo * parte },
    { l: "Materiais", base: T.mat * parte, taxa: IVA_MAT, iva: T.ivaMat * parte },
  ].filter((x) => x.base > 0);
}
function QuadroIva({ T, parte = 1, rotulo = "Total" }: { T: ReturnType<typeof totais>; parte?: number; rotulo?: string }) {
  const ls = linhasIva(T, parte);
  return (
    <div className="ml-auto w-full max-w-md">
      <table className="w-full text-right text-[15px]">
        <thead><tr className="text-xs uppercase tracking-wider text-slate-500"><th className="pb-1 text-left font-normal" /><th className="pb-1 font-normal">Sem IVA</th><th className="pb-1 font-normal">IVA</th></tr></thead>
        <tbody>
          {ls.map((x) => (
            <tr key={x.l}><td className="py-1 text-left text-slate-600">{x.l}</td><td className="py-1 tabular-nums">{eur(x.base)} €</td><td className="py-1 tabular-nums text-slate-600">{Math.round(x.taxa * 100)}% · {eur(x.iva)} €</td></tr>
          ))}
          <tr className="border-t border-slate-200"><td className="pt-2 text-left text-slate-600">Subtotal</td><td className="pt-2 tabular-nums">{eur(T.base * parte)} €</td><td className="pt-2 tabular-nums text-slate-600">{eur(T.iva * parte)} €</td></tr>
        </tbody>
      </table>
      <p className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-lg font-semibold"><span>{rotulo}</span><span className="tabular-nums">{eur(T.total * parte)} €</span></p>
    </div>
  );
}
/** As prestações das condições de pagamento (com "Por fases", as guardadas no plano da obra: planoObra.ts). */
export function tranches(d: Negocio, total: number, S?: Estado): { l: string; p: number; v: number; quando?: string }[] {
  const pr = prestacoes(d.f.pagamento, d.orc?.pagFases);
  // com o estado, a data prevista de cada prestação (o dia em que acaba a fase, pelo plano da obra)
  let quando: ((t: (typeof pr)[number]) => string | undefined) | null = null;
  if (S && d.orc) {
    const P = planoObra(d, S), n = Math.max(1, Math.ceil(P.dias - 1e-9));
    const cal = diasDaObra(d.orc.inicioObra ? deIso(d.orc.inicioObra) : iniciosRapidos(new Date())[0].data, n);
    quando = (t) => (t.fase === 0 ? undefined : dataCurta(cal[Math.min(n - 1, Math.max(0, Math.ceil(diaDaPrestacao(P, t) - 1e-9) - 1))]));
  }
  return pr.map((t) => ({ l: t.l, p: t.p, v: total * t.p, quando: quando?.(t) }));
}
const data = (iso?: string) => (iso ? iso.split("-").reverse().join("/") : "a definir");
function fimPrevisto(inicio?: string, dias?: string): string {
  if (!inicio || !dias) return "a definir";
  const d = new Date(inicio + "T12:00:00"); let n = Number(dias);
  while (n > 1) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) n--; }
  return d.toLocaleDateString("pt-PT");
}
/** Os tipos de documento com link do portal. */
export const TIPOS_DOC = ["proposta", "contrato", "fatura", "encomenda", "adenda"] as const;
// pelo lugar do tipo na lista (antes era pelo comprimento do nome: "proposta" e "contrato", ambos com 8 letras, davam o mesmo código)
const token = (d: Negocio, tipo: string) => (d.id * 7919 + (TIPOS_DOC.indexOf(tipo as (typeof TIPOS_DOC)[number]) + 1) * 104729).toString(36).toUpperCase();
/** O código do link de um documento (o negócio e o tipo). */
export const tokenDoc = token;
/** O link do portal do cliente. No protótipo abre o portal neste mesmo endereço (os dados vivem neste browser). */
export const linkPortal = (d: Negocio, tipo: string) => `${typeof window !== "undefined" ? window.location.origin : ""}/prototipo/negocios?portal=${token(d, tipo)}`;

/* ------------------------------------------------------------------ a folha */
function Folha({ titulo, numero, data: dt, children, carimbo }: { titulo: string; numero: string; data: string; children: ReactNode; carimbo?: string }) {
  return (
    <article className="folha relative mx-auto w-full max-w-[760px] rounded-2xl border border-border bg-white p-6 text-[15px] text-slate-900 shadow-[0_8px_30px_rgb(16_24_40/0.08)] sm:p-10">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <p className="text-xl font-semibold tracking-tight">{EMPRESA.nome}</p>
          <p className="text-sm text-slate-500">{EMPRESA.sub}</p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wider text-slate-500">{titulo}</p>
          <p className="text-lg font-semibold tabular-nums">{numero}</p>
          <p className="text-sm text-slate-500">{dt}</p>
        </div>
      </header>
      {carimbo && <span className="absolute right-8 top-28 -rotate-6 rounded-lg border-2 border-emerald-600 px-3 py-1 text-sm font-bold uppercase tracking-wider text-emerald-700">{carimbo}</span>}
      <div className="mt-6 space-y-6">{children}</div>
    </article>
  );
}
const Cliente = ({ d }: { d: Negocio }) => (
  <section className="grid gap-4 sm:grid-cols-2">
    <div><p className="text-xs uppercase tracking-wider text-slate-500">Cliente</p><p className="font-medium">{d.f.nome_fiscal || d.nome}</p><p className="text-slate-600">{d.f.email || d.tel}{d.f.nif_fat || d.f.nif ? ` · NIF ${d.f.nif_fat || d.f.nif}` : ""}</p></div>
    <div><p className="text-xs uppercase tracking-wider text-slate-500">Local da obra</p><p className="font-medium">{d.f.morada || d.local}</p><p className="text-slate-600">{[d.f.cp, d.f.localidade].filter(Boolean).join(" ")}{d.f.fracao ? ` · ${d.f.fracao}` : ""}</p></div>
  </section>
);
function Totais({ d, S }: { d: Negocio; S: Estado }) {
  return <QuadroIva T={totais(d, S)} />;
}

/* ------------------------------------------------------------------ como vai decorrer a obra (14/10) */
/** Na proposta: as fases da obra com as datas (do plano da obra do orçamento) e quando se paga cada prestação. Sem custos. */
function ObraNaProposta({ S, d }: { S: Estado; d: Negocio }) {
  const P = planoObra(d, S);
  const fases = P.fases.filter((f) => f.fim > f.inicio);
  if (!fases.length) return null;
  const n = Math.max(1, Math.ceil(P.dias - 1e-9));
  const inicio = d.orc?.inicioObra ? deIso(d.orc.inicioObra) : iniciosRapidos(new Date())[0].data;
  const cal = diasDaObra(inicio, n);
  const dia = (x: number) => dataCurta(cal[Math.min(cal.length - 1, Math.max(0, x))]);
  const periodo = (a: number, b: number) => { const i = Math.floor(a), j = Math.ceil(b - 1e-9) - 1; return j <= i ? dia(i) : `${dia(i)} a ${dia(j)}`; };
  return (
    <section aria-label="Como vai decorrer a obra">
      <p className="mb-2 text-xs uppercase tracking-wider text-slate-500">Como vai decorrer a obra</p>
      {/* a obra numa barra: cada fase com a sua largura (os dias) */}
      <div className="flex h-3 overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
        {fases.map((f) => <span key={f.n} className="h-full border-r-2 border-white last:border-r-0" style={{ width: `${((f.fim - f.inicio) / P.dias) * 100}%`, background: COR_FASE[f.n] }} />)}
      </div>
      <ol className="mt-3 grid gap-2 sm:grid-cols-2">
        {fases.map((f) => (
          <li key={f.n} className="flex gap-3 rounded-xl border border-slate-200 p-3">
            <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COR_FASE[f.n] }} aria-hidden="true" />
            <span className="min-w-0">
              <span className="block font-medium">{f.n}. {f.nome}</span>
              <span className="block text-sm text-slate-600">{periodo(f.inicio, f.fim)} · {nfmt(f.fim - f.inicio)} {f.fim - f.inicio === 1 ? "dia útil" : "dias úteis"}</span>
              <span className="block text-sm text-slate-500">{f.tarefas.map((t) => t.nome).join(", ")}</span>
            </span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-sm text-slate-600">
        Início previsto a {dia(0)} e fim a {dia(n - 1)}, só em dias úteis (sem fins de semana nem feriados).
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ proposta (14/10: o documento formal, em páginas A4) */
const MESES_LONGOS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const longa = (x: Date) => `${x.getDate()} de ${MESES_LONGOS[x.getMonth()]} de ${x.getFullYear()}`;
/** "05/10" → 5 de outubro de 2026; "hoje…" ou vazio → hoje. */
function dataDe(q: string | null | undefined): Date {
  const m = q?.match(/^(\d{1,2})\/(\d{1,2})/);
  return m ? new Date(2026, Number(m[2]) - 1, Number(m[1])) : new Date();
}

/** Uma página A4 (794 × 1123 px no ecrã); no telemóvel cresce com o conteúdo. */
function Pagina({ n, total, numero, capa, children }: { n: number; total: number; numero: string; capa?: boolean; children: ReactNode }) {
  return (
    <article className="pagina relative mx-auto flex w-full max-w-[794px] flex-col overflow-hidden bg-white text-[15px] leading-relaxed text-slate-800 shadow-[0_12px_40px_rgb(16_24_40/0.14)] sm:min-h-[1123px]">
      {!capa && (
        <header className="flex items-center justify-between border-b border-slate-200 px-6 py-4 text-xs text-slate-500 sm:px-12">
          <span className="font-semibold tracking-[0.22em] text-slate-900">{EMPRESA.nome.toUpperCase()}</span>
          <span>Proposta {numero}</span>
        </header>
      )}
      <div className={cn("flex-1", !capa && "space-y-9 px-6 py-8 sm:px-12 sm:py-10")}>{children}</div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-6 py-4 text-[11px] text-slate-500 sm:px-12">
        <span>{EMPRESA.nome} · {EMPRESA.sub} · NIF {EMPRESA.nif} · {EMPRESA.morada}</span>
        <span className="tabular-nums">Página {n} de {total}</span>
      </footer>
    </article>
  );
}
/** O título numerado de cada parte do documento (a ordem é a da leitura da proposta). */
const Titulo = ({ n, children }: { n: number; children: ReactNode }) => (
  <h2 className="flex items-baseline gap-3 border-b border-slate-900 pb-2 text-xl font-semibold tracking-tight text-slate-900">
    <span className="text-sm font-semibold tabular-nums text-[#5a36bf]">{String(n).padStart(2, "0")}</span>{children}
  </h2>
);

/* Os ícones da proposta: uma cor, discretos. A fase leva a cor da fase (como no plano da obra). */
const ICONE_FASE: Record<number, LucideIcon> = { 1: Hammer, 2: Plug, 3: Grid3x3, 4: Armchair };
const ICONE_GRUPO: Record<Grupo, LucideIcon> = { trabalhos: HardHat, preparacao: ShieldCheck, materiais: Package, cliente: UserRound };
/** O nome de uma linha de materiais na tabela do orçamento (sem prefixos técnicos). */
function nomeNaTabela(dl: string): string {
  const { grupo, item } = linhaDeMaterial(dl);
  return grupo === "cliente" ? `${item.nome} (fornecido por si)` : item.det ? `${item.nome} (${item.det})` : item.nome;
}
const Rotulo = ({ ic: Ic, children }: { ic: LucideIcon; children: ReactNode }) => (
  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500"><Ic className="h-3.5 w-3.5" aria-hidden="true" />{children}</p>
);
type ItemMat = { k: string; nome: string; det: string; img?: IlustracaoKey };
/** Uma lista de materiais com a ilustração, o nome e a quantidade por extenso. */
function ListaMateriais({ titulo, itens }: { titulo: string; itens: ItemMat[] }) {
  return (
    <div>
      <Rotulo ic={Package}>{titulo}</Rotulo>
      <ul className="mt-1 grid gap-x-8 sm:grid-cols-2">
        {itens.map((x) => (
          <li key={x.k} className="flex items-center gap-3 border-b border-slate-100 py-2 text-[15px]">
            <Ilustracao k={x.img ?? ilustracaoDe(x.nome)} className="h-9 w-9 text-slate-500" />
            <span className="min-w-0 flex-1 leading-snug">{x.nome}</span>
            {x.det && <span className="shrink-0 whitespace-nowrap text-sm tabular-nums text-slate-500">{x.det}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
/** "Materiais e escolhas" da proposta (e do portal): os do modelo, os escolhidos, o que o cliente fornece (com o que poupa) e as escolhas. */
export function MateriaisEscolhas({ mats, escolhidos, fornecidos, escolhas, nec, n = 2 }: {
  mats: ItemMat[]; escolhidos: ItemMat[]; fornecidos: { nome: string; det?: string; poupa: number }[]; escolhas: { l: string; v?: string }[]; nec: string[]; n?: number;
}) {
  return (
    <section className="space-y-5">
      <Titulo n={n}>Materiais e escolhas</Titulo>
      {mats.length > 0 && <ListaMateriais titulo="Incluídos no modelo" itens={mats} />}
      {escolhidos.length > 0 && <ListaMateriais titulo="Escolhidos consigo" itens={escolhidos} />}
      {!escolhidos.length && nec.length > 0 && <ListaMateriais titulo="Escolhidos consigo" itens={nec.map((n) => ({ k: n, nome: n, det: "" }))} />}
      {fornecidos.length > 0 && (
        <div>
          <Rotulo ic={UserRound}>Fornecido por si</Rotulo>
          <ul className="mt-1 divide-y divide-slate-100">
            {fornecidos.map((x) => (
              <li key={x.nome} className="flex items-baseline justify-between gap-3 py-2 text-[15px]">
                <span className="min-w-0">{x.nome}{x.det && <span className="block text-sm text-slate-500">{x.det}</span>}</span>
                {x.poupa > 0 && <span className="shrink-0 whitespace-nowrap text-sm tabular-nums text-emerald-700">poupa {eur(x.poupa)} €</span>}
              </li>
            ))}
          </ul>
          {fornecidos.some((x) => x.poupa > 0) && (
            <p className="mt-1 text-right text-sm text-slate-600">Ao todo, poupa <b className="font-semibold tabular-nums text-emerald-700">{eur(fornecidos.reduce((a, x) => a + x.poupa, 0))} €</b> sem IVA, já descontados no preço.</p>
          )}
        </div>
      )}
      {escolhas.length > 0 && (
        <div>
          <Rotulo ic={Palette}>As suas escolhas</Rotulo>
          <dl className="mt-1 divide-y divide-slate-100">
            {escolhas.map((x) => (
              <div key={x.l} className="flex items-baseline justify-between gap-3 py-2 text-[15px]">
                <dt className={x.v ? "text-slate-600" : "flex items-center gap-1.5 text-slate-800"}>{!x.v && <Check className="h-4 w-4 text-emerald-700" aria-hidden="true" />}{x.l}</dt>
                {x.v && <dd className="text-right font-medium text-slate-900">{x.v}</dd>}
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}

export function PropostaDoc({ S, d }: { S: Estado; d: Negocio }) {
  const o = d.orc!, L = LINHAS[d.linha], T = totais(d, S), desconto = o.desconto || 0, k = 1 - desconto / 100;
  const numero = `PR 2026/${d.id}${o.versoes?.length ? ` · v${o.versoes.length + 1}` : ""}`;
  const emitida = dataDe(o.enviada);
  const dv = Number((d.f.validade || "30 dias").match(/\d+/)?.[0] ?? 30);
  const ate = new Date(emitida); ate.setDate(ate.getDate() + dv);
  const P = planoObra(d, S), dias = Math.max(1, Math.ceil(P.dias - 1e-9));
  // o prazo que se promete ao cliente: o da proposta (o comercial pode dar folga); sem ele, o do plano
  const prazo = Number(d.f.prazo_exec) || dias;
  const inicio = o.inicioObra ? deIso(o.inicioObra) : iniciosRapidos(new Date())[0].data;
  const cal = diasDaObra(inicio, dias);
  const tr = tranches(d, T.total, S);
  // as linhas por fase da obra (os serviços pela fase da tarefa; os materiais pela descrição; a demolição na 1)
  const faseDe = new Map(P.tarefas.map((t) => [t.chave, t.fase]));
  const linhas = o.linhas.map((l) => {
    const x = linhaCalc(l, S), fase: FaseObra = l.t === "mat" ? (l.d === LINHA_DEMOLICAO ? 1 : faseDosMateriais(l.d)) : (faseDe.get(l.sid) ?? 4);
    return l.t === "svc"
      ? { fase, nome: x.s!.n, q: l.q, un: x.s!.un, pu: (x.preco * k) / (l.q || 1), total: x.preco * k, mat: false }
      : { fase, nome: nomeNaTabela(l.d), q: 1, un: "vg", pu: x.preco * k, total: x.preco * k, mat: true };
  });
  // "O que vamos fazer": por fase, em grupos curtos e sem os prefixos técnicos das linhas (propostaConteudo.ts)
  const conteudo = porFase(o.linhas.map((l) => {
    if (l.t === "svc") { const x = linhaCalc(l, S); return { fase: faseDe.get(l.sid) ?? 4, t: "svc" as const, nome: x.s!.n, q: l.q, un: x.s!.un }; }
    return { fase: l.d === LINHA_DEMOLICAO ? 1 : faseDosMateriais(l.d), t: "mat" as const, d: l.d };
  }));
  const fases = FASES_OBRA.filter((f) => linhas.some((x) => x.fase === f.n));
  const mats = calcMats(d, S, true).filter((x) => x.q > 0);
  const prods = (d.visita.prod ?? []).filter((p) => p.q > 0);
  const escolhas = escolhasVisiveis(ESCOLHAS.campos.filter((c) => d.f[c.k] && c.k !== "materiais_cliente").map((c) => [c.l, d.f[c.k]] as const));
  const fornecidos = fornecidosPeloCliente(d, S);
  const escolhidos = prods.filter((p) => !p.cliente);
  const comercial = PAPEIS.comercial.nome;
  const total = 4;

  return (
    <div className="folha doc-paginas space-y-8">
      {/* ---------------- 1. a capa */}
      <Pagina n={1} total={total} numero={numero} capa>
        <div className="bg-[#24204a] px-6 pb-12 pt-10 text-white sm:px-12">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-2xl font-semibold tracking-[0.18em]">{EMPRESA.nome.toUpperCase()}</p>
              <p className="mt-1 text-sm text-white/70">{EMPRESA.sub}</p>
            </div>
            <div className="text-right text-sm text-white/80">
              <p className="text-xs uppercase tracking-[0.2em] text-white/60">Proposta</p>
              <p className="text-lg font-semibold tabular-nums text-white">{numero}</p>
            </div>
          </div>
          <p className="mt-16 text-sm uppercase tracking-[0.2em] text-white/60">Proposta de remodelação</p>
          <h1 className="mt-2 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">{d.servico}</h1>
          <p className="mt-2 text-lg text-white/80">{[d.f.morada || d.local, d.f.localidade].filter(Boolean).join(", ")}</p>
        </div>
        <div className="space-y-10 px-6 py-10 sm:px-12">
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Preparada para</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{d.f.nome_fiscal || d.nome}</p>
              <p className="text-slate-600">{d.f.email || d.tel}{d.f.nif_fat || d.f.nif ? ` · NIF ${d.f.nif_fat || d.f.nif}` : ""}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Data</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{longa(emitida)}</p>
              <p className="text-slate-600">Válida até {longa(ate)}{o.versoes?.length ? ` · substitui a versão ${o.versoes.length}` : ""}</p>
            </div>
          </div>
          {/* o essencial numa linha: o que o cliente procura primeiro */}
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-slate-200 sm:grid-cols-4">
            {([["Total, com IVA", `${eur(T.total)} €`], ["Prazo", `${prazo} ${prazo === 1 ? "dia útil" : "dias úteis"}`], ["Início previsto", dataCurta(cal[0])], ["Garantia", `${d.f.garantia || "2 anos"}`]] as const).map(([t, v]) => (
              <div key={t} className="bg-white p-4"><dt className="text-xs uppercase tracking-[0.14em] text-slate-500">{t}</dt><dd className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{v}</dd></div>
            ))}
          </dl>
          {/* a carta */}
          <div className="max-w-[60ch] space-y-3 text-slate-700">
            <p>Olá, {d.nome.split(" ")[0]},</p>
            <p>Obrigado por nos ter recebido{d.visita.slot ? ` (${d.visita.slot.split(" · ")[0]})` : ""}. Esta proposta foi preparada a partir do levantamento feito no local: as medidas, o que nos disse que queria mudar e o que escolheu manter.</p>
            <p>Nas páginas seguintes está o que vamos fazer, fase a fase, o orçamento detalhado, as datas e as condições. Se quiser mudar alguma coisa, diga-nos: fazemos uma nova versão.</p>
            <p className="pt-2">Com os melhores cumprimentos,<br /><span className="font-semibold text-slate-900">{comercial}</span>, {EMPRESA.nome}</p>
          </div>
          {o.aceite && <p className="inline-block -rotate-3 rounded-lg border-2 border-emerald-600 px-4 py-1.5 text-sm font-bold uppercase tracking-wider text-emerald-700">Aceite {o.aceite}</p>}
        </div>
      </Pagina>

      {/* ---------------- 2. o que vamos fazer */}
      <Pagina n={2} total={total} numero={numero}>
        <section className="space-y-4">
          <Titulo n={1}>O que vamos fazer</Titulo>
          <p className="text-slate-600">{d.f.pedido || `Remodelação com o modelo "${L.modelo}".`} A obra divide-se em fases, pela ordem em que acontecem.</p>
          <ol className="space-y-6">
            {conteudo.map((f) => {
              const F = FASES_OBRA[f.fase - 1], Ic = ICONE_FASE[f.fase] ?? HardHat, cor = COR_FASE[f.fase as FaseObra];
              return (
                <li key={f.fase} className="break-inside-avoid">
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: `${cor}1f`, color: cor }} aria-hidden="true"><Ic className="h-[18px] w-[18px]" /></span>
                    <p className="min-w-0 text-[15px] font-semibold leading-snug text-slate-900"><span className="text-slate-500">Fase {f.fase} ·</span> {F.nome}</p>
                  </div>
                  <div className="ml-[18px] mt-2 space-y-3 border-l border-slate-200 pl-[29px]">
                    {f.grupos.map((g) => {
                      const Gi = ICONE_GRUPO[g.k];
                      return (
                        <div key={g.k}>
                          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500"><Gi className="h-3.5 w-3.5" aria-hidden="true" />{g.t}</p>
                          <ul className="mt-1 space-y-0.5 text-[15px] text-slate-800">
                            {g.itens.map((x) => <li key={x.nome}>{x.nome}{x.det && <span className="text-slate-500"> · {x.det}</span>}</li>)}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
        <MateriaisEscolhas mats={mats.map((x) => ({ k: x.n, nome: x.n, det: quantidade(x.q, x.un) }))} escolhidos={escolhidos.map((p) => ({ k: p.id, nome: p.n, det: quantidade(p.q, p.un) }))}
          fornecidos={fornecidos} escolhas={escolhas} nec={!prods.length ? d.visita.nec : []} />
      </Pagina>

      {/* ---------------- 3. o orçamento detalhado */}
      <Pagina n={3} total={total} numero={numero}>
        <section className="space-y-4">
          <Titulo n={3}>Orçamento detalhado</Titulo>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-slate-300 text-left text-xs uppercase tracking-[0.12em] text-slate-500">
                  <th className="py-2 pr-3 font-semibold">Descrição</th><th className="py-2 pr-3 text-right font-semibold">Qtd.</th><th className="py-2 pr-3 text-right font-semibold">Preço un.</th><th className="py-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              {fases.map((f) => {
                const L2 = linhas.filter((x) => x.fase === f.n), sub = L2.reduce((a, x) => a + x.total, 0);
                return (
                  <tbody key={f.n}>
                    <tr><td colSpan={4} className="pb-1 pt-4 text-[13px] font-semibold text-slate-900"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: COR_FASE[f.n] }} aria-hidden="true" />Fase {f.n} · {f.curto}</td></tr>
                    {L2.map((x) => (
                      <tr key={x.nome} className="border-b border-slate-100">
                        <td className="py-1.5 pr-3">{x.nome}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{nfmt(x.q)} {x.un}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{eur(x.pu)} €</td>
                        <td className="py-1.5 text-right tabular-nums">{eur(x.total)} €</td>
                      </tr>
                    ))}
                    <tr><td colSpan={3} className="py-1.5 pr-3 text-right text-slate-500">Subtotal da fase {f.n}</td><td className="py-1.5 text-right font-medium tabular-nums">{eur(sub)} €</td></tr>
                  </tbody>
                );
              })}
            </table>
          </div>
          <div className="ml-auto w-full max-w-sm space-y-1.5 border-t border-slate-900 pt-3 text-[14px]">
            {desconto > 0 && <div className="flex justify-between text-slate-600"><span>Desconto incluído nos preços</span><span className="tabular-nums">{desconto}%</span></div>}
            <div className="flex justify-between"><span>Mão de obra, sem IVA</span><span className="tabular-nums">{eur(T.mo)} €</span></div>
            <div className="flex justify-between"><span>Materiais, sem IVA</span><span className="tabular-nums">{eur(T.mat)} €</span></div>
            <div className="flex justify-between text-slate-600"><span>IVA a 6% (mão de obra)</span><span className="tabular-nums">{eur(T.ivaMo)} €</span></div>
            <div className="flex justify-between text-slate-600"><span>IVA a 23% (materiais)</span><span className="tabular-nums">{eur(T.ivaMat)} €</span></div>
            <div className="flex justify-between border-t border-slate-300 pt-2 text-lg font-semibold text-slate-900"><span>Total</span><span className="tabular-nums">{eur(T.total)} €</span></div>
          </div>
        </section>
      </Pagina>

      {/* ---------------- 4. datas, pagamento, condições e aceitação */}
      <Pagina n={4} total={total} numero={numero}>
        <section className="space-y-4">
          <Titulo n={4}>Planeamento</Titulo>
          <ObraNaProposta S={S} d={d} />
        </section>
        <section className="space-y-4">
          <Titulo n={5}>Pagamento</Titulo>
          <table className="w-full border-collapse text-[14px]">
            <tbody>
              {tr.map((t) => (
                <tr key={t.l} className="border-b border-slate-100">
                  <td className="py-2 pr-3">{t.l}{t.quando ? <span className="text-slate-500"> · previsto {t.quando}</span> : null}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-slate-500">{Math.round(t.p * 100)}%</td>
                  <td className="py-2 text-right font-medium tabular-nums">{eur(t.v)} €</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-sm text-slate-600">Por transferência bancária. Cada prestação tem a sua fatura, enviada para o portal.</p>
        </section>
        <section className="space-y-3">
          <Titulo n={6}>Condições</Titulo>
          <ul className="list-disc space-y-1 pl-5 text-slate-700">
            <li>Prazo de execução: {prazo} {prazo === 1 ? "dia útil" : "dias úteis"}, a contar do início acordado, sem fins de semana nem feriados.</li>
            <li>Garantia de {d.f.garantia || "2 anos"} sobre a mão de obra, a contar do auto de receção; os materiais têm a garantia do fabricante.</li>
            <li>Proposta válida até {longa(ate)}.</li>
            <li>Trabalhos que não estão descritos nesta proposta fazem-se só com o seu acordo, numa adenda com o preço e o prazo.</li>
            {d.f.notas_cliente && <li>{d.f.notas_cliente}</li>}
          </ul>
        </section>
        <section className="space-y-4">
          <Titulo n={7}>Aceitação</Titulo>
          <div className="grid gap-6 sm:grid-cols-2">
            {[["Pela " + EMPRESA.nome, comercial], ["O cliente", d.f.nome_fiscal || d.nome]].map(([q, nome]) => (
              <div key={q} className="pt-10">
                <div className="border-t border-slate-400 pt-2">
                  <p className="text-xs uppercase tracking-[0.16em] text-slate-500">{q}</p>
                  <p className="font-medium text-slate-900">{nome}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-sm text-slate-600">{o.aceite ? `Aceite no portal do cliente a ${o.aceite}.` : "Pode aceitar no portal do cliente, com um toque: fica registado quem, quando e de onde."}</p>
        </section>
      </Pagina>
    </div>
  );
}

/* ------------------------------------------------------------------ contrato */
export function ContratoDoc({ S, d }: { S: Estado; d: Negocio }) {
  const o = d.orc!, T = totais(d, S), tr = tranches(d, T.total, S);
  const n = (k: number, titulo: string, corpo: ReactNode) => (
    <section key={k}><h3 className="font-semibold">Cláusula {k}.ª · {titulo}</h3><div className="mt-1 text-slate-700">{corpo}</div></section>
  );
  return (
    <Folha titulo={d.f.modelo_contrato || "Contrato de empreitada"} numero={`CT 2026/${d.id}`} data={o.contrato === "assinado" ? "assinado" : o.contrato === "enviado" ? "à espera da assinatura" : "rascunho"} carimbo={o.contrato === "assinado" ? "Assinado" : undefined}>
      <p className="text-slate-700">
        Entre <b>{EMPRESA.nome}</b>, NIF {EMPRESA.nif}, com sede em {EMPRESA.morada}, representada por {d.f.representante || "—"}, e <b>{d.f.nome_fiscal || d.nome}</b>{d.f.nif_fat || d.f.nif ? `, NIF ${d.f.nif_fat || d.f.nif}` : ""}, é celebrado este contrato, que segue a proposta PR 2026/{d.id}.
      </p>
      {n(1, "Objeto", <>Os trabalhos de {d.servico.toLowerCase()} em {d.f.morada || d.local}{d.f.localidade ? `, ${d.f.localidade}` : ""}: {o.linhas.filter((l) => l.t === "svc").map((l) => linhaCalc(l, S).s!.n.toLowerCase()).join(", ")}, e os materiais do modelo escolhido.</>)}
      {n(2, "Preço", <>{eur(T.base)} € sem IVA: {eur(T.mo)} € de mão de obra, com IVA a 6% ({eur(T.ivaMo)} €), e {eur(T.mat)} € de materiais, com IVA a 23% ({eur(T.ivaMat)} €). Total com IVA: <b>{eur(T.total)} €</b>.</>)}
      {n(3, "Pagamento", <ul className="list-disc pl-5">{tr.map((t) => <li key={t.l}>{t.l}{t.quando ? ` (previsto: ${t.quando})` : ""}: {Math.round(t.p * 100)}%, {eur(t.v)} €</li>)}</ul>)}
      {n(4, "Prazo", <>Início {d.f.inicio_prev ? `a ${data(d.f.inicio_prev)}` : "por marcar"}, com {d.f.prazo_exec || "—"} dias úteis de execução: fim previsto a {fimPrevisto(d.f.inicio_prev, d.f.prazo_exec)}.{d.f.multa === "Sim" ? " O atraso imputável à empresa dá lugar a penalização, nos termos das condições gerais." : ""}</>)}
      {n(5, "Garantia", <>{d.f.garantia || "2 anos"} sobre a mão de obra, a contar da data do auto de receção. Os materiais têm a garantia do fabricante.</>)}
      {n(6, "Condições gerais", <>Fazem parte deste contrato as condições gerais da empresa, entregues ao cliente com a proposta.</>)}
      <section className="grid gap-6 pt-4 sm:grid-cols-2">
        {[["Pela empresa", d.f.representante || "—", o.contrato ? "Assinado" : ""], ["O cliente", d.f.nome_fiscal || d.nome, o.contrato === "assinado" ? "Assinado no portal" : o.contrato === "enviado" ? "À espera" : ""]].map(([q, nome, est]) => (
          <div key={q} className="border-t border-slate-300 pt-2">
            <p className="text-xs uppercase tracking-wider text-slate-500">{q}</p>
            <p className="font-medium">{nome}</p>
            {est && <p className={cn("text-sm", est.startsWith("Assinado") ? "text-emerald-700" : "text-slate-500")}>{est}{d.f.assinatura ? ` · ${d.f.assinatura.toLowerCase()}` : ""}</p>}
          </div>
        ))}
      </section>
    </Folha>
  );
}

/* ------------------------------------------------------------------ adenda (14/10) */
/** A adenda ao contrato: os trabalhos a mais, o preço (IVA a 6%), os dias a mais e as assinaturas. */
export function AdendaDoc({ d, a }: { d: Negocio; a: Adenda }) {
  const base = totalAdenda(a.linhas), dias = diasAdenda(a.linhas);
  return (
    <Folha titulo="Adenda ao contrato" numero={a.n} data={a.estado === "assinada" ? "assinada" : "à espera da assinatura"} carimbo={a.estado === "assinada" ? "Assinada" : undefined}>
      <Cliente d={d} />
      <p className="text-slate-700">Trabalhos a mais na obra do contrato CT 2026/{d.id}, por {a.motivo.toLowerCase()}. O resto do contrato mantém-se.</p>
      <ul className="divide-y divide-slate-200 border-y border-slate-200">
        {a.linhas.map((x) => (
          <li key={x.sid} className="flex items-baseline justify-between gap-4 py-2.5">
            <span>{x.n}<span className="block text-sm text-slate-500">{nfmt(x.q)} {x.un} × {eur(x.pu)} € · IVA 6%</span></span>
            <span className="tabular-nums">{eur(x.q * x.pu)} €</span>
          </li>
        ))}
      </ul>
      <div className="space-y-1">
        <div className="flex justify-between text-slate-600"><span>Sem IVA</span><span className="tabular-nums">{eur(base)} €</span></div>
        <div className="flex justify-between text-slate-600"><span>IVA (6%)</span><span className="tabular-nums">{eur(base * IVA_MO)} €</span></div>
        <div className="flex justify-between text-lg font-semibold"><span>Total</span><span className="tabular-nums">{eur(base * (1 + IVA_MO))} €</span></div>
      </div>
      <p className="text-slate-700">Prazo: mais {dias} {dias === 1 ? "dia útil" : "dias úteis"}. Pagamento: com a última prestação do contrato.</p>
      <section className="grid gap-6 pt-4 sm:grid-cols-2">
        {[["Pela empresa", d.f.representante || "—", "Assinado"], ["O cliente", d.f.nome_fiscal || d.nome, a.estado === "assinada" ? "Assinado no portal" : "À espera"]].map(([q, nome, est]) => (
          <div key={q} className="border-t border-slate-300 pt-2">
            <p className="text-xs uppercase tracking-wider text-slate-500">{q}</p>
            <p className="font-medium">{nome}</p>
            <p className={cn("text-sm", est.startsWith("Assinado") ? "text-emerald-700" : "text-slate-500")}>{est}</p>
          </div>
        ))}
      </section>
    </Folha>
  );
}

/* ------------------------------------------------------------------ fatura */
export function FaturaDoc({ S, d }: { S: Estado; d: Negocio }) {
  const T = totais(d, S), tr = tranches(d, T.total), t0 = tr[0], ft = d.fin.fatura;
  return (
    <Folha titulo="Fatura" numero={ft ? ft.n : "por emitir"} data={ft ? `emitida ${ft.q}` : "rascunho"} carimbo={d.fin.recibo ? `Paga · ${d.fin.recibo.n}` : undefined}>
      <Cliente d={d} />
      <ul className="divide-y divide-slate-200 border-y border-slate-200">
        {linhasIva(T, t0.p).map((x) => (
          <li key={x.l} className="flex items-baseline justify-between gap-4 py-2.5">
            <span>{x.l} · {d.servico}, conforme contrato CT 2026/{d.id}<span className="block text-sm text-slate-500">{d.f.tranche || "1.ª tranche"}: {Math.round(t0.p * 100)}% · IVA {Math.round(x.taxa * 100)}%</span></span>
            <span className="tabular-nums">{eur(x.base)} €</span>
          </li>
        ))}
      </ul>
      <QuadroIva T={T} parte={t0.p} rotulo="A pagar" />
      <p className="text-sm text-slate-600">Vencimento: {d.f.vencimento || "15 dias"} · {d.f.metodo || "Transferência"} · série {d.f.serie || "FT 2026"}</p>
    </Folha>
  );
}

/* ------------------------------------------------------------------ nota de encomenda (14/10) */
/** O estado de cada linha, como o cliente o lê: a confirmar, reservado em armazém, a encomendar, encomendado, recebido. */
function estadoLinha(d: Negocio, falta: number): { t: string; ok: boolean } {
  const ec = d.obra.ec!, e = d.obra.enc;
  if (ec.estado !== "aprovada") return { t: "a confirmar", ok: false };
  if (falta <= 0) return { t: "reservado em armazém", ok: true };
  if (!e || e.estado === "por confirmar") return { t: "a encomendar", ok: false };
  return e.estado === "recebida" ? { t: "recebido", ok: true } : { t: "encomendado ao fornecedor", ok: false };
}
/** A nota de encomenda: os materiais e produtos da obra, com o preço (nunca o custo), o estado de cada um e quando estão em obra. */
export function NotaEncomendaDoc({ d }: { d: Negocio }) {
  const ec = d.obra.ec;
  if (!ec) return null;
  const p = d.obra.plano;
  const prontos = ec.linhas.filter((x) => estadoLinha(d, x.falta).ok).length;
  return (
    <Folha titulo="Nota de encomenda" numero={ec.n} data={`de ${ec.criada}`} carimbo={ec.estado === "aprovada" ? "Confirmada" : undefined}>
      <Cliente d={d} />
      <p className="text-slate-700">Os materiais e produtos da obra de {d.servico.toLowerCase()}, conforme o contrato CT 2026/{d.id}. Estão incluídos no preço do contrato: <b>não se pagam à parte</b>.</p>
      <ul className="divide-y divide-slate-200 border-y border-slate-200">
        {ec.linhas.map((x) => {
          const st = estadoLinha(d, x.falta);
          return (
            <li key={x.n} className="flex items-baseline justify-between gap-4 py-2.5">
              <span className="min-w-0">{x.n}<span className="block text-sm text-slate-500">{nfmt(x.q)} {x.un} · {x.de === "produto" ? "escolhido na visita" : "do modelo"} · <span className={st.ok ? "text-emerald-700" : "text-slate-500"}>{st.t}</span></span></span>
              <span className="shrink-0 tabular-nums">{eur((x.preco ?? 0) * x.q)} €</span>
            </li>
          );
        })}
      </ul>
      <div className="flex items-baseline justify-between"><span className="text-slate-600">Materiais, sem IVA (IVA a 23%)</span><span className="text-lg font-semibold tabular-nums">{eur(ec.valor)} €</span></div>
      <section className="rounded-xl bg-slate-50 p-4">
        <p className="font-medium">{prontos === ec.linhas.length ? "Tudo pronto para a obra." : `${prontos} de ${ec.linhas.length} prontos para a obra.`}</p>
        <p className="text-slate-600">{p ? `Tudo em obra antes do início, a ${rotuloDia(p, 0)}.` : "A data de entrega segue o início da obra."} Avisamos no portal quando chegar.</p>
      </section>
    </Folha>
  );
}

/* ------------------------------------------------------------------ partilhar */
function imprimir(el: HTMLElement | null, titulo: string) {
  if (!el) return;
  const w = window.open("", "_blank");
  if (!w) return;
  const estilos = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((n) => n.outerHTML).join("");
  w.document.write(`<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>${titulo}</title>${estilos}<style>body{background:#fff;margin:0;padding:24px}.folha{box-shadow:none!important;border:0!important}.pagina{box-shadow:none!important;min-height:auto!important;break-after:page}.doc-paginas{display:block}</style></head><body class="calma">${el.outerHTML}</body></html>`);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 600);
}

export function Partilhar({ ctx, d, tipo, children, estado }: { ctx: Ctx; d: Negocio; tipo: "proposta" | "contrato" | "fatura" | "encomenda" | "adenda"; children: ReactNode; estado: string }) {
  const link = linkPortal(d, tipo);
  const [copiado, setCopiado] = useState(false);
  const [ver, setVer] = useState(false);
  const [zoom, setZoom] = useState(1);
  const doc = useRef<HTMLDivElement>(null), leitor = useRef<HTMLDivElement>(null);
  const nome = { proposta: "a proposta", contrato: "o contrato", fatura: "a fatura", encomenda: "a nota de encomenda", adenda: "a adenda ao contrato" }[tipo];
  const msg = `Olá ${d.nome.split(" ")[0]}, segue ${nome} da ${EMPRESA.nome}: ${link}`;
  const tel = d.tel.replace(/\D/g, "");
  const copiar = async () => {
    try { await navigator.clipboard.writeText(link); } catch { /* sem acesso à área de transferência */ }
    setCopiado(true); setTimeout(() => setCopiado(false), 2000);
  };
  void ctx;
  return (
    <section className="space-y-4" aria-label={`Documento: ${nome}`}>
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[15px] font-semibold">Partilhar {nome}</p>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-sm text-muted-foreground">{estado}</span>
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-input bg-background p-1 pl-3">
          <a href={link} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm text-primary underline-offset-4 hover:underline" title={link}>{link}</a>
          <Button size="sm" variant={copiado ? "secondary" : "outline"} onClick={copiar}>{copiado ? <><Check className="mr-1.5 h-4 w-4" />Copiado</> : <><Copy className="mr-1.5 h-4 w-4" />Copiar link</>}</Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" asChild><a href={`mailto:${d.f.email || ""}?subject=${encodeURIComponent(`${EMPRESA.nome} · ${nome}`)}&body=${encodeURIComponent(msg)}`}><Mail className="mr-1.5 h-4 w-4" />Email</a></Button>
          <Button variant="outline" asChild><a href={`https://wa.me/351${tel}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"><MessageCircle className="mr-1.5 h-4 w-4" />WhatsApp</a></Button>
          <Button variant="outline" onClick={() => setVer(true)}><Maximize2 className="mr-1.5 h-4 w-4" />Abrir em ecrã inteiro</Button>
          <Button variant="outline" onClick={() => imprimir(doc.current?.querySelector(".folha") as HTMLElement, `${EMPRESA.nome} · ${nome}`)}><Printer className="mr-1.5 h-4 w-4" />Imprimir ou PDF</Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">No protótipo, o link abre o portal do cliente neste browser (os dados ficam neste computador). O link real será do portal da Olyvia.</p>
      </div>
      <div ref={doc} className="rounded-2xl bg-muted/60 p-3 sm:p-6">{children}</div>
      {ver && createPortal(
        // o leitor: o documento em ecrã inteiro, como o cliente o abre no portal, com zoom e imprimir (Escape fecha).
        // Vai para o body: dentro do passo (animado, com transform) o "fixed" ficava preso ao passo e não cobria o ecrã.
        <div className="fixed inset-0 z-[90] overflow-y-auto bg-[#e6e4ee] animate-in fade-in-0" role="dialog" aria-modal="true" aria-label={`O cliente vê ${nome}`}
          onKeyDown={(e) => { if (e.key === "Escape") setVer(false); }}>
          <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-slate-300 bg-white/95 px-4 py-2.5 backdrop-blur">
            <p className="min-w-0 text-sm text-slate-600"><span className="font-semibold text-slate-900">{nome.replace(/^(a|o) /, "").replace(/^./, (c) => c.toUpperCase())}</span> · como {d.nome.split(" ")[0]} vê no portal · {estado}</p>
            <div className="flex items-center gap-1">
              <div className="hidden items-center rounded-lg border border-slate-300 sm:flex" role="group" aria-label="Zoom">
                <button type="button" aria-label="Diminuir" disabled={zoom <= 0.6} onClick={() => setZoom((z) => Math.max(0.6, Math.round((z - 0.1) * 10) / 10))} className="grid h-10 w-10 place-items-center rounded-l-lg text-slate-700 hover:bg-slate-100 disabled:opacity-40"><Minus className="h-4 w-4" /></button>
                <button type="button" onClick={() => setZoom(1)} className="h-10 min-w-[4rem] px-2 text-sm tabular-nums text-slate-700 hover:bg-slate-100" aria-label="Repor o zoom">{Math.round(zoom * 100)}%</button>
                <button type="button" aria-label="Aumentar" disabled={zoom >= 1.6} onClick={() => setZoom((z) => Math.min(1.6, Math.round((z + 0.1) * 10) / 10))} className="grid h-10 w-10 place-items-center rounded-r-lg text-slate-700 hover:bg-slate-100 disabled:opacity-40"><Plus className="h-4 w-4" /></button>
              </div>
              <button type="button" onClick={() => imprimir(leitor.current?.querySelector(".folha") as HTMLElement, `${EMPRESA.nome} · ${nome}`)} className="inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-slate-700 hover:bg-slate-100"><Printer className="h-4 w-4" />Imprimir ou PDF</button>
              <button type="button" autoFocus onClick={() => setVer(false)} aria-label="Fechar" className="grid h-10 w-10 place-items-center rounded-lg hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
          </div>
          <div ref={leitor} className="px-3 py-8 sm:py-12" style={{ zoom }}>{children}</div>
        </div>,
        document.body,
      )}
    </section>
  );
}
