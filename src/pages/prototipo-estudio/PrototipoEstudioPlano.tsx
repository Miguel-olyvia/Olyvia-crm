// 9/11: os dois estúdios da Obra (o do plano, para as Operações, e o das medidas, para o supervisor), com os dados de exemplo do motor e
// sem conta, para os ver e mostrar sem mexer em negócios reais. O negócio do Tiago Almeida (1027) chega pago, com o plano por aprovar.
import { useMemo, useReducer, useState } from "react";
import { CalendarDays, Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TECS, acoes, seed, type Estado } from "@/emylia/motor";
import { diasDaObra, isoDia } from "@/emylia/planoObra";
import { inicioDoPlano } from "@/emylia/preparacaoObra";
import { gravarPlanta, retangulo } from "@/emylia/planta";
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
  // 11/11: a planta da visita (3 × 4 m, os 12 m² do chão), para o Estúdio das medidas a mostrar (as medidas seguem-na)
  if (!d.f.planta) d.f.planta = gravarPlanta({ o: { x: 0, y: 0 }, paredes: retangulo(300, 400), pecas: [{ id: "porta", tipo: "porta", x: 110, y: 396, w: 80, h: 8 }] });
  if (!d.f.diag_pe_direito_m) d.f.diag_pe_direito_m = "2,5";
  const A = acoes(S, () => {}, (fn) => fn());
  S.role = "financeiro"; A.emitir(d.id); A.validar(d.id); S.role = "operacoes";
  // 11/11 (Rúben: «falta ver quando os técnicos estão ocupados»): para se ver no exemplo, outra obra aprovada com duas pessoas desta equipa
  // nos dias em que aqui estão livres, e uns dias de férias de outra
  const p = d.obra.plano;
  const outra = S.deals.find((x) => x.id !== d.id && x.obra && !x.obra.plano);
  const tec = (i: number) => p?.tasks[i]?.tec ?? null;
  const ini = p ? inicioDoPlano(p) : null;
  if (p && ini && outra && tec(0) && tec(1)) {
    outra.obra.plano = {
      tasks: [
        { nome: "Demolição", svcs: [], dia: 2, dur: 3, sk: p.tasks[0].sk, h: 24, tec: tec(0), fase: 1 },
        { nome: "Canalização", svcs: [], dia: 4, dur: 3, sk: p.tasks[1].sk, h: 24, tec: tec(1), fase: 2 },
      ],
      estado: "aprovado", dia: 0, origem: "orcamento", inicio: isoDia(ini),
    };
    const ultimo = p.tasks[p.tasks.length - 1]?.tec;
    const ficha = TECS.find((x) => x.id === ultimo);
    if (ficha) ficha.feriasDatas = diasDaObra(ini, 12).slice(10, 12).map(isoDia);
  }
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
          <p className="text-[15px] text-muted-foreground">Pago, com o plano por aprovar. O supervisor aceita as medidas e as Operações validam o plano, ao mesmo tempo.</p>
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
