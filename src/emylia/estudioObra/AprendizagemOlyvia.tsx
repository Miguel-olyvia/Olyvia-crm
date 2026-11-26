// 26/11 (plano «Obra Viva», etapa 5; Rúben: «a plataforma tem de aprender com tudo, e crescer»). O que a Olyvia aprendeu com as obras
// da empresa (aprendizagemMotor.ts): as lições que já entram sozinhas nos planos novos, as que ainda estão a aprender, o que muda neste
// plano por causa delas, as horas que o Catálogo devia ter (proposta: mudam o preço) e o erro do motor obra a obra.
import { useMemo } from "react";
import { Brain, ChevronDown } from "lucide-react";
import type { Estado, Negocio } from "../motor";
import { MIN_OBRAS, aprender, tendenciaDoErro, type Licao } from "../aprendizagemMotor";

const pct = (n: number) => `${Math.round(n * 100)}%`;
const vezes = (n: number) => `${n.toLocaleString("pt-PT", { maximumFractionDigits: 2 })}×`;
const dias = (n: number) => `${n.toLocaleString("pt-PT", { maximumFractionDigits: 1 })} ${n === 1 ? "dia" : "dias"}`;
const obras = (n: number) => `${n} ${n === 1 ? "obra" : "obras"}`;

function estadoLicao(l: Licao): string {
  if (l.aplica) return "entra sozinha nos planos novos";
  if (l.obras < MIN_OBRAS) return `a aprender (${l.obras} de ${MIN_OBRAS} obras)`;
  return "o motor já acerta";
}

export function AprendizagemOlyvia({ S, d }: { S: Pick<Estado, "deals">; d: Negocio }) {
  // as obras todas da empresa (menos esta): é o que o motor usa quando gera um plano novo
  const A = useMemo(() => { try { return aprender(S.deals ?? [], d.id); } catch { return null; } }, [S.deals, d.id, S.deals?.length]);
  if (!A) return null;
  const L = [...A.licoes.values()].sort((a, b) => Number(b.aplica) - Number(a.aplica) || b.obras - a.obras || Math.abs(b.razao - 1) - Math.abs(a.razao - 1));
  const valem = L.filter((x) => x.aplica).length;
  const neste = (d.obra.plano?.tasks ?? []).filter((t) => t.aprendido);
  const ultimo = A.erros[A.erros.length - 1], tend = tendenciaDoErro(A.erros);
  const nObras = new Set(A.erros.map((e) => e.negocio)).size;
  return (
    <section aria-labelledby="aprende-t" className="space-y-3 rounded-3xl border border-border bg-card p-4 sm:p-5">
      <div>
        <h2 id="aprende-t" className="flex items-center gap-2 text-[15px] font-semibold"><Brain className="h-4 w-4 text-primary" aria-hidden="true" />O que a Olyvia aprendeu</h2>
        <p className="text-[15px]">
          {L.length
            ? <>Aprendeu com {A.observacoes} {A.observacoes === 1 ? "tarefa" : "tarefas"} de obra: <b>{valem} {valem === 1 ? "lição entra" : "lições entram"} sozinha{valem === 1 ? "" : "s"}</b> nos planos novos{L.length > valem ? `, ${L.length - valem} ainda a aprender` : ""}.</>
            : "Ainda sem obras acabadas para aprender. Cada tarefa feita em obra, e cada plano validado, ensina o plano seguinte."}
          {ultimo && <> O plano gerado errou {pct(ultimo.erroDias)} nos dias na última obra medida{tend ? ` (${pct(tend.antes)} nas primeiras, ${pct(tend.agora)} nas últimas)` : ""}.</>}
        </p>
        <p className="text-sm text-muted-foreground">Só muda os dias do calendário. As horas e o preço ao cliente ficam os do orçamento, e o gestor valida o plano antes da obra.</p>
      </div>

      {neste.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-[15px] font-semibold">Neste plano</h3>
          <ul className="space-y-1 text-[15px]">
            {neste.map((t, i) => (
              <li key={i}><b className="font-medium">{t.nome}</b>: {dias(t.dias ?? t.dur)} em vez de {dias(t.aprendido!.base)} <span className="text-muted-foreground">(o que {obras(t.aprendido!.obras)} ensinaram)</span></li>
            ))}
          </ul>
        </div>
      )}

      {(L.length > 0 || A.catalogo.length > 0 || A.erros.length > 0) && (
        <details className="group rounded-2xl border border-border">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-[15px] font-medium">
            As lições, o Catálogo e o erro do motor
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="space-y-4 px-3 pb-3">
            {L.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] border-collapse text-left text-[14px]">
                  <caption className="sr-only">As lições por tarefa</caption>
                  <thead><tr className="border-b border-border text-muted-foreground">
                    <th scope="col" className="py-1.5 pr-3 font-medium">Tarefa</th>
                    <th scope="col" className="py-1.5 pr-3 font-medium">Dias reais face ao previsto</th>
                    <th scope="col" className="py-1.5 pr-3 font-medium">Obras</th>
                    <th scope="col" className="py-1.5 font-medium">Estado</th>
                  </tr></thead>
                  <tbody>
                    {L.slice(0, 12).map((l) => (
                      <tr key={l.chave} className="border-b border-border/60 last:border-0">
                        <td className="py-1.5 pr-3">{l.nome}</td>
                        <td className="py-1.5 pr-3 tabular-nums">{vezes(l.razao)}</td>
                        <td className="py-1.5 pr-3 tabular-nums">{l.obras}</td>
                        <td className={l.aplica ? "py-1.5 font-medium text-success" : "py-1.5 text-muted-foreground"}>{estadoLicao(l)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {A.catalogo.length > 0 && (
              <div className="space-y-1">
                <h3 className="text-[15px] font-semibold">Para o Catálogo</h3>
                <p className="text-sm text-muted-foreground">As horas mudam o preço dos próximos orçamentos: decide quem gere o Catálogo.</p>
                <ul className="space-y-1 text-[15px]">
                  {A.catalogo.slice(0, 8).map((c) => (
                    <li key={c.chave}><b className="font-medium">{c.nome}</b>: as obras fizeram {c.reais} h para {c.previstas} h previstas ({vezes(c.razao)}, {obras(c.obras)}).</li>
                  ))}
                </ul>
              </div>
            )}
            {A.erros.length > 0 && (
              <div className="space-y-1">
                <h3 className="text-[15px] font-semibold">O erro do motor, obra a obra</h3>
                <ul className="space-y-1 text-[15px]">
                  {A.erros.slice(-8).map((e) => (
                    <li key={e.negocio}>{e.nome}{e.inicio ? ` · ${e.inicio.split("-").reverse().join("/")}` : ""}: {pct(e.erroDias)} nos dias{e.erroHoras != null ? `, ${pct(e.erroHoras)} nas horas` : ""} <span className="text-muted-foreground">({e.tarefas} {e.tarefas === 1 ? "tarefa" : "tarefas"}{e.comLicoes ? ", plano com lições" : ""})</span></li>
                  ))}
                </ul>
                <p className="text-sm text-muted-foreground">Medido em {obras(nObras)} com tarefas acabadas.</p>
              </div>
            )}
          </div>
        </details>
      )}
    </section>
  );
}
