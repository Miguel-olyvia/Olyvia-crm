// Os documentos que o cliente recebe: proposta, contrato e fatura.
// Cada um aparece como uma folha, com o que é partilhável à volta:
// o link do portal, email, WhatsApp, ver como o cliente e imprimir (PDF).
import { useRef, useState, type ReactNode } from "react";
import { Check, Copy, Eye, Mail, MessageCircle, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LINHAS, eur, linhaCalc, nfmt, tot, type Estado, type Negocio } from "./motor";
import type { Ctx } from "./pecas";

const EMPRESA = { nome: "Mudelar", sub: "Remodelações de casas de banho e cozinhas", nif: "500 000 000", morada: "Lisboa" };

export const taxaIva = (d: Negocio) => (d.f.iva?.startsWith("6") ? 0.06 : 0.23);
export function totais(d: Negocio, S: Estado) {
  const base = d.orc ? tot(d, S).pf : 0, iva = base * taxaIva(d);
  return { base, iva, total: base + iva };
}
export function tranches(d: Negocio, total: number): { l: string; p: number; v: number }[] {
  const pg = d.f.pagamento || "50% + 50% no fim";
  const ps = pg.startsWith("100") ? [[ "Na adjudicação", 1 ]] : pg.startsWith("30") ? [["Na adjudicação", 0.3], ["A meio da obra", 0.4], ["No fim da obra", 0.3]] : [["Na adjudicação", 0.5], ["No fim da obra", 0.5]];
  return (ps as [string, number][]).map(([l, p]) => ({ l, p, v: total * p }));
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
  const T = totais(d, S);
  return (
    <dl className="ml-auto grid w-full max-w-xs grid-cols-2 gap-y-1.5 text-right">
      <dt className="text-left text-slate-600">Total sem IVA</dt><dd className="tabular-nums">{eur(T.base)} €</dd>
      <dt className="text-left text-slate-600">IVA {Math.round(taxaIva(d) * 100)}%</dt><dd className="tabular-nums">{eur(T.iva)} €</dd>
      <dt className="border-t border-slate-200 pt-2 text-left font-semibold">Total</dt><dd className="border-t border-slate-200 pt-2 text-lg font-semibold tabular-nums">{eur(T.total)} €</dd>
    </dl>
  );
}

/* ------------------------------------------------------------------ proposta */
export function PropostaDoc({ S, d }: { S: Estado; d: Negocio }) {
  const o = d.orc!, L = LINHAS[d.linha], T = totais(d, S), desconto = o.desconto || 0;
  return (
    <Folha titulo="Proposta" numero={`PR 2026/${d.id}`} data={o.enviada ? `enviada ${o.enviada}` : "rascunho"} carimbo={o.aceite ? "Aceite" : undefined}>
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
        {d.visita.nec.length > 0 && <p className="mt-2 text-sm text-slate-600">Equipamentos escolhidos: {d.visita.nec.join(", ")}{d.f.gama ? ` · gama ${d.f.gama.toLowerCase()}` : ""}.</p>}
      </section>
      <Totais d={d} S={S} />
      <section className="grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
        <div><p className="text-xs uppercase tracking-wider text-slate-500">Prazo</p><p>{d.f.prazo_exec ? `${d.f.prazo_exec} dias úteis` : "a definir"}{d.f.inicio_prev ? `, a começar a ${data(d.f.inicio_prev)}` : ""}</p></div>
        <div><p className="text-xs uppercase tracking-wider text-slate-500">Validade</p><p>{d.f.validade || "30 dias"}</p></div>
        <div><p className="text-xs uppercase tracking-wider text-slate-500">Pagamento</p><p>{tranches(d, T.total).map((t) => `${Math.round(t.p * 100)}% ${t.l.toLowerCase()} (${eur(t.v)} €)`).join(" · ")}</p></div>
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
  const o = d.orc!, T = totais(d, S), tr = tranches(d, T.total);
  const n = (k: number, titulo: string, corpo: ReactNode) => (
    <section key={k}><h3 className="font-semibold">Cláusula {k}.ª · {titulo}</h3><div className="mt-1 text-slate-700">{corpo}</div></section>
  );
  return (
    <Folha titulo={d.f.modelo_contrato || "Contrato de empreitada"} numero={`CT 2026/${d.id}`} data={o.contrato === "assinado" ? "assinado" : o.contrato === "enviado" ? "à espera da assinatura" : "rascunho"} carimbo={o.contrato === "assinado" ? "Assinado" : undefined}>
      <p className="text-slate-700">
        Entre <b>{EMPRESA.nome}</b>, NIF {EMPRESA.nif}, com sede em {EMPRESA.morada}, representada por {d.f.representante || "—"}, e <b>{d.f.nome_fiscal || d.nome}</b>{d.f.nif_fat || d.f.nif ? `, NIF ${d.f.nif_fat || d.f.nif}` : ""}, é celebrado este contrato, que segue a proposta PR 2026/{d.id}.
      </p>
      {n(1, "Objeto", <>Os trabalhos de {d.servico.toLowerCase()} em {d.f.morada || d.local}{d.f.localidade ? `, ${d.f.localidade}` : ""}: {o.linhas.filter((l) => l.t === "svc").map((l) => linhaCalc(l, S).s!.n.toLowerCase()).join(", ")}, e os materiais do modelo escolhido.</>)}
      {n(2, "Preço", <>{eur(T.base)} € sem IVA, mais IVA à taxa de {Math.round(taxaIva(d) * 100)}%, num total de <b>{eur(T.total)} €</b>.</>)}
      {n(3, "Pagamento", <ul className="list-disc pl-5">{tr.map((t) => <li key={t.l}>{t.l}: {Math.round(t.p * 100)}%, {eur(t.v)} €</li>)}</ul>)}
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
  const base = t0.v / (1 + taxaIva(d)), iva = t0.v - base;
  return (
    <Folha titulo="Fatura" numero={ft ? ft.n : "por emitir"} data={ft ? `emitida ${ft.q}` : "rascunho"} carimbo={d.fin.recibo ? `Paga · ${d.fin.recibo.n}` : undefined}>
      <Cliente d={d} />
      <ul className="divide-y divide-slate-200 border-y border-slate-200">
        <li className="flex items-baseline justify-between gap-4 py-2.5">
          <span>{d.servico}, conforme contrato CT 2026/{d.id}<span className="block text-sm text-slate-500">{d.f.tranche || "1.ª tranche"}: {Math.round(t0.p * 100)}% de {eur(T.total)} €</span></span>
          <span className="tabular-nums">{eur(base)} €</span>
        </li>
      </ul>
      <dl className="ml-auto grid w-full max-w-xs grid-cols-2 gap-y-1.5 text-right">
        <dt className="text-left text-slate-600">Base</dt><dd className="tabular-nums">{eur(base)} €</dd>
        <dt className="text-left text-slate-600">IVA {Math.round(taxaIva(d) * 100)}%</dt><dd className="tabular-nums">{eur(iva)} €</dd>
        <dt className="border-t border-slate-200 pt-2 text-left font-semibold">A pagar</dt><dd className="border-t border-slate-200 pt-2 text-lg font-semibold tabular-nums">{eur(t0.v)} €</dd>
      </dl>
      <p className="text-sm text-slate-600">Vencimento: {d.f.vencimento || "15 dias"} · {d.f.metodo || "Transferência"} · série {d.f.serie || "FT 2026"}</p>
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

export function Partilhar({ ctx, d, tipo, children, estado }: { ctx: Ctx; d: Negocio; tipo: "proposta" | "contrato" | "fatura"; children: ReactNode; estado: string }) {
  const link = `https://portal.olyvia-ai.com/${tipo}/${token(d, tipo)}`;
  const [copiado, setCopiado] = useState(false);
  const [ver, setVer] = useState(false);
  const doc = useRef<HTMLDivElement>(null);
  const nome = { proposta: "a proposta", contrato: "o contrato", fatura: "a fatura" }[tipo];
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
