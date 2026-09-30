import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { Link } from "react-router-dom";
import {
  ErroDeDados,
  intervencoesDoAtivo,
  leiturasDoAtivo,
  listarAtivos,
  listarClientes,
  pmpDoPeriodo,
  type AtivoComLocal,
  type Cliente,
} from "../lib/dados";
import PainelExportar from "../components/PainelExportar";
import PainelResumo from "../components/PainelResumo";
import {
  Badge,
  Barra,
  Card,
  Combobox,
  EmptyState,
  ErrorState,
  Field,
  Select,
  Skeleton,
  cx,
} from "../components/ui";
import { AlertTriangle, Layers, Clock } from "../components/icons";
import { data as fmtData } from "../lib/formatar";
import {
  agruparPmp,
  ativoProblematico,
  estadoPmp,
  paraOndeVai,
  resumoAtivo,
  resumoPmp,
  seriesDeLeituras,
  type Intervencao,
  type Leitura,
  type LinhaPmp,
  type SerieDeLeituras,
} from "../domain/analises";

/**
 * Análises — as duas perguntas que os dados já sabiam responder.
 *
 * Não há aqui um construtor de relatórios. O Infraspeak tem onze tipos de
 * documento com campos à escolha, e o resultado é que quase ninguém os
 * configura: usam-se dois. Estes são esses dois.
 *
 *  · **PMP** — a manutenção preventiva prometida contra a feita. É o número
 *    que decide se um contrato se renova, e nunca ninguém o somou.
 *
 *  · **Equipamento** — tudo o que já se fez a uma coisa, e a evolução das
 *    leituras. É o que responde a "este extintor tem dado problemas?", que é
 *    a pergunta antes de decidir entre reparar outra vez e substituir.
 *
 * As percentagens vêm sempre acompanhadas das ordens que as compõem. Uma
 * percentagem sozinha nunca responde à pergunta seguinte — "quais falharam?".
 */

type Aba = "resumo" | "pmp" | "ativo" | "medicoes";

/** Os últimos 12 meses, que é o período de que um contrato fala. */
function periodoPorOmissao(): { desde: string; ate: string } {
  const ate = new Date();
  const desde = new Date(ate);
  desde.setMonth(desde.getMonth() - 11);
  desde.setDate(1);
  desde.setHours(0, 0, 0, 0);
  return { desde: desde.toISOString(), ate: ate.toISOString() };
}

const MESES = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

function mesEmPortugues(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${MESES[d.getMonth()]} ${d.getFullYear()}`;
}

export default function Analises() {
  const { activeOrgId } = useAuth();
  const [aba, setAba] = useState<Aba>("resumo");

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold text-slate-900">Análises</h1>
        <p className="mt-1 text-sm text-slate-500">
          O que já está gravado, somado. Nada aqui se escreve.
        </p>
      </header>

      <nav className="mb-5 flex gap-1 rounded-lg bg-slate-100 p-1" role="tablist">
        {([
          ["resumo", "O período"],
          ["pmp", "Manutenção preventiva"],
          ["ativo", "Equipamento"],
          ["medicoes", "Exportar medições"],
        ] as const).map(([id, rotulo]) => (
          <button
            key={id}
            role="tab"
            aria-selected={aba === id}
            onClick={() => setAba(id)}
            className={cx(
              "flex-1 rounded-md px-3 py-2 text-sm font-medium transition",
              aba === id
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            {rotulo}
          </button>
        ))}
      </nav>

      {aba === "resumo" && <PainelResumo orgId={activeOrgId} />}
      {aba === "pmp" && <PainelPmp orgId={activeOrgId} />}
      {aba === "ativo" && <PainelAtivo orgId={activeOrgId} />}
      {aba === "medicoes" && <PainelExportar orgId={activeOrgId} />}
    </div>
  );
}

/* ─────────────────────────── PMP ─────────────────────────── */

function PainelPmp({ orgId }: { orgId: string | null }) {
  const [linhas, setLinhas] = useState<LinhaPmp[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(true);
  const [meses, setMeses] = useState(12);
  const [cliente, setCliente] = useState<string>("");

  const carregar = useCallback(async () => {
    if (!orgId) return;
    setACarregar(true);
    setErro(null);
    try {
      const ate = new Date();
      const desde = new Date(ate);
      desde.setMonth(desde.getMonth() - (meses - 1));
      desde.setDate(1);
      desde.setHours(0, 0, 0, 0);
      const [p, c] = await Promise.all([
        pmpDoPeriodo(orgId, desde.toISOString(), ate.toISOString()),
        listarClientes(orgId),
      ]);
      setLinhas(p);
      setClientes(c);
    } catch (e) {
      setErro(e instanceof ErroDeDados ? e.message : "Não foi possível carregar.");
    } finally {
      setACarregar(false);
    }
  }, [orgId, meses]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const nomeCliente = useMemo(() => {
    const m = new Map(clientes.map((c) => [c.id, c.nome]));
    return (id: string) => m.get(id) ?? "Cliente sem nome";
  }, [clientes]);

  const filtradas = useMemo(
    () => (cliente ? linhas.filter((l) => l.cliente_id === cliente) : linhas),
    [linhas, cliente]
  );

  const total = useMemo(() => resumoPmp(filtradas), [filtradas]);
  const porCliente = useMemo(
    () => agruparPmp(filtradas, (l) => l.cliente_id),
    [filtradas]
  );
  const porMes = useMemo(() => agruparPmp(filtradas, (l) => l.mes), [filtradas]);
  const falhadas = useMemo(
    () => filtradas.filter((l) => l.em_atraso).slice(0, 20),
    [filtradas]
  );

  if (erro) return <ErrorState message={erro} onRetry={() => void carregar()} />;
  if (aCarregar) return <Skeleton className="h-64" />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-3">
        <div className="min-w-0 flex-1">
          <Field label="Período">
            <Select value={meses} onChange={(e) => setMeses(Number(e.target.value))}>
              <option value={3}>Últimos 3 meses</option>
              <option value={6}>Últimos 6 meses</option>
              <option value={12}>Últimos 12 meses</option>
              <option value={24}>Últimos 24 meses</option>
            </Select>
          </Field>
        </div>
        <div className="min-w-0 flex-1">
          <Field label="Cliente">
            <Select value={cliente} onChange={(e) => setCliente(e.target.value)}>
              <option value="">Todos</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      {total.previstas === 0 ? (
        <EmptyState
          icon={<Layers className="h-6 w-6" />}
          title="Não há manutenção preventiva neste período"
          description="O PMP conta ordens preventivas com data marcada. Sem planos ativos não há nada a somar — os planos montam-se em Planos."
        />
      ) : (
        <>
          <Card className="p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-medium text-slate-700">PMP cumprido</h2>
              <span className="text-xs text-slate-500">
                {total.cumpridas} de {total.previstas} ordens previstas
              </span>
            </div>

            <p
              className={cx(
                "mt-2 text-4xl font-semibold tabular-nums",
                estadoPmp(total.percentagem) === "bom" && "text-emerald-600",
                estadoPmp(total.percentagem) === "atencao" && "text-amber-600",
                estadoPmp(total.percentagem) === "mau" && "text-red-600"
              )}
            >
              {total.percentagem}%
            </p>
            <Barra percentagem={total.percentagem} className="mt-2" />

            {/* Uma percentagem alta feita toda com atraso não é o mesmo que
                trabalho feito a horas. Por isso o segundo número aparece
                sempre, e não só quando é mau. */}
            <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-xs text-slate-500">Feitas a horas</dt>
                <dd className="font-medium tabular-nums text-slate-900">
                  {total.percentagemAHoras}%
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Em atraso</dt>
                <dd
                  className={cx(
                    "font-medium tabular-nums",
                    total.emAtraso > 0 ? "text-red-600" : "text-slate-900"
                  )}
                >
                  {total.emAtraso}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Por fazer</dt>
                <dd className="font-medium tabular-nums text-slate-900">{total.porFazer}</dd>
              </div>
            </dl>
          </Card>

          {!cliente && porCliente.length > 1 && (
            <Card className="p-4 sm:p-5">
              <h2 className="text-sm font-medium text-slate-700">Por cliente</h2>
              <ul className="mt-3 divide-y divide-slate-100">
                {porCliente
                  .slice()
                  .sort((a, b) => a.resumo.percentagem - b.resumo.percentagem)
                  .map((g) => (
                    <li key={g.chave} className="flex items-center gap-3 py-2">
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                        {nomeCliente(g.chave)}
                      </span>
                      <span className="text-xs tabular-nums text-slate-500">
                        {g.resumo.cumpridas}/{g.resumo.previstas}
                      </span>
                      <div className="w-24">
                        <Barra percentagem={g.resumo.percentagem} />
                      </div>
                      <span
                        className={cx(
                          "w-12 text-right text-sm font-medium tabular-nums",
                          estadoPmp(g.resumo.percentagem) === "bom" && "text-emerald-600",
                          estadoPmp(g.resumo.percentagem) === "atencao" && "text-amber-600",
                          estadoPmp(g.resumo.percentagem) === "mau" && "text-red-600"
                        )}
                      >
                        {g.resumo.percentagem}%
                      </span>
                    </li>
                  ))}
              </ul>
            </Card>
          )}

          <Card className="p-4 sm:p-5">
            <h2 className="text-sm font-medium text-slate-700">Mês a mês</h2>
            <ul className="mt-3 space-y-2">
              {porMes.map((g) => (
                <li key={g.chave} className="flex items-center gap-3">
                  <span className="w-20 shrink-0 text-xs text-slate-500">
                    {mesEmPortugues(g.chave)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Barra percentagem={g.resumo.percentagem} />
                  </div>
                  <span className="w-16 text-right text-xs tabular-nums text-slate-600">
                    {g.resumo.cumpridas}/{g.resumo.previstas}
                  </span>
                </li>
              ))}
            </ul>
          </Card>

          {falhadas.length > 0 && (
            <Card className="p-4 sm:p-5">
              <h2 className="flex items-center gap-2 text-sm font-medium text-red-700">
                <AlertTriangle className="h-4 w-4" />
                Em atraso, e ainda por fazer
              </h2>
              {/* O que uma percentagem nunca diz: quais. Estas ainda se
                  recuperam, e é por isso que estão aqui e não num relatório. */}
              <ul className="mt-3 divide-y divide-slate-100">
                {falhadas.map((l) => (
                  <li key={l.ordem_id} className="py-2">
                    <Link
                      to={`/ordens/${l.codigo}`}
                      className="flex items-baseline gap-2 text-sm hover:underline"
                    >
                      <span className="font-mono text-xs text-slate-500">{l.codigo}</span>
                      <span className="min-w-0 flex-1 truncate text-slate-800">{l.titulo}</span>
                      <span className="shrink-0 text-xs text-red-600">
                        {fmtData(l.agendada_para)}
                      </span>
                    </Link>
                    <span className="text-xs text-slate-500">{nomeCliente(l.cliente_id)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

/* ─────────────────────── Um equipamento ─────────────────────── */

function PainelAtivo({ orgId }: { orgId: string | null }) {
  const [ativos, setAtivos] = useState<AtivoComLocal[]>([]);
  const [escolhido, setEscolhido] = useState<string>("");
  const [intervencoes, setIntervencoes] = useState<Intervencao[]>([]);
  const [leituras, setLeituras] = useState<Leitura[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aCarregarLista, setACarregarLista] = useState(true);
  const [aCarregarFicha, setACarregarFicha] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    let vivo = true;
    setACarregarLista(true);
    listarAtivos(orgId)
      .then((a) => {
        if (vivo) setAtivos(a);
      })
      .catch((e) => {
        if (vivo) setErro(e instanceof ErroDeDados ? e.message : "Não foi possível carregar.");
      })
      .finally(() => {
        if (vivo) setACarregarLista(false);
      });
    return () => {
      vivo = false;
    };
  }, [orgId]);

  useEffect(() => {
    if (!escolhido) {
      setIntervencoes([]);
      setLeituras([]);
      return;
    }
    let vivo = true;
    setACarregarFicha(true);
    setErro(null);
    Promise.all([intervencoesDoAtivo(escolhido), leiturasDoAtivo(escolhido)])
      .then(([i, l]) => {
        if (!vivo) return;
        setIntervencoes(i);
        setLeituras(l);
      })
      .catch((e) => {
        if (vivo) setErro(e instanceof ErroDeDados ? e.message : "Não foi possível carregar.");
      })
      .finally(() => {
        if (vivo) setACarregarFicha(false);
      });
    return () => {
      vivo = false;
    };
  }, [escolhido]);

  const opcoes = useMemo(
    () =>
      ativos.map((a) => ({
        value: a.id,
        // O local vai no rótulo porque "Extintor 3" sozinho não identifica
        // nada quando há quarenta extintores.
        label: `${a.codigo} · ${a.nome} — ${a.local_nome}`,
      })),
    [ativos]
  );

  const resumo = useMemo(() => resumoAtivo(intervencoes), [intervencoes]);
  const aviso = useMemo(() => ativoProblematico(intervencoes), [intervencoes]);
  const series = useMemo(() => seriesDeLeituras(leituras), [leituras]);
  const ativo = ativos.find((a) => a.id === escolhido);

  if (erro) return <ErrorState message={erro} />;
  if (aCarregarLista) return <Skeleton className="h-64" />;

  return (
    <div className="space-y-5">
      <Field label="Equipamento" hint="Procura pelo código, pelo nome ou pelo local.">
        <Combobox
          options={opcoes}
          value={escolhido}
          onChange={setEscolhido}
          placeholder="Escolhe um equipamento…"
        />
      </Field>

      {!escolhido ? (
        <EmptyState
          icon={<Layers className="h-6 w-6" />}
          title="Escolhe um equipamento"
          description="Vês tudo o que já se lhe fez, e a evolução das leituras ao longo do tempo."
        />
      ) : aCarregarFicha ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          {ativo && (
            <Card className="p-4 sm:p-5">
              <h2 className="text-base font-semibold text-slate-900">{ativo.nome}</h2>
              <p className="text-sm text-slate-500">
                <span className="font-mono text-xs">{ativo.codigo}</span> · {ativo.local_nome}
                {ativo.marca ? ` · ${ativo.marca}` : ""}
                {ativo.modelo ? ` ${ativo.modelo}` : ""}
              </p>

              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-slate-500">Visitas</dt>
                  <dd className="font-medium tabular-nums text-slate-900">{resumo.visitas}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Preventivas</dt>
                  <dd className="font-medium tabular-nums text-slate-900">{resumo.preventivas}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Avarias</dt>
                  <dd
                    className={cx(
                      "font-medium tabular-nums",
                      resumo.corretivas > 0 ? "text-amber-700" : "text-slate-900"
                    )}
                  >
                    {resumo.corretivas}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Última visita</dt>
                  <dd className="font-medium text-slate-900">
                    {resumo.ultimaVisita ? fmtData(resumo.ultimaVisita) : "—"}
                  </dd>
                </div>
              </dl>

              {aviso && (
                <p className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  {aviso}
                </p>
              )}
            </Card>
          )}

          {series.map((s) => (
            <Serie key={s.medicaoDefId} serie={s} />
          ))}

          <Card className="p-4 sm:p-5">
            <h2 className="text-sm font-medium text-slate-700">Tudo o que se lhe fez</h2>
            {intervencoes.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                Ainda não há nenhuma intervenção registada neste equipamento.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {intervencoes.map((i) => (
                  <li key={i.ordem_id} className="py-2">
                    <Link
                      to={`/ordens/${i.codigo}`}
                      className="flex items-baseline gap-2 text-sm hover:underline"
                    >
                      <span className="font-mono text-xs text-slate-500">{i.codigo}</span>
                      <span className="min-w-0 flex-1 truncate text-slate-800">{i.titulo}</span>
                      <span className="shrink-0 text-xs text-slate-500">
                        {fmtData(i.quando)}
                      </span>
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Badge
                        className={cx(
                          i.origem === "corretiva"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-100 text-slate-700"
                        )}
                      >
                        {i.origem}
                      </Badge>
                      {i.nao_conformidades > 0 && (
                        <Badge className="bg-red-100 text-red-700">
                          {i.nao_conformidades} não conforme
                        </Badge>
                      )}
                      {i.estado !== "fechada" && i.estado !== "confirmada" && (
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          <Clock className="h-3 w-3" />
                          {i.estado.replace("_", " ")}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

/**
 * Uma medição ao longo do tempo.
 *
 * Sem biblioteca de gráficos: são barras proporcionais numa lista. Um gráfico
 * a sério traria 60 kB para mostrar seis pontos, e numa lista lê-se o valor
 * exato — que é o que quem faz manutenção quer copiar para um relatório.
 */
function Serie({ serie }: { serie: SerieDeLeituras }) {
  const valores = serie.pontos.map((p) => p.valor_num ?? 0);
  const min = Math.min(...valores, serie.limiteMin ?? Infinity);
  const max = Math.max(...valores, serie.limiteMax ?? -Infinity);
  const amplitude = max - min || 1;
  const rumo = paraOndeVai(serie);

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-slate-700">
          {serie.nome}
          {serie.unidade ? <span className="text-slate-400"> ({serie.unidade})</span> : null}
        </h2>
        <span className="text-xs text-slate-500">
          {serie.limiteMin != null || serie.limiteMax != null
            ? `aceitável ${serie.limiteMin ?? "—"} a ${serie.limiteMax ?? "—"}`
            : "sem limites definidos"}
          {rumo && rumo !== "igual" && (
            <span className="ml-2">{rumo === "sobe" ? "↑ subiu" : "↓ desceu"}</span>
          )}
        </span>
      </div>

      <ul className="mt-3 space-y-1.5">
        {serie.pontos.map((p) => {
          const largura = (((p.valor_num ?? 0) - min) / amplitude) * 100;
          return (
            <li key={p.leitura_id} className="flex items-center gap-2 text-xs">
              <span className="w-20 shrink-0 text-slate-500">{fmtData(p.lida_em)}</span>
              <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={cx(
                    "h-full rounded-full",
                    p.conforme === false ? "bg-red-500" : "bg-emerald-500"
                  )}
                  style={{ width: `${Math.max(2, Math.min(100, largura))}%` }}
                />
              </div>
              <span
                className={cx(
                  "w-16 shrink-0 text-right font-medium tabular-nums",
                  p.conforme === false ? "text-red-600" : "text-slate-800"
                )}
              >
                {p.valor_num}
              </span>
              <Link
                to={`/ordens/${p.codigo}`}
                className="w-24 shrink-0 truncate font-mono text-[11px] text-slate-400 hover:underline"
              >
                {p.codigo}
              </Link>
            </li>
          );
        })}
      </ul>

      {serie.naoConformes > 0 && (
        <p className="mt-3 text-xs text-red-600">
          {serie.naoConformes === 1
            ? "1 leitura ficou fora dos limites."
            : `${serie.naoConformes} leituras ficaram fora dos limites.`}
        </p>
      )}
    </Card>
  );
}
