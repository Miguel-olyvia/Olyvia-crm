// O portal do cliente (14/10/2026; percurso guiado a 15/10): o que o cliente vê no link pessoal, no telemóvel ou no computador.
// Um percurso com o próximo passo sempre à vista: Rever a proposta → Aceitar → Assinar o contrato → Acompanhar a obra.
// · Proposta por aceitar: a proposta inteira (o mesmo documento), com "Aceitar a proposta" sempre à mão em baixo.
// · Aceite: é o comercial que gera o contrato (decisão do Ruben, 15/10); até lá, "O contrato está a ser preparado", sem botão.
// · Contrato gerado: aparece no mesmo link, por assinar, com o contrato à vista.
// · Assinado: o mesmo link mostra o plano da obra (fases e datas, sem custos nem margens).
// As ações são as do motor, por isso o negócio no protótipo passa de fase como hoje (e o outro separador vê-o pelo storage).
import { useState, type ReactNode } from "react";
import { Armchair, Check, ChevronRight, Clock, FileText, Grid3x3, Hammer, PenLine, Plug, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { eur, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { AdendaDoc, ContratoDoc, FaturaDoc, NotaEncomendaDoc, PropostaDoc, totais, tranches } from "./DocsCliente";
import { COR_FASE } from "./planoObra";
import { FASES_OBRA, type FaseObra } from "./fasesObra";
import { rotuloDia } from "./preparacaoObra";
import { totalComIva } from "./adendas";

/** Os passos do percurso, pela ordem. */
export const PASSOS_PORTAL = ["Rever a proposta", "Aceitar", "Assinar o contrato", "Acompanhar a obra"] as const;
const CURTO = ["Proposta", "Aceitar", "Contrato", "Obra"];

/** Em que passo está o cliente: 0 rever/aceitar, 2 contrato (a preparar ou por assinar), 3 obra. */
export function passoPortal(d: Negocio): { i: number; estado: "rever" | "preparar" | "assinar" | "obra" | "sem" } {
  const o = d.orc;
  if (!o?.enviada) return { i: 0, estado: "sem" };
  if (!o.aceite) return { i: 0, estado: "rever" };
  if (o.vendaDireta || o.contrato === "assinado") return { i: 3, estado: "obra" };
  if (o.contrato === "enviado") return { i: 2, estado: "assinar" };
  return { i: 2, estado: "preparar" };
}

const ICONE_FASE: Record<number, LucideIcon> = { 1: Hammer, 2: Plug, 3: Grid3x3, 4: Armchair };

function Botao({ children, onClick, ghost }: { children: ReactNode; onClick: () => void; ghost?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={cn("min-h-12 w-full rounded-xl px-4 text-[15px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2",
        ghost ? "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50" : "bg-slate-900 text-white hover:bg-slate-800")}>
      {children}
    </button>
  );
}

export function PortalCliente({ ctx, d, fechar }: { ctx: Ctx; d: Negocio; fechar: () => void }) {
  const { S, A, run } = ctx;
  const [doc, setDoc] = useState<string | null>(null);
  const [alterar, setAlterar] = useState(false);
  const [confirmar, setConfirmar] = useState<"aceitar" | "assinar" | null>(null);
  const [texto, setTexto] = useState("");
  const [ref, setRef] = useState("");
  const [verProposta, setVerProposta] = useState(false);
  const o = d.orc, p = d.obra.plano, nome = d.nome.split(" ")[0];
  const T = o ? totais(d, S) : null;
  const P = passoPortal(d);
  const topo = () => { try { document.querySelector('[aria-label^="Portal do cliente"]')?.scrollTo({ top: 0, behavior: "smooth" }); } catch { /* sem scroll */ } };
  const fazer = (fn: () => void) => { setConfirmar(null); run(fn); topo(); };

  // o que mais espera pelo cliente, depois do contrato: adendas e o pagamento
  const outros: { id: string; t: string; sub: string; corpo: ReactNode }[] = [];
  for (const a of d.adendas ?? []) if (a.estado === "enviada")
    outros.push({ id: a.n, t: "Assinar a adenda", sub: `${a.linhas.map((x) => x.n).join(", ")} · +${eur(totalComIva(a.linhas))} € com IVA`, corpo: <div className="space-y-2"><Botao ghost onClick={() => setDoc(a.n)}>Ler a adenda</Botao><Botao onClick={() => fazer(() => A.assinarAdenda(d.id, a.n))}>Assinar</Botao></div> });
  if (d.fin.fatura && !d.fin.pago && T) {
    const t0 = tranches(d, T.total)[0];
    outros.push({
      id: "pag", t: `Pagar a fatura ${d.fin.fatura.n}`, sub: `${t0.l}: ${eur(t0.v)} € · por transferência`,
      corpo: d.f.comprovativo
        ? <p className="flex items-center gap-2 text-[15px] text-emerald-700"><Check className="h-4 w-4" aria-hidden="true" />Comprovativo enviado ({d.f.comprovativo}). Estamos a confirmar.</p>
        : <div className="space-y-2">
            <input value={ref} onChange={(ev) => setRef(ev.target.value)} placeholder="Referência da transferência" aria-label="Referência da transferência" className="h-12 w-full rounded-xl border border-slate-300 px-3 text-[15px] outline-none focus:border-slate-900" />
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

  /* ---------------------------------------------- o plano da obra, como o cliente o vê (sem custos) */
  const fasesObra = p?.origem === "orcamento"
    ? ([...new Set(p.tasks.map((t) => t.fase ?? 0))].filter(Boolean).sort() as FaseObra[]).map((f) => {
        const ts = p.tasks.filter((t) => t.fase === f), i0 = Math.min(...ts.map((t) => t.dia)), i1 = Math.max(...ts.map((t) => t.dia + t.dur - 1));
        const estado = p.estado === "concluída" || (p.estado === "em curso" && p.dia > i1) ? "feita" : p.estado === "em curso" && p.dia >= i0 ? "agora" : "depois";
        return { f, ts, i0, i1, estado };
      })
    : [];

  /* ---------------------------------------------- o cartão do passo de agora (um só primário, na barra de baixo) */
  let agora: ReactNode = null;
  if (P.estado === "rever" && o && T) {
    agora = alterar ? (
      <div className="space-y-2">
        <p className="text-[15px] font-semibold">O que gostava de mudar?</p>
        <textarea value={texto} onChange={(ev) => setTexto(ev.target.value)} rows={3} aria-label="O que gostava de mudar" placeholder="Ex.: outra cor de azulejo, começar mais tarde…" className="w-full rounded-xl border border-slate-300 p-3 text-[15px] outline-none focus:border-slate-900" />
        <Botao onClick={() => { fazer(() => A.pedirAlteracoes(d.id, texto)); setAlterar(false); setTexto(""); }}>Enviar o pedido</Botao>
        <Botao ghost onClick={() => setAlterar(false)}>Cancelar</Botao>
      </div>
    ) : (
      <>
        <p className="text-sm font-medium text-slate-500">Passo 1 de 4</p>
        <h2 className="mt-0.5 text-xl font-semibold">Reveja a sua proposta</h2>
        <p className="mt-1 text-[15px] text-slate-600">Está toda aqui em baixo: o que vamos fazer, fase a fase, os materiais, o preço e as condições.</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-200 pt-4">
          <div><dt className="text-xs uppercase tracking-[0.12em] text-slate-500">Total, com IVA</dt><dd className="text-lg font-semibold tabular-nums">{eur(T.total)} €</dd></div>
          <div><dt className="text-xs uppercase tracking-[0.12em] text-slate-500">Prazo</dt><dd className="text-lg font-semibold tabular-nums">{d.f.prazo_exec ? `${d.f.prazo_exec} dias úteis` : "a combinar"}</dd></div>
        </dl>
      </>
    );
  } else if (P.estado === "preparar") {
    agora = (
      <>
        <p className="flex items-center gap-2 text-[15px] font-semibold text-emerald-700"><Check className="h-5 w-5" aria-hidden="true" />Proposta aceite</p>
        <h2 className="mt-2 text-xl font-semibold">O contrato está a ser preparado</h2>
        <p className="mt-1 text-[15px] text-slate-600">Segue a proposta que aceitou. Quando estiver pronto, aparece aqui, neste mesmo link, para assinar. Não precisa de fazer nada agora.</p>
        <p className="mt-3 flex items-center gap-2 text-sm text-slate-500"><Clock className="h-4 w-4" aria-hidden="true" />Normalmente fica pronto no mesmo dia.</p>
      </>
    );
  } else if (P.estado === "assinar") {
    agora = (
      <>
        <p className="text-sm font-medium text-slate-500">Passo 3 de 4</p>
        <h2 className="mt-0.5 text-xl font-semibold">Assinar o contrato</h2>
        <p className="mt-1 text-[15px] text-slate-600">O contrato CT 2026/{d.id} segue a proposta que aceitou. Leia-o aqui em baixo e assine quando estiver pronto.</p>
      </>
    );
  } else if (P.estado === "obra") {
    const ultimo = fasesObra.length ? Math.max(...fasesObra.map((x) => x.i1)) : 0;
    agora = (
      <>
        <p className="flex items-center gap-2 text-[15px] font-semibold text-emerald-700"><Check className="h-5 w-5" aria-hidden="true" />{o?.vendaDireta ? "Proposta aceite" : "Contrato assinado"}</p>
        <h2 className="mt-2 text-xl font-semibold">A sua obra</h2>
        <p className="mt-1 text-[15px] text-slate-600">
          {p?.estado === "concluída" ? "Concluída. Obrigado pela confiança."
            : p?.estado === "em curso" ? "Em curso. Aqui vê em que fase está."
            : p && p.origem === "orcamento" && fasesObra.length ? `Começa a ${rotuloDia(p, 0)} e acaba a ${rotuloDia(p, ultimo)}.`
            : "As datas confirmam-se em breve; avisamos aqui."}
        </p>
      </>
    );
  }

  /* ---------------------------------------------- a barra fixa em baixo: o próximo passo sempre à mão */
  const barra = P.estado === "rever" && !alterar ? (
    confirmar === "aceitar" ? (
      <div className="space-y-2">
        <p className="text-[15px]">Aceitar a proposta PR 2026/{d.id}, de <b className="tabular-nums">{T ? eur(T.total) : ""} €</b> com IVA?</p>
        <div className="grid grid-cols-2 gap-2"><Botao ghost onClick={() => setConfirmar(null)}>Voltar</Botao><Botao onClick={() => fazer(() => A.aceitar(d.id))}>Aceitar</Botao></div>
      </div>
    ) : (
      <div className="flex flex-col gap-1 sm:flex-row-reverse sm:items-center sm:gap-3">
        <div className="sm:w-64"><Botao onClick={() => setConfirmar("aceitar")}>Aceitar a proposta</Botao></div>
        <button type="button" onClick={() => setAlterar(true)} className="min-h-11 text-[15px] font-medium text-slate-600 underline-offset-4 hover:underline sm:mr-auto">Gostava de mudar alguma coisa</button>
      </div>
    )
  ) : P.estado === "assinar" ? (
    confirmar === "assinar" ? (
      <div className="space-y-2">
        <p className="text-[15px]">Assinar digitalmente o contrato CT 2026/{d.id}? Fica com uma cópia aqui, em Documentos.</p>
        <div className="grid grid-cols-2 gap-2"><Botao ghost onClick={() => setConfirmar(null)}>Voltar</Botao><Botao onClick={() => fazer(() => A.assinar(d.id))}>Assinar</Botao></div>
      </div>
    ) : (
      <div className="sm:ml-auto sm:w-64"><Botao onClick={() => setConfirmar("assinar")}><span className="inline-flex items-center gap-2"><PenLine className="h-4 w-4" aria-hidden="true" />Assinar o contrato</span></Botao></div>
    )
  ) : null;

  return (
    <div className="fixed inset-0 z-[90] overflow-y-auto bg-slate-100 text-slate-900 animate-in fade-in-0 duration-200" role="dialog" aria-modal="true" aria-label={`Portal do cliente: ${d.nome}`}>
      <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/90 px-4 py-2 backdrop-blur">
        <p className="text-sm font-semibold tracking-[0.18em] text-slate-900">MUDELAR</p>
        <button type="button" onClick={doc ? () => setDoc(null) : fechar} aria-label={doc ? "Voltar ao portal" : "Fechar o portal"} className="grid h-11 w-11 place-items-center rounded-lg hover:bg-slate-200"><X className="h-5 w-5" /></button>
      </div>
      {doc ? (
        <div className="px-3 py-6 sm:py-10 animate-in fade-in-0 slide-in-from-right-3 duration-200">{corpoDoc(doc)}</div>
      ) : (
        <div className={cn("mx-auto w-full max-w-3xl space-y-5 px-4 pt-6", barra ? "pb-44" : "pb-10")}>
          <header>
            <h1 className="text-2xl font-semibold">Olá, {nome}</h1>
            <p className="text-[15px] text-slate-600">{d.servico} · {d.f.morada || d.local}</p>
          </header>

          {/* o percurso: onde está e o que vem a seguir */}
          <ol className="grid grid-cols-4 gap-1.5" aria-label="O seu percurso">
            {PASSOS_PORTAL.map((t, i) => {
              const feito = i < P.i || (P.estado === "obra" && i === 3 && p?.estado === "concluída");
              const aqui = i === P.i && !feito;
              return (
                <li key={t} aria-current={aqui ? "step" : undefined}>
                  <span className={cn("block h-1.5 rounded-full transition-colors duration-500", feito ? "bg-slate-900" : aqui ? "bg-[#5a36bf]" : "bg-slate-300")} aria-hidden="true" />
                  <span className={cn("mt-1.5 flex items-center gap-1 text-xs sm:text-sm", aqui ? "font-semibold text-slate-900" : feito ? "text-slate-700" : "text-slate-500")}>
                    {feito && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
                    <span className="sm:hidden" aria-hidden="true">{CURTO[i]}</span><span className="sr-only sm:not-sr-only">{t}</span>
                    {feito && <span className="sr-only"> (feito)</span>}
                  </span>
                </li>
              );
            })}
          </ol>

          {agora && <section aria-label="Agora" className="rounded-2xl bg-white p-5 shadow-sm animate-in fade-in-0 slide-in-from-bottom-1 duration-300">{agora}</section>}

          {/* o plano da obra (depois de assinar) */}
          {P.estado === "obra" && fasesObra.length > 0 && p && (
            <section aria-label="O plano da obra" className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold">O plano, fase a fase</h2>
              <ol className="mt-4">
                {fasesObra.map(({ f, ts, i0, i1, estado }, k) => {
                  const Ic = ICONE_FASE[f] ?? Hammer, ultima = k === fasesObra.length - 1;
                  return (
                    <li key={f} className="relative flex gap-3 pb-5 last:pb-0">
                      {!ultima && <span aria-hidden="true" className="absolute bottom-0 left-[17px] top-10 w-px bg-slate-200" />}
                      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", estado === "feita" && "bg-emerald-50 text-emerald-700")} style={estado === "feita" ? undefined : { background: `${COR_FASE[f]}1f`, color: COR_FASE[f] }} aria-hidden="true">
                        {estado === "feita" ? <Check className="h-[18px] w-[18px]" /> : <Ic className="h-[18px] w-[18px]" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[15px] font-semibold">{FASES_OBRA[f - 1].curto}</p>
                        <p className="text-sm tabular-nums text-slate-500">{rotuloDia(p, i0)}{i1 > i0 ? ` a ${rotuloDia(p, i1)}` : ""}</p>
                        {estado === "agora" && <p className="text-sm font-medium text-[#5a36bf]">A decorrer</p>}
                        {estado === "feita" && <p className="text-sm font-medium text-emerald-700">Feita</p>}
                        <p className="text-sm text-slate-600">{[...new Set(ts.map((t) => t.nome))].join(" · ")}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
              {d.obra.ec?.estado === "aprovada" && (
                <p className="mt-4 border-t border-slate-200 pt-3 text-sm text-slate-600">Materiais: {d.obra.enc && d.obra.enc.estado !== "recebida" ? (d.obra.enc.entrega ? `chegam a ${d.obra.enc.entrega}.` : "encomendados.") : "todos prontos para a obra."}</p>
              )}
            </section>
          )}

          {outros.length > 0 && (
            <section aria-label="O que precisa de si" className="space-y-3">
              <h2 className="text-base font-semibold">Também precisa de si</h2>
              {outros.map((x) => (
                <div key={x.id} className="rounded-2xl bg-white p-4 shadow-sm">
                  <p className="text-[15px] font-semibold">{x.t}</p>
                  <p className="mb-3 text-sm text-slate-600">{x.sub}</p>
                  {x.corpo}
                </div>
              ))}
            </section>
          )}

          {/* o documento do passo de agora, inteiro: a proposta para aceitar, o contrato para assinar */}
          {P.estado === "rever" && <div className="-mx-4 sm:mx-0" aria-label="A proposta" role="region"><PropostaDoc S={S} d={d} /></div>}
          {P.estado === "assinar" && <div className="-mx-4 sm:mx-0" aria-label="O contrato" role="region"><ContratoDoc S={S} d={d} /></div>}
          {P.estado === "preparar" && (
            verProposta
              ? <div className="-mx-4 sm:mx-0" aria-label="A proposta" role="region"><PropostaDoc S={S} d={d} /></div>
              : <Botao ghost onClick={() => setVerProposta(true)}>Ver a proposta que aceitou</Botao>
          )}
          {P.estado === "sem" && <p className="rounded-2xl bg-white p-4 text-[15px] shadow-sm">A sua proposta está a ser preparada. Avisamos aqui quando estiver pronta.</p>}

          {/* os documentos */}
          {docs.some(([, t, ok]) => t && ok) && (
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
          )}
        </div>
      )}

      {!doc && barra && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] pt-3 backdrop-blur" role="region" aria-label="Próximo passo">
          <div className="mx-auto w-full max-w-3xl">{barra}</div>
        </div>
      )}
    </div>
  );
}
