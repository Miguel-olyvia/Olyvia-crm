import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Select, Skeleton, cx } from "./ui";
import { AlertTriangle, ChevronDown, ChevronRight, Inbox } from "./icons";
import { euros } from "../lib/formatar";
import { ErroDeDados } from "../lib/dados";
import { carregarPrevisaoBase, expandirOrcamentos } from "../lib/previsao";
import {
  CRUZAMENTO,
  GERAL,
  analisarOrcamento,
  calcularTarifas,
  capacidadeDaEquipa,
  obrasEmSimultaneo,
  ocupacao,
  ordenarFila,
  simularFila,
  type AnaliseOrcamento,
  type ExpansaoOrcamento,
  type OrdemFila,
  type Periodo,
  type PrevisaoBase,
} from "../domain/previsao";

/**
 * Previsão — "e se estes orçamentos fossem todos aprovados?"
 *
 * Só leitura. Cruza as linhas de cada orçamento com os modelos das obras
 * (o mesmo motor que cria as obras), soma horas, pessoas e custos, e põe-nos
 * contra a equipa: quantas obras em simultâneo, onde está o gargalo, e quando
 * começaria e acabaria cada uma se entrassem na fila.
 *
 * Todas as escolhas são listas — nada de campos de texto livre.
 */

const ESTADOS: Record<string, string> = {
  rascunho: "Rascunho",
  enviado: "Enviado",
  aceite: "Aceite",
  finalizado: "Finalizado",
};
const ESTADOS_POR_DEFEITO = new Set(["enviado", "aceite", "finalizado"]);

const OPCOES_DIAS = [
  [30, "Últimos 30 dias"],
  [90, "Últimos 90 dias"],
  [180, "Últimos 6 meses"],
  [365, "Último ano"],
] as const;

type Contrato = "todos" | "contratados" | "sem_contrato";
type QuemTrabalha = "tecnicos" | "com_supervisores" | "todos";
const FUNCOES: Record<QuemTrabalha, string[] | null> = {
  tecnicos: ["tecnico", "operador"],
  com_supervisores: ["tecnico", "operador", "supervisor"],
  todos: null,
};

const ORDENS: [OrdemFila, string][] = [
  ["data", "Pela data (o mais antigo primeiro)"],
  ["contratados", "Contratados primeiro"],
  ["valor", "Maior valor primeiro"],
  ["margem", "Maior margem primeiro"],
];

const horas = (min: number) => `${(min / 60).toLocaleString("pt-PT", { maximumFractionDigits: 1 })} h`;
const dataCurta = (d: string | null) =>
  d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "2-digit" }) : "—";
const pct = (v: number) => (Number.isFinite(v) ? `${Math.round(v * 100)} %` : "∞");

function corOcupacao(v: number): string {
  if (v === 0) return "bg-slate-50 text-slate-400";
  if (v <= 0.85) return "bg-emerald-50 text-emerald-800";
  if (v <= 1) return "bg-amber-50 text-amber-800";
  return "bg-red-50 text-red-700";
}

export default function PrevisaoOrcamentos({
  orgId,
  clientes,
}: {
  orgId: string;
  clientes: Map<string, string>;
}) {
  const [dias, setDias] = useState<number>(180);
  const [base, setBase] = useState<PrevisaoBase | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(true);
  const [recarga, setRecarga] = useState(0);

  const [expansoes, setExpansoes] = useState<Map<string, ExpansaoOrcamento>>(new Map());
  const [aCruzar, setACruzar] = useState<{ feitos: number; total: number } | null>(null);
  const [erroCruzar, setErroCruzar] = useState<string | null>(null);

  const [estados, setEstados] = useState<Set<string>>(new Set(ESTADOS_POR_DEFEITO));
  const [comercial, setComercial] = useState("todos");
  const [contrato, setContrato] = useState<Contrato>("todos");
  const [quem, setQuem] = useState<QuemTrabalha>("tecnicos");
  const [comCarga, setComCarga] = useState<"sim" | "nao">("sim");
  const [ordemFila, setOrdemFila] = useState<OrdemFila>("data");
  const [periodo, setPeriodo] = useState<Periodo>("semana");
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());
  const [aberto, setAberto] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setACarregar(true);
    setErro(null);
    carregarPrevisaoBase(orgId, dias)
      .then((b) => vivo && setBase(b))
      .catch((e) => vivo && setErro(e instanceof ErroDeDados ? e.message : "Algo correu mal a carregar a previsão."))
      .finally(() => vivo && setACarregar(false));
    return () => {
      vivo = false;
    };
  }, [orgId, dias, recarga]);

  const nomeSkill = useMemo(() => {
    const m = new Map((base?.skills ?? []).map((s) => [s.id, s.nome]));
    return (k: string) => (k === GERAL ? "Sem especialidade (qualquer pessoa)" : (m.get(k) ?? "Especialidade inativa"));
  }, [base]);

  const comerciais = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of base?.orcamentos ?? []) if (o.comercial_id) m.set(o.comercial_id, o.comercial_nome ?? "Sem nome");
    return [...m].sort((a, b) => a[1].localeCompare(b[1]));
  }, [base]);

  const estadosPresentes = useMemo(
    () => [...new Set((base?.orcamentos ?? []).map((o) => o.estado))].sort(),
    [base]
  );

  const filtrados = useMemo(
    () =>
      (base?.orcamentos ?? []).filter(
        (o) =>
          estados.has(o.estado) &&
          (comercial === "todos" || (comercial === "sem" ? !o.comercial_id : o.comercial_id === comercial)) &&
          (contrato === "todos" || (contrato === "contratados" ? o.contratado : !o.contratado))
      ),
    [base, estados, comercial, contrato]
  );

  // O cruzamento, por lotes, só dos que ainda não foram cruzados.
  useEffect(() => {
    const faltam = filtrados.map((o) => o.id).filter((id) => !expansoes.has(id));
    if (!faltam.length) return;
    let vivo = true;
    setErroCruzar(null);
    setACruzar({ feitos: 0, total: faltam.length });
    expandirOrcamentos(orgId, faltam, (feitos) => vivo && setACruzar({ feitos, total: faltam.length }))
      .then((xs) => {
        if (!vivo) return;
        setExpansoes((m) => {
          const n = new Map(m);
          for (const x of xs) n.set(x.id, x);
          // Os que a base não devolveu (não deviam existir) não ficam a pedir outra vez.
          for (const id of faltam) if (!n.has(id)) n.set(id, { id, linhas: [] });
          return n;
        });
      })
      .catch((e) => vivo && setErroCruzar(e instanceof ErroDeDados ? e.message : "Não foi possível cruzar com os modelos."))
      .finally(() => vivo && setACruzar(null));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, filtrados]);

  const equipa = useMemo(() => {
    const f = FUNCOES[quem];
    return (base?.equipa ?? []).filter((p) => !f || f.includes(p.funcao));
  }, [base, quem]);

  const calculo = useMemo(() => {
    if (!base) return null;
    const tarifas = calcularTarifas(base.equipa, base.custo_hora_medio);
    const todas = filtrados.map((o) => analisarOrcamento(o, expansoes.get(o.id), tarifas));
    const cenario = todas.filter((a) => !excluidos.has(a.orcamento.id));
    const cap = capacidadeDaEquipa(equipa);
    const simult = obrasEmSimultaneo(cenario, cap);
    const fila = simularFila(
      ordenarFila(cenario, ordemFila),
      cap,
      base.dias_uteis,
      comCarga === "sim" ? base.carga_atual : [],
      nomeSkill
    );
    const ocup = ocupacao(fila, cap, periodo);
    const lugar = new Map(fila.lugares.map((l) => [l.id, l]));
    const soma = (f: (a: AnaliseOrcamento) => number | null) =>
      cenario.reduce<number | null>((s, a) => {
        const v = f(a);
        return v == null || s == null ? null : s + v;
      }, 0);
    const valor = soma((a) => (a.orcamento.valor_sem_iva == null ? 0 : Number(a.orcamento.valor_sem_iva)));
    const margem = base.ve_custos ? soma((a) => a.margem) : null;
    const fins = fila.lugares.map((l) => l.fim).filter((f): f is string => !!f).sort();
    const fim = fins.length ? fins[fins.length - 1] : null;
    return {
      todas,
      cenario,
      cap,
      simult,
      ocup,
      lugar,
      kpi: {
        n: cenario.length,
        valor,
        minutos: cenario.reduce((s, a) => s + a.minutos, 0),
        custo: base.ve_custos ? soma((a) => a.custoMaoObra) : null,
        margem,
        margemPct: margem != null && valor ? Math.round((margem / valor) * 1000) / 10 : null,
        fim,
        bloqueados: fila.lugares.filter((l) => l.bloqueio).length,
        linhasFalhadas: cenario.reduce((s, a) => s + a.linhasFalhadas, 0),
        porCruzar: cenario.filter((a) => !a.expandido).length,
      },
    };
  }, [base, filtrados, expansoes, excluidos, equipa, ordemFila, comCarga, periodo, nomeSkill]);

  if (aCarregar && !base) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }
  if (erro) return <ErrorState message={erro} onRetry={() => setRecarga((r) => r + 1)} />;
  if (!base || !calculo) return null;

  const { kpi, simult, ocup, lugar, cap } = calculo;
  const alternar = (id: string) =>
    setExcluidos((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        E se todos estes orçamentos fossem aprovados? Cada linha é cruzada com o modelo do seu serviço (o mesmo que cria as
        obras) e o total é posto contra a equipa. Só leitura — nada é criado.
      </p>

      {/* ── Escolhas ─────────────────────────────────────────────────── */}
      <Card className="space-y-3 p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Orçamentos de">
            <Select value={dias} onChange={(e) => setDias(Number(e.target.value))} className="w-full">
              {OPCOES_DIAS.map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Comercial">
            <Select value={comercial} onChange={(e) => setComercial(e.target.value)} className="w-full">
              <option value="todos">Todos</option>
              {comerciais.map(([id, nome]) => (
                <option key={id} value={id}>
                  {nome}
                </option>
              ))}
              <option value="sem">Sem comercial</option>
            </Select>
          </Field>
          <Field label="Contrato">
            <Select value={contrato} onChange={(e) => setContrato(e.target.value as Contrato)} className="w-full">
              <option value="todos">Todos</option>
              <option value="contratados">Só assinados e contratualizados</option>
              <option value="sem_contrato">Só os ainda sem contrato assinado</option>
            </Select>
          </Field>
          <Field label="Quem conta como equipa">
            <Select value={quem} onChange={(e) => setQuem(e.target.value as QuemTrabalha)} className="w-full">
              <option value="tecnicos">Técnicos e operadores</option>
              <option value="com_supervisores">Técnicos, operadores e supervisores</option>
              <option value="todos">Toda a equipa ativa</option>
            </Select>
          </Field>
          <Field label="Obras já planeadas">
            <Select value={comCarga} onChange={(e) => setComCarga(e.target.value as "sim" | "nao")} className="w-full">
              <option value="sim">Contam (a equipa já está ocupada com elas)</option>
              <option value="nao">Não contam (equipa livre)</option>
            </Select>
          </Field>
          <Field label="Ordem da fila">
            <Select value={ordemFila} onChange={(e) => setOrdemFila(e.target.value as OrdemFila)} className="w-full">
              {ORDENS.map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Ocupação por">
            <Select value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)} className="w-full">
              <option value="semana">Semana</option>
              <option value="mes">Mês</option>
            </Select>
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-medium text-slate-700">Estado do orçamento:</span>
          {estadosPresentes.map((e) => (
            <button
              key={e}
              type="button"
              aria-pressed={estados.has(e)}
              onClick={() =>
                setEstados((s) => {
                  const n = new Set(s);
                  if (n.has(e)) n.delete(e);
                  else n.add(e);
                  return n;
                })
              }
              className={cx(
                "rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition-colors",
                estados.has(e) ? "bg-brand-50 text-brand-800 ring-brand-200" : "bg-white text-slate-500 ring-slate-200"
              )}
            >
              {ESTADOS[e] ?? e}
            </button>
          ))}
        </div>
      </Card>

      {aCruzar && (
        <p className="text-xs text-slate-500" role="status">
          A cruzar com os modelos… {aCruzar.feitos}/{aCruzar.total}
        </p>
      )}
      {erroCruzar && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erroCruzar}</p>}

      {calculo.todas.length === 0 ? (
        <EmptyState
          icon={<Inbox width={22} height={22} />}
          title="Nenhum orçamento com estes filtros"
          description="Muda o período, o estado, o comercial ou o contrato."
        />
      ) : (
        <>
          {/* ── Indicadores ────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="kpis">
            <Kpi titulo="Orçamentos no cenário" valor={String(kpi.n)} nota={`de ${calculo.todas.length} filtrados`} />
            <Kpi titulo="Valor (sem IVA)" valor={euros(kpi.valor)} />
            <Kpi titulo="Horas de trabalho" valor={horas(kpi.minutos)} nota="pessoa × hora" />
            <Kpi
              titulo="Obras em simultâneo"
              valor={String(simult.obras)}
              nota={simult.gargalo ? `gargalo: ${nomeSkill(simult.gargalo)}` : undefined}
              alerta={simult.obras === 0 && kpi.n > 0}
            />
            {base.ve_custos && <Kpi titulo="Mão de obra prevista" valor={euros(kpi.custo)} nota="pelas tarifas da equipa" />}
            {base.ve_custos && (
              <Kpi
                titulo="Margem prevista"
                valor={euros(kpi.margem)}
                nota={kpi.margemPct != null ? `${kpi.margemPct.toLocaleString("pt-PT")} % do valor` : undefined}
                alerta={kpi.margem != null && kpi.margem < 0}
              />
            )}
            <Kpi
              titulo="A fila acaba em"
              valor={dataCurta(kpi.fim)}
              nota={kpi.bloqueados ? `${kpi.bloqueados} sem lugar` : "todas com lugar"}
              alerta={kpi.bloqueados > 0}
            />
            <Kpi
              titulo="Linhas sem modelo"
              valor={String(kpi.linhasFalhadas)}
              nota={kpi.porCruzar ? `${kpi.porCruzar} orçamento(s) por cruzar` : "cruzamento a corrigir em Modelos"}
              alerta={kpi.linhasFalhadas > 0}
            />
          </div>

          {/* ── Capacidade ─────────────────────────────────────────────── */}
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-slate-800">Tenho gente para quantas obras ao mesmo tempo?</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Para uma obra média deste cenário: o que precisa por dia em cada especialidade, contra o que a equipa dá
              ({equipa.length} {equipa.length === 1 ? "pessoa" : "pessoas"}; quem tem várias especialidades conta uma parte
              em cada).
            </p>
            {simult.porSkill.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Ainda não há trabalho cruzado para medir.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm" data-testid="tabela-capacidade">
                  <thead className="text-xs text-slate-500">
                    <tr>
                      <th className="py-1.5 pr-3 font-medium">Especialidade</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Pessoas</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Dá por dia</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Uma obra pede/dia</th>
                      <th className="py-1.5 pr-3 text-right font-medium">Equipa por obra</th>
                      <th className="py-1.5 text-right font-medium">Obras em simultâneo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simult.porSkill.map((s) => (
                      <tr key={s.skill} className={cx("border-t border-slate-100", s.skill === simult.gargalo && "bg-amber-50/60")}>
                        <td className="py-1.5 pr-3 text-slate-800">
                          {nomeSkill(s.skill)}
                          {s.skill === simult.gargalo && <Badge className="ml-2 bg-amber-100 text-amber-800 ring-amber-200">gargalo</Badge>}
                        </td>
                        <td className={cx("py-1.5 pr-3 text-right tabular", s.pessoas === 0 && "font-semibold text-red-700")}>
                          {s.pessoas === 0 ? "falta" : s.pessoas}
                        </td>
                        <td className="py-1.5 pr-3 text-right tabular">{horas(s.minutosDia)}</td>
                        <td className="py-1.5 pr-3 text-right tabular">{horas(s.necessidadeDia)}</td>
                        <td className="py-1.5 pr-3 text-right tabular">{s.pessoasPorObra}</td>
                        <td className="py-1.5 text-right font-semibold tabular">{Number.isFinite(s.obras) ? s.obras : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* ── Ocupação ───────────────────────────────────────────────── */}
          <Card className="p-4">
            <h2 className="text-sm font-semibold text-slate-800">
              Ocupação por especialidade, {periodo === "semana" ? "semana a semana" : "mês a mês"}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Com a fila acima{comCarga === "sim" ? " e as obras já planeadas" : ""}. Verde até 85 %, amarelo até 100 %,
              vermelho acima — falta gente.
            </p>
            {ocup.porSkill.size === 0 ? (
              <p className="mt-3 text-sm text-slate-500">Sem carga no horizonte.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="text-xs" data-testid="tabela-ocupacao">
                  <thead>
                    <tr className="text-slate-500">
                      <th className="sticky left-0 bg-white py-1 pr-3 text-left font-medium">Especialidade</th>
                      {ocup.periodos.map((p) => (
                        <th key={p} className="px-1 py-1 text-center font-medium whitespace-nowrap">
                          {periodo === "semana" ? dataCurta(p).replace(/ \d+$/, "") : p.slice(5) + "/" + p.slice(2, 4)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...ocup.porSkill].map(([k, vs]) => (
                      <tr key={k}>
                        <td className="sticky left-0 bg-white py-1 pr-3 whitespace-nowrap text-slate-700">
                          {nomeSkill(k)}
                          {!(cap.get(k)?.minutosDia ?? 0) && <span className="ml-1 text-red-700">(ninguém)</span>}
                        </td>
                        {vs.map((v, i) => (
                          <td key={i} className={cx("px-1 py-1 text-center tabular", corOcupacao(v))}>
                            {v === 0 ? "·" : pct(v)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* ── Os orçamentos ──────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-800">Orçamentos ({calculo.todas.length})</h2>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setExcluidos(new Set())}>
                Todos no cenário
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setExcluidos(new Set(calculo.todas.map((a) => a.orcamento.id)))}
              >
                Nenhum
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            {calculo.todas.map((a) => {
              const o = a.orcamento;
              const l = lugar.get(o.id);
              const noCenario = !excluidos.has(o.id);
              const exp = expansoes.get(o.id);
              return (
                <Card key={o.id} className={cx("p-3", !noCenario && "opacity-60")}>
                  <div className="flex flex-wrap items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-brand"
                      checked={noCenario}
                      onChange={() => alternar(o.id)}
                      aria-label={`Incluir ${o.numero} no cenário`}
                    />
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setAberto(aberto === o.id ? null : o.id)}
                      aria-expanded={aberto === o.id}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        {aberto === o.id ? (
                          <ChevronDown width={14} height={14} className="text-slate-400" />
                        ) : (
                          <ChevronRight width={14} height={14} className="text-slate-400" />
                        )}
                        <span className="font-mono text-sm text-slate-500">{o.numero}</span>
                        <span className="text-sm font-medium text-slate-800">{o.titulo}</span>
                        <Badge className="bg-slate-50 text-slate-600 ring-slate-200">{ESTADOS[o.estado] ?? o.estado}</Badge>
                        {o.contratado ? (
                          <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">contratualizado</Badge>
                        ) : (
                          <Badge className="bg-slate-50 text-slate-500 ring-slate-200">sem contrato assinado</Badge>
                        )}
                        {a.linhasFalhadas > 0 && (
                          <Badge className="bg-amber-50 text-amber-800 ring-amber-200">
                            {a.linhasFalhadas} {a.linhasFalhadas === 1 ? "linha sem modelo" : "linhas sem modelo"}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {o.cliente_id ? (clientes.get(o.cliente_id) ?? "Cliente") : "Sem cliente"}
                        {" · "}
                        {o.comercial_nome ?? "sem comercial"}
                      </p>
                    </button>
                    <div className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-0.5 text-right text-xs sm:grid-cols-4">
                      <Num titulo="trabalho" valor={a.expandido ? horas(a.minutos) : "…"} />
                      <Num titulo="duração" valor={a.expandido ? `${a.dias} d úteis` : "…"} />
                      <Num
                        titulo="na fila"
                        valor={!noCenario ? "fora" : l?.bloqueio ? "sem lugar" : l?.inicio ? `${dataCurta(l.inicio)} → ${dataCurta(l.fim)}` : "…"}
                        alerta={!!l?.bloqueio && noCenario}
                      />
                      {base.ve_custos ? (
                        <Num
                          titulo="margem"
                          valor={a.margem == null ? "—" : `${euros(a.margem)}${a.margemPercent != null ? ` · ${a.margemPercent.toLocaleString("pt-PT")} %` : ""}`}
                          alerta={a.margem != null && a.margem < 0}
                        />
                      ) : (
                        <Num titulo="valor" valor={euros(o.valor_sem_iva)} />
                      )}
                    </div>
                  </div>

                  {aberto === o.id && (
                    <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                      {l?.bloqueio && noCenario && (
                        <p className="flex items-center gap-1 text-xs text-red-700">
                          <AlertTriangle width={12} height={12} /> {l.bloqueio}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                        <span>Valor sem IVA: {euros(o.valor_sem_iva)}</span>
                        {base.ve_custos && <span>· Material: {euros(o.custo_material)}</span>}
                        {base.ve_custos && <span>· Mão de obra prevista: {euros(a.custoMaoObra)}</span>}
                        {base.ve_custos && <span>· Mão de obra orçada: {euros(o.mao_obra_orcada)}</span>}
                      </div>
                      {a.porSkill.size > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {[...a.porSkill].map(([k, c]) => (
                            <Badge key={k} className="bg-slate-50 text-slate-700 ring-slate-200">
                              {nomeSkill(k)}: {horas(c.minutos)} · {c.pessoas} {c.pessoas === 1 ? "pessoa" : "pessoas"}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {!exp ? (
                        <p className="text-xs text-slate-500">A cruzar com os modelos…</p>
                      ) : exp.linhas.length === 0 ? (
                        <p className="text-xs text-slate-500">Este orçamento não tem linhas.</p>
                      ) : (
                        <ul className="space-y-2">
                          {exp.linhas.map((ln) => {
                            const c = CRUZAMENTO[ln.cruzamento];
                            return (
                              <li key={ln.id} className="rounded-lg bg-slate-50/70 p-2">
                                <div className="flex flex-wrap items-center gap-2 text-sm">
                                  <span className="text-slate-800">{ln.servico_nome ?? ln.descricao}</span>
                                  <span className="text-xs text-slate-500">
                                    × {Number(ln.qt).toLocaleString("pt-PT")} {ln.unidade ?? ""}
                                  </span>
                                  <Badge
                                    className={cx(
                                      c.falha
                                        ? "bg-amber-50 text-amber-800 ring-amber-200"
                                        : ln.cruzamento === "modelo"
                                          ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                                          : "bg-slate-50 text-slate-500 ring-slate-200"
                                    )}
                                  >
                                    <span title={c.ajuda}>{c.rotulo}</span>
                                  </Badge>
                                </div>
                                {c.falha && <p className="mt-0.5 text-xs text-amber-800">{c.ajuda}</p>}
                                {ln.passos.length > 0 && (
                                  <table className="mt-1.5 w-full text-xs">
                                    <tbody>
                                      {ln.passos.map((p, i) => (
                                        <tr key={i} className="border-t border-slate-200/60">
                                          <td className="py-1 pr-2 text-slate-400">F{p.fase}</td>
                                          <td className="py-1 pr-2 text-slate-700">{p.nome}</td>
                                          <td className="py-1 pr-2 text-slate-500">{p.skill_id ? nomeSkill(p.skill_id) : "—"}</td>
                                          <td className="py-1 pr-2 text-right tabular">{horas(p.minutos)}</td>
                                          <td className="py-1 pr-2 text-right tabular">
                                            {p.pessoas} {p.pessoas === 1 ? "pessoa" : "pessoas"}
                                          </td>
                                          <td className="py-1 text-right text-slate-500">
                                            {Number(p.espera_antes_horas) > 0 ? `espera ${p.espera_antes_horas} h` : ""}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          <p className="text-[11px] text-slate-400">
            Contas: minutos dos passos = pessoa × minuto; fases em série, especialidades em paralelo dentro da fase;
            esperas em dias corridos; {base.dias_uteis.length} dias úteis de horizonte, com os feriados da organização.
            Custos pelas tarifas (custo/hora) de quem tem a especialidade; sem tarifa, a média da equipa.
          </p>
        </>
      )}
    </div>
  );
}

function Kpi({ titulo, valor, nota, alerta }: { titulo: string; valor: string; nota?: string; alerta?: boolean }) {
  return (
    <Card className="p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{titulo}</p>
      <p className={cx("mt-0.5 text-lg font-semibold tabular", alerta ? "text-red-700" : "text-slate-900")}>{valor}</p>
      {nota && <p className="text-[11px] text-slate-500">{nota}</p>}
    </Card>
  );
}

function Num({ titulo, valor, alerta }: { titulo: string; valor: string; alerta?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{titulo}</p>
      <p className={cx("font-mono tabular", alerta ? "text-red-700" : "text-slate-700")}>{valor}</p>
    </div>
  );
}
