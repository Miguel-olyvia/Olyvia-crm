import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  ErroDeDados,
  compromissosDoCRM,
  indisponibilidadesDoPeriodo,
  listarEquipa,
  listarLocais,
  ordensDoPeriodo,
  type IndisponibilidadeNoDia,
  type LocalRow,
  type MembroEquipa,
} from "../lib/dados";
import { Badge, Card, EmptyState, ErrorState, IconButton, Skeleton, cx } from "../components/ui";
import { AlertTriangle, ChevronLeft, ChevronRight, Clock, User } from "../components/icons";
import SeletorDeData from "../components/SeletorDeData";
import RotaDoDia from "../components/RotaDoDia";
import {
  HORA_ABRE,
  HORA_FECHA,
  cargaComCompromissos,
  cargaPesada,
  chaveDoDia,
  diasDaSemana,
  grelhaDoMes,
  horasDaRegua,
  mesmoDia,
  noMesDe,
  porAtribuir,
  porDia,
  posicaoDoCompromisso,
  posicaoNaRegua,
  somarDias,
  type Compromisso,
  type OrdemNaAgenda,
} from "../domain/agenda";

/**
 * O dia, a semana e o mês — com a equipa toda lado a lado.
 *
 * A pergunta a que responde é uma só: **quem tem espaço?** A escala muda
 * conforme se está a marcar uma visita para amanhã (dia), a equilibrar a
 * semana, ou a olhar para o mês antes de aceitar mais trabalho.
 *
 * Três decisões que vêm de olhar para o calendário do Infraspeak:
 *
 *  · **não carrega vazio à espera de filtros.** Lá, o calendário não mostra
 *    nada até se escolherem filtros, e por isso ninguém o abre;
 *  · **não inventa horas.** Uma ordem sem hora marcada aparece à parte, e não
 *    empilhada às 09:00 a fingir precisão que não existe;
 *  · **a agenda é uma só.** Os compromissos que já estão no CRM — visitas
 *    comerciais, formações — aparecem aqui. Sem isso, uma pessoa com a manhã
 *    ocupada aparecia como livre.
 */

type Vista = "dia" | "semana" | "mes";

const CORES_ORIGEM: Record<string, string> = {
  preventiva: "bg-brand-100 text-brand-800 ring-brand-200",
  corretiva: "bg-amber-100 text-amber-800 ring-amber-200",
  obra: "bg-sky-100 text-sky-800 ring-sky-200",
};

/** Os compromissos do CRM têm cor própria: não são trabalho de Operações. */
const COR_CRM = "bg-slate-200 text-slate-700 ring-slate-300";

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];
const DIAS_CURTOS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

function rotuloDoPeriodo(vista: Vista, dia: Date): string {
  if (vista === "dia") {
    return dia.toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" });
  }
  if (vista === "semana") {
    const dias = diasDaSemana(dia);
    const a = dias[0];
    const b = dias[6];
    return a.getMonth() === b.getMonth()
      ? `${a.getDate()} – ${b.getDate()} de ${MESES[b.getMonth()]}`
      : `${a.getDate()} ${MESES[a.getMonth()].slice(0, 3)} – ${b.getDate()} ${MESES[b.getMonth()].slice(0, 3)}`;
  }
  return `${MESES[dia.getMonth()]} de ${dia.getFullYear()}`;
}

/** O que carregar, conforme a vista. */
function periodoDaVista(vista: Vista, dia: Date): [Date, Date] {
  if (vista === "dia") return [dia, dia];
  if (vista === "semana") {
    const dias = diasDaSemana(dia);
    return [dias[0], dias[6]];
  }
  const g = grelhaDoMes(dia);
  return [g[0], g[g.length - 1]];
}

export default function Agenda() {
  const { activeOrgId, funcao } = useAuth();
  const [vista, setVista] = useState<Vista>("dia");
  const [dia, setDia] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [equipa, setEquipa] = useState<MembroEquipa[]>([]);
  const [ordens, setOrdens] = useState<OrdemNaAgenda[]>([]);
  const [indisp, setIndisp] = useState<IndisponibilidadeNoDia[]>([]);
  const [compromissos, setCompromissos] = useState<Compromisso[]>([]);
  const [locais, setLocais] = useState<LocalRow[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(true);

  const [de, ate] = useMemo(() => periodoDaVista(vista, dia), [vista, dia]);

  const carregar = useCallback(async () => {
    if (!activeOrgId) return;
    setACarregar(true);
    setErro(null);
    try {
      const [e, o, i, c, l] = await Promise.all([
        listarEquipa(activeOrgId),
        ordensDoPeriodo(activeOrgId, de, ate),
        indisponibilidadesDoPeriodo(activeOrgId, de, ate),
        compromissosDoCRM(activeOrgId, de, ate),
        listarLocais(activeOrgId),
      ]);
      setEquipa(e);
      setOrdens(o);
      setIndisp(i);
      setCompromissos(c);
      setLocais(l);
    } catch (e) {
      setErro(e instanceof ErroDeDados ? e.message : "Não foi possível carregar a agenda.");
    } finally {
      setACarregar(false);
    }
  }, [activeOrgId, de, ate]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const andar = (n: number) =>
    setDia((d) =>
      vista === "dia"
        ? somarDias(d, n)
        : vista === "semana"
          ? somarDias(d, n * 7)
          : new Date(d.getFullYear(), d.getMonth() + n, 1)
    );

  const podeVer = funcao === "admin" || funcao === "gestor" || funcao === "operador";
  if (!podeVer) {
    return (
      <div className="mx-auto max-w-5xl p-4 sm:p-6">
        <EmptyState
          icon={<Clock className="h-6 w-6" />}
          title="A agenda da equipa é de quem coordena"
          description="Vês o teu trabalho em Hoje e em Ordens. A agenda mostra o dia de toda a gente, e por isso é de quem distribui."
        />
      </div>
    );
  }

  const irParaODia = (d: Date) => {
    setDia(d);
    setVista("dia");
  };

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1">
          <IconButton aria-label="Anterior" onClick={() => andar(-1)}>
            <ChevronLeft width={16} height={16} />
          </IconButton>
          <SeletorDeData valor={dia} aoEscolher={setDia} rotulo={rotuloDoPeriodo(vista, dia)} />
          <IconButton aria-label="Seguinte" onClick={() => andar(1)}>
            <ChevronRight width={16} height={16} />
          </IconButton>
        </div>

        <nav className="flex gap-1 rounded-lg bg-slate-100 p-1" role="tablist">
          {(
            [
              ["dia", "Dia"],
              ["semana", "Semana"],
              ["mes", "Mês"],
            ] as const
          ).map(([v, r]) => (
            <button
              key={v}
              role="tab"
              aria-selected={vista === v}
              onClick={() => setVista(v)}
              className={cx(
                "rounded-md px-3 py-1.5 text-sm font-medium transition",
                vista === v
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              {r}
            </button>
          ))}
        </nav>
      </header>

      {erro && <ErrorState message={erro} onRetry={() => void carregar()} />}
      {!erro && aCarregar && <Skeleton className="h-72" />}

      {!erro && !aCarregar && equipa.length === 0 && (
        <EmptyState
          icon={<User className="h-6 w-6" />}
          title="Ainda não há equipa em Operações"
          description="Sem pessoas não há agenda para desenhar. Acrescenta-as em Definições › Equipa."
        />
      )}

      {!erro && !aCarregar && equipa.length > 0 && (
        <>
          {vista === "dia" && (
            <VistaDoDia
              dia={dia}
              equipa={equipa}
              ordens={ordens}
              indisp={indisp}
              compromissos={compromissos}
              locais={locais}
            />
          )}
          {vista === "semana" && (
            <VistaDaSemana
              dia={dia}
              equipa={equipa}
              ordens={ordens}
              indisp={indisp}
              compromissos={compromissos}
              aoEscolherDia={irParaODia}
            />
          )}
          {vista === "mes" && (
            <VistaDoMes
              dia={dia}
              ordens={ordens}
              indisp={indisp}
              compromissos={compromissos}
              aoEscolherDia={irParaODia}
            />
          )}
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────── Dia ──────────────────────────────────── */

function VistaDoDia({
  dia,
  equipa,
  ordens,
  indisp,
  compromissos,
  locais,
}: {
  dia: Date;
  equipa: readonly MembroEquipa[];
  ordens: readonly OrdemNaAgenda[];
  indisp: readonly IndisponibilidadeNoDia[];
  compromissos: readonly Compromisso[];
  locais: readonly LocalRow[];
}) {
  const chave = chaveDoDia(dia);
  const doDia = useMemo(() => indisp.filter((i) => i.dia.slice(0, 10) === chave), [indisp, chave]);
  const feriado = doDia.find((i) => i.tipo === "feriado")?.detalhe ?? null;
  const semDono = useMemo(() => porAtribuir(ordens), [ordens]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        {ordens.length === 0
          ? "Nada marcado."
          : ordens.length === 1
            ? "1 ordem marcada."
            : `${ordens.length} ordens marcadas.`}
        {compromissos.length > 0 && (
          <span className="ml-1">
            {compromissos.length === 1
              ? "1 compromisso vindo do Olyvia."
              : `${compromissos.length} compromissos vindos do Olyvia.`}
          </span>
        )}
        {feriado && <span className="ml-1 text-amber-700">Feriado: {feriado}.</span>}
      </p>

      {semDono.length > 0 && <SemDono ordens={semDono} />}

      <Card className="overflow-hidden p-0">
        <Regua />
        <ul className="divide-y divide-slate-100">
          {equipa.map((pessoa) => {
            const minhas = ordens.filter((o) => o.responsavel_id === pessoa.utilizador_id);
            const meus = compromissos.filter((c) => c.utilizador_id === pessoa.utilizador_id);
            const meusImp = doDia.filter((i) => i.utilizador_id === pessoa.utilizador_id);
            const carga = cargaComCompromissos(minhas, meus);
            const ausente = meusImp.some((i) => i.tipo === "ausente");
            const foraDeHorario = meusImp.some((i) => i.tipo === "fora_de_horario");
            const total = carga.ordens + carga.compromissos;

            return (
              <li key={pessoa.utilizador_id} className="flex flex-col sm:flex-row">
                {/* O nome e a carga, sempre visíveis. No telemóvel ficam por
                    cima da barra em vez de a espremerem. */}
                <div className="flex shrink-0 items-baseline justify-between gap-2 px-3 py-2 sm:w-44 sm:flex-col sm:justify-start sm:gap-0.5">
                  <span className="truncate text-sm font-medium text-slate-800">{pessoa.nome}</span>
                  {/* Quem está de férias não está "livre". São as duas coisas
                      sem ordens, e quem distribui trabalho tem de as separar. */}
                  <span
                    className={cx(
                      "whitespace-nowrap text-xs tabular-nums",
                      cargaPesada(carga) ? "font-medium text-amber-700" : "text-slate-400"
                    )}
                  >
                    {ausente ? "ausente" : total === 0 ? "livre" : `${total} · ${carga.horas} h`}
                    {!ausente && carga.semHora > 0 && ` · ${carga.semHora} sem hora`}
                  </span>
                </div>

                <div className="relative min-w-0 flex-1 border-t border-slate-100 px-3 py-2 sm:border-l sm:border-t-0">
                  {ausente ? (
                    <div className="flex h-11 items-center rounded-lg bg-slate-100 px-3 text-xs text-slate-500 ring-1 ring-inset ring-slate-200">
                      Ausente neste dia
                    </div>
                  ) : (
                    <BarraDoDia
                      ordens={minhas}
                      compromissos={meus}
                      dia={dia}
                      foraDeHorario={foraDeHorario}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      {/* Depois da grelha, e não antes: primeiro vê-se quem tem o dia cheio,
          e só depois se pergunta quantos quilómetros custa. */}
      <RotaDoDia equipa={equipa} ordens={ordens} locais={locais} />
    </div>
  );
}

function SemDono({ ordens }: { ordens: readonly OrdemNaAgenda[] }) {
  return (
    <Card className="border-amber-200 bg-amber-50/50 p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-medium text-amber-900">
        <AlertTriangle width={15} height={15} />
        {ordens.length === 1
          ? "1 ordem marcada e sem ninguém"
          : `${ordens.length} ordens marcadas e sem ninguém`}
      </h2>
      <ul className="mt-2 flex flex-wrap gap-2">
        {ordens.map((o) => (
          <li key={o.id}>
            <Link
              to={`/ordens/${o.codigo}`}
              className="inline-flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs ring-1 ring-amber-200 transition-colors hover:ring-amber-300"
            >
              <span className="font-mono text-slate-500">{o.codigo}</span>
              <span className="max-w-[14rem] truncate text-slate-800">{o.titulo}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * A régua das horas, por cima das linhas.
 *
 * Posicionamento absoluto, com a MESMA conta das barras. Distribuir as marcas
 * com flex parecia mais simples e estava errado das duas maneiras: catorze
 * marcas a um trezeavos da largura dão 107 %, e mesmo sem transbordar ficavam
 * ao lado das horas em vez de em cima delas.
 */
function Regua() {
  const total = HORA_FECHA - HORA_ABRE;
  return (
    <div className="hidden border-b border-slate-100 bg-slate-50/60 sm:flex">
      <div className="w-44 shrink-0 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
        Equipa
      </div>
      <div className="relative min-w-0 flex-1 border-l border-slate-100 px-3 py-1.5">
        {/* A última marca (20h) ficaria meia fora do ecrã, e a hora de fecho
            não é informação que valha um recorte. */}
        <div className="relative h-3.5">
          {horasDaRegua()
            .slice(0, -1)
            .map((h) => (
              <span
                key={h}
                className="absolute top-0 text-[10px] tabular-nums text-slate-400"
                style={{ left: `${((h - HORA_ABRE) / total) * 100}%` }}
              >
                {h}h
              </span>
            ))}
        </div>
      </div>
    </div>
  );
}

/**
 * As barras de uma pessoa, num dia.
 *
 * As que não têm hora ficam por baixo, em fila. Não é estética: uma ordem sem
 * hora marcada é trabalho combinado sem compromisso, e misturá-la na régua
 * daria a entender que já tem sítio no dia.
 */
function BarraDoDia({
  ordens,
  compromissos,
  dia,
  foraDeHorario,
}: {
  ordens: readonly OrdemNaAgenda[];
  compromissos: readonly Compromisso[];
  dia: Date;
  foraDeHorario: boolean;
}) {
  const comHora = ordens
    .map((o) => ({ o, p: posicaoNaRegua(o, dia) }))
    .filter((x): x is { o: OrdemNaAgenda; p: NonNullable<typeof x.p> } => x.p !== null);
  const semHora = ordens.filter((o) => posicaoNaRegua(o, dia) === null);
  const crm = compromissos
    .map((c) => ({ c, p: posicaoDoCompromisso(c, dia) }))
    .filter((x): x is { c: Compromisso; p: NonNullable<typeof x.p> } => x.p !== null);

  return (
    <div>
      <div
        className={cx(
          "relative h-11 rounded-lg",
          foraDeHorario
            ? "bg-[repeating-linear-gradient(45deg,#f8fafc,#f8fafc_6px,#f1f5f9_6px,#f1f5f9_12px)]"
            : "bg-slate-50"
        )}
      >
        {horasDaRegua()
          .slice(1, -1)
          .map((h) => (
            <span
              key={h}
              aria-hidden="true"
              className="absolute inset-y-1 w-px bg-slate-200/70"
              style={{ left: `${((h - HORA_ABRE) / (HORA_FECHA - HORA_ABRE)) * 100}%` }}
            />
          ))}

        {/* Os compromissos do Olyvia desenham-se primeiro: são contexto, e o
            trabalho de Operações é o que se vem cá fazer. */}
        {crm.map(({ c, p }) => (
          <span
            key={c.compromisso_id}
            title={`${c.titulo}${c.onde ? ` · ${c.onde}` : ""} — já estava na agenda`}
            style={{ left: `${p.esquerda}%`, width: `${p.largura}%` }}
            className={cx(
              "absolute inset-y-1 flex items-center overflow-hidden rounded-md px-1.5 text-[11px] ring-1 ring-inset",
              COR_CRM
            )}
          >
            <span className="truncate">{c.titulo}</span>
          </span>
        ))}

        {comHora.map(({ o, p }) => (
          <Link
            key={o.id}
            to={`/ordens/${o.codigo}`}
            title={`${o.codigo} · ${o.titulo}`}
            style={{ left: `${p.esquerda}%`, width: `${p.largura}%` }}
            className={cx(
              "absolute inset-y-1 flex items-center overflow-hidden rounded-md px-1.5 text-[11px] font-medium ring-1 ring-inset transition-transform hover:z-10 hover:scale-[1.02]",
              CORES_ORIGEM[o.origem] ?? "bg-slate-200 text-slate-700 ring-slate-300",
              p.transborda && "border-l-2 border-dashed border-slate-400"
            )}
          >
            <span className="truncate">{o.titulo}</span>
          </Link>
        ))}
      </div>

      {semHora.length > 0 && (
        <ul className="mt-1.5 flex flex-wrap gap-1.5">
          {semHora.map((o) => (
            <li key={o.id}>
              <Link
                to={`/ordens/${o.codigo}`}
                className="inline-flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-[11px] ring-1 ring-slate-200 transition-colors hover:ring-slate-300"
              >
                <Badge className="bg-slate-100 text-slate-500 ring-slate-200">sem hora</Badge>
                <span className="max-w-[12rem] truncate text-slate-700">{o.titulo}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ────────────────────────────── Semana ────────────────────────────────── */

/**
 * Pessoas em linhas, dias em colunas.
 *
 * A escala muda a pergunta: no dia quer-se saber a que HORAS; na semana, em
 * que DIA. Por isso a célula não desenha barras — mostra quanto, e clica-se
 * para descer ao dia.
 */
function VistaDaSemana({
  dia,
  equipa,
  ordens,
  indisp,
  compromissos,
  aoEscolherDia,
}: {
  dia: Date;
  equipa: readonly MembroEquipa[];
  ordens: readonly OrdemNaAgenda[];
  indisp: readonly IndisponibilidadeNoDia[];
  compromissos: readonly Compromisso[];
  aoEscolherDia: (d: Date) => void;
}) {
  const dias = useMemo(() => diasDaSemana(dia), [dia]);
  const hoje = new Date();

  const ordensPorDia = useMemo(() => porDia(ordens, (o) => o.agendada_para), [ordens]);
  const crmPorDia = useMemo(() => porDia(compromissos, (c) => c.inicio), [compromissos]);
  const impPorDia = useMemo(() => {
    const m = new Map<string, IndisponibilidadeNoDia[]>();
    for (const i of indisp) {
      const k = i.dia.slice(0, 10);
      const l = m.get(k);
      if (l) l.push(i);
      else m.set(k, [i]);
    }
    return m;
  }, [indisp]);

  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[46rem] border-collapse text-sm">
        <thead>
          <tr>
            <th className="w-40 border-b border-slate-100 bg-slate-50/60 px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Equipa
            </th>
            {dias.map((d, i) => (
              <th
                key={chaveDoDia(d)}
                className={cx(
                  "border-b border-l border-slate-100 px-2 py-2 text-center",
                  mesmoDia(d, hoje) ? "bg-brand-50" : "bg-slate-50/60"
                )}
              >
                <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  {DIAS_CURTOS[i]}
                </span>
                <span
                  className={cx(
                    "block text-sm tabular-nums",
                    mesmoDia(d, hoje) ? "font-semibold text-brand-800" : "text-slate-700"
                  )}
                >
                  {d.getDate()}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {equipa.map((pessoa) => (
            <tr key={pessoa.utilizador_id}>
              <td className="px-3 py-2 align-middle">
                <span className="block truncate text-sm font-medium text-slate-800">
                  {pessoa.nome}
                </span>
              </td>
              {dias.map((d) => {
                const k = chaveDoDia(d);
                const minhas = (ordensPorDia.get(k) ?? []).filter(
                  (o) => o.responsavel_id === pessoa.utilizador_id
                );
                const meus = (crmPorDia.get(k) ?? []).filter(
                  (c) => c.utilizador_id === pessoa.utilizador_id
                );
                const imp = (impPorDia.get(k) ?? []).filter(
                  (i) => i.utilizador_id === pessoa.utilizador_id
                );
                const ausente = imp.some((i) => i.tipo === "ausente");
                const feriado = imp.some((i) => i.tipo === "feriado");
                const naoTrabalha = imp.some((i) => i.tipo === "fora_de_horario");
                const carga = cargaComCompromissos(minhas, meus);
                const total = carga.ordens + carga.compromissos;

                return (
                  <td key={k} className="border-l border-slate-100 p-1 align-top">
                    <button
                      type="button"
                      onClick={() => aoEscolherDia(d)}
                      title={`${pessoa.nome} · ${d.toLocaleDateString("pt-PT")}`}
                      className={cx(
                        "flex h-14 w-full flex-col items-center justify-center rounded-md text-xs transition-colors",
                        ausente
                          ? "bg-slate-100 text-slate-400"
                          : feriado && total === 0
                            ? "bg-amber-50 text-amber-700"
                            : naoTrabalha && total === 0
                              ? "bg-[repeating-linear-gradient(45deg,#f8fafc,#f8fafc_5px,#f1f5f9_5px,#f1f5f9_10px)] text-slate-300"
                              : total === 0
                                ? "text-slate-300 hover:bg-slate-50"
                                : cargaPesada(carga)
                                  ? "bg-amber-100 font-medium text-amber-900 hover:bg-amber-200"
                                  : "bg-brand-50 font-medium text-brand-800 hover:bg-brand-100"
                      )}
                    >
                      {ausente ? (
                        <span>férias</span>
                      ) : total === 0 ? (
                        <span>{feriado ? "feriado" : naoTrabalha ? "—" : "livre"}</span>
                      ) : (
                        <>
                          <span className="text-sm tabular-nums">{total}</span>
                          <span className="tabular-nums opacity-70">{carga.horas} h</span>
                        </>
                      )}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/* ─────────────────────────────── Mês ──────────────────────────────────── */

/**
 * O mês, da equipa toda junta.
 *
 * Não há aqui uma linha por pessoa, de propósito: trinta dias vezes seis
 * pessoas são cento e oitenta células, e ninguém lê isso. A pergunta do mês é
 * outra — **em que dias é que a equipa está cheia?** — e responde-se com um
 * número por dia.
 */
function VistaDoMes({
  dia,
  ordens,
  indisp,
  compromissos,
  aoEscolherDia,
}: {
  dia: Date;
  ordens: readonly OrdemNaAgenda[];
  indisp: readonly IndisponibilidadeNoDia[];
  compromissos: readonly Compromisso[];
  aoEscolherDia: (d: Date) => void;
}) {
  const grelha = useMemo(() => grelhaDoMes(dia), [dia]);
  const hoje = new Date();
  const ordensPorDia = useMemo(() => porDia(ordens, (o) => o.agendada_para), [ordens]);
  const crmPorDia = useMemo(() => porDia(compromissos, (c) => c.inicio), [compromissos]);

  const feriados = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of indisp) if (i.tipo === "feriado") m.set(i.dia.slice(0, 10), i.detalhe);
    return m;
  }, [indisp]);

  const maximo = useMemo(
    () => Math.max(1, ...grelha.map((d) => (ordensPorDia.get(chaveDoDia(d)) ?? []).length)),
    [grelha, ordensPorDia]
  );

  return (
    <Card className="p-3 sm:p-4">
      <div className="grid grid-cols-7 gap-1">
        {DIAS_CURTOS.map((d) => (
          <span
            key={d}
            className="pb-1 text-center text-[11px] font-medium uppercase tracking-wide text-slate-400"
          >
            {d}
          </span>
        ))}

        {grelha.map((d) => {
          const k = chaveDoDia(d);
          const doDia = ordensPorDia.get(k) ?? [];
          const crm = crmPorDia.get(k) ?? [];
          const feriado = feriados.get(k);
          const desteMes = noMesDe(d, dia);
          const eHoje = mesmoDia(d, hoje);

          return (
            <button
              key={k}
              type="button"
              onClick={() => aoEscolherDia(d)}
              className={cx(
                "flex h-24 flex-col rounded-lg border p-1.5 text-left transition-colors",
                eHoje ? "border-brand-200 bg-brand-50/40" : "border-slate-100 hover:bg-slate-50",
                !desteMes && "opacity-45"
              )}
            >
              <span className="flex items-baseline justify-between">
                <span
                  className={cx(
                    "text-xs tabular-nums",
                    eHoje ? "font-semibold text-brand-800" : "text-slate-500"
                  )}
                >
                  {d.getDate()}
                </span>
                {crm.length > 0 && (
                  <span className="text-[10px] text-slate-400" title="Compromissos vindos do Olyvia">
                    +{crm.length}
                  </span>
                )}
              </span>

              {feriado && (
                <span className="mt-0.5 truncate text-[10px] text-amber-700">{feriado}</span>
              )}

              {doDia.length > 0 && (
                <>
                  <span className="mt-auto text-sm font-semibold tabular-nums text-slate-800">
                    {doDia.length}
                  </span>
                  {/* Uma barra relativa ao dia mais cheio do mês. Dá a forma do
                      mês num relance, sem se ler número a número. */}
                  <span className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-slate-100">
                    <span
                      className="block h-full rounded-full bg-brand"
                      style={{ width: `${(doDia.length / maximo) * 100}%` }}
                    />
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-slate-500">
        O número é de ordens de Operações. O <span className="text-slate-400">+n</span> em cima são
        compromissos que já estavam na agenda do Olyvia. Carrega num dia para o abrir.
      </p>
    </Card>
  );
}
