import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ErroDeDados } from "../lib/dados";
import { capacidadeDaEquipa } from "../lib/capacidade";
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton, cx } from "../components/ui";
import { ObraCapacidade } from "../components/ObraIcones";
import { podePlanear } from "../domain/obras";
import {
  ROTULO_NIVEL,
  ROTULO_TIPO,
  apertos,
  avaliarCelula,
  composicao,
  diaMes,
  fraseAperto,
  horas,
  percentagem,
  type Avaliacao,
  type Capacidade as Dados,
  type EspecialidadeCapacidade,
  type ModoProcura,
  type Nivel,
} from "../domain/capacidade";

/**
 * Capacidade — a pergunta da direção de operações: "vamos ter gente para o
 * que aí vem?". Especialidade × semana, com a procura das obras e do
 * comercial (pesado pela probabilidade) contra a equipa. As contas são da
 * base (rpc_ops_capacidade); aqui só se desenha.
 *
 * Cores = ESTADO (folga / apertado / falta), sempre com o valor escrito e a
 * legenda — nunca a cor sozinha.
 */

// Estado: as cores reservadas para estado (verde/âmbar/vermelho), em fundo
// claro; o texto fica sempre na tinta normal.
const ESTILO_NIVEL: Record<Nivel, CSSProperties> = {
  vazio: { background: "transparent" },
  folga: { background: "rgba(12,163,12,0.10)", boxShadow: "inset 3px 0 0 #0ca30c" },
  apertado: { background: "rgba(250,178,25,0.18)", boxShadow: "inset 3px 0 0 #fab219" },
  falta: { background: "rgba(208,59,59,0.14)", boxShadow: "inset 3px 0 0 #d03b3b" },
  sem_gente: { background: "rgba(208,59,59,0.14)", boxShadow: "inset 3px 0 0 #d03b3b" },
};
const COR_NIVEL: Record<Nivel, string> = {
  vazio: "#cbd5e1",
  folga: "#0ca30c",
  apertado: "#fab219",
  falta: "#d03b3b",
  sem_gente: "#d03b3b",
};

type Selecao = { especialidade: EspecialidadeCapacidade; w: number } | null;

export default function Capacidade() {
  const { activeOrgId, funcao } = useAuth();
  const [dados, setDados] = useState<Dados | null>(null);
  const [aCarregar, setACarregar] = useState(true);
  const [aRecalcular, setARecalcular] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [modo, setModo] = useState<ModoProcura>("tudo");
  const [selecao, setSelecao] = useState<Selecao>(null);

  const carregar = useCallback(
    async (recalcular = false) => {
      if (!activeOrgId) return;
      setErro(null);
      if (recalcular) setARecalcular(true);
      try {
        setDados(await capacidadeDaEquipa(activeOrgId, { recalcular }));
      } catch (e) {
        setErro(e instanceof ErroDeDados ? e.message : "Algo correu mal a calcular a capacidade.");
      } finally {
        setACarregar(false);
        setARecalcular(false);
      }
    },
    [activeOrgId]
  );

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const lista = useMemo(() => (dados ? apertos(dados, modo) : []), [dados, modo]);
  const semanaPorW = useMemo(() => new Map((dados?.semanas ?? []).map((s) => [s.w, s])), [dados]);

  if (!podePlanear(funcao)) {
    return <ErrorState message="A capacidade da equipa é para o gestor." />;
  }
  if (aCarregar) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }
  if (erro) return <ErrorState message={erro} onRetry={() => void carregar()} />;
  if (!dados) return null;

  const r = dados.resumo;
  const semEquipa = dados.especialidades.every((e) => e.pessoas === 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Capacidade</h1>
          <p className="mt-0.5 max-w-2xl text-sm text-slate-500">
            O trabalho que aí vem — obras planeadas, contratos assinados e o que o comercial tem em curso — contra a
            equipa, por especialidade e semana.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div role="radiogroup" aria-label="Que procura contar" className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs">
            {(
              [
                ["tudo", "Com o comercial"],
                ["certo", "Só o certo"],
              ] as const
            ).map(([v, rot]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={modo === v}
                onClick={() => setModo(v)}
                className={cx(
                  "rounded-md px-2.5 py-1.5 font-medium transition-colors",
                  modo === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                {rot}
              </button>
            ))}
          </div>
          <Button variant="secondary" size="sm" onClick={() => void carregar(true)} disabled={aRecalcular}>
            {aRecalcular ? "A recalcular…" : "Recalcular"}
          </Button>
        </div>
      </div>

      {/* O que conta, numa linha. */}
      <p className="text-xs text-slate-500">
        {r.obras} {r.obras === 1 ? "obra" : "obras"} · {r.contratos} {r.contratos === 1 ? "contrato" : "contratos"} sem
        obra · {r.aceites} {r.aceites === 1 ? "orçamento aceite" : "orçamentos aceites"} ·{" "}
        {r.propostas} {r.propostas === 1 ? "proposta" : "propostas"} em curso
        {r.propostas_total > r.propostas && ` (das ${r.propostas_total} mais recentes)`}
        {(r.por_expandir ?? 0) > 0 && ` · ${r.por_expandir} por calcular (Recalcular mais tarde)`}
        {dados.calculado_em && ` · calculado às ${horaDe(dados.calculado_em)}`}
      </p>

      {semEquipa && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900">
          Ninguém da equipa tem especialidades atribuídas, por isso não há oferta para comparar. Atribua-as em
          Definições → Equipa.
        </div>
      )}
      {r.pessoas_sem_especialidade > 0 && !semEquipa && (
        <p className="text-xs text-slate-500">
          {r.pessoas_sem_especialidade}{" "}
          {r.pessoas_sem_especialidade === 1 ? "pessoa da equipa não tem" : "pessoas da equipa não têm"} especialidade e
          não contam na oferta.
        </p>
      )}

      {/* O que pede atenção, em frases. */}
      <Card className="p-4">
        <h2 className="text-sm font-semibold text-slate-800">O que pede atenção</h2>
        {lista.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            Nas próximas {dados.semanas.length} semanas a equipa chega para o trabalho previsto.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {lista.slice(0, 5).map((a) => {
              const esp = dados.especialidades.find((e) => e.id === a.especialidadeId);
              return (
                <li key={`${a.especialidadeId}-${a.semana.w}`}>
                  <button
                    type="button"
                    onClick={() => esp && setSelecao({ especialidade: esp, w: a.semana.w })}
                    className="flex w-full items-start gap-2 rounded-lg px-1.5 py-1 text-left text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <IconeNivel nivel={a.avaliacao.nivel} />
                    <span>{fraseAperto(a)}</span>
                  </button>
                </li>
              );
            })}
            {lista.length > 5 && (
              <li className="pl-7 text-xs text-slate-400">e mais {lista.length - 5} no mapa abaixo.</li>
            )}
          </ul>
        )}
      </Card>

      {/* O mapa: especialidade × semana. */}
      <Card className="p-0">
        {dados.especialidades.length === 0 ? (
          <EmptyState
            icon={<ObraCapacidade width={22} height={22} />}
            title="Ainda sem especialidades"
            description="Crie as especialidades da equipa em Definições para ver a capacidade por ofício."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
              <caption className="sr-only">
                Ocupação da equipa por especialidade e semana: procura a dividir pela oferta.
              </caption>
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th scope="col" className="sticky left-0 z-10 bg-white px-3 py-2 font-medium">
                    Especialidade
                  </th>
                  {dados.semanas.map((s) => (
                    <th key={s.w} scope="col" className="px-1 py-2 text-center font-medium">
                      <span className="block normal-case tracking-normal text-slate-600">{diaMes(s.inicio)}</span>
                      <span className="block text-[10px] normal-case tracking-normal">
                        {s.w === 0 ? "esta semana" : `${s.dias} dias`}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dados.especialidades.map((e) => (
                  <tr key={e.id ?? "sem"}>
                    <th scope="row" className="sticky left-0 z-10 border-t border-slate-100 bg-white px-3 py-1.5 text-left font-normal">
                      <span className="block text-slate-800">{e.nome}</span>
                      <span className="block text-[11px] text-slate-400">
                        {e.id === null ? "tarefas sem ofício" : `${e.pessoas} ${e.pessoas === 1 ? "pessoa" : "pessoas"}`}
                      </span>
                    </th>
                    {e.celulas.map((c) => {
                      const s = semanaPorW.get(c.w);
                      const a = avaliarCelula(c, s?.dias ?? 0, modo);
                      const ativa = selecao?.especialidade.id === e.id && selecao?.w === c.w;
                      return (
                        <td key={c.w} className="border-t border-slate-100 p-0.5">
                          <button
                            type="button"
                            onClick={() => setSelecao(ativa ? null : { especialidade: e, w: c.w })}
                            title={dica(e.nome, s ? diaMes(s.inicio) : "", a)}
                            aria-label={dica(e.nome, s ? diaMes(s.inicio) : "", a)}
                            aria-pressed={ativa}
                            style={ESTILO_NIVEL[a.nivel]}
                            className={cx(
                              "flex h-11 w-full min-w-[56px] flex-col items-center justify-center rounded-md text-xs transition-shadow",
                              ativa && "ring-2 ring-brand ring-offset-1",
                              a.nivel === "vazio" && "text-slate-300"
                            )}
                          >
                            <span className="font-mono tabular font-medium text-slate-800">
                              {a.nivel === "vazio" ? "·" : a.nivel === "sem_gente" ? "sem equipa" : percentagem(a.ocupacao)}
                            </span>
                            {a.faltam > 0 && <span className="text-[10px] text-slate-600">+{a.faltam} pess.</span>}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Legenda />
      </Card>

      {selecao && (
        <Detalhe dados={dados} selecao={selecao} modo={modo} onFechar={() => setSelecao(null)} />
      )}

      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer select-none font-medium text-slate-600">Como se calcula</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Oferta: pessoas ativas da equipa com a especialidade × dias úteis (sem feriados nem ausências aprovadas) ×
            o horário de cada uma. Quem tem vários ofícios conta uma parte em cada.
          </li>
          <li>Obras: as tarefas por fazer, nos dias planeados. O que já devia ter acabado conta esta semana.</li>
          <li>Contratos assinados sem obra: o tempo dos modelos dos serviços, a partir da data de início, a 100 %.</li>
          <li>Orçamentos aceites sem contrato: a 90 %, cerca de um mês depois de aceites.</li>
          <li>
            Propostas enviadas nos últimos 60 dias: × a probabilidade da proposta (ou do negócio), a partir de 3 semanas
            depois da data prevista de fecho.
          </li>
          <li>Para o comercial, uma equipa de 2 pessoas e as fases pela ordem (demolições primeiro, acabamentos no fim).</li>
          <li>Folga até 85 %; apertado até 100 %; acima, falta gente. "+N pess." = pessoas a mais nessa semana.</li>
        </ul>
      </details>
    </div>
  );
}

function horaDe(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

function dica(esp: string, semana: string, a: Avaliacao): string {
  const base = `${esp}, semana de ${semana}: ${ROTULO_NIVEL[a.nivel]}`;
  if (a.nivel === "vazio") return base;
  return `${base} — procura ${horas(a.procura)}, oferta ${horas(a.oferta)}${
    a.faltam > 0 ? `, faltam ~${a.faltam} ${a.faltam === 1 ? "pessoa" : "pessoas"}` : ""
  }`;
}

function IconeNivel({ nivel }: { nivel: Nivel }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden className="mt-0.5 shrink-0" style={{ color: COR_NIVEL[nivel] }}>
      {nivel === "folga" ? (
        <path d="M5 12l4 4 10-10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      ) : nivel === "apertado" ? (
        <path d="M12 4l9 16H3z" fill="currentColor" />
      ) : (
        <>
          <circle cx="12" cy="12" r="9" fill="currentColor" />
          <path d="M12 7v6M12 16.5v.5" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

function Legenda() {
  const itens: [Nivel, string][] = [
    ["folga", "Folga (até 85 %)"],
    ["apertado", "Apertado (85–100 %)"],
    ["falta", "Falta gente (> 100 %)"],
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
      {itens.map(([n, rot]) => (
        <span key={n} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 rounded-sm" style={ESTILO_NIVEL[n]} aria-hidden />
          <IconeNivel nivel={n} />
          {rot}
        </span>
      ))}
      <span className="text-slate-400">· clique numa semana para ver de onde vem o trabalho</span>
    </div>
  );
}

function Detalhe({
  dados,
  selecao,
  modo,
  onFechar,
}: {
  dados: Dados;
  selecao: NonNullable<Selecao>;
  modo: ModoProcura;
  onFechar: () => void;
}) {
  const { especialidade: e, w } = selecao;
  const s = dados.semanas.find((x) => x.w === w);
  const c = e.celulas.find((x) => x.w === w);
  if (!s || !c) return null;
  const a = avaliarCelula(c, s.dias, modo);
  const partes = composicao(dados, e.id, w, modo);

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">
            {e.nome} · semana de {diaMes(s.inicio)}
          </h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <IconeNivel nivel={a.nivel} />
            {ROTULO_NIVEL[a.nivel]} — procura {horas(a.procura)} contra {horas(a.oferta)} de equipa
            {a.ocupacao != null && ` (${percentagem(a.ocupacao)})`}
            {a.faltam > 0 && `; faltam ~${a.faltam} ${a.faltam === 1 ? "pessoa" : "pessoas"}`}
          </p>
          {c.atrasado > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              Inclui {horas(c.atrasado)} de tarefas que já deviam ter acabado.
            </p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={onFechar} aria-label="Fechar o detalhe">
          Fechar
        </Button>
      </div>

      {partes.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Nada previsto para esta especialidade nesta semana.</p>
      ) : (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
              <th className="py-1.5 pr-2 font-medium">De onde vem</th>
              <th className="px-2 font-medium">Tipo</th>
              <th className="px-2 text-right font-medium">Certeza</th>
              <th className="pl-2 text-right font-medium">Horas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {partes.map(({ fonte: f, minutos }) => (
              <tr key={f.id}>
                <td className="py-1.5 pr-2 text-slate-700">
                  {f.tipo === "obra" && f.codigo ? (
                    <Link to={`/obras/${encodeURIComponent(f.codigo)}`} className="font-medium text-brand hover:underline">
                      {f.codigo}
                    </Link>
                  ) : (
                    <span className="font-medium">{f.codigo ?? "—"}</span>
                  )}
                  {f.titulo && <span className="ml-1.5 text-slate-500">{f.titulo}</span>}
                </td>
                <td className="px-2">
                  <Badge>{ROTULO_TIPO[f.tipo]}</Badge>
                </td>
                <td className="px-2 text-right font-mono tabular text-slate-600">{Math.round(f.prob * 100)} %</td>
                <td className="pl-2 text-right font-mono tabular text-slate-800">{horas(minutos)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {modo === "tudo" && partes.some((p) => p.fonte.tipo === "proposta" || p.fonte.tipo === "aceite") && (
        <p className="mt-2 text-xs text-slate-400">
          As horas do comercial já vêm multiplicadas pela certeza (ex.: 10 h a 40 % contam 4 h).
        </p>
      )}
    </Card>
  );
}
