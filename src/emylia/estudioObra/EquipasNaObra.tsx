// 27/11 (Rúben: «precisamos de ter equipas já pré-customizadas, e não técnicos isolados; uma área dentro do estúdio para customizar equipas
// e associar à obra; e nas equipas permitir criar novos perfis, que gera novas contas logo, porque podemos ter subcontratados»).
// No separador Equipa do Estúdio da obra: as equipas da empresa (as mesmas da área «Equipas de obra»: neg_equipas_ler/guardar), quem está
// em cada uma e se está livre nos dias desta obra; «Trazer para esta obra» passa as tarefas por começar para os membros do ofício certo
// (A.associarEquipa, um só «anular»); criar e editar equipas aqui mesmo; e «Nova pessoa (subcontratado)» abre a ficha do RH, que cria a
// pessoa e, com «Criar e enviar convite», a conta dela.
import { lazy, Suspense, useMemo, useState } from "react";
import { Check, Pencil, Plus, UserPlus, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { TECS, propostaDeEquipa, type Negocio } from "../motor";
import { podeNeg } from "../permissoes";
import { orgDoModoReal } from "../acessosPortal";
import { ocupacaoDosTecnicos } from "../preparacaoObra";
import { guardarEquipasObra, lerEquipasObra, useEquipasObra, type EquipaObra } from "../equipa/equipasObra";
import { usarTecnicos, type FichaTecnico } from "../equipa/tecnicos";
import { dataDoDia, estadoVivo, nomeNoPlano } from "./planoVivo";
import { isoDia } from "../planoObra";
import type { Ctx } from "../pecas";

// a ficha do RH só carrega quando se abre (é grande)
const NovaPessoaRh = lazy(() => import("./NovaPessoaNaObra"));

const nomeDe = (id: string) => TECS.find((x) => x.id === id)?.n ?? id;
const oficioDe = (id: string) => TECS.find((x) => x.id === id)?.sk ?? "";

export function EquipasNaObra({ ctx, d, pedirEquipa = false, fecharPedido }: { ctx: Ctx; d: Negocio; pedirEquipa?: boolean; fecharPedido?: () => void }) {
  const { S, A, run } = ctx;
  const p = d.obra.plano!;
  const planeia = podeNeg(S.role, "obra.planear");
  const equipas = useEquipasObra();
  const ativas = equipas.filter((e) => e.ativa && e.membros.length);
  const [editar, setEditar] = useState<EquipaObra | "nova" | null>(null);
  const [novaPessoa, setNovaPessoa] = useState(false);
  // 28/11: a pessoa da criação rápida entra logo na lista dos técnicos (sem recarregar); a próxima leitura do Catálogo já a traz do RH
  const [, setNovos] = useState(0);
  const oficiosDoCatalogo = useMemo(() => (S.custos?.perfis ?? []).map((x) => ({ id: x.id, n: x.n })), [S.custos?.perfis]);
  const juntarTecnico = (t: FichaTecnico) => {
    const lista = [...(S.tecnicos ?? (TECS as FichaTecnico[])).filter((x) => x.id !== t.id), t];
    S.tecnicos = lista;
    usarTecnicos(lista);
    setNovos((n) => n + 1);
  };
  // a equipa escolhida para vir: mostra-se a proposta de distribuição antes de aplicar
  const [distribuir, setDistribuir] = useState<EquipaObra | null>(null);
  // os dias que faltam desta obra (de hoje ao fim), para dizer se a equipa está livre
  const diasObra = useMemo(() => {
    const hoje = p.estado === "em curso" ? p.dia : 0, fim = Math.max(hoje, ...p.tasks.map((t) => t.dia + t.dur));
    const out: string[] = [];
    for (let k = hoje; k < fim; k++) { const x = dataDoDia(p, k); if (x) out.push(isoDia(x)); }
    return out;
  }, [p]);
  const ocup = useMemo(() => ocupacaoDosTecnicos(S, d.id), [S, d.id, S.deals]); // eslint-disable-line react-hooks/exhaustive-deps
  const ocupados = (id: string) => diasObra.filter((iso) => ocup.get(id)?.has(iso) || TECS.find((x) => x.id === id)?.feriasDatas?.includes(iso)).length;
  const tarefasDe = (e: EquipaObra) => p.tasks.filter((t) => t.tec && e.membros.includes(t.tec) && estadoVivo(t, p) !== "validada").length;

  return (
    <section aria-label="As equipas" className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[15px] font-semibold"><Users className="h-4 w-4 text-primary" aria-hidden="true" />As equipas</p>
          <p className="text-sm text-muted-foreground">Quem vai sempre junto. «Trazer para esta obra» passa as tarefas por começar para os membros do ofício certo.</p>
        </div>
        {planeia && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="min-h-10 rounded-full" onClick={() => setNovaPessoa(true)}><UserPlus className="mr-1.5 h-4 w-4" aria-hidden="true" />Subcontratados</Button>
            <Button type="button" className="min-h-10 rounded-full" onClick={() => setEditar("nova")}><Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />Nova equipa</Button>
          </div>
        )}
      </div>

      {editar && <EditarEquipa equipa={editar === "nova" ? null : editar} fechar={() => setEditar(null)} />}

      {/* «Juntar uma equipa» (no cabeçalho do separador): escolher qual */}
      {pedirEquipa && !distribuir && (
        <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/[0.03] p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[15px] font-semibold">Que equipa vem para esta obra?</p>
            <button type="button" aria-label="Fechar" onClick={fecharPedido} className="grid h-10 w-10 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
          </div>
          {!ativas.length ? <p className="text-sm text-muted-foreground">Ainda não há equipas: crie uma com «Nova equipa».</p> : (
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {ativas.map((e) => (
                <li key={e.id}>
                  <button type="button" onClick={() => setDistribuir(e)} className="flex min-h-12 w-full items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 text-left text-sm hover:border-primary">
                    <span className="min-w-0"><span className="block font-semibold">{e.nome}</span><span className="block truncate text-xs text-muted-foreground">{e.membros.map((m) => nomeDe(m).split(" ")[0]).join(", ")}</span></span>
                    <span className="text-xs text-primary">Ver a distribuição</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {distribuir && <DistribuirEquipa ctx={ctx} d={d} equipa={distribuir} fechar={() => { setDistribuir(null); fecharPedido?.(); }} />}

      {!ativas.length && !editar ? (
        <p className="rounded-xl bg-muted/40 px-4 py-3 text-sm text-muted-foreground">Ainda não há equipas. Crie a primeira com «Nova equipa»: um nome e quem vai sempre junto.</p>
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2">
          {ativas.map((e) => {
            const n = tarefasDe(e), oc = e.membros.map((m) => ({ m, dias: ocupados(m) })), presos = oc.filter((x) => x.dias > 0);
            return (
              <li key={e.id} className={cn("rounded-xl border p-3", n ? "border-primary/40 bg-primary/[0.04]" : "border-border")}>
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold">{e.nome}{n > 0 && <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">nesta obra · {n} {n === 1 ? "tarefa" : "tarefas"}</span>}</p>
                    <p className={cn("text-xs", presos.length ? "text-amber-800 dark:text-amber-300" : "text-success")}>
                      {presos.length ? presos.map((x) => `${nomeDe(x.m).split(" ")[0]} ocupado ${x.dias} ${x.dias === 1 ? "dia" : "dias"}`).join(", ") + " nos dias desta obra" : "Livres nos dias desta obra"}
                    </p>
                  </div>
                  {planeia && <Button type="button" size="sm" variant="ghost" className="min-h-9 rounded-full" aria-label={`Editar a ${e.nome}`} onClick={() => setEditar(e)}><Pencil className="h-4 w-4" aria-hidden="true" /></Button>}
                </div>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {e.membros.map((m) => <li key={m} className="rounded-full border border-border px-2.5 py-1 text-xs">{nomeDe(m)} <span className="text-muted-foreground">· {oficioDe(m) || "sem ofício"}</span></li>)}
                </ul>
                {planeia && p.estado !== "concluída" && (
                  <Button type="button" size="sm" className="mt-2 min-h-9 rounded-full" onClick={() => setDistribuir(e)}>Trazer para esta obra</Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {novaPessoa && (
        <Suspense fallback={null}>
          <NovaPessoaRh aberto={novaPessoa} fechar={() => setNovaPessoa(false)} oficios={oficiosDoCatalogo} aoCriarTecnico={juntarTecnico}
            aoCriarOficio={(o) => { if (S.custos && !S.custos.perfis.some((x) => x.id === o.id)) S.custos.perfis.push({ id: o.id, n: o.n, salario: null }); }} />
        </Suspense>
      )}
    </section>
  );
}

/** A proposta de distribuição: cada tarefa por começar com o membro que a faz (pelo ofício; sem ninguém do ofício, o menos carregado,
 *  marcado). O gestor troca o que quiser e aplica tudo de uma vez (um só «anular»). */
function DistribuirEquipa({ ctx, d, equipa, fechar }: { ctx: Ctx; d: Negocio; equipa: EquipaObra; fechar: () => void }) {
  const { A, run } = ctx;
  const p = d.obra.plano!;
  const proposta = useMemo(() => propostaDeEquipa(p, equipa.membros), [p, equipa.membros]);
  const [escolha, setEscolha] = useState<Record<number, string>>(() => Object.fromEntries(proposta.map((x) => [x.ti, x.para])));
  const horas = equipa.membros.map((m) => ({ m, h: proposta.filter((x) => escolha[x.ti] === m).reduce((a, x) => a + x.h, 0) }));
  const muda = proposta.filter((x) => escolha[x.ti] !== x.de).length, fora = proposta.filter((x) => !x.doOficio).length;
  const aplicar = () => { run(() => { A.associarEquipa(d.id, equipa, proposta.map((x) => ({ ti: x.ti, para: escolha[x.ti] }))); }); fechar(); };
  return (
    <div aria-label={`Distribuir as tarefas pela ${equipa.nome}`} className="space-y-3 rounded-xl border border-primary/30 bg-primary/[0.03] p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">A {equipa.nome} nesta obra: a distribuição proposta</p>
          <p className="text-sm text-muted-foreground">{proposta.length} {proposta.length === 1 ? "tarefa por começar" : "tarefas por começar"} · {muda} {muda === 1 ? "muda" : "mudam"} de pessoa{fora ? ` · ${fora} sem ninguém do ofício na equipa (vão para quem tem menos trabalho)` : ""}. Troque o que quiser antes de aplicar.</p>
        </div>
        <button type="button" aria-label="Fechar" onClick={fechar} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      <ul className="flex flex-wrap gap-1.5" aria-label="Horas de cada um">
        {horas.map(({ m, h }) => <li key={m} className="rounded-full bg-card px-2.5 py-1 text-xs ring-1 ring-border">{nomeDe(m).split(" ")[0]} · {oficioDe(m) || "sem ofício"} · <span className="font-semibold tabular-nums">{Math.round(h * 10) / 10} h</span></li>)}
      </ul>
      {!proposta.length ? <p className="text-sm text-muted-foreground">Não há tarefas por começar nesta obra.</p> : (
        <ul className="max-h-[50vh] divide-y divide-border overflow-y-auto rounded-xl border border-border bg-card">
          {proposta.map((x) => (
            <li key={x.ti} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1">{nomeNoPlano(p, p.tasks[x.ti])}<span className="text-xs text-muted-foreground"> · {Math.round(x.h * 10) / 10} h{x.de ? ` · era ${nomeDe(x.de).split(" ")[0]}` : ""}</span>
                {!x.doOficio && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/30 dark:text-amber-200">sem o ofício</span>}</span>
              <select aria-label={`Quem faz ${p.tasks[x.ti].nome}`} value={escolha[x.ti]} onChange={(e) => setEscolha((o) => ({ ...o, [x.ti]: e.target.value }))}
                className="min-h-9 rounded-lg border border-input bg-background px-2 text-sm">
                {equipa.membros.map((m) => <option key={m} value={m}>{nomeDe(m)}{oficioDe(m) ? ` · ${oficioDe(m)}` : ""}</option>)}
              </select>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" className="min-h-10" onClick={fechar}>Cancelar</Button>
        <Button type="button" className="min-h-10" disabled={!muda} onClick={aplicar}>Aplicar a distribuição{muda ? ` (${muda})` : ""}</Button>
      </div>
    </div>
  );
}

/** Criar ou editar uma equipa: o nome e os membros (quem já está noutra equipa ativa não aparece). Grava como a área «Equipas de obra». */
function EditarEquipa({ equipa, fechar }: { equipa: EquipaObra | null; fechar: () => void }) {
  const [nome, setNome] = useState(equipa?.nome ?? "");
  const [membros, setMembros] = useState<string[]>(equipa?.membros ?? []);
  const [erro, setErro] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);
  const noutras = new Set(lerEquipasObra().filter((e) => e.ativa && e.id !== equipa?.id).flatMap((e) => e.membros));
  const pessoas = TECS.filter((x) => !noutras.has(x.id)).sort((a, b) => (a.sk ?? "").localeCompare(b.sk ?? "") || a.n.localeCompare(b.n));
  const gravar = async (desativar = false) => {
    setAGravar(true); setErro(null);
    const org = orgDoModoReal();
    const esta: EquipaObra = { id: equipa?.id ?? `eq-${Date.now().toString(36)}`, nome: nome.trim(), membros, ativa: !desativar };
    const L = equipa ? lerEquipasObra().map((e) => (e.id === equipa.id ? esta : e)) : [...lerEquipasObra(), esta];
    const e = await guardarEquipasObra(org ? supabase : null, org, L);
    setAGravar(false);
    if (e) setErro(e); else fechar();
  };
  return (
    <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/[0.03] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[15px] font-semibold">{equipa ? `Editar a ${equipa.nome}` : "Nova equipa"}</p>
        <button type="button" aria-label="Fechar" onClick={fechar} className="grid h-10 w-10 place-items-center rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
      </div>
      <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome (ex.: Equipa do Laureano)" aria-label="Nome da equipa"
        className="h-11 w-full rounded-xl border border-input bg-background px-3 text-[15px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/25" />
      <p className="text-sm text-muted-foreground">Quem vai sempre junto ({membros.length} {membros.length === 1 ? "escolhido" : "escolhidos"}):</p>
      <ul className="grid max-h-64 gap-1 overflow-y-auto sm:grid-cols-2">
        {pessoas.map((x) => {
          const on = membros.includes(x.id);
          return (
            <li key={x.id}>
              <button type="button" aria-pressed={on} onClick={() => setMembros((m) => (on ? m.filter((y) => y !== x.id) : [...m, x.id]))}
                className={cn("flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 text-left text-sm", on ? "border-primary bg-primary/[0.06]" : "border-transparent hover:bg-muted")}>
                <span aria-hidden="true" className={cn("grid h-5 w-5 shrink-0 place-items-center rounded border", on ? "border-primary bg-primary text-primary-foreground" : "border-input")}>{on && <Check className="h-3.5 w-3.5" />}</span>
                <span className="min-w-0 flex-1 truncate">{x.n} <span className="text-muted-foreground">· {x.sk || "sem ofício"}</span></span>
              </button>
            </li>
          );
        })}
      </ul>
      {erro && <p role="alert" className="text-sm font-medium text-destructive">{erro}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        {equipa && <Button type="button" variant="ghost" className="min-h-10 text-destructive" disabled={aGravar} onClick={() => void gravar(true)}>Desfazer a equipa</Button>}
        <Button type="button" variant="ghost" className="min-h-10" onClick={fechar}>Cancelar</Button>
        <Button type="button" className="min-h-10" disabled={!nome.trim() || membros.length < 1 || aGravar} onClick={() => void gravar()}>{aGravar ? "A gravar…" : equipa ? "Guardar" : "Criar a equipa"}</Button>
      </div>
    </div>
  );
}
