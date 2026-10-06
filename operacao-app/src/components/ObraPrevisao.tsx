import { useEffect, useMemo, useState } from "react";
import { Button, Card, Input, Select, cx } from "./ui";
import ObraGantt from "./ObraGantt";
import { previsaoDaObra, type PrevisaoBase } from "../lib/margem";
import type { TarefaObra } from "../lib/obras";
import type { FaseGantt, TarefaGantt } from "../domain/obras-gantt";
import {
  diasUteisDeDiferenca,
  fatorPara,
  rotuloRitmo,
  simularPlano,
  type Calendario,
  type Cenario,
  type FatoresPrevisao,
  type TarefaPrevisao,
} from "../domain/previsao";
import { data as formatarData } from "../lib/formatar";

/**
 * Fim provável e "e se…" — nada aqui grava.
 *
 * `modo="resumo"`: uma linha para a ficha da obra — fim do plano, fim
 * previsto (P50) e provável até (P80).
 * `modo="simulador"`: escolher um cenário e ver as datas mudarem, com o
 * Gantt a mostrar o plano atual em sombra.
 */

function paraPrevisao(t: TarefaObra): TarefaPrevisao {
  return {
    id: t.id,
    estado: t.estado,
    inicio: t.inicio_planeado,
    fim: t.fim_planeado,
    minutosPrevistos: t.minutos_previstos,
    minutosEstimativa: t.minutos_estimativa ?? null,
    minutosReais: Number(t.minutos_reais) || 0,
    pessoas: Math.max(1, t.pessoas_previstas ?? (t.pessoas.length || 1)),
    skillId: t.skill_id ?? null,
    dependencias: t.dependencias ?? (t.depende_de ? [t.depende_de] : []),
  };
}

const FONTE: Record<FatoresPrevisao["fonte"], (b: PrevisaoBase) => string> = {
  obra: (b) => `pelo ritmo desta obra (${b.n_obra} tarefa${b.n_obra === 1 ? "" : "s"} feita${b.n_obra === 1 ? "" : "s"})`,
  historico: (b) => `pelo histórico da empresa (${b.n_historico} tarefas terminadas)`,
  sem_dados: () => "ainda sem histórico: P80 = mais 20 %",
};

function diferenca(dias: number): string {
  if (dias === 0) return "igual ao plano";
  const n = Math.abs(dias);
  return `${n} ${n === 1 ? "dia útil" : "dias úteis"} ${dias > 0 ? "depois" : "antes"}`;
}

export default function ObraPrevisao({
  obraId,
  tarefas,
  modo,
  fases,
  tarefasGantt,
  nomes,
  skills,
  recarga,
}: {
  obraId: string;
  tarefas: readonly TarefaObra[];
  modo: "resumo" | "simulador";
  fases?: readonly FaseGantt[];
  tarefasGantt?: readonly TarefaGantt[];
  nomes?: ReadonlyMap<string, string>;
  /** id → nome das especialidades da organização (para o "+1 pessoa"). */
  skills?: ReadonlyMap<string, string>;
  recarga: number;
}) {
  const [base, setBase] = useState<PrevisaoBase | null>(null);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let vivo = true;
    previsaoDaObra(obraId)
      .then((b) => vivo && setBase(b))
      .catch(() => vivo && setErro(true));
    return () => {
      vivo = false;
    };
  }, [obraId, recarga]);

  const entrada = useMemo(() => tarefas.map(paraPrevisao), [tarefas]);

  const fatores: FatoresPrevisao | null = useMemo(
    () =>
      base && {
        p50: base.p50,
        p80: base.p80,
        fonte: base.fonte,
        porEspecialidade: new Map(base.por_especialidade.map((e) => [e.skill_id, { p50: e.p50, p80: e.p80 }])),
      },
    [base]
  );

  const calendario: Calendario | null = useMemo(
    () => base && { diasUteis: base.dias_uteis, hoje: base.hoje, minutosPorDia: base.minutos_por_dia },
    [base]
  );

  const p50 = useMemo(
    () => (fatores && calendario ? simularPlano(entrada, fatorPara(fatores, "p50"), calendario) : null),
    [entrada, fatores, calendario]
  );
  const p80 = useMemo(
    () => (fatores && calendario ? simularPlano(entrada, fatorPara(fatores, "p80"), calendario) : null),
    [entrada, fatores, calendario]
  );

  if (erro || !base || !fatores || !calendario || !p50 || !p80 || !entrada.length) {
    return null;
  }
  const porFazer = entrada.some((t) => t.estado !== "feita" && t.estado !== "validada");
  if (!porFazer) return null;

  if (modo === "resumo") {
    const atraso = diasUteisDeDiferenca(p50.fimPlano, p50.fim, calendario);
    return (
      <p className="text-xs text-slate-500" data-testid="obra-previsao-resumo">
        Fim provável: <b className={cx(atraso > 0 ? "text-amber-700" : "text-slate-700")}>{formatarData(p50.fim)}</b>
        {" · "}até {formatarData(p80.fim)} (P80)
        <span className="text-slate-400"> — {FONTE[fatores.fonte](base)}</span>
      </p>
    );
  }

  return (
    <Simulador
      entrada={entrada}
      fatores={fatores}
      calendario={calendario}
      base={base}
      p50fim={p50.fim}
      p80fim={p80.fim}
      fases={fases ?? []}
      tarefasGantt={tarefasGantt ?? []}
      nomes={nomes ?? new Map()}
      skills={skills ?? new Map()}
      tarefas={tarefas}
    />
  );
}

function Simulador({
  entrada,
  fatores,
  calendario,
  base,
  p50fim,
  p80fim,
  fases,
  tarefasGantt,
  nomes,
  skills,
  tarefas,
}: {
  entrada: TarefaPrevisao[];
  fatores: FatoresPrevisao;
  calendario: Calendario;
  base: PrevisaoBase;
  p50fim: string | null;
  p80fim: string | null;
  fases: readonly FaseGantt[];
  tarefasGantt: readonly TarefaGantt[];
  nomes: ReadonlyMap<string, string>;
  skills: ReadonlyMap<string, string>;
  tarefas: readonly TarefaObra[];
}) {
  const [adiar, setAdiar] = useState("0");
  const [skill, setSkill] = useState("");
  const [tarefaX, setTarefaX] = useState("");
  const [percentagem, setPercentagem] = useState("50");
  const [ritmo, setRitmo] = useState<"plano" | "p50" | "p80">("p50");
  const [verGantt, setVerGantt] = useState(true);

  const abertas = tarefas.filter((t) => t.estado !== "feita" && t.estado !== "validada");
  const skillsNaObra = [...new Set(abertas.map((t) => t.skill_id).filter((s): s is string => !!s))];

  const cenario: Cenario = {
    adiarDias: Math.max(0, Math.min(250, Number(adiar) || 0)),
    maisUmaPessoaEm: skill || null,
    tarefaMaisLonga: tarefaX ? { id: tarefaX, percentagem: Math.max(-90, Math.min(500, Number(percentagem) || 0)) } : null,
  };
  const fator = ritmo === "plano" ? () => 1 : fatorPara(fatores, ritmo);
  const r = simularPlano(entrada, fator, calendario, cenario);
  const semCenario = simularPlano(entrada, fator, calendario);
  const vsPlano = diasUteisDeDiferenca(r.fimPlano, r.fim, calendario);
  const vsSemCenario = diasUteisDeDiferenca(semCenario.fim, r.fim, calendario);

  const mudadas = entrada
    .map((t) => ({ t, d: r.tarefas.get(t.id) }))
    .filter(({ t, d }) => d && (d.inicio !== t.inicio || d.fim !== t.fim))
    .sort((a, b) => (a.d!.inicio < b.d!.inicio ? -1 : 1));
  const nomeDe = new Map(tarefas.map((t) => [t.id, t.nome]));

  const gantt: TarefaGantt[] = tarefasGantt.map((g) => {
    const d = r.tarefas.get(g.id);
    return d
      ? { ...g, inicio: d.inicio, fim: d.fim, inicioOriginal: g.inicio, fimOriginal: g.fim, atraso: null }
      : g;
  });

  const limpar = () => {
    setAdiar("0");
    setSkill("");
    setTarefaX("");
    setPercentagem("50");
  };

  return (
    <div className="space-y-3" data-testid="obra-simulador">
      <Card className="p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800">E se…?</h3>
          <p className="text-xs text-slate-500">Nada aqui grava — é só para ver o efeito.</p>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs text-slate-600">
            Ritmo
            <Select className="mt-1" value={ritmo} onChange={(e) => setRitmo(e.target.value as typeof ritmo)}>
              <option value="plano">Como planeado (1×)</option>
              <option value="p50">Provável — {rotuloRitmo(fatores.p50)}</option>
              <option value="p80">Pessimista (P80) — {rotuloRitmo(fatores.p80)}</option>
            </Select>
          </label>
          <label className="text-xs text-slate-600">
            Adiar o início (dias úteis)
            <Input
              className="mt-1"
              type="number"
              min={0}
              max={250}
              inputMode="numeric"
              value={adiar}
              onChange={(e) => setAdiar(e.target.value)}
            />
          </label>
          <label className="text-xs text-slate-600">
            +1 pessoa em
            <Select className="mt-1" value={skill} onChange={(e) => setSkill(e.target.value)}>
              <option value="">—</option>
              {skillsNaObra.map((s) => (
                <option key={s} value={s}>
                  {skills.get(s) ?? "Especialidade"}
                </option>
              ))}
            </Select>
          </label>
          <div className="text-xs text-slate-600">
            Uma tarefa demora mais
            <div className="mt-1 flex gap-2">
              <Select className="min-w-0 flex-1" value={tarefaX} onChange={(e) => setTarefaX(e.target.value)} aria-label="Tarefa">
                <option value="">—</option>
                {abertas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                  </option>
                ))}
              </Select>
              <Input
                className="w-20"
                type="number"
                inputMode="numeric"
                value={percentagem}
                onChange={(e) => setPercentagem(e.target.value)}
                aria-label="Mais quanto, em percentagem"
                disabled={!tarefaX}
              />
              <span className="self-center">%</span>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-3">
          <div>
            <p className="text-xs text-slate-400">Fim do plano</p>
            <p className="font-mono text-sm tabular text-slate-700">{formatarData(r.fimPlano)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Com este cenário</p>
            <p
              className={cx(
                "font-mono text-lg font-semibold tabular",
                vsPlano > 0 ? "text-amber-700" : vsPlano < 0 ? "text-emerald-700" : "text-slate-900"
              )}
              data-testid="simulador-fim"
            >
              {formatarData(r.fim)}
            </p>
            <p className="text-xs text-slate-500">
              {diferenca(vsPlano)}
              {vsSemCenario !== 0 && <> · o cenário mexe {diferenca(vsSemCenario).replace("igual ao plano", "nada")}</>}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Sem mexer em nada</p>
            <p className="text-sm text-slate-700">
              provável {formatarData(p50fim)} · até {formatarData(p80fim)}
            </p>
            <p className="text-xs text-slate-400">{FONTE[fatores.fonte](base)}</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" onClick={limpar}>
            Limpar cenário
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setVerGantt((v) => !v)}>
            {verGantt ? "Esconder o mapa" : "Ver no mapa"}
          </Button>
        </div>

        {mudadas.length > 0 && (
          <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto text-xs text-slate-600">
            {mudadas.slice(0, 30).map(({ t, d }) => (
              <li key={t.id} className="flex flex-wrap gap-x-2">
                <span className="truncate font-medium text-slate-700">{nomeDe.get(t.id) ?? "Tarefa"}</span>
                <span className="font-mono tabular text-slate-400">
                  {formatarData(t.inicio)} → {formatarData(t.fim)}
                </span>
                <span className="font-mono tabular">
                  passa a {formatarData(d!.inicio)} → {formatarData(d!.fim)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {verGantt && gantt.length > 0 && (
        <div>
          <p className="mb-1 text-xs text-slate-500">As barras são o cenário; a sombra é o plano atual.</p>
          <ObraGantt
            fases={fases}
            tarefas={gantt}
            hoje={calendario.hoje}
            podeEditar={false}
            nomes={nomes}
            comConflito={new Set()}
            selecionada={null}
            aoSelecionar={() => {}}
            aoMudarDatas={() => {}}
          />
        </div>
      )}
    </div>
  );
}
