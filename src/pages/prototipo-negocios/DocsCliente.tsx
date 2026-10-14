// Os documentos que o cliente recebe: proposta, contrato, nota de encomenda (14/10) e fatura.
// Cada um aparece como uma folha, com o que é partilhável à volta:
// o link do portal, email, WhatsApp, ver como o cliente e imprimir (PDF).
import { useRef, useState, type ReactNode } from "react";
import { Check, Copy, Eye, Mail, MessageCircle, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LINHAS, eur, linhaCalc, nfmt, tot, type Estado, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { rotuloDia } from "./preparacaoObra";
import { COR_FASE, dataCurta, deIso, diaDaPrestacao, diasDaObra, iniciosRapidos, planoObra, prestacoes } from "./planoObra";

const EMPRESA = { nome: "Mudelar", sub: "Remodelações de casas de banho e cozinhas", nif: "500 000 000", morada: "Lisboa" };

// IVA na proposta: a mão de obra (os serviços) a 6% e os materiais a 23%.
export const IVA_MO = 0.06, IVA_MAT = 0.23;
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
const token = (d: Negocio, tipo: string) => (d.id * 7919 + tipo.length * 104729).toString(36).toUpperCase();

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

/* ------------------------------------------------------------------ proposta */
export function PropostaDoc({ S, d }: { S: Estado; d: Negocio }) {
  const o = d.orc!, L = LINHAS[d.linha], T = totais(d, S), desconto = o.desconto || 0;
  return (
    <Folha titulo="Proposta" numero={`PR 2026/${d.id}${o.versoes?.length ? ` · v${o.versoes.length + 1}` : ""}`} data={(o.enviada ? `enviada ${o.enviada}` : "rascunho") + (o.versoes?.length ? ` · substitui a v${o.versoes.length}` : "")} carimbo={o.aceite ? "Aceite" : undefined}>
      <Cliente d={d} />
      <section>
        <h3 className="text-lg font-semibold">{d.servico}</h3>
        <p className="mt-1 text-slate-600">{d.f.pedido || `Remodelação com o modelo "${L.modelo}".`}</p>
      </section>
      <section>
        <p className="mb-2 text-xs uppercase tracking-wider text-slate-500">O que está incluído</p>
        <ul className="divide-y divide-slate-200 border-y border-slate-200">
          {o.linhas.map((l, i) => {
            const x = linhaCalc(l, S);
            return (
              <li key={i} className="flex items-baseline justify-between gap-4 py-2.5">
                <span>{l.t === "mat" ? `Materiais: ${l.d}` : x.s!.n}{l.t === "svc" && <span className="text-slate-500"> · {nfmt(l.q)} {x.s!.un}</span>}</span>
                <span className="tabular-nums">{eur(x.preco * (1 - desconto / 100))} €</span>
              </li>
            );
          })}
        </ul>
        {d.visita.nec.length > 0 && <p className="mt-2 text-sm text-slate-600">Equipamentos escolhidos: {d.visita.nec.join(", ")}.</p>}
      </section>
      <Totais d={d} S={S} />
      <ObraNaProposta S={S} d={d} />
      <section className="grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
        <div><p className="text-xs uppercase tracking-wider text-slate-500">Prazo</p><p>{d.f.prazo_exec ? `${d.f.prazo_exec} dias úteis` : "a definir"}{d.f.inicio_prev ? `, a começar a ${data(d.f.inicio_prev)}` : ""}</p></div>
        <div><p className="text-xs uppercase tracking-wider text-slate-500">Validade</p><p>{d.f.validade || "30 dias"}</p></div>
        <div><p className="text-xs uppercase tracking-wider text-slate-500">Pagamento</p><p>{tranches(d, T.total, S).map((t) => `${Math.round(t.p * 100)}% ${t.l.charAt(0).toLowerCase() + t.l.slice(1)}${t.quando ? `, ${t.quando}` : ""} (${eur(t.v)} €)`).join(" · ")}</p></div>
        <div><p className="text-xs uppercase tracking-wider text-slate-500">Garantia</p><p>{d.f.garantia || "2 anos"} sobre a mão de obra</p></div>
      </section>
      {d.f.notas_cliente && <p className="text-slate-700">{d.f.notas_cliente}</p>}
      <footer className="border-t border-slate-200 pt-4 text-sm text-slate-500">
        {o.aceite ? `Aceite pelo cliente no portal a ${o.aceite}.` : "O cliente aceita esta proposta no portal, com um toque. Fica registado quem, quando e de onde."}
      </footer>
    </Folha>
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
  w.document.write(`<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>${titulo}</title>${estilos}<style>body{background:#fff;margin:0;padding:24px}.folha{box-shadow:none!important;border:0!important}</style></head><body class="calma">${el.outerHTML}</body></html>`);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 600);
}

export function Partilhar({ ctx, d, tipo, children, estado }: { ctx: Ctx; d: Negocio; tipo: "proposta" | "contrato" | "fatura" | "encomenda"; children: ReactNode; estado: string }) {
  const link = `https://portal.olyvia-ai.com/${tipo}/${token(d, tipo)}`;
  const [copiado, setCopiado] = useState(false);
  const [ver, setVer] = useState(false);
  const doc = useRef<HTMLDivElement>(null);
  const nome = { proposta: "a proposta", contrato: "o contrato", fatura: "a fatura", encomenda: "a nota de encomenda" }[tipo];
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
          <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground" title={link}>{link}</span>
          <Button size="sm" variant={copiado ? "secondary" : "default"} onClick={copiar}>{copiado ? <><Check className="mr-1.5 h-4 w-4" />Copiado</> : <><Copy className="mr-1.5 h-4 w-4" />Copiar link</>}</Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" asChild><a href={`mailto:${d.f.email || ""}?subject=${encodeURIComponent(`${EMPRESA.nome} · ${nome}`)}&body=${encodeURIComponent(msg)}`}><Mail className="mr-1.5 h-4 w-4" />Email</a></Button>
          <Button variant="outline" asChild><a href={`https://wa.me/351${tel}?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"><MessageCircle className="mr-1.5 h-4 w-4" />WhatsApp</a></Button>
          <Button variant="outline" onClick={() => setVer(true)}><Eye className="mr-1.5 h-4 w-4" />Ver como o cliente</Button>
          <Button variant="outline" onClick={() => imprimir(doc.current?.querySelector(".folha") as HTMLElement, `${EMPRESA.nome} · ${nome}`)}><Printer className="mr-1.5 h-4 w-4" />Imprimir ou PDF</Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Link de exemplo: no protótipo não abre o portal.</p>
      </div>
      <div ref={doc} className="rounded-2xl bg-muted/60 p-3 sm:p-6">{children}</div>
      {ver && (
        <div className="fixed inset-0 z-[90] overflow-y-auto bg-slate-100 animate-in fade-in-0" role="dialog" aria-modal="true" aria-label={`O cliente vê ${nome}`}>
          <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
            <p className="text-sm text-slate-600">Portal do cliente · como {d.nome.split(" ")[0]} vê {nome}</p>
            <button type="button" onClick={() => setVer(false)} aria-label="Fechar" className="grid h-10 w-10 place-items-center rounded-lg hover:bg-slate-200"><X className="h-5 w-5" /></button>
          </div>
          <div className="px-3 py-6 sm:py-10">{children}</div>
        </div>
      )}
    </section>
  );
}
