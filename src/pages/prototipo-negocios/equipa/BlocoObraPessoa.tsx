// O bloco "Obra" na ficha da pessoa do RH (22/10/2026): só para as pessoas que são técnicos de obra (pessoaRhId, ou "p-tec-<id>").
// Antes era a aba RH › Técnicos; os técnicos já são pessoas em Pessoas, por isso a ficha deles ganha este bloco na Visão geral.
// O custo/hora (€/h) entra no custo previsto e no real das obras (obraOps.ts: custosObra); ao lado mostra-se o custo/hora que o salário e os
// encargos no RH dariam, sem o impor. O ofício e as férias também se mudam aqui (as férias contam nos conflitos do plano e na Agenda).
// As tarefas já atribuídas não mudam de técnico. Só a Direção e as Operações mudam a ficha (equipa.edit, ação editarTecnico); os outros veem-na.
// Entra na ficha do RH de exemplo pelo ponto de extensão genérico (rh-exemplo/ficha/extensoesFicha), que o RhPagina fornece.
import { useId, useState } from "react";
import { CalendarX2, HardHat, Lightbulb, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useEstadoRh } from "@/components/rh-exemplo/dados/loja";
import { useCusto } from "@/components/rh-exemplo/dados/lojaCusto";
import { PAPEIS, eur, nfmt } from "../motor";
import { podeNeg } from "../permissoes";
import { obrasDoTecnico, rotuloCurto } from "./regrasAgenda";
import type { EquipaCtx } from "./ctx";
import { sugestaoCustoHora, tecnicoDaPessoaRh } from "./pontes";
import { OFICIOS, garantirTecnicos, type FichaTecnico } from "./tecnicos";

const BOTAO = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[15px] font-medium transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50";
const PRIMARIO = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-[15px] font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50";
const CAMPO = "h-11 rounded-lg border border-input bg-card px-3 text-[15px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60";

/** "17,5" ou "17.5" → 17,5; vazio ou texto → NaN. */
const lerNumero = (s: string): number => (s.trim() ? Number(s.trim().replace(/\s/g, "").replace(",", ".")) : NaN);

/** O bloco "Obra" da pessoa `pessoaId`; nada quando a pessoa não é um técnico de obra. */
export default function BlocoObraPessoa({ pessoaId, S, A, run, irObra }: { pessoaId: string } & Pick<EquipaCtx, "S" | "A" | "run" | "irObra">) {
  garantirTecnicos(S);
  const t = tecnicoDaPessoaRh(pessoaId, S.tecnicos);
  if (!t) return null;
  return <FichaObra key={t.id} t={t} pessoaId={pessoaId} ctx={{ S, A, run, irObra }} />;
}

function FichaObra({ t, pessoaId, ctx }: { t: FichaTecnico; pessoaId: string; ctx: Pick<EquipaCtx, "S" | "A" | "run" | "irObra"> }) {
  const { S, A, run, irObra } = ctx;
  const id = useId();
  const pode = podeNeg(S.role, "equipa.edit");
  const hoje = new Date().toISOString().slice(0, 10);
  const fichaRh = useEstadoRh((e) => e.fichas[pessoaId] ?? null);
  useCusto((e) => e.definicoes); // a sugestão muda com a taxa e o seguro do separador Custos
  const sug = sugestaoCustoHora(fichaRh);
  const [custo, setCusto] = useState(nfmt(t.custoHora));
  const [novaData, setNovaData] = useState("");
  const v = lerNumero(custo);
  const invalido = !Number.isFinite(v) || v <= 0 || v > 200;
  const mudou = !invalido && Math.round(v * 100) / 100 !== t.custoHora;
  const obras = obrasDoTecnico(S.deals, t.id, t.custoHora);
  const ferias = t.feriasDatas ?? [];
  const editar = (m: Parameters<typeof A.editarTecnico>[1]) => run(() => A.editarTecnico(t.id, m));

  return (
    <section aria-labelledby={`${id}-t`} data-testid="bloco-obra-pessoa" className="flex flex-col gap-5 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div>
        <h3 id={`${id}-t`} className="flex items-center gap-2 text-lg font-semibold"><HardHat className="h-5 w-5 text-muted-foreground" aria-hidden="true" />Obra</h3>
        <p className="text-[15px] text-muted-foreground">Técnico de obra · {t.tel} · na empresa desde {t.desde || "—"}</p>
        {!pode && (
          <p className="mt-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-[15px]" role="note">
            Está a ver como {PAPEIS[S.role].n}: pode consultar, mas só a Direção ou as Operações mudam o custo por hora, o ofício e as férias.
          </p>
        )}
      </div>

      {/* o custo/hora */}
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-custo`} className="text-[15px] font-medium">Custo por hora (€/h)</label>
        <div className="flex flex-wrap items-start gap-3">
          <form className="flex items-start gap-2" onSubmit={(e) => { e.preventDefault(); if (mudou) editar({ custoHora: v }); }}>
            <div className="flex flex-col gap-1">
              <input id={`${id}-custo`} inputMode="decimal" value={custo} onChange={(e) => setCusto(e.target.value)} disabled={!pode}
                aria-invalid={invalido || undefined} aria-describedby={`${id}-custo-ajuda`} className={cn(CAMPO, "w-32 tabular-nums", invalido && "border-destructive")} />
              {invalido && <span className="text-sm text-destructive" role="alert">Escreva um valor entre 0 e 200.</span>}
            </div>
            <button type="submit" className={PRIMARIO} disabled={!pode || !mudou}>Guardar</button>
          </form>
          <div id={`${id}-custo-ajuda`} className="flex min-w-0 max-w-md flex-1 gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            {sug ? (
              <span>
                Pelo salário no RH: <b className="tabular-nums">{eur(sug.valor)} €/h</b> ({eur(sug.salario)} € × 14 ÷ 12 + {nfmt(sug.encargosPct)} % de encargos, a dividir por {nfmt(sug.horasMes)} h por mês).
                Não conta o tempo fora da obra nem a estrutura: é um ponto de partida.
                {pode && <button type="button" className="ml-1 font-medium text-primary underline-offset-4 hover:underline" onClick={() => setCusto(nfmt(sug.valor))}>Usar este valor</button>}
              </span>
            ) : <span>Sem salário no RH para sugerir um valor.</span>}
          </div>
        </div>
        <p className="text-sm text-muted-foreground">Entra no custo previsto e no real das obras: as horas de cada tarefa vezes o custo por hora de quem a faz.</p>
      </div>

      {/* o ofício */}
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-sk`} className="text-[15px] font-medium">Ofício</label>
        <select id={`${id}-sk`} value={t.sk} disabled={!pode} onChange={(e) => editar({ sk: e.target.value })} className={cn(CAMPO, "max-w-xs")}>
          {OFICIOS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <p className="text-sm text-muted-foreground">O plano da obra propõe técnicos pelo ofício. As tarefas já atribuídas ficam com quem estão.</p>
      </div>

      {/* as férias */}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-[15px] font-medium">Férias</legend>
        {ferias.length ? (
          <ul className="flex flex-wrap gap-1.5" aria-label={`Férias de ${t.n}`}>
            {ferias.map((d) => (
              <li key={d} className={cn("inline-flex min-h-9 items-center gap-1 rounded-full border border-border pl-3 text-sm", d < hoje && "text-muted-foreground")}>
                {rotuloCurto(d)}/{d.slice(0, 4)}
                <button type="button" disabled={!pode} onClick={() => editar({ feriasDatas: ferias.filter((x) => x !== d) })} aria-label={`Tirar o dia ${d.split("-").reverse().join("/")} das férias`}
                  className="grid h-9 w-9 place-items-center rounded-full hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50">
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><CalendarX2 className="h-4 w-4" aria-hidden="true" />Sem férias marcadas.</p>}
        {pode && (
          <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (novaData) { editar({ feriasDatas: [...ferias, novaData] }); setNovaData(""); } }}>
            <label htmlFor={`${id}-ferias`} className="sr-only">Dia de férias a juntar</label>
            <input id={`${id}-ferias`} type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} className={CAMPO} />
            <button type="submit" className={BOTAO} disabled={!novaData}><Plus className="h-4 w-4" aria-hidden="true" />Juntar dia</button>
          </form>
        )}
        <p className="text-sm text-muted-foreground">Um dia de férias com obra marcada aparece como conflito no plano da obra e na Agenda.</p>
      </fieldset>

      {/* as obras atuais */}
      <div className="flex flex-col gap-2">
        <h4 className="text-[15px] font-medium">Obras atuais</h4>
        {obras.length ? (
          <ul className="flex flex-col gap-1.5">
            {obras.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">#{o.id} · {o.servico} · {o.nome}</span>
                  <span className="block text-sm text-muted-foreground">
                    {o.estado}{o.inicio ? ` · ${rotuloCurto(o.inicio)}${o.fim && o.fim !== o.inicio ? ` a ${rotuloCurto(o.fim)}` : ""}` : ""} · {o.tarefas} {o.tarefas === 1 ? "tarefa" : "tarefas"} · {nfmt(o.horas)} h · {eur(o.custo)} € de mão de obra
                  </span>
                </span>
                <button type="button" className={BOTAO} onClick={() => irObra(o.id)} aria-label={`Abrir a obra #${o.id}`}>Abrir a obra</button>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted-foreground">Sem obras com tarefas dele.</p>}
      </div>
    </section>
  );
}
