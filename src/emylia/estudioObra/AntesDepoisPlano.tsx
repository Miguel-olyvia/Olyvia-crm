// 25/11 (Rúben: «queremos ter um gestor de obra a validar realmente este plano, e depois registar o histórico do antes e depois para
// aprendermos»). O que o gestor mudou ao plano que o motor gerou do orçamento: ao vivo, enquanto valida (o plano por aprovar), e os registos
// de cada validação, guardados no negócio (planoAntesDepois.ts).
import { useState } from "react";
import { ChevronDown, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";
import { TECS, type Negocio } from "../motor";
import { ROTULO_DIFERENCA, diferencasPlano, geradoDe, resumoDiferencas, retratoTarefas, type Diferenca, type RegistoPlano } from "../planoAntesDepois";

const nomeTec = (id: string | null) => TECS.find((x) => x.id === id)?.n ?? "por atribuir";

function Tabela({ l }: { l: Diferenca[] }) {
  if (!l.length) return <p className="text-[15px] text-muted-foreground">Sem mudanças: o plano gerado ficou como estava.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] border-collapse text-left text-[14px]">
        <thead>
          <tr className="border-b border-border text-muted-foreground">
            <th scope="col" className="py-1.5 pr-3 font-medium">Tarefa</th>
            <th scope="col" className="py-1.5 pr-3 font-medium">O que mudou</th>
            <th scope="col" className="py-1.5 pr-3 font-medium">Gerado</th>
            <th scope="col" className="py-1.5 font-medium">Validado</th>
          </tr>
        </thead>
        <tbody>
          {l.map((x, k) => (
            <tr key={k} className="border-b border-border/60 align-top">
              <td className="py-1.5 pr-3">{x.tarefa}</td>
              <td className="py-1.5 pr-3">{ROTULO_DIFERENCA[x.tipo]}</td>
              <td className="py-1.5 pr-3 text-muted-foreground">{x.antes ?? "—"}</td>
              <td className="py-1.5 font-medium">{x.depois ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Registo({ r, aberto: a0 = false }: { r: RegistoPlano; aberto?: boolean }) {
  const [aberto, setAberto] = useState(a0);
  return (
    <li className="rounded-xl border border-border">
      <button type="button" aria-expanded={aberto} onClick={() => setAberto((x) => !x)}
        className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium">{r.motivo === "aprovado" ? "Validado" : "Recomeçado (teste)"} · {resumoDiferencas(r.diferencas)}</span>
          <span className="block text-sm text-muted-foreground">{r.q}{r.quem ? ` · ${r.quem}` : ""} · {r.gerado.length} tarefas geradas, {r.final.length} no fim</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", aberto && "rotate-180")} aria-hidden="true" />
      </button>
      {aberto && <div className="border-t border-border px-3 py-2"><Tabela l={r.diferencas} /></div>}
    </li>
  );
}

/** As mudanças face ao plano gerado (ao vivo, com o plano por aprovar) e os registos das validações. */
export function AntesDepoisPlano({ d, aoVivo = true }: { d: Negocio; aoVivo?: boolean }) {
  const p = d.obra.plano, regs = d.obra.aprendizagem ?? [];
  const gerado = p ? geradoDe(p) : null;
  // 25/11: também com a obra aprovada ou em curso (o supervisor valida o plano já na gestão da obra)
  const vivo = aoVivo && p && p.estado !== "concluída" && gerado ? diferencasPlano(gerado, retratoTarefas(p), nomeTec) : null;
  if (!vivo && !regs.length) return null;
  return (
    <section aria-labelledby="antes-depois-t" className="space-y-3 rounded-3xl border border-border bg-card p-4 sm:p-5">
      <div>
        <h2 id="antes-depois-t" className="flex items-center gap-2 text-[15px] font-semibold"><GraduationCap className="h-4 w-4 text-primary" aria-hidden="true" />O plano gerado e o validado</h2>
        <p className="text-sm text-muted-foreground">O que o gestor de obra muda ao plano que o motor gerou do orçamento. Fica guardado em cada validação, para aprender.</p>
      </div>
      {vivo && (
        <div className="space-y-2">
          <p className="text-[15px]"><b>Até agora:</b> {vivo.length ? resumoDiferencas(vivo) : "ainda sem mudanças ao plano gerado"}.</p>
          {vivo.length > 0 && <Tabela l={vivo} />}
        </div>
      )}
      {regs.length > 0 && (
        <ul className="space-y-2">
          {[...regs].reverse().map((r, k) => <Registo key={regs.length - k} r={r} aberto={k === 0 && !vivo} />)}
        </ul>
      )}
    </section>
  );
}
