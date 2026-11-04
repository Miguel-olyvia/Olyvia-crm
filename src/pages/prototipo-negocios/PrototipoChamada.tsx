// 4/11 (Rúben): a «Chamada em direto» sem conta, para experimentar e mostrar: o mesmo painel do «Tudo na chamada» do
// Negócio, com um negócio de exemplo em memória. O que o motor propõe e se aceita fica na lista em baixo, só nesta página.
// Precisa do motor a correr no PC (python tools/chamadas/servidor.py). Com ?teste=1 usa a chamada de exemplo, sem microfone.
import { useMemo, useState } from "react";
import { ChamadaDireto } from "@/emylia/ChamadaDireto";
import { CONTACTO, LEAD, type Def } from "@/emylia/campos";
import type { Negocio } from "@/emylia/motor";
import type { Ctx } from "@/emylia/pecas";

export default function PrototipoChamada() {
  const [f, setF] = useState<Record<string, string>>({});
  const grupos = useMemo(() => [...LEAD, ...CONTACTO], []);
  const defs = useMemo(() => new Map<string, Def>(grupos.flatMap((g) => g.campos).map((c) => [c.k, c])), [grupos]);
  const ctx = useMemo(() => ({
    S: {}, run: (fn: () => void) => fn(), go: (fn: () => void) => () => fn(), q: "",
    A: { campo: (_id: number, k: string, v: string) => setF((x) => ({ ...x, [k]: v })) },
  }) as unknown as Ctx, []);
  const d = { id: 1, f, nome: "Cliente de exemplo", tel: "", fase: 1 } as unknown as Negocio;
  const preenchidos = Object.entries(f).filter(([, v]) => v.trim() !== "");
  return (
    <main className="mx-auto w-full max-w-4xl px-4 pb-24 pt-8 sm:px-8">
      <div className="mb-6">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">Negócios › Protótipo</div>
        <h1 className="text-2xl font-semibold tracking-tight">Chamada em direto</h1>
        <p className="text-[15px] text-muted-foreground">O mesmo painel do «Tudo na chamada» do Negócio, sem conta. O que se preenche fica só nesta página.</p>
      </div>
      <ChamadaDireto ctx={ctx} d={d} grupos={grupos} />
      <section aria-labelledby="preenchidos" className="mt-8 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-sm)]">
        <h2 id="preenchidos" className="text-lg font-semibold tracking-tight">Campos do negócio</h2>
        {preenchidos.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Ainda nada. Termine a chamada e carregue em «Preencher».</p> : (
          <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {preenchidos.map(([k, v]) => (
              <div key={k} className="text-[15px] leading-snug">
                <dt className="text-sm text-muted-foreground">{defs.get(k)?.l ?? k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    </main>
  );
}
