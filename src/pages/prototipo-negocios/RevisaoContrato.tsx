// A revisão do contrato pelo Jurídico (15/10/2026): o cliente pediu, no portal, alterações a cláusulas. O Jurídico vê o que o
// cliente disse em cada uma, o texto anterior, e reescreve (ou mantém, dizendo que mantém). Só valida com todas as cláusulas
// pedidas revistas; validado, o comercial envia a versão seguinte e o cliente assina no mesmo link.
// Abre por cima da app (como o portal), a partir do próximo passo do negócio ("Rever o contrato").
import { useMemo, useState } from "react";
import { Check, MessageSquareText, Scale, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PAPEIS, type Negocio } from "./motor";
import type { Ctx } from "./pecas";
import { clausulasContrato } from "./DocsCliente";

export function RevisaoContrato({ ctx, d }: { ctx: Ctx; d: Negocio }) {
  const { S, A, run } = ctx;
  const o = d.orc!, pedido = o.contratoPedido;
  const atuais = useMemo(() => clausulasContrato(d, S), [d, S]);
  const [texto, setTexto] = useState<Record<string, string>>(() => Object.fromEntries((pedido?.clausulas ?? []).map((x) => [x.c, atuais.find((c) => c.titulo === x.c)?.texto ?? ""])));
  const [mantem, setMantem] = useState<Record<string, boolean>>({});
  const fechar = () => run(() => A.fecharRevisao());
  if (!pedido) return null;
  const juridico = S.role === "juridico", versao = (o.contratoVersoes?.length ?? 0) + 1;
  const revista = (c: string) => mantem[c] || (texto[c] ?? "").trim() !== (atuais.find((x) => x.titulo === c)?.texto ?? "").trim();
  const feitas = pedido.clausulas.filter((x) => revista(x.c)).length, todas = feitas === pedido.clausulas.length;
  const validar = () => run(() => {
    for (const x of pedido.clausulas) if (!mantem[x.c]) A.reverClausula(d.id, x.c, texto[x.c] ?? "");
    A.validarContrato(d.id);
  });

  return (
    <div className="fixed inset-0 z-[85] overflow-y-auto bg-background animate-in fade-in-0 duration-200" role="dialog" aria-modal="true" aria-label={`Rever o contrato CT 2026/${d.id}`}>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-2 backdrop-blur">
        <p className="flex items-center gap-2 text-sm font-semibold"><Scale className="h-4 w-4 text-muted-foreground" aria-hidden="true" />Jurídico · contrato CT 2026/{d.id}</p>
        <button type="button" onClick={fechar} aria-label="Fechar" className="grid h-11 w-11 place-items-center rounded-lg hover:bg-muted"><X className="h-5 w-5" /></button>
      </div>
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-40 pt-6 sm:px-6">
        <header>
          <p className="text-sm text-muted-foreground">{d.nome} · {d.servico}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Rever o contrato</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">
            O cliente pediu alterações {pedido.clausulas.length === 1 ? "a uma cláusula" : `a ${pedido.clausulas.length} cláusulas`} ({pedido.q}). Reescreva cada uma (ou mantenha o texto) e valide: a versão {versao} vai depois ao cliente pelo comercial.
          </p>
          {!juridico && (
            <p className="mt-3 rounded-xl border border-border bg-muted/40 px-4 py-3 text-[15px]">
              Este passo é do Jurídico.{" "}
              <button type="button" onClick={() => run(() => A.role("juridico"))} className="font-medium text-primary underline-offset-4 hover:underline">Mudar para {PAPEIS.juridico.n}</button>
            </p>
          )}
        </header>

        <ol className="space-y-5" aria-label="Cláusulas pedidas">
          {pedido.clausulas.map((x) => {
            const c = atuais.find((y) => y.titulo === x.c), k = atuais.findIndex((y) => y.titulo === x.c) + 1, ok = revista(x.c);
            return (
              <li key={x.c} className={cn("rounded-2xl border bg-card p-4 shadow-[var(--shadow-sm)] sm:p-5", ok ? "border-success/40" : "border-border")}>
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-base font-semibold">Cláusula {k}.ª · {x.c}</h2>
                  {ok && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5 text-sm font-medium text-success"><Check className="h-3.5 w-3.5" aria-hidden="true" />revista</span>}
                </div>
                <p className="mt-3 flex items-start gap-2 rounded-xl bg-warning/[0.08] px-3 py-2 text-[15px]">
                  <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                  <span><span className="font-medium">O cliente: </span>{x.nota ? `«${x.nota}»` : "não gosta desta cláusula (sem detalhe)."}</span>
                </p>
                <p className="mt-3 text-sm font-medium text-muted-foreground">Texto anterior</p>
                <p className="mt-1 whitespace-pre-line rounded-xl bg-muted/50 px-3 py-2 text-[15px] text-muted-foreground">{c?.texto}</p>
                <label className="mt-3 block">
                  <span className="text-sm font-medium">Novo texto</span>
                  <textarea value={texto[x.c] ?? ""} disabled={!juridico || !!mantem[x.c]} rows={4} onChange={(e) => setTexto((t) => ({ ...t, [x.c]: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-input bg-background p-3 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60" />
                </label>
                <label className="mt-2 flex min-h-11 cursor-pointer items-center gap-2 text-[15px]">
                  <input type="checkbox" disabled={!juridico} checked={!!mantem[x.c]} onChange={(e) => setMantem((m) => ({ ...m, [x.c]: e.target.checked }))} className="h-5 w-5 accent-[hsl(var(--primary))]" />
                  Manter o texto (fica explicado ao cliente pelo comercial)
                </label>
              </li>
            );
          })}
        </ol>
        <p className="text-sm text-muted-foreground">As outras cláusulas ficam como estão: {atuais.filter((c) => !pedido.clausulas.some((x) => x.c === c.titulo)).map((c) => c.titulo.toLowerCase()).join(", ")}.</p>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background/95 px-4 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground" aria-live="polite">{feitas} de {pedido.clausulas.length} {pedido.clausulas.length === 1 ? "cláusula revista" : "cláusulas revistas"}</p>
          <Button size="lg" disabled={!juridico || !todas} onClick={validar}>Validar o contrato</Button>
        </div>
      </div>
    </div>
  );
}
