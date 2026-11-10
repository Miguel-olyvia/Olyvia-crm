// 9/11: os dois estúdios da Obra (o do plano, para as Operações, e o das medidas, para o supervisor), com os dados de exemplo do motor e
// sem conta, para os ver e mostrar sem mexer em negócios reais. O negócio do Tiago Almeida (1027) chega pago, com o plano por aprovar.
import { useMemo, useReducer, useState } from "react";
import { CalendarDays, Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { acoes, seed, type Estado } from "@/emylia/motor";
import { FINANCEIRO, emFalta } from "@/emylia/campos";
import type { Ctx } from "@/emylia/pecas";
import { EstudioPlano } from "@/emylia/estudioPlano/EstudioPlano";
import { EstudioMedidas } from "@/emylia/estudioPlano/EstudioMedidas";
import "@/emylia/prototipo.css";

function montar(): Estado {
  const S = seed();
  const d = S.deals.find((x) => x.id === 1027)!;
  // pago, como o Financeiro o deixaria: a obra com o plano gerado, por aprovar
  for (let i = 0; i < 4; i++) for (const c of emFalta(FINANCEIRO, d.f)) d.f[c.k] = c.op ? c.op[0] : c.t === "sim_nao" ? "Não" : c.t === "numero" || c.t === "contador" ? "1" : c.t === "data" ? "2026-11-09" : "x";
  const A = acoes(S, () => {}, (fn) => fn());
  S.role = "financeiro"; A.emitir(d.id); A.validar(d.id); S.role = "operacoes";
  return S;
}

export default function PrototipoEstudioPlano() {
  const S = useMemo(montar, []);
  const [, redesenhar] = useReducer((x: number) => x + 1, 0);
  const [aviso, setAviso] = useState("");
  const run = (fn: () => void) => { fn(); redesenhar(); };
  const A = useMemo(() => acoes(S, (a) => setAviso(`${a.msg}${a.sub ? " · " + a.sub : ""}`), run), [S]); // eslint-disable-line react-hooks/exhaustive-deps
  const ctx = { S, A, run, go: (fn: () => void) => () => run(fn), q: "" } as unknown as Ctx;
  const d = S.deals.find((x) => x.id === 1027)!;
  const [aberto, setAberto] = useState<"plano" | "medidas" | null>(null);
  return (
    <main className="pn calma pg-root min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Protótipo · dados de exemplo</p>
          <h1 className="text-2xl font-semibold tracking-tight">Os estúdios da Obra · {d.nome}</h1>
          <p className="text-[15px] text-muted-foreground">Pago, com o plano por aprovar. Primeiro o supervisor aceita as medidas; depois as Operações validam o plano.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Button type="button" size="lg" className="min-h-14" onClick={() => setAberto("medidas")}><Ruler className="mr-2 h-5 w-5" aria-hidden="true" />Estúdio das medidas</Button>
          <Button type="button" size="lg" variant="outline" className="min-h-14" onClick={() => setAberto("plano")}><CalendarDays className="mr-2 h-5 w-5" aria-hidden="true" />Estúdio do plano</Button>
        </div>
        <p role="status" className="min-h-6 text-sm text-muted-foreground">{aviso}</p>
        <p className="text-sm text-muted-foreground">Medidas: {d.f.retif_aceite ? "aceites" : "por aceitar"} · Plano: {d.obra.plano?.estado ?? "—"}</p>
      </div>
      {aberto === "plano" && <EstudioPlano ctx={ctx} d={d} fechar={() => setAberto(null)} />}
      {aberto === "medidas" && <EstudioMedidas ctx={ctx} d={d} fechar={() => setAberto(null)} />}
    </main>
  );
}
