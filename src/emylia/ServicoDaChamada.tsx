// 4/11 (Rúben): no passo «Qualificação», o tipo de serviço que veio da lead (casa de banho, cozinha…). Quem liga garante na chamada qual
// é: confirma-o ou troca-o por outro, com um clique (A.servicoDaChamada). As linhas são as da organização (LINHAS, lidas da base).
import { useId, useState } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { LINHAS, servicosPedidos, type LinhaId, type Negocio } from "./motor";
import type { Ctx } from "./pecas";

export function ServicoDaChamada({ ctx, d, ro }: { ctx: Ctx; d: Negocio; ro?: boolean }) {
  const rotulo = useId();
  const validado = d.f.servico_validado === "Sim";
  const atual: LinhaId | null = d.linhaPorDefinir ? null : d.linha;
  const linhas = Object.entries(LINHAS) as [LinhaId, (typeof LINHAS)[LinhaId]][];
  const escolher = (l: LinhaId) => { if (!ro) ctx.run(() => ctx.A.servicoDaChamada(d.id, l)); };
  return (
    <section aria-labelledby={rotulo} className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={rotulo} className="text-[15px] font-medium text-foreground">Tipo de serviço</h3>
        <span className={cn("text-sm", validado ? "text-success" : "text-muted-foreground")}>
          {validado ? "Confirmado na chamada" : atual ? "Veio da lead: confirme na chamada" : "A lead não disse: escolha na chamada"}
        </span>
      </div>
      <div role="group" aria-labelledby={rotulo} className="flex flex-wrap gap-2">
        {linhas.map(([id, l]) => {
          const ligado = atual === id;
          return (
            <button
              key={id} type="button" aria-pressed={ligado} aria-disabled={ro || undefined} onClick={() => escolher(id)}
              className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-4 text-[15px] transition-colors duration-150",
                ligado ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card text-foreground hover:border-foreground/40")}
            >
              {ligado && validado && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}{l.n}
            </button>
          );
        })}
      </div>
      <ServicosDoCatalogo ctx={ctx} d={d} ro={ro} />
      {atual && !validado && !ro && (
        <button type="button" onClick={() => escolher(atual)} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-dashed border-primary px-4 text-[15px] font-medium text-primary hover:bg-primary/[0.06]">
          <Check className="h-4 w-4" aria-hidden="true" />Confirmar: é {LINHAS[atual].n.toLowerCase()}
        </button>
      )}
    </section>
  );
}

/** 4/11 (Rúben: «o tipo de serviço tem de ser mais completo»): os serviços do Catálogo da organização que o cliente pediu. Procura-se pelo
 *  nome; os escolhidos ficam à vista (tira-se com o ×). Gravam-se no negócio (A.servicosDoPedido). */
const MAX_SUGESTOES = 12;
function ServicosDoCatalogo({ ctx, d, ro }: { ctx: Ctx; d: Negocio; ro?: boolean }) {
  const [q, setQ] = useState("");
  const id = useId();
  const escolhidos = servicosPedidos(d, ctx.S);
  const ids = escolhidos.map((x) => x.id);
  const todos = Object.entries(ctx.S.svc).map(([sid, sv]) => ({ id: sid, n: sv.n })).sort((a, b) => a.n.localeCompare(b.n, "pt"));
  if (todos.length === 0) return null;
  const termo = q.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const semAcento = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const sugestoes = todos.filter((x) => !ids.includes(x.id) && (!termo || semAcento(x.n).includes(termo))).slice(0, MAX_SUGESTOES);
  const mudar = (novos: string[]) => { if (!ro) ctx.run(() => ctx.A.servicosDoPedido(d.id, novos)); };
  return (
    <div className="space-y-3 border-t border-border pt-4">
      <p id={id} className="text-[15px] font-medium text-foreground">Serviços do Catálogo <span className="font-normal text-muted-foreground">(o que o cliente quer fazer)</span></p>
      {escolhidos.length > 0 && (
        <ul aria-labelledby={id} className="flex flex-wrap gap-2">
          {escolhidos.map((x) => (
            <li key={x.id} className="inline-flex min-h-11 items-center gap-1 rounded-full border border-primary bg-primary/10 pl-4 pr-1 text-[15px] font-medium">
              {x.n}
              {!ro && (
                <button type="button" aria-label={`Tirar ${x.n}`} onClick={() => mudar(ids.filter((s) => s !== x.id))} className="grid h-9 w-9 place-items-center rounded-full hover:bg-primary/15">
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!ro && (
        <>
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar no Catálogo (ex.: canalização)" aria-label="Procurar serviços no Catálogo"
              className="h-11 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" />
          </div>
          {sugestoes.length > 0 ? (
            <div role="group" aria-label="Juntar serviços do Catálogo" className="flex flex-wrap gap-2">
              {sugestoes.map((x) => (
                <button key={x.id} type="button" onClick={() => { mudar([...ids, x.id]); setQ(""); }}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-input bg-card px-4 text-[15px] hover:border-foreground/40">
                  <Plus className="h-4 w-4 text-primary" aria-hidden="true" />{x.n}
                </button>
              ))}
            </div>
          ) : termo ? <p className="text-sm text-muted-foreground">Nenhum serviço do Catálogo com «{q.trim()}».</p> : null}
        </>
      )}
    </div>
  );
}
