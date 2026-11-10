// 10/11 (Rúben: «não queremos muitos passos, queremos certezas e informação limpa nas screens»): a página do negócio, sem conta, com os
// dados de exemplo do motor, para ver e mostrar o Financeiro (a fatura e o pagamento) e a Obra (antes de arrancar) sem mexer em negócios
// reais. O negócio do Tiago Almeida (1027): no Financeiro, por faturar; na Obra, pago, com as medidas e o plano por fazer.
import { useMemo, useReducer, useState } from "react";
import { acoes, seed, type Estado } from "@/emylia/motor";
import { FINANCEIRO, emFalta } from "@/emylia/campos";
import type { Ctx } from "@/emylia/pecas";
import { NegocioSimples } from "@/emylia/NegocioSimples";
import "@/emylia/prototipo.css";

type Etapa = "financeiro" | "obra";

function montar(etapa: Etapa): Estado {
  const S = seed();
  const d = S.deals.find((x) => x.id === 1027)!;
  // os dados de faturação e da fatura, menos o NIF (para se ver o que o registo diz quando falta um dado)
  for (let i = 0; i < 4; i++) for (const c of emFalta([FINANCEIRO[0], FINANCEIRO[1]], d.f)) if (c.k !== "nif_fat") d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Sim" : "x";
  delete d.f.nif_fat;
  const A = acoes(S, () => {}, (fn) => fn());
  if (etapa === "obra") {
    d.f.nif_fat = "123456789";
    for (let i = 0; i < 4; i++) for (const c of emFalta(FINANCEIRO, d.f)) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-11-09" : "x";
    S.role = "financeiro"; A.emitir(d.id); A.validar(d.id);
  }
  S.role = etapa === "obra" ? "operacoes" : "financeiro";
  S.view = "negocio"; S.deal = d.id;
  return S;
}

function Demo({ etapa }: { etapa: Etapa }) {
  const S = useMemo(() => montar(etapa), [etapa]);
  const [, redesenhar] = useReducer((x: number) => x + 1, 0);
  const run = (fn: () => void) => { fn(); redesenhar(); };
  const A = useMemo(() => acoes(S, () => redesenhar(), run), [S]); // eslint-disable-line react-hooks/exhaustive-deps
  const ctx = { S, A, run, go: (fn: () => void) => () => run(fn), q: "" } as unknown as Ctx;
  return <NegocioSimples {...ctx} />;
}

export default function PrototipoNegocioSimples() {
  const [etapa, setEtapa] = useState<Etapa>("financeiro");
  return (
    <main className="pn calma pg-root min-h-screen bg-background">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 pt-4 sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Protótipo · dados de exemplo</p>
        {(["financeiro", "obra"] as const).map((e) => (
          <button key={e} type="button" aria-pressed={etapa === e} onClick={() => setEtapa(e)}
            className={etapa === e ? "min-h-10 rounded-full bg-foreground px-4 text-sm text-background" : "min-h-10 rounded-full border border-input px-4 text-sm"}>
            {e === "financeiro" ? "Financeiro" : "Obra"}
          </button>
        ))}
      </div>
      <Demo key={etapa} etapa={etapa} />
    </main>
  );
}
