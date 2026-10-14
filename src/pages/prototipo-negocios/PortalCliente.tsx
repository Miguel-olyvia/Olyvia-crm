// O portal do cliente (14/10/2026): o que o cliente vê no telemóvel, aberto a partir do negócio.
// Em cima, em que ponto está (proposta → contrato → materiais → obra); depois "O que precisa de si" (aceitar ou pedir
// alterações, assinar o contrato e as adendas, avisar que pagou); a obra com as datas por fase e os materiais; e os
// documentos. As ações são as do motor (as mesmas que os "Simular" faziam), por isso o resto do protótipo reage.
import { useState, type ReactNode } from "react";
import { Check, ChevronRight, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { eur, tot, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { AdendaDoc, ContratoDoc, FaturaDoc, NotaEncomendaDoc, PropostaDoc, totais, tranches } from "./DocsCliente";
import { COR_FASE } from "./planoObra";
import { FASES_OBRA } from "./fasesObra";
import { rotuloDia } from "./preparacaoObra";
import { totalComIva } from "./adendas";

const ETAPAS = ["Proposta", "Contrato", "Materiais", "Obra"] as const;

function etapa(d: Negocio): number {
  const o = d.orc, p = d.obra.plano;
  if (p?.estado === "em curso" || p?.estado === "concluída") return 3;
  if (o?.contrato === "assinado" || (o?.vendaDireta && o.aceite)) return 2;
  if (o?.aceite) return 1;
  return 0;
}

function Botao({ children, onClick, ghost }: { children: ReactNode; onClick: () => void; ghost?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={cn("min-h-12 w-full rounded-xl px-4 text-[15px] font-semibold transition-colors", ghost ? "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50" : "bg-slate-900 text-white hover:bg-slate-800")}>
      {children}
    </button>
  );
}

export function PortalCliente({ ctx, d, fechar }: { ctx: Ctx; d: Negocio; fechar: () => void }) {
  const { S, A, run } = ctx;
  const [doc, setDoc] = useState<string | null>(null);
  const [alterar, setAlterar] = useState(false);
  const [texto, setTexto] = useState("");
  const [ref, setRef] = useState("");
  const o = d.orc, p = d.obra.plano, e = etapa(d), nome = d.nome.split(" ")[0];
  const T = d.orc ? totais(d, S) : null;
  const fazer = (fn: () => void) => run(fn);

  // o que espera pelo cliente
  const pendentes: { id: string; t: string; sub: string; corpo: ReactNode }[] = [];
  if (o?.enviada && !o.aceite)
    pendentes.push({
      id: "prop", t: "A sua proposta", sub: `${eur(T!.total)} € com IVA · ${d.servico}`,
      corpo: alterar ? (
        <div className="space-y-2">
          <textarea value={texto} onChange={(ev) => setTexto(ev.target.value)} rows={3} placeholder="O que gostava de mudar?" className="w-full rounded-xl border border-slate-300 p-3 text-[15px] outline-none focus:border-slate-900" />
          <Botao onClick={() => { fazer(() => A.pedirAlteracoes(d.id, texto)); setAlterar(false); setTexto(""); }}>Enviar o pedido</Botao>
          <Botao ghost onClick={() => setAlterar(false)}>Cancelar</Botao>
        </div>
      ) : (
        <div className="space-y-2">
          <Botao onClick={() => setDoc("proposta")} ghost>Ver a proposta</Botao>
          <Botao onClick={() => fazer(() => A.aceitar(d.id))}>Aceitar a proposta</Botao>
          <button type="button" onClick={() => setAlterar(true)} className="min-h-11 w-full text-[15px] font-medium text-slate-600 underline-offset-4 hover:underline">Gostava de mudar alguma coisa</button>
        </div>
      ),
    });
  if (o?.contrato === "enviado")
    pendentes.push({ id: "ct", t: "Assinar o contrato", sub: `CT 2026/${d.id} · segue a proposta que aceitou`, corpo: <div className="space-y-2"><Botao ghost onClick={() => setDoc("contrato")}>Ler o contrato</Botao><Botao onClick={() => fazer(() => A.assinar(d.id))}>Assinar</Botao></div> });
  for (const a of d.adendas ?? []) if (a.estado === "enviada")
    pendentes.push({ id: a.n, t: "Assinar a adenda", sub: `${a.linhas.map((x) => x.n).join(", ")} · +${eur(totalComIva(a.linhas))} € com IVA`, corpo: <div className="space-y-2"><Botao ghost onClick={() => setDoc(a.n)}>Ler a adenda</Botao><Botao onClick={() => fazer(() => A.assinarAdenda(d.id, a.n))}>Assinar</Botao></div> });
  if (d.fin.fatura && !d.fin.pago) {
    const t0 = tranches(d, T!.total)[0];
    pendentes.push({
      id: "pag", t: `Pagar a fatura ${d.fin.fatura.n}`, sub: `${t0.l}: ${eur(t0.v)} € · por transferência`,
      corpo: d.f.comprovativo
        ? <p className="flex items-center gap-2 text-[15px] text-emerald-700"><Check className="h-4 w-4" aria-hidden="true" />Comprovativo enviado ({d.f.comprovativo}). Estamos a confirmar.</p>
        : <div className="space-y-2">
            <input value={ref} onChange={(ev) => setRef(ev.target.value)} placeholder="Referência da transferência" className="h-12 w-full rounded-xl border border-slate-300 px-3 text-[15px] outline-none focus:border-slate-900" />
            <Botao onClick={() => fazer(() => A.avisarPagamento(d.id, ref))}>Já paguei</Botao>
          </div>,
    });
  }

  const docs: [string, string, boolean][] = [
    ["proposta", `Proposta PR 2026/${d.id}`, !!o?.enviada],
    ["contrato", `Contrato CT 2026/${d.id}`, !!o?.contrato],
    ["encomenda", d.obra.ec ? `Nota de encomenda ${d.obra.ec.n}` : "", !!d.obra.ec && d.obra.ec.estado === "aprovada"],
    ...(d.adendas ?? []).map((a) => [a.n, `Adenda ${a.n}`, true] as [string, string, boolean]),
    ["fatura", d.fin.fatura ? `Fatura ${d.fin.fatura.n}` : "", !!d.fin.fatura],
  ];
  const corpoDoc = (k: string) => k === "proposta" ? <PropostaDoc S={S} d={d} /> : k === "contrato" ? <ContratoDoc S={S} d={d} /> : k === "encomenda" ? <NotaEncomendaDoc d={d} /> : k === "fatura" ? <FaturaDoc S={S} d={d} /> : (() => { const a = d.adendas?.find((x) => x.n === k); return a ? <AdendaDoc d={d} a={a} /> : null; })();
  const fases = p?.origem === "orcamento" ? [...new Set(p.tasks.map((t) => t.fase ?? 0))].filter(Boolean).sort() : [];

  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-slate-100 text-slate-900 animate-in fade-in-0 duration-200" role="dialog" aria-modal="true" aria-label={`Portal do cliente: ${d.nome}`}>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur">
        <p className="text-sm text-slate-600">Portal do cliente · como {nome} vê</p>
        <button type="button" onClick={doc ? () => setDoc(null) : fechar} aria-label={doc ? "Voltar ao portal" : "Fechar o portal"} className="grid h-11 w-11 place-items-center rounded-lg hover:bg-slate-200"><X className="h-5 w-5" /></button>
      </div>
      {doc ? (
        <div className="px-3 py-6 sm:py-10 animate-in fade-in-0 slide-in-from-right-3 duration-200">{corpoDoc(doc)}</div>
      ) : (
        <div className="mx-auto w-full max-w-md space-y-5 px-4 py-6">
          <header>
            <p className="text-sm font-semibold tracking-wide text-slate-500">MUDELAR</p>
            <h1 className="mt-1 text-2xl font-semibold">Olá, {nome}</h1>
            <p className="text-[15px] text-slate-600">{d.servico} · {d.f.morada || d.local}</p>
          </header>
          {/* em que ponto está */}
          <ol className="grid grid-cols-4 gap-1.5" aria-label="Em que ponto está">
            {ETAPAS.map((t, i) => (
              <li key={t} aria-current={i === e ? "step" : undefined}>
                <span className={cn("block h-1.5 rounded-full transition-colors duration-500", i < e ? "bg-slate-900" : i === e ? "bg-slate-900/50" : "bg-slate-300")} />
                <span className={cn("mt-1 block text-xs", i === e ? "font-semibold" : "text-slate-500")}>{t}</span>
              </li>
            ))}
          </ol>

          {pendentes.length > 0 ? (
            <section aria-label="O que precisa de si" className="space-y-3">
              <h2 className="text-base font-semibold">O que precisa de si</h2>
              {pendentes.map((x) => (
                <div key={x.id} className="rounded-2xl bg-white p-4 shadow-sm animate-in fade-in-0 slide-in-from-bottom-1 duration-300">
                  <p className="text-[15px] font-semibold">{x.t}</p>
                  <p className="mb-3 text-sm text-slate-600">{x.sub}</p>
                  {x.corpo}
                </div>
              ))}
            </section>
          ) : (
            <p className="flex items-center gap-2 rounded-2xl bg-white p-4 text-[15px] shadow-sm"><Check className="h-5 w-5 text-emerald-600" aria-hidden="true" />Não precisa de fazer nada. Avisamos aqui quando houver novidades.</p>
          )}

          {/* a obra */}
          {p && (o?.contrato === "assinado" || o?.vendaDireta) && (
            <section aria-label="A sua obra" className="rounded-2xl bg-white p-4 shadow-sm">
              <h2 className="text-base font-semibold">A sua obra</h2>
              <p className="text-sm text-slate-600">
                {p.estado === "concluída" ? "Concluída." : p.estado === "em curso" ? "Em curso." : p.origem === "orcamento" ? `Começa a ${rotuloDia(p, 0)} e acaba a ${rotuloDia(p, Math.max(...p.tasks.map((t) => t.dia + t.dur - 1)))}.` : "As datas confirmam-se em breve."}
              </p>
              {fases.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {fases.map((f) => {
                    const ts = p.tasks.filter((t) => t.fase === f), i0 = Math.min(...ts.map((t) => t.dia)), i1 = Math.max(...ts.map((t) => t.dia + t.dur - 1));
                    return (
                      <li key={f} className="flex items-start gap-3 text-[15px]">
                        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COR_FASE[f] }} aria-hidden="true" />
                        <span>{FASES_OBRA[f - 1].curto}<span className="block text-sm text-slate-500">{rotuloDia(p, i0)}{i1 > i0 ? ` a ${rotuloDia(p, i1)}` : ""}</span></span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {d.obra.ec?.estado === "aprovada" && (
                <p className="mt-3 text-sm text-slate-600">Materiais: {d.obra.enc && d.obra.enc.estado !== "recebida" ? (d.obra.enc.entrega ? `chegam a ${d.obra.enc.entrega}.` : "encomendados.") : "todos prontos para a obra."}</p>
              )}
            </section>
          )}

          {/* os documentos */}
          <section aria-label="Documentos" className="rounded-2xl bg-white p-2 shadow-sm">
            <h2 className="px-2 pt-2 text-base font-semibold">Documentos</h2>
            <ul>
              {docs.filter(([, t, ok]) => t && ok).map(([k, t]) => (
                <li key={k}>
                  <button type="button" onClick={() => setDoc(k)} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left text-[15px] hover:bg-slate-50">
                    <FileText className="h-4 w-4 text-slate-500" aria-hidden="true" /><span className="flex-1">{t}</span><ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <p className="text-center text-xs text-slate-500">Protótipo: o portal real abre por um link pessoal. Total da obra {eur(tot(d, S).pf)} € sem IVA.</p>
        </div>
      )}
    </div>
  );
}
