// Trabalhos a mais (14/10/2026): depois do contrato assinado, a mudança faz-se com uma adenda (adendas.ts).
// Um cartão discreto no negócio: as adendas feitas (estado, total, dias, o documento) e "Nova adenda", que abre
// a escolha dos serviços com a quantidade, o motivo e as contas ao vivo (+ € e + dias). Enviada, o cliente assina
// no portal (aqui, simulado); assinada, as tarefas entram no plano da obra e o valor junta-se ao do contrato.
// 21/10: a pré-visualização tem o preço que o cliente recebe; a quantidade escreve-se; o comercial retira a adenda
// enviada ou refaz a que o cliente não aceitou (com o porquê dele à vista).
import { useMemo, useState } from "react";
import { Check, Minus, Plus, Trash2, FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CATALOGO_TODO } from "./catalogo";
import { eur, r2, servicoDoCatalogo, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { SeletorPesquisa } from "./pecasFicha";
import { AdendaDoc, Partilhar } from "./DocsCliente";
import { MOTIVOS_ADENDA, diasAdenda, previsaoLinha, totalAdenda, totalComIva, valorContrato, type Adenda, type LinhaAdenda } from "./adendas";

const ESTADO: Record<Adenda["estado"], [string, string]> = {
  enviada: ["à espera do cliente", "bg-warning/15"], assinada: ["assinada", "bg-success/15"],
  recusada: ["o cliente não aceitou", "bg-destructive/10"], anulada: ["retirada", "bg-muted text-muted-foreground"],
};

export function TrabalhosAMais(ctx: Ctx & { d: Negocio }) {
  const { S, A, d, go, run } = ctx;
  const [novo, setNovo] = useState(false);
  const [itens, setItens] = useState<{ sid: string; q: number }[]>([]);
  const [motivo, setMotivo] = useState<string>(MOTIVOS_ADENDA[0]);
  const [ver, setVer] = useState<string | null>(null);
  const L = d.adendas ?? [];
  const V = valorContrato(d, S);
  const assinado = d.orc?.contrato === "assinado" || (d.orc?.vendaDireta && !!d.orc.aceite);
  // os serviços: os em uso primeiro, depois o Catálogo inteiro
  const opcoes = useMemo(() => {
    const vistos = new Set<string>();
    const out: { v: string; t: string; sub: string; valor: string }[] = [];
    for (const [sid, s] of Object.entries(S.svc)) { vistos.add(sid); out.push({ v: sid, t: s.n, sub: s.perfil, valor: `${eur(s.preco)} €/${s.un}` }); }
    for (const c of CATALOGO_TODO) if (!vistos.has(c.id)) { const s = servicoDoCatalogo(c.id); out.push({ v: c.id, t: c.n, sub: c.cat, valor: s ? `${eur(s.preco)} €/${s.un}` : c.un }); }
    return out;
  }, [S.svc]);
  if (!assinado || d.obra.plano?.estado === "concluída") return null;
  // a pré-visualização das contas, sem mexer no estado: o mesmo preço e as mesmas horas que a adenda leva ao cliente
  const linhas: LinhaAdenda[] = itens.flatMap((x) => { const l = previsaoLinha(S, x.sid, x.q); return l ? [l] : []; });
  const fechar = () => { setNovo(false); setItens([]); setMotivo(MOTIVOS_ADENDA[0]); };
  const mudarQ = (sid: string, q: number) => setItens((I) => I.map((y) => (y.sid === sid ? { ...y, q: Math.max(0, r2(q)) } : y)));
  /** Refazer a que o cliente não aceitou: os mesmos trabalhos e o mesmo motivo, para mudar o que ele pediu. */
  const refazer = (a: Adenda) => { setItens(a.linhas.map((x) => ({ sid: x.sid, q: x.q }))); setMotivo(a.motivo); setNovo(true); setVer(null); };
  const valida = linhas.length > 0 && linhas.every((x) => x.q > 0);

  return (
    <section aria-labelledby={`tam-${d.id}`} className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)] sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id={`tam-${d.id}`} className="text-lg font-semibold">Trabalhos a mais</h2>
          <p className="text-[15px] text-muted-foreground">Com o contrato assinado, o que muda vai numa adenda que o cliente assina. Assinada, junta-se ao contrato e entra no plano da obra.</p>
          {V.adendas > 0 && <p className="mt-1 text-[15px] tabular-nums">Valor do contrato: <b className="font-semibold">{eur(V.total)} €</b> <span className="text-muted-foreground">com IVA ({eur(V.contrato)} € + {eur(V.adendas)} € em adendas)</span></p>}
        </div>
        {!novo && <Button variant="outline" className="min-h-11" onClick={() => setNovo(true)}><FilePlus2 className="mr-1.5 h-4 w-4" aria-hidden="true" />Nova adenda</Button>}
      </div>

      {L.length > 0 && (
        <ul className="mt-4 space-y-3">
          {L.map((a) => (
            <li key={a.n} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold">{a.n} · {a.linhas.map((x) => x.n).join(", ")}</p>
                  <p className="text-sm tabular-nums text-muted-foreground">+{eur(totalAdenda(a.linhas))} € sem IVA · +{diasAdenda(a.linhas)} {diasAdenda(a.linhas) === 1 ? "dia" : "dias"} · {a.motivo.toLowerCase()}</p>
                </div>
                <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-sm font-medium", ESTADO[a.estado][1])}>{ESTADO[a.estado][0]}</span>
              </div>
              {a.origem && <p className="mt-1 text-sm text-muted-foreground">Imprevisto na obra: {a.origem.texto}</p>}
              {/* 21/10: a fatura própria da adenda, emitida pelo Financeiro depois da assinatura, e o pagamento no portal */}
              {a.estado === "assinada" && (
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[15px]">
                  <span className="text-muted-foreground">Fatura: {a.recibo ? `${a.fatura!.n}, paga (${a.recibo.n})` : a.fatura ? `${a.fatura.n}, ${a.pag?.comprovativo ? `o cliente avisou: ${a.pag.comprovativo}` : "por pagar no portal"}` : "por emitir"}</span>
                  {!a.fatura && S.role === "financeiro" && <Button size="sm" className="min-h-10" onClick={go(() => A.faturarAdendas(d.id))}>Emitir a fatura</Button>}
                  {a.fatura && !a.recibo && a.pag?.comprovativo && S.role === "financeiro" && <Button size="sm" className="min-h-10" onClick={go(() => A.validarPagamentosAdenda(d.id))}>Validar o pagamento</Button>}
                </div>
              )}
              {a.estado === "recusada" && <p className="mt-2 text-[15px]">{a.recusa ? <>«{a.recusa}»</> : "Sem motivo."} <span className="text-sm text-muted-foreground">· {a.recusada}</span></p>}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {a.estado === "enviada" && <Button size="sm" variant="outline" className="min-h-10" onClick={go(() => A.simularAdenda(d.id, a.n))}>Simular: o cliente assina</Button>}
                {a.estado === "recusada" && !novo && <Button size="sm" variant="outline" className="min-h-10" onClick={() => refazer(a)}>Refazer a adenda</Button>}
                <button type="button" onClick={() => setVer(ver === a.n ? null : a.n)} aria-expanded={ver === a.n} className="inline-flex min-h-10 items-center text-sm font-medium text-primary underline-offset-4 hover:underline">{ver === a.n ? "Fechar o documento" : "Ver o documento"}</button>
                {a.estado === "enviada" && <button type="button" onClick={go(() => A.anularAdenda(d.id, a.n))} className="inline-flex min-h-10 items-center text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">Retirar do portal</button>}
              </div>
              {ver === a.n && <div className="mt-3 animate-in fade-in-0 duration-200"><Partilhar ctx={ctx} d={d} tipo="adenda" estado={a.estado === "enviada" ? "à espera da assinatura" : ESTADO[a.estado][0]}><AdendaDoc S={S} d={d} a={a} /></Partilhar></div>}
            </li>
          ))}
        </ul>
      )}

      {novo && (
        <div className="mt-4 space-y-4 rounded-xl border border-border p-4 animate-in fade-in-0 slide-in-from-top-1 duration-200">
          <fieldset>
            <legend className="text-[15px] font-medium">Porquê?</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {MOTIVOS_ADENDA.map((m) => (
                <button key={m} type="button" aria-pressed={motivo === m} onClick={() => setMotivo(m)}
                  className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-[15px] transition-colors", motivo === m ? "border-primary bg-primary text-primary-foreground" : "border-input hover:border-foreground/40")}>
                  {motivo === m && <Check className="h-4 w-4" aria-hidden="true" />}{m}
                </button>
              ))}
            </div>
          </fieldset>
          <div>
            <p className="text-[15px] font-medium">Que trabalhos?</p>
            {linhas.length > 0 && (
              <ul className="mt-2 divide-y divide-border">
                {linhas.map((x) => (
                  <li key={x.sid} className="flex flex-wrap items-center justify-between gap-3 py-2.5 animate-in fade-in-0 slide-in-from-top-1 duration-200">
                    <span className="min-w-0 flex-1 text-[15px]">{x.n}<span className="block text-sm tabular-nums text-muted-foreground">{eur(x.pu)} €/{x.un} = {eur(x.q * x.pu)} €</span></span>
                    <span className="inline-flex items-center rounded-lg border border-input bg-card p-0.5" role="group" aria-label={`Quantidade de ${x.n}`}>
                      <button type="button" aria-label="Menos" disabled={x.q <= 1} onClick={() => mudarQ(x.sid, Math.max(1, x.q - 1))} className="grid h-10 w-10 place-items-center rounded-lg hover:bg-muted disabled:opacity-40"><Minus className="h-4 w-4" /></button>
                      {/* 21/10: a quantidade também se escreve (20 m² não são 20 toques) */}
                      <label className="flex items-baseline gap-1 px-1"><span className="sr-only">Quantidade de {x.n} ({x.un})</span>
                        <input type="number" inputMode="decimal" min={0} step="any" value={x.q || ""} onChange={(e) => mudarQ(x.sid, Number(e.target.value.replace(",", ".")) || 0)}
                          className="w-14 bg-transparent text-center tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
                        <span className="text-sm text-muted-foreground">{x.un}</span></label>
                      <button type="button" aria-label="Mais" onClick={() => mudarQ(x.sid, x.q + 1)} className="grid h-10 w-10 place-items-center rounded-lg hover:bg-muted"><Plus className="h-4 w-4" /></button>
                    </span>
                    <button type="button" aria-label={`Tirar ${x.n}`} onClick={() => setItens((I) => I.filter((y) => y.sid !== x.sid))} className="grid h-11 w-11 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"><Trash2 className="h-4 w-4" /></button>
                  </li>
                ))}
              </ul>
            )}
            <SeletorPesquisa rotulo="Juntar um trabalho" placeholder="Serviço do Catálogo" max={12}
              opcoes={opcoes.filter((o) => !itens.some((x) => x.sid === o.v))}
              onEscolher={(v) => setItens((I) => [...I, { sid: v, q: 1 }])}
              className="mt-1" gatilho={<span className="inline-flex items-center gap-1.5 px-1 font-medium text-primary"><Plus className="h-4 w-4" aria-hidden="true" />Juntar um trabalho</span>} />
          </div>
          {/* as contas ao vivo */}
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-muted/50 p-3 text-sm">
            <div><p className="text-muted-foreground">Sem IVA</p><p className="text-[15px] font-semibold tabular-nums">+{eur(totalAdenda(linhas))} €</p></div>
            <div><p className="text-muted-foreground">Com IVA (6%)</p><p className="text-[15px] font-semibold tabular-nums">+{eur(totalComIva(linhas))} €</p></div>
            <div><p className="text-muted-foreground">Prazo</p><p className="text-[15px] font-semibold tabular-nums">+{diasAdenda(linhas)} {diasAdenda(linhas) === 1 ? "dia" : "dias"}</p></div>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="ghost" size="lg" onClick={fechar}>Cancelar</Button>
            <Button size="lg" disabled={!valida} onClick={() => { run(() => A.criarAdenda(d.id, itens, motivo)); fechar(); }}>Enviar ao cliente para assinar</Button>
          </div>
        </div>
      )}
    </section>
  );
}
