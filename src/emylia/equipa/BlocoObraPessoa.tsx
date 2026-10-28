// O bloco "Obra" na ficha da pessoa do RH (22/10/2026): só para as pessoas que são técnicos de obra (pessoaRhId, ou "p-tec-<id>").
// Antes era a aba RH › Técnicos; os técnicos já são pessoas em Pessoas, por isso a ficha deles ganha este bloco na Visão geral.
// 22/10: o custo/hora é só leitura (calculado nos Custos do RH: equipa/pontes.ts custosDoRh). Entra no €/h do ofício (a média dos técnicos dele: receitas e orçamentos) e no real das obras; ao lado mostra-se o custo/hora que o salário e os
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
import { garantirTecnicos, perfilDoTecnico, type FichaTecnico } from "./tecnicos";
import { custosDe, horaPerfil, origemHora } from "../v2/custosModelo";

const BOTAO = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[15px] font-medium transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50";
const CAMPO = "h-11 rounded-lg border border-input bg-card px-3 text-[15px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60";

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
  useCusto((e) => e.definicoes); // o cálculo muda com a taxa e o seguro do separador Custos
  // o detalhe do cálculo: o do RH deste aparelho, ou o guardado na ficha (vindo de outro aparelho)
  const sug = sugestaoCustoHora(fichaRh);
  const rh = sug && sug.valor === t.custoHora ? { salario: sug.salario, encargosPct: sug.encargosPct, horasMes: sug.horasMes } : t.custoRh;
  const [novaData, setNovaData] = useState("");
  const obras = obrasDoTecnico(S.deals, t.id, t.custoHora);
  const ferias = t.feriasDatas ?? [];
  const editar = (m: Parameters<typeof A.editarTecnico>[1]) => run(() => A.editarTecnico(t.id, m));
  // 22/10: o ofício é um perfil do Catálogo; ao lado, o €/h que o orçamento usa para esse ofício (a média dos técnicos dele)
  const C = custosDe(S), perfil = perfilDoTecnico(t), hp = perfil ? horaPerfil(C, perfil) : null;

  return (
    <section aria-labelledby={`${id}-t`} data-testid="bloco-obra-pessoa" className="flex flex-col gap-5 rounded-xl border border-border bg-card p-4 sm:p-5">
      <div>
        <h3 id={`${id}-t`} className="flex items-center gap-2 text-lg font-semibold"><HardHat className="h-5 w-5 text-muted-foreground" aria-hidden="true" />Obra</h3>
        <p className="text-[15px] text-muted-foreground">Técnico de obra · {t.tel} · na empresa desde {t.desde || "—"}</p>
        {!pode && (
          <p className="mt-3 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-[15px]" role="note">
            Está a ver como {PAPEIS[S.role].n}: pode consultar, mas só a Direção ou as Operações mudam o ofício e as férias.
          </p>
        )}
      </div>

      {/* o custo/hora: só leitura, calculado nos Custos do RH (22/10) */}
      <div className="flex flex-col gap-2" data-testid="custo-hora-rh">
        <h4 className="text-[15px] font-medium">Custo/hora (calculado nos Custos do RH)</h4>
        {t.semCustoRh ? (
          <p className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-[15px]" role="note">
            Sem custo no RH: falta a retribuição ou o vínculo desta pessoa. Fica fora da média do ofício{hp?.fonte === "salario" ? ", que usa o salário do perfil" : hp?.fonte === "cargo" ? ", que usa o salário do cargo" : ""}.
          </p>
        ) : t.custoOculto ? (
          // 28/10: o custo de cada técnico só vai a quem vê as retribuições no RH (o €/h do ofício, mais abaixo, vê-se sempre)
          <p className="text-[15px] text-muted-foreground" role="note">O custo/hora de cada técnico só se mostra a quem vê as retribuições no RH.</p>
        ) : (
          <div className="flex min-w-0 max-w-xl gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span>
              <b className="text-[15px] tabular-nums">{eur(t.custoHora)} €/h</b>
              {rh ? <> = ({eur(rh.salario)} € × 14 ÷ 12 + {nfmt(rh.encargosPct)} % de encargos da empresa) ÷ {nfmt(rh.horasMes)} h do contrato por mês.</> : null}
              {" "}Para o mudar, mude a retribuição ou o horário da pessoa no RH (Custos e Contrato).
            </span>
          </div>
        )}
        <p className="text-sm text-muted-foreground">Entra no €/h do ofício (a média dos técnicos dele), que o Catálogo e os orçamentos novos usam, e no custo real das obras. Os orçamentos já enviados não mudam.</p>
        <p className="text-xs text-muted-foreground">O RH de exemplo só vive neste aparelho: uma retribuição mudada aqui chega aos outros aparelhos pelo custo/hora guardado na ficha do técnico.</p>
      </div>

      {/* o ofício: o perfil do Catálogo (22/10) */}
      <div className="flex flex-col gap-2">
        <label htmlFor={`${id}-sk`} className="text-[15px] font-medium">Ofício</label>
        <select id={`${id}-sk`} value={perfil} disabled={!pode} onChange={(e) => editar({ perfilId: e.target.value })} className={cn(CAMPO, "max-w-xs")}>
          {!perfil && <option value="">Sem ofício</option>}
          {C.perfis.map((p) => <option key={p.id} value={p.id}>{p.n}</option>)}
        </select>
        {hp && (
          <p className="text-sm text-muted-foreground" data-testid="media-oficio">
            {hp.eh == null ? "Sem custo/hora neste ofício." : <>O orçamento usa <b className="tabular-nums text-foreground">{eur(hp.eh)} €/h</b> para {hp.n}: {origemHora(hp).replace(/^./, (c) => c.toLowerCase())}.</>}
          </p>
        )}
        <p className="text-sm text-muted-foreground">O €/h de cada ofício nas receitas e nos orçamentos é a média dos técnicos dele. O plano da obra propõe técnicos pelo ofício; as tarefas já atribuídas ficam com quem estão.</p>
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
