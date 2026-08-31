import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  ErroDeDados,
  impedimentosDoDia,
  listarEquipa,
  ordensDoDia,
  type MembroEquipa,
} from "../lib/dados";
import { Badge, Card, EmptyState, ErrorState, IconButton, Skeleton, cx } from "../components/ui";
import { AlertTriangle, ChevronLeft, ChevronRight, Clock, User } from "../components/icons";
import {
  HORA_ABRE,
  HORA_FECHA,
  cargaPesada,
  feriadoDoDia,
  horasDaRegua,
  mesmoDia,
  porAtribuir,
  porPessoa,
  posicaoNaRegua,
  somarDias,
  type ImpedimentoDaEquipa,
  type LinhaDaAgenda,
  type OrdemNaAgenda,
} from "../domain/agenda";

/**
 * O dia, com toda a gente lado a lado.
 *
 * A pergunta a que responde é uma só: **quem tem espaço amanhã de manhã?** Foi
 * a coisa que quem coordena mais pediu depois de usar o resto.
 *
 * Duas decisões que vêm de olhar para o calendário do Infraspeak:
 *
 *  · **não carrega vazio à espera de filtros.** Lá, o calendário não mostra
 *    nada até se escolherem filtros, e o resultado é que ninguém o abre;
 *  · **não inventa horas.** Uma ordem sem hora marcada aparece numa faixa
 *    própria, não empilhada às 09:00 a fingir precisão que não existe.
 *
 * Quem não tem nada continua a aparecer. É nas linhas vazias que se vê quem
 * está livre — esconder quem não tem trabalho respondia à pergunta contrária.
 */

const CORES_ORIGEM: Record<string, string> = {
  preventiva: "bg-brand-100 text-brand-800 ring-brand-200",
  corretiva: "bg-amber-100 text-amber-800 ring-amber-200",
  obra: "bg-sky-100 text-sky-800 ring-sky-200",
};

function diaEmPortugues(d: Date): string {
  return d.toLocaleDateString("pt-PT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export default function Agenda() {
  const { activeOrgId, funcao } = useAuth();
  const [dia, setDia] = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const [equipa, setEquipa] = useState<MembroEquipa[]>([]);
  const [ordens, setOrdens] = useState<OrdemNaAgenda[]>([]);
  const [impedimentos, setImpedimentos] = useState<ImpedimentoDaEquipa[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(true);

  const carregar = useCallback(async () => {
    if (!activeOrgId) return;
    setACarregar(true);
    setErro(null);
    try {
      const [e, o, i] = await Promise.all([
        listarEquipa(activeOrgId),
        ordensDoDia(activeOrgId, dia),
        impedimentosDoDia(activeOrgId, dia),
      ]);
      setEquipa(e);
      setOrdens(o);
      setImpedimentos(i);
    } catch (e) {
      setErro(e instanceof ErroDeDados ? e.message : "Não foi possível carregar o dia.");
    } finally {
      setACarregar(false);
    }
  }, [activeOrgId, dia]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const linhas = useMemo(
    () => porPessoa(equipa, ordens, impedimentos),
    [equipa, ordens, impedimentos]
  );
  const semDono = useMemo(() => porAtribuir(ordens), [ordens]);
  const feriado = useMemo(() => feriadoDoDia(impedimentos), [impedimentos]);
  const hoje = mesmoDia(dia, new Date());

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

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold capitalize text-slate-900">
            {diaEmPortugues(dia)}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {ordens.length === 0
              ? "Nada marcado."
              : ordens.length === 1
                ? "1 ordem marcada."
                : `${ordens.length} ordens marcadas.`}
            {feriado && <span className="ml-1 text-amber-700">Feriado: {feriado}.</span>}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <IconButton aria-label="Dia anterior" onClick={() => setDia((d) => somarDias(d, -1))}>
            <ChevronLeft width={16} height={16} />
          </IconButton>
          {!hoje && (
            <button
              type="button"
              onClick={() => {
                const d = new Date();
                d.setHours(0, 0, 0, 0);
                setDia(d);
              }}
              className="rounded-lg px-3 py-2 text-sm font-medium text-brand-800 transition-colors hover:bg-brand-50"
            >
              Hoje
            </button>
          )}
          <IconButton aria-label="Dia seguinte" onClick={() => setDia((d) => somarDias(d, 1))}>
            <ChevronRight width={16} height={16} />
          </IconButton>
        </div>
      </header>

      {erro && <ErrorState message={erro} onRetry={() => void carregar()} />}

      {!erro && aCarregar && <Skeleton className="h-72" />}

      {!erro && !aCarregar && (
        <div className="space-y-4">
          {semDono.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/50">
              <h2 className="flex items-center gap-2 text-sm font-medium text-amber-900">
                <AlertTriangle width={15} height={15} />
                {semDono.length === 1
                  ? "1 ordem marcada e sem ninguém"
                  : `${semDono.length} ordens marcadas e sem ninguém`}
              </h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                {semDono.map((o) => (
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
          )}

          {equipa.length === 0 ? (
            <EmptyState
              icon={<User className="h-6 w-6" />}
              title="Ainda não há equipa em Operações"
              description="Sem pessoas não há dia para desenhar. Acrescenta-as em Definições › Equipa."
            />
          ) : (
            <GrelhaDoDia linhas={linhas} dia={dia} />
          )}
        </div>
      )}
    </div>
  );
}

/**
 * A grelha, separada de quem vai buscar os dados.
 *
 * A separação é para poder ser desenhada com dados a fingir, sem sessão nem
 * base de dados — numa grelha de tempo, o que corre mal é sempre geometria, e
 * geometria não se vê a ler código.
 */
export function GrelhaDoDia({
  linhas,
  dia,
}: {
  linhas: readonly LinhaDaAgenda<MembroEquipa>[];
  dia: Date;
}) {
  return (
            <Card className="overflow-hidden p-0">
              <Regua />
              <ul className="divide-y divide-slate-100">
                {linhas.map(({ pessoa, ordens: minhas, carga, impedimentos: imp }) => {
                  const ausente = imp.find((i) => i.tipo === "ausente");
                  const foraDeHorario = imp.some((i) => i.tipo === "fora_de_horario");

                  return (
                    <li key={pessoa.utilizador_id} className="flex flex-col sm:flex-row">
                      {/* O nome e a carga, sempre visíveis. No telemóvel ficam
                          por cima da barra em vez de a espremerem. */}
                      <div className="flex shrink-0 items-baseline justify-between gap-2 px-3 py-2 sm:w-44 sm:flex-col sm:justify-start sm:gap-0.5">
                        <span className="truncate text-sm font-medium text-slate-800">
                          {pessoa.nome}
                        </span>
                        {/* Quem está de férias não está "livre". São as duas
                            coisas sem ordens, e quem lê a agenda para
                            distribuir trabalho precisa de as distinguir. */}
                        <span
                          className={cx(
                            "whitespace-nowrap text-xs tabular-nums",
                            cargaPesada(carga) ? "font-medium text-amber-700" : "text-slate-400"
                          )}
                        >
                          {ausente
                            ? "ausente"
                            : carga.ordens === 0
                              ? "livre"
                              : `${carga.ordens} · ${carga.horas} h`}
                          {!ausente && carga.semHora > 0 && ` · ${carga.semHora} sem hora`}
                        </span>
                      </div>

                      <div className="relative min-w-0 flex-1 border-t border-slate-100 px-3 py-2 sm:border-l sm:border-t-0">
                        {ausente ? (
                          <div className="flex h-11 items-center rounded-lg bg-slate-100 px-3 text-xs text-slate-500 ring-1 ring-inset ring-slate-200">
                            Ausente — de {new Date(ausente.desde).toLocaleDateString("pt-PT")} a{" "}
                            {new Date(ausente.ate).toLocaleDateString("pt-PT")}
                          </div>
                        ) : (
                          <BarraDoDia ordens={minhas} dia={dia} foraDeHorario={foraDeHorario} />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
  );
}

/**
 * A régua das horas, por cima das linhas.
 *
 * Posicionamento absoluto, com a MESMA conta das barras. Distribuir as marcas
 * com flex parecia mais simples e estava errado das duas maneiras: catorze
 * marcas a um trezeavos da largura dão 107 %, e mesmo sem transbordar as
 * marcas ficavam ao lado das horas em vez de em cima delas.
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
 * As que não têm hora ficam por baixo, em fila. Não é um detalhe estético: uma
 * ordem sem hora marcada é trabalho combinado sem compromisso, e misturá-la na
 * régua daria a entender que já tem sítio no dia.
 */
function BarraDoDia({
  ordens,
  dia,
  foraDeHorario,
}: {
  ordens: readonly OrdemNaAgenda[];
  dia: Date;
  foraDeHorario: boolean;
}) {
  const comHora = ordens
    .map((o) => ({ o, p: posicaoNaRegua(o, dia) }))
    .filter((x): x is { o: OrdemNaAgenda; p: NonNullable<typeof x.p> } => x.p !== null);
  const semHora = ordens.filter((o) => posicaoNaRegua(o, dia) === null);

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
        {/* As linhas das horas, discretas — servem para localizar, não para ler. */}
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
