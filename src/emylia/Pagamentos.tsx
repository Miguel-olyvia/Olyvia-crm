// 20/11/2026 (auditoria de 19/11, F10): a lista «Pagamentos», o mesmo componente no Financeiro e na Obra (e nas adendas do Financeiro).
// Cada linha diz o que é, o valor, o momento e o estado, e tem um só botão principal, que muda com o estado: «Registar o número da
// fatura» → «Ok, já foi paga» → paga, sem botão. O estado do Eticadata é só texto (a Olyvia volta a lê-lo sozinha). As regras estão em
// listaPagamentos.ts; as ações são as do motor (as mesmas que o servidor valida).
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Check, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { eur, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { SEM_PERM, pelaPermissaoAlguma, podeNeg, podeVerificarErp } from "./permissoes";
import { lerFaturaErp } from "./erpEticadata";
import { alvoFaturaAdenda } from "./adendas";
import { em3, ibanAVista, mbDisponivel, metodoDe, referenciaMb, useDadosPagamento } from "./pagamentoCliente";
import { gruposPagamentos, type GrupoPagamentos, type LinhaPagamento } from "./listaPagamentos";

/** O campo do número a focar quando o passo «Pagamentos» se abrir (o sinal do Hoje apaga-se logo a seguir ao 1.º desenho, antes de o
 *  passo abrir): passoDoPulso (PaginaNegocio.tsx) guarda-o aqui e o campo usa-o uma vez. */
let focoPendente: string | null = null;
export const lembrarFoco = (alvo: string | null): void => { focoPendente = alvo; };

/** De quanto em quanto tempo a Olyvia volta a ler o Eticadata enquanto a 1.ª fatura está por pagar e o negócio está aberto. */
const INTERVALO_MS = 60_000;

/** Como o cliente paga a 1.ª parcela (o método e a referência), com a fatura por pagar. */
function ComoPaga({ d }: { d: Negocio }) {
  const empresa = useDadosPagamento();
  const ft = d.fin.fatura;
  if (!ft) return null;
  const metodo = metodoDe(d.f.metodo);
  const linhas: [string, string][] = [
    ["Como paga", d.f.metodo ? metodo : "o cliente escolhe no portal"],
    // 19/11 (auditoria): a referência Multibanco só com o prestador de pagamentos configurado (mbDisponivel); sem ele não há referência real
    ...(metodo === "Referência MB" ? [mbDisponivel(empresa) ? ["Entidade · referência", `${empresa?.mbEntidade} · ${em3(referenciaMb(d.id, ft.n))}`] as [string, string] : ["Referência MB", "indisponível (sem prestador de pagamentos ligado)"] as [string, string]] : []),
    ...(metodo === "MB Way" ? [["MB Way para", empresa?.mbway ?? "sem número"] as [string, string]] : []),
    ...(metodo === "Transferência" ? [["IBAN", empresa?.iban ? ibanAVista(empresa.iban) : "ainda não indicado"] as [string, string]] : []),
  ];
  return (
    <>
      <dl className="mt-2 space-y-0.5 text-[15px]">
        {linhas.map(([k, v]) => <div key={k} className="flex flex-wrap gap-x-2"><dt className="text-muted-foreground">{k}</dt><dd className="tabular-nums">{v}</dd></div>)}
      </dl>
      {!empresa?.iban && <p className="mt-2 text-sm text-muted-foreground">A empresa ainda não tem o IBAN para o cliente pagar. Indique-o em Pessoas, Workflow, separador «Pagamentos».</p>}
    </>
  );
}

/** O número da fatura (ou da nota de crédito) emitida no Eticadata. A 1.ª fatura do contrato e as das adendas confirmam-se no ERP antes de
 *  se registarem; sem ligação ao ERP, regista-se sem confirmar. */
function RegistarNumero({ ctx, d, x }: { ctx: Ctx; d: Negocio; x: LinhaPagamento }) {
  const { A, S, run } = ctx;
  const [numero, setNumero] = useState("");
  const [aLer, setALer] = useState(false);
  const [erro, setErro] = useState<{ msg: string; semLigacao: boolean } | null>(null);
  const campo = useRef<HTMLInputElement>(null);
  const id = useId();
  const nota = x.tipo === "nota";
  // o «Registar a fatura» do Hoje (A.abrirFaturaAdenda) traz o cursor para aqui
  const meu = x.adenda ? alvoFaturaAdenda(x.adenda) : x.tipo === "contrato" && x.i === 0 ? "sec-4" : null;
  const alvo = !!meu && (S.pulse === meu || focoPendente === meu);
  useEffect(() => {
    if (!alvo) return;
    focoPendente = null;
    campo.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    campo.current?.focus();
  }, [alvo]);
  if (!podeNeg(S.role, "finance.invoice")) return (
    <div className="mt-3 space-y-1">
      <Button size="lg" disabled>{nota ? "Registar o número da nota de crédito" : "Registar o número da fatura"}</Button>
      <p className="text-sm text-muted-foreground">{SEM_PERM["finance.invoice"].sub}</p>
    </div>
  );
  const limpo = () => numero.trim().replace(/\s+/g, " ");
  /** Regista (info: a leitura do ERP; null: sem ligação, sem confirmar). */
  const gravar = (n: string, info: Parameters<typeof A.registarFaturaAdenda>[3]) => run(() => {
    const ok = x.tipo === "adenda" ? A.registarFaturaAdenda(d.id, x.adenda!, n, info)
      : nota ? A.registarNotaCredito(d.id, n)
      : x.i === 0 ? (A.registarFaturaErp(d.id, n, info, true), !!d.fin.fatura)
      : A.registarFaturaParcela(d.id, x.tranche!, n);
    if (ok) { setNumero(""); setErro(null); }
  });
  const registar = async (e: FormEvent) => {
    e.preventDefault();
    const n = limpo();
    if (!n) { setErro({ msg: nota ? "Escreva o número da nota de crédito." : "Escreva o número da fatura, como aparece no Eticadata.", semLigacao: false }); return; }
    // as parcelas do contrato a seguir à 1.ª e a nota de crédito registam-se sem ler o ERP (como até aqui)
    if (nota || (x.tipo === "contrato" && x.i > 0)) { gravar(n, undefined); return; }
    setALer(true); setErro(null);
    const r = await lerFaturaErp(n);
    setALer(false);
    if ("info" in r) { gravar(n, r.info); return; }
    setErro({ msg: r.msg, semLigacao: r.motivo === "sem_ligacao" });
  };
  return (
    <form onSubmit={registar} className="mt-3 grid gap-1.5" aria-label={`Registar ${nota ? "a nota de crédito" : "a fatura"} · ${x.titulo}`}>
      <label htmlFor={id} className="text-sm text-muted-foreground">{nota ? "Número da nota de crédito no Eticadata" : "Número da fatura no Eticadata"}</label>
      <div className="flex flex-wrap gap-2">
        <input id={id} ref={campo} value={numero} onChange={(e) => setNumero(e.target.value)} placeholder={nota ? "NC 2026/…" : "FAT 15200126/538"} autoComplete="off"
          className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-[15px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 sm:max-w-xs"
          aria-invalid={!!erro} aria-describedby={erro ? id + "-erro" : undefined} />
        <Button type="submit" size="lg" disabled={aLer || !numero.trim()}>{aLer ? "A confirmar no ERP…" : nota ? "Registar o número da nota de crédito" : "Registar o número da fatura"}</Button>
      </div>
      {erro && (
        <p id={id + "-erro"} role="alert" className="text-sm text-destructive">
          {erro.msg}
          {erro.semLigacao && <> <button type="button" className="font-medium underline underline-offset-4" onClick={() => gravar(limpo(), null)}>Registar sem confirmar</button></>}
        </p>
      )}
    </form>
  );
}

function Linha({ ctx, d, x }: { ctx: Ctx; d: Negocio; x: LinhaPagamento }) {
  const { A, S, run } = ctx;
  const podeValidar = podeNeg(S.role, "finance.validate_payment");
  const pagar = () => run(() => {
    if (x.tipo === "adenda") A.validarPagamentosAdenda(d.id, x.adenda);
    else if (x.i === 0) A.validar(d.id);
    else A.validarParcela(d.id, x.tranche!);
  });
  const vez = x.acao !== null;
  return (
    <li className={cn("rounded-2xl border p-4", vez ? "border-primary/40 bg-primary/[0.04]" : "border-border bg-card")} data-testid={`pagamento-${x.chave}`} aria-label={x.titulo}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[17px] font-semibold tracking-tight">
          {x.titulo}
          {x.valor != null && <> · <span className="tabular-nums">{x.valor < 0 ? "−" : ""}{eur(Math.abs(x.valor))} €</span> <span className="text-sm font-normal text-muted-foreground">{x.comIva ? "com IVA" : "s/ IVA"}</span></>}
        </p>
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-medium",
          x.estado === "paga" ? "bg-success/15 text-success" : x.estado === "espera" ? "bg-muted text-muted-foreground" : "bg-warning/15 text-foreground")}>
          {x.estado === "paga" ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Clock className="h-3.5 w-3.5" aria-hidden />}{x.textoEstado}
        </span>
      </div>
      <p className="mt-1 text-[15px] text-muted-foreground">{x.momento}</p>
      {x.estado === "faturar" && x.tipo !== "nota" && <p className="mt-1 text-[15px]">Emita-a no Eticadata e escreva aqui o número: vai para o portal do cliente, com os dados para pagar.</p>}
      {x.estado === "faturar" && x.tipo === "nota" && <p className="mt-1 text-[15px]">Emita-a no Eticadata e escreva aqui o número. Depois, aprova-se o plano e segue a encomenda de cliente.</p>}
      {x.estado === "pagar" && x.numero && <p className="mt-1 text-[15px]">Fatura {x.numero} registada, no portal do cliente.</p>}
      {x.erp && <p className="mt-1 text-[15px] text-muted-foreground">{x.erp}</p>}
      {x.aviso && <p className="mt-2 rounded-xl bg-primary/[0.06] px-3 py-2 text-[15px]">{x.aviso}</p>}
      {x.estado === "pagar" && x.tipo === "contrato" && x.i === 0 && <ComoPaga d={d} />}
      {x.motivo && <p className="mt-1 text-[15px] text-muted-foreground">{x.motivo}</p>}
      {x.extra && <p className="mt-1 text-[15px] text-muted-foreground">{x.extra}</p>}
      {x.acao === "registar" && <RegistarNumero ctx={ctx} d={d} x={x} />}
      {x.acao === "pagar" && (
        <div className="mt-3 space-y-1">
          <Button size="lg" disabled={!podeValidar} onClick={pagar}>Ok, já foi paga</Button>
          {!podeValidar && <p className="text-sm text-muted-foreground">{SEM_PERM["finance.validate_payment"].sub}</p>}
        </div>
      )}
    </li>
  );
}

function Grupo({ ctx, d, g, comTitulo }: { ctx: Ctx; d: Negocio; g: GrupoPagamentos; comTitulo: boolean }) {
  return (
    <section aria-label={g.titulo} data-testid={g.tipo === "adenda" ? `fin-adenda-${g.chave.slice("adenda:".length)}` : `pagamentos-${g.chave}`} className="space-y-2">
      {comTitulo && (
        <p className="text-[15px] font-semibold">{g.titulo}{g.sub && <span className="font-normal tabular-nums text-muted-foreground"> · {g.sub}</span>}</p>
      )}
      <ol className="space-y-3">{g.linhas.map((x) => <Linha key={x.chave} ctx={ctx} d={d} x={x} />)}</ol>
    </section>
  );
}

/** A lista «Pagamentos» do negócio. `so="adendas"`: só as das adendas (o bloco das adendas no Financeiro). */
export function Pagamentos({ ctx, d, so }: { ctx: Ctx; d: Negocio; so?: "adendas" }) {
  const { A, S, go } = ctx;
  const G = gruposPagamentos(S, d).filter((g) => !so || g.tipo === "adenda");
  // a 1.ª fatura por pagar, com leitura do Eticadata: lê-a de novo a cada minuto, em silêncio (só avisa se o estado mudar)
  const porPagar = !so && !!d.fin.fatura && !d.fin.pago && !!d.fin.erp;
  const verificar = (S.role === "financeiro" || pelaPermissaoAlguma(S.role, ["finance.validate_payment", "finance.invoice"])) && podeVerificarErp(S.role);
  useEffect(() => {
    if (!porPagar || !verificar) return;
    const t = setInterval(() => go(() => A.verificarErp(d.id, true))(), INTERVALO_MS);
    return () => clearInterval(t);
  }, [porPagar, verificar, d.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!G.length) return so ? null : <p className="text-[15px] text-muted-foreground">Ainda não há pagamentos: aparecem com a proposta aceite.</p>;
  // com um só grupo (só o contrato), sem título: a lista diz tudo
  const comTitulo = G.length > 1 || !!so;
  return <div className="max-w-2xl space-y-6" aria-label="Pagamentos">{G.map((g) => <Grupo key={g.chave} ctx={ctx} d={d} g={g} comTitulo={comTitulo} />)}</div>;
}
