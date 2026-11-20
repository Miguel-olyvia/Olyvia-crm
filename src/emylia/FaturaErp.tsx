// 22/10/2026: a fatura do Eticadata no V1. O Financeiro emite no ERP e escreve aqui o número; a Olyvia lê no ERP o estado (erpEticadata.ts)
// e, quando estiver paga, o negócio passa à Obra com o recibo do ERP. Sem ligação ao ERP, regista-se na mesma e valida-se à mão.
import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PAPEIS, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { lerFaturaErp } from "./erpEticadata";
import { SEM_PERM, podeNeg } from "./permissoes";
import { FINANCEIRO, efetivo, emFalta } from "./campos";

/** O passo «Registar a fatura do ERP»: o número da fatura emitida no Eticadata; confirma-a no ERP antes de a registar. */
export function RegistarFaturaErp({ ctx, d, tamanho = "lg", aEsquerda = false, semDados = false }: { ctx: Ctx; d: Negocio; tamanho?: "lg" | "default"; aEsquerda?: boolean; /** 18/11: o passo Fatura sem os campos (não os exige) */ semDados?: boolean }) {
  const { A, go, S } = ctx;
  const [numero, setNumero] = useState("");
  const [aLer, setALer] = useState(false);
  const [erro, setErro] = useState<{ msg: string; semLigacao: boolean } | null>(null);
  // 9/11 (Lote 1, L): registar a fatura pede negocios.registar_fatura (A.registarFaturaErp, neg_registar_fatura); sem ela, nem se pergunta
  // ao Eticadata: o botão fica desligado e diz porquê
  const pode = podeNeg(S.role, "finance.invoice");
  // 10/11 (teste do 1026): sem os dados de faturação e da fatura, o motor não regista; diz-se aqui o que falta, antes de escrever o número
  // (antes, o aviso passava em segundos e a fatura ficava por registar sem se perceber porquê)
  const faltam = semDados ? [] : [FINANCEIRO[0], FINANCEIRO[1]].map((g) => efetivo(S.campos, g)).filter((g) => !g.oculto)
    .flatMap((g) => emFalta([g], d.f).map((c) => ({ c: c.l, g: g.nome || g.titulo })));
  const registar = async (e: FormEvent) => {
    e.preventDefault();
    if (!pode || faltam.length) return;
    const n = numero.trim().replace(/\s+/g, " ");
    if (!n) { setErro({ msg: "Escreva o número da fatura, como aparece no Eticadata.", semLigacao: false }); return; }
    setALer(true); setErro(null);
    const r = await lerFaturaErp(n);
    setALer(false);
    if ("info" in r) { go(() => A.registarFaturaErp(d.id, n, r.info, semDados))(); return; }
    setErro({ msg: r.msg, semLigacao: r.motivo === "sem_ligacao" });
  };
  if (!pode) return (
    <div className={cn("grid w-full gap-1.5 sm:w-auto", !aEsquerda && "sm:justify-items-end")}>
      <Button size={tamanho} disabled aria-describedby={`fat-erp-semperm-${d.id}`}>Registar fatura<ArrowRight className="ml-2 h-4 w-4" /></Button>
      <p id={`fat-erp-semperm-${d.id}`} className="max-w-sm text-sm text-muted-foreground">{SEM_PERM["finance.invoice"].sub}</p>
      {/* 11/11: o caminho para quem pode, num toque (como o «Mudar para …» do próximo passo) */}
      <button type="button" className="justify-self-start text-sm font-medium text-primary underline-offset-4 hover:underline" onClick={go(() => A.role("financeiro"))}>Mudar para {PAPEIS.financeiro.n}</button>
    </div>
  );
  if (faltam.length) return (
    <div className={cn("grid w-full gap-1.5 sm:w-auto", !aEsquerda && "sm:justify-items-end")}>
      <Button size={tamanho} disabled aria-describedby={`fat-erp-falta-${d.id}`}>Registar fatura<ArrowRight className="ml-2 h-4 w-4" /></Button>
      <p id={`fat-erp-falta-${d.id}`} className="max-w-sm text-sm text-muted-foreground">
        Antes de registar, falta {faltam.map((x) => `${x.c} (${x.g})`).join(", ")}.
      </p>
    </div>
  );
  return (
    <form onSubmit={registar} className={cn("grid w-full gap-1.5 sm:w-auto", !aEsquerda && "sm:justify-items-end")} aria-label="Registar a fatura do ERP">
      <div className="flex w-full flex-wrap gap-2 sm:w-auto">
        <label className="sr-only" htmlFor={`fat-erp-${d.id}`}>Número da fatura no Eticadata</label>
        <input id={`fat-erp-${d.id}`} value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="FAT 15200126/538" autoComplete="off"
          className={cn("min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-[15px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 sm:w-56",
            tamanho === "lg" ? "h-11" : "h-10")} aria-invalid={!!erro} aria-describedby={erro ? `fat-erp-erro-${d.id}` : undefined} />
        <Button type="submit" size={tamanho} disabled={aLer}>{aLer ? "A confirmar no ERP…" : "Registar fatura"}<ArrowRight className="ml-2 h-4 w-4" /></Button>
      </div>
      {erro && (
        <p id={`fat-erp-erro-${d.id}`} role="alert" className="text-sm text-destructive">
          {erro.msg}
          {erro.semLigacao && <> <button type="button" className="font-medium underline underline-offset-4" onClick={go(() => A.registarFaturaErp(d.id, numero.trim().replace(/\s+/g, " "), null, semDados))}>Registar sem confirmar</button></>}
        </p>
      )}
    </form>
  );
}

// 20/11 (auditoria F10): sem RegistarFaturaAdendaErp nem EstadoFaturaErp. A fatura das adendas regista-se, e o estado do Eticadata vê-se
// (em texto, sem botões repetidos), na lista «Pagamentos» (Pagamentos.tsx), a mesma no Financeiro e na Obra.
