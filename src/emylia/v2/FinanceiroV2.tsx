// A fase Financeiro da V2 (13/10/2026): a Olyvia REGISTA as faturas emitidas no programa certificado (não as emite),
// uma por tranche do plano de pagamento do contrato, e valida o pagamento de cada uma (sai o recibo).
// O pagamento da tranche que dispara (DISPARO, em financeiro.ts) chama a ação do motor que põe a obra a andar (A.validar:
// Inventário + plano). Sem modais: tudo na própria página. Sem botão primário: o primário do passo é o "Continuar" da página.
import { useId, useState } from "react";
import { CheckCircle2, Circle, Clock, FileText, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FINANCEIRO } from "../campos";
import { eur, type Negocio } from "../motor";
import type { Ctx } from "../pecas";
import { DISPARO, dataPT, disparaObra, errosPagamento, errosRegisto, registarFatura, resumoFin, trancheDoDisparo, validarPagamento, valorTranche, type FaturaReg, type Tranche } from "./financeiro";
import { faturasDe, guardarFaturas, hojeISO, totalComIva, tranchesDe } from "./estadoV2";
import { BOTAO, CHIP, INPUT } from "./estilo";
import { SEM_PERM, podeNeg } from "../permissoes";
import { AdendasNoFinanceiro } from "../FinanceiroAdendas";
import { PAPEIS } from "../motor";
import { podeVerComo, quemFatura } from "../real/papeisReal";

const CONTAS = FINANCEIRO[2].campos.find((c) => c.k === "conta")?.op ?? ["Banco A · conta à ordem", "Banco B · conta obras"];

const ontemISO = () => { const t = new Date(); t.setDate(t.getDate() - 1); return t.toISOString().slice(0, 10); };

/** Escolher a data: Hoje, Ontem, ou outra no calendário. */
function EscolherData({ rotulo, valor, mudar }: { rotulo: string; valor: string; mudar: (v: string) => void }) {
  const id = useId(), hoje = hojeISO(), ontem = ontemISO();
  return (
    <fieldset>
      <legend className="text-[15px] font-medium">{rotulo}</legend>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" aria-pressed={valor === hoje} className={CHIP(valor === hoje)} onClick={() => mudar(hoje)}>Hoje</button>
        <button type="button" aria-pressed={valor === ontem} className={CHIP(valor === ontem)} onClick={() => mudar(ontem)}>Ontem</button>
        <label htmlFor={id} className="sr-only">{rotulo}: outra data</label>
        <input id={id} type="date" value={valor} onChange={(e) => mudar(e.target.value)} className={cn(INPUT, "w-auto")} />
      </div>
    </fieldset>
  );
}

function Erros({ erros }: { erros: string[] }) {
  if (!erros.length) return null;
  return <ul role="alert" className="mt-3 space-y-1 text-[15px]">{erros.map((e) => <li key={e} className="flex items-center gap-2"><Info className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />{e}</li>)}</ul>;
}

function FormPagamento({ ctx, d, f, fs, tranches, fechar, avisar }: { ctx: Ctx; d: Negocio; f: FaturaReg; fs: FaturaReg[]; tranches: Tranche[]; fechar: () => void; avisar: (m: string) => void }) {
  const { S, A, run } = ctx;
  const [data, setData] = useState(hojeISO());
  const [conta, setConta] = useState(d.f.conta || "");
  const [ref, setRef] = useState("");
  const [erros, setErros] = useState<string[]>([]);
  const idRef = useId();
  const confirmar = () => {
    // 19/10: só quem tem finance.validate_payment (o motor volta a verificar)
    if (!podeNeg(S.role, "finance.validate_payment")) { setErros([SEM_PERM["finance.validate_payment"].sub]); return; }
    const p = { data, conta, ref };
    const e = errosPagamento(p);
    setErros(e);
    if (e.length) return;
    let msg = "";
    run(() => {
      const pagas = fs.filter((x) => x.pagamento).reduce((a, x) => a + x.valor, 0) + f.valor;
      // se este pagamento dispara a obra (e ainda não disparou), é o motor que emite o recibo e põe a obra a andar
      const simulado = validarPagamento(fs, f.id, p, "?");
      if (!d.fin.recibo && disparaObra(tranches, simulado)) {
        Object.assign(d.f, { data_pag: data, conta, comprovativo: ref.trim(), valor_recebido: String(Math.round(pagas * 100) / 100) });
        if (!d.fin.fatura) d.fin.fatura = { n: f.numero, q: dataPT(f.data).slice(0, 5) };
        A.validar(d.id);
        if (!d.fin.recibo) { msg = "Faltam dados do pagamento no passo Pagamento."; return; }
        guardarFaturas(S, d.id, validarPagamento(fs, f.id, p, d.fin.recibo.n));
        msg = d.obra.ec
          ? `Pagamento validado · recibo ${d.fin.recibo.n}. A obra está a andar: encomenda ${d.obra.ec.n} no Inventário; falta aprovar o plano.`
          : `Pagamento validado · recibo ${d.fin.recibo.n}. A encomenda de cliente não chegou ao Inventário: emita-a no negócio.`;
      } else {
        const rc = A.reciboTranche(d.id, f.numero);
        if (!rc) return;
        guardarFaturas(S, d.id, validarPagamento(fs, f.id, p, rc));
        msg = `Pagamento validado · recibo ${rc}.`;
      }
    });
    if (!msg) return;
    avisar(msg);
    fechar();
  };
  return (
    <div className="mt-3 space-y-5 border-l-2 border-border pl-4">
      <EscolherData rotulo="Data do pagamento" valor={data} mudar={setData} />
      <fieldset>
        <legend className="text-[15px] font-medium">Conta de destino</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {CONTAS.map((c) => <button key={c} type="button" aria-pressed={conta === c} className={CHIP(conta === c)} onClick={() => setConta(c)}>{c}</button>)}
        </div>
      </fieldset>
      <div>
        <label htmlFor={idRef} className="text-[15px] font-medium">Referência ou comprovativo</label>
        <input id={idRef} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="TRF 1013-221" className={cn(INPUT, "mt-2 max-w-xs")} />
      </div>
      <Erros erros={erros} />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" className={BOTAO} onClick={confirmar}>Confirmar o pagamento de {eur(f.valor)} €</Button>
        <Button variant="ghost" className={BOTAO} onClick={fechar}>Cancelar</Button>
      </div>
    </div>
  );
}

function FormRegistar({ ctx, d, fs, tranches, total, avisar }: { ctx: Ctx; d: Negocio; fs: FaturaReg[]; tranches: Tranche[]; total: number; avisar: (m: string) => void }) {
  const { S, A, run } = ctx;
  const livres = tranches.filter((t) => !fs.some((f) => f.tranche === t.id));
  const [tranche, setTranche] = useState(livres[0]?.id ?? "");
  const [numero, setNumero] = useState("");
  const [data, setData] = useState(hojeISO());
  const [valor, setValor] = useState(livres[0] ? String(valorTranche(total, tranches, livres[0].id)) : "");
  const [pdf, setPdf] = useState("");
  const [erros, setErros] = useState<string[]>([]);
  const idNum = useId(), idValor = useId(), idPdf = useId();
  const escolher = (id: string) => { setTranche(id); setValor(String(valorTranche(total, tranches, id))); };
  const registar = () => {
    // 19/10: só quem tem finance.invoice (o motor volta a verificar)
    if (!podeNeg(S.role, "finance.invoice")) { setErros([SEM_PERM["finance.invoice"].sub]); return; }
    const n = { numero, data, valor: Number(valor.replace(",", ".")), tranche, pdf: pdf || undefined };
    const e = errosRegisto(n, fs, tranches);
    setErros(e);
    if (e.length) return;
    const t = tranches.find((x) => x.id === tranche)!;
    let ok = false;
    run(() => {
      ok = A.registarFatura(d.id, numero, dataPT(data), t.nome);
      if (ok) guardarFaturas(S, d.id, registarFatura(fs, n));
    });
    if (!ok) return;
    avisar(`Fatura ${numero.trim()} registada (${t.nome}).`);
    const prox = livres.find((x) => x.id !== tranche);
    setNumero(""); setPdf(""); setTranche(prox?.id ?? ""); setValor(prox ? String(valorTranche(total, tranches, prox.id)) : "");
  };
  return (
    <section aria-labelledby={`reg-${d.id}`}>
      <h3 id={`reg-${d.id}`} className="text-[17px] font-semibold tracking-tight">Registar fatura</h3>
      <p className="mt-1 text-[15px] text-muted-foreground">Emitida no programa certificado</p>
      <div className="mt-4 space-y-5">
        <fieldset>
          <legend className="text-[15px] font-medium">Tranche</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {livres.map((t) => (
              <button key={t.id} type="button" aria-pressed={tranche === t.id} className={CHIP(tranche === t.id)} onClick={() => escolher(t.id)}>
                {t.nome} · {eur(valorTranche(total, tranches, t.id))} €
              </button>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor={idNum} className="text-[15px] font-medium">Número da fatura</label>
            <input id={idNum} value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="FT 2026/419" className={cn(INPUT, "mt-2")} />
          </div>
          <div>
            <label htmlFor={idValor} className="text-[15px] font-medium">Valor com IVA (€)</label>
            <input id={idValor} inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} className={cn(INPUT, "mt-2 tabular-nums")} />
          </div>
        </div>
        <EscolherData rotulo="Data da fatura" valor={data} mudar={setData} />
        <div>
          <label htmlFor={idPdf} className="text-[15px] font-medium">PDF da fatura <span className="font-normal text-muted-foreground">(opcional)</span></label>
          <input id={idPdf} type="file" accept="application/pdf" onChange={(e) => setPdf(e.target.files?.[0]?.name ?? "")} className="mt-2 block min-h-11 text-[15px]" />
        </div>
        <Erros erros={erros} />
        <Button variant="outline" className={BOTAO} onClick={registar}><FileText aria-hidden="true" />Registar fatura</Button>
      </div>
    </section>
  );
}

export function FinanceiroV2(ctx: Ctx & { d: Negocio; compacto?: boolean }) {
  const { S, d, compacto } = ctx;
  // 19/10: registar faturas e validar pagamentos é do Financeiro (ou da Direção); os outros papéis só leem
  const podeValidar = podeNeg(S.role, "finance.validate_payment"), podeRegistar = podeNeg(S.role, "finance.invoice");
  const [aberta, setAberta] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");
  const tranches = tranchesDe(d), total = totalComIva(S, d), fs = faturasDe(S, d);
  const R = resumoFin(total, tranches, fs), disparo = trancheDoDisparo(tranches);
  const nomeT = (id: string) => tranches.find((t) => t.id === id)?.nome ?? id;
  return (
    <div className="max-w-2xl space-y-8">
      {!compacto && (
        <section aria-label="Valor" className="rounded-2xl border border-border bg-card p-5">
          <p className="text-[15px] text-muted-foreground">A faturar, com IVA</p>
          <p className="text-3xl font-semibold tabular-nums">{eur(total)} €</p>
          <p className="mt-1 text-[15px] text-muted-foreground">{d.f.pagamento || "Pagamento numa só vez"} · {eur(R.faturado)} € faturado · {eur(R.pago)} € pago</p>
        </section>
      )}
      <section aria-labelledby={`tr-${d.id}`}>
        <h3 id={`tr-${d.id}`} className="text-[17px] font-semibold tracking-tight">{compacto ? "Faturas e pagamentos" : "Tranches"}</h3>
        <ul className="mt-2 divide-y divide-border">
          {tranches.map((t) => {
            const f = fs.find((x) => x.tranche === t.id);
            const I = f?.pagamento ? CheckCircle2 : f ? Clock : Circle;
            const cor = f?.pagamento ? "text-success" : f ? "text-warning" : "text-muted-foreground";
            const estado = f?.pagamento ? `Paga a ${dataPT(f.pagamento.data)} · recibo ${f.recibo}`
              : f ? `Fatura ${f.numero} de ${dataPT(f.data)} · por pagar` : "Por faturar";
            return (
              <li key={t.id} className="py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <I className={cn("h-5 w-5 shrink-0", cor)} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium">{t.nome} · <span className="tabular-nums">{eur(valorTranche(total, tranches, t.id))} €</span></span>
                    <span className="block text-[15px] text-muted-foreground">
                      {estado}{f?.pdf ? ` · PDF ${f.pdf}` : ""}
                      {disparo?.id === t.id && !f?.pagamento && !d.fin.recibo ? " · ao ser paga, a obra arranca" : ""}
                    </span>
                  </span>
                  {f && !f.pagamento && aberta !== f.id && podeValidar && (
                    <Button variant="outline" className={BOTAO} onClick={() => setAberta(f.id)}>Validar pagamento</Button>
                  )}
                </div>
                {f && !f.pagamento && aberta === f.id && podeValidar && (
                  <FormPagamento ctx={ctx} d={d} f={f} fs={fs} tranches={tranches} fechar={() => setAberta(null)} avisar={setAviso} />
                )}
              </li>
            );
          })}
        </ul>
        <p aria-live="polite" className={cn("flex items-center gap-2 text-[15px]", aviso && "mt-2")}>
          {aviso && <><CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden="true" />{aviso}</>}
        </p>
      </section>

      {(!podeValidar || !podeRegistar) && !R.completo && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-muted-foreground">
          <Info className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          {quemFatura()} regista{quemFatura().includes(" ou ") ? "m" : ""} faturas e valida{quemFatura().includes(" ou ") ? "m" : ""} pagamentos.
          {podeVerComo("financeiro") && <button type="button" onClick={ctx.go(() => ctx.A.role("financeiro"))} className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline">Mudar para {PAPEIS.financeiro.nome}</button>}
        </p>
      )}
      {R.porFaturar.length > 0 && podeRegistar && <FormRegistar key={fs.length} ctx={ctx} d={d} fs={fs} tranches={tranches} total={total} avisar={setAviso} />}
      {R.completo && <p className="flex items-center gap-2 text-[15px]"><CheckCircle2 className="h-5 w-5 text-success" aria-hidden="true" />Todas as tranches faturadas e pagas.</p>}

      {!compacto && (
        // 27/10: só a frase principal (a lista do que acontece repetia o que os passos da obra já mostram)
        <p className="text-[15px] text-muted-foreground">
          {DISPARO === "primeira" ? "Ao validar o pagamento da primeira tranche" : "Ao validar o pagamento da última tranche"}
          {disparo ? ` (${nomeT(disparo.id)})` : ""}, sai o recibo e a obra põe-se a andar.
        </p>
      )}
      {/* 21/10: as adendas assinadas: a fatura (registada, do programa certificado), o pagamento e a encomenda dos materiais (decisão B) */}
      <AdendasNoFinanceiro ctx={ctx} d={d} v2 />
    </div>
  );
}
