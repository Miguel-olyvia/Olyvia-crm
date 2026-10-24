// Anular o contrato assinado (ou a venda direta aceite) antes de a obra arrancar (19/10/2026): só a Direção (contracts.cancel), com o motivo.
// O motor (A.anularContrato) marca o negócio perdido e elimina a encomenda de cliente no Inventário (as reservas libertam-se e as encomendas a
// fornecedor ligadas são anuladas). Aqui só o botão e a confirmação, iguais no aspeto simples (NegocioSimples) e no Atual (PaginaNegocio).
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { eur, valorSinal, type Negocio } from "./motor";
import { podeNeg } from "./permissoes";
import type { Ctx } from "./pecas";

/** Há contrato (ou venda direta) para anular e a obra ainda não arrancou? */
export function podeAnular(d: Negocio): boolean {
  const o = d.orc, p = d.obra.plano;
  return d.fase >= 4 && !d.perdido && !!o && (o.contrato === "assinado" || (o.vendaDireta && !!o.aceite)) && p?.estado !== "em curso" && p?.estado !== "concluída";
}
/** "contrato" ou "venda". */
export const oQueAnular = (d: Negocio) => (d.orc?.vendaDireta ? "venda" : "contrato");

/** A confirmação, com o motivo obrigatório (mínimo 3 caracteres). Sem a permissão, diz quem anula e deixa mudar de papel. */
export function ConfirmarAnulacao({ ctx, d, fechar }: { ctx: Ctx; d: Negocio; fechar: () => void }) {
  const { S, A, go, run } = ctx;
  const [motivo, setMotivo] = useState("");
  const idMotivo = useId();
  const vd = !!d.orc?.vendaDireta, doc = vd ? `a venda VD 2026/${d.id}` : `o contrato CT 2026/${d.id}`, ec = d.obra.ec;
  if (!podeNeg(S.role, "contracts.cancel")) {
    return (
      <div role="alertdialog" aria-label={`Anular ${oQueAnular(d)}`} className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4 animate-in fade-in-0">
        <p className="flex-1 text-[15px]">Só a Direção anula contratos.</p>
        <Button variant="outline" onClick={fechar}>Cancelar</Button>
        <Button variant="outline" onClick={go(() => A.role("direcao"))}>Mudar para Direção</Button>
      </div>
    );
  }
  const sinal = Number(d.f.valor_recebido) || valorSinal(d, S);
  const ok = motivo.trim().length >= 3;
  return (
    <div role="alertdialog" aria-label={`Anular ${oQueAnular(d)}`} className="mt-4 space-y-3 rounded-xl border border-destructive/30 bg-destructive/[0.04] p-4 animate-in fade-in-0">
      <p className="text-[15px]">
        Anular {doc}?{" "}
        {ec ? `A encomenda de cliente ${ec.n} é eliminada no Inventário: as reservas libertam-se e as encomendas a fornecedor ligadas são anuladas. ` : ""}
        O negócio fica perdido, com o motivo. Não se desfaz.
        {d.fin.pago ? ` O sinal (${eur(sinal)} €) devolve-se fora da Olyvia.` : ""}
      </p>
      <div>
        <label htmlFor={idMotivo} className="text-[15px] font-medium">Motivo</label>
        <input id={idMotivo} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="O cliente desistiu da obra"
          className="mt-1 block min-h-11 w-full max-w-md rounded-lg border border-input bg-background px-3 text-[15px]" />
        {!ok && <p className="mt-1 text-sm text-muted-foreground">Mínimo 3 caracteres.</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={fechar}>Cancelar</Button>
        <Button variant="destructive" disabled={!ok} onClick={() => { run(() => A.anularContrato(d.id, motivo)); fechar(); }}>Anular {oQueAnular(d)}</Button>
      </div>
    </div>
  );
}
