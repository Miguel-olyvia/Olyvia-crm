// 25/11 (Rúben: «queremos ter um gestor de obra a validar realmente este plano, e depois registar o histórico do antes e depois para
// aprendermos»). O que o gestor mudou ao plano que o motor gerou do orçamento: ao vivo, enquanto valida (o plano por aprovar), e os registos
// de cada validação, guardados no negócio (planoAntesDepois.ts).
import { useState } from "react";
import { ChevronDown, GraduationCap, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { TECS, type Negocio } from "../motor";
import { ROTULO_ALTERACAO, rotuloAcao, type Alteracao } from "../historicoPlano";
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

const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const quando = (iso: string) => { const t = new Date(iso); return isNaN(t.getTime()) ? iso : `${t.getDate()} ${MES[t.getMonth()]} ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`; };

/** 25/11 (Rúben: «qualquer alteração deve ir para um histórico»): todas as mudanças ao plano, da mais recente para a mais antiga. */
function Alteracoes({ l }: { l: Alteracao[] }) {
  const [aberto, setAberto] = useState(false);
  const [quantas, setQuantas] = useState(20);
  const total = l.reduce((n, a) => n + a.mudancas.length, 0);
  const recentes = [...l].reverse().slice(0, quantas);
  return (
    <div className="rounded-xl border border-border">
      <button type="button" aria-expanded={aberto} onClick={() => setAberto((x) => !x)} className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left">
        <History className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium">Todas as alterações ao plano</span>
          <span className="block text-sm text-muted-foreground">{l.length} {l.length === 1 ? "alteração" : "alterações"}, {total} {total === 1 ? "mudança" : "mudanças"} · a última a {quando(l[l.length - 1].q)}{l[l.length - 1].quem ? `, por ${l[l.length - 1].quem}` : ""}</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", aberto && "rotate-180")} aria-hidden="true" />
      </button>
      {aberto && (
        <ol className="space-y-3 border-t border-border px-3 py-3" aria-label="Alterações ao plano, da mais recente">
          {recentes.map((a, k) => (
            <li key={l.length - k} className="text-[14px]">
              <p><b className="font-medium">{rotuloAcao(a.acao)}</b> <span className="text-muted-foreground">· {quando(a.q)}{a.quem ? ` · ${a.quem}` : ""} · plano {a.estado}</span></p>
              <ul className="mt-1 space-y-0.5 pl-3">
                {a.mudancas.map((m, j) => (
                  <li key={j} className="text-muted-foreground">
                    <span className="text-foreground">{m.tarefa}</span> · {ROTULO_ALTERACAO[m.tipo]}
                    {m.detalhe ? <>: <span className="text-foreground">{m.detalhe}</span></> : (m.antes || m.depois) ? <>: {m.antes ?? "—"} → <span className="text-foreground">{m.depois ?? "—"}</span></> : null}
                  </li>
                ))}
              </ul>
            </li>
          ))}
          {l.length > quantas && (
            <li><button type="button" onClick={() => setQuantas((n) => n + 50)} className="min-h-9 rounded-full px-3 text-sm font-medium text-primary hover:bg-primary/10">Ver mais {Math.min(50, l.length - quantas)}</button></li>
          )}
        </ol>
      )}
    </div>
  );
}

/** As mudanças face ao plano gerado (ao vivo, com o plano por aprovar) e os registos das validações. */
export function AntesDepoisPlano({ d, aoVivo = true }: { d: Negocio; aoVivo?: boolean }) {
  const p = d.obra.plano, regs = d.obra.aprendizagem ?? [], alts = d.obra.mudancasPlano ?? [];
  const gerado = p ? geradoDe(p) : null;
  // 25/11: também com a obra aprovada ou em curso (o supervisor valida o plano já na gestão da obra)
  const vivo = aoVivo && p && p.estado !== "concluída" && gerado ? diferencasPlano(gerado, retratoTarefas(p), nomeTec) : null;
  if (!vivo && !regs.length && !alts.length) return null;
  return (
    <section aria-labelledby="antes-depois-t" className="space-y-3 rounded-3xl border border-border bg-card p-4 sm:p-5">
      <div>
        <h2 id="antes-depois-t" className="flex items-center gap-2 text-[15px] font-semibold"><GraduationCap className="h-4 w-4 text-primary" aria-hidden="true" />O plano gerado e o validado</h2>
        <p className="text-sm text-muted-foreground">O que o gestor de obra muda ao plano que o motor gerou do orçamento. Cada alteração fica guardada no histórico da obra, para aprender.</p>
      </div>
      {vivo && (
        <div className="space-y-2">
          <p className="text-[15px]"><b>Até agora:</b> {vivo.length ? resumoDiferencas(vivo) : "ainda sem mudanças ao plano gerado"}.</p>
          {vivo.length > 0 && <Tabela l={vivo} />}
        </div>
      )}
      {alts.length > 0 && <Alteracoes l={alts} />}
      {regs.length > 0 && (
        <ul className="space-y-2">
          {[...regs].reverse().map((r, k) => <Registo key={regs.length - k} r={r} aberto={k === 0 && !vivo} />)}
        </ul>
      )}
    </section>
  );
}
