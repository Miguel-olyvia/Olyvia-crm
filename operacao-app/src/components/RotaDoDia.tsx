import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Select, cx } from "./ui";
import { AlertTriangle, ChevronRight, ExternalLink, MapPin } from "./icons";
import { MAXIMO_DE_PARAGENS, linkParaRota } from "../domain/mapa";
import {
  comoDistancia,
  compararCaminhos,
  distanciaKm,
  horasPorRemarcar,
  type Paragem,
} from "../domain/rota";
import type { OrdemNaAgenda } from "../domain/agenda";
import type { LocalRow, MembroEquipa } from "../lib/dados";

/**
 * O dia de uma pessoa, pela estrada.
 *
 * As ordens aparecem em toda a aplicação pela hora marcada, que é como se
 * combinam com o cliente. Mas quatro ordens em pontos diferentes da cidade,
 * feitas por essa ordem, podem ser o dobro dos quilómetros — e quem conduz
 * nunca soube quantos, porque ninguém lhos disse.
 *
 * Isto mostra as duas hipóteses lado a lado e deixa a decisão a quem coordena.
 * Não reordena nada sozinho: a primeira hora costuma estar combinada, e há
 * razões para uma ordem ser onde é que este ecrã não conhece.
 *
 * A distância é em **linha reta** — ver `domain/rota.ts`. Serve para ordenar,
 * não para prometer quilómetros a ninguém, e o ecrã di-lo.
 */

interface Paragem_ extends Paragem {
  ordem: OrdemNaAgenda;
  local: LocalRow;
}

export default function RotaDoDia({
  equipa,
  ordens,
  locais,
}: {
  equipa: readonly MembroEquipa[];
  ordens: readonly OrdemNaAgenda[];
  locais: readonly LocalRow[];
}) {
  const porLocal = useMemo(() => new Map(locais.map((l) => [l.id, l])), [locais]);

  /** Quem tem ordens hoje. Não faz sentido oferecer quem não tem. */
  const comDia = useMemo(
    () => equipa.filter((p) => ordens.some((o) => o.responsavel_id === p.utilizador_id)),
    [equipa, ordens]
  );

  const [quem, setQuem] = useState<string>("");
  // Se ninguém escolheu, mostra-se o dia mais cheio — é o que tem mais para
  // ganhar, e o que quem coordena vai querer ver primeiro.
  const escolhido =
    quem ||
    comDia
      .map((p) => ({
        id: p.utilizador_id,
        n: ordens.filter((o) => o.responsavel_id === p.utilizador_id).length,
      }))
      .sort((a, b) => b.n - a.n)[0]?.id ||
    "";

  const { paragens, semSitio } = useMemo(() => {
    const minhas = ordens
      .filter((o) => o.responsavel_id === escolhido)
      .slice()
      // A ordem do dia é a das horas. É a partir desta que se compara.
      .sort((a, b) => (a.agendada_para ?? "").localeCompare(b.agendada_para ?? ""));

    const com: Paragem_[] = [];
    const sem: OrdemNaAgenda[] = [];

    for (const o of minhas) {
      const l = o.local_id ? porLocal.get(o.local_id) : undefined;
      if (l && typeof l.latitude === "number" && typeof l.longitude === "number") {
        com.push({ id: o.id, latitude: l.latitude, longitude: l.longitude, ordem: o, local: l });
      } else {
        sem.push(o);
      }
    }
    return { paragens: com, semSitio: sem };
  }, [ordens, escolhido, porLocal]);

  const comparacao = useMemo(() => compararCaminhos(paragens), [paragens]);
  const [pelaEstrada, setPelaEstrada] = useState(false);

  // A comparação devolve `Paragem`, que é só o id e o ponto. Volta-se à
  // paragem inteira para se poder escrever o nome do sítio no ecrã.
  const sequencia = useMemo(() => {
    const escolha = pelaEstrada ? comparacao.melhor : comparacao.atual;
    const porId = new Map(paragens.map((p) => [p.id, p]));
    return escolha.map((p) => porId.get(p.id)!).filter(Boolean);
  }, [pelaEstrada, comparacao, paragens]);

  const km = pelaEstrada ? comparacao.kmMelhor : comparacao.kmAtual;
  const linkDaRota = linkParaRota(sequencia);

  // O preço que não se vê no mapa: cada paragem que cai para trás é uma hora
  // combinada que deixa de bater certo, e um telefonema a um cliente.
  const remarcar = useMemo(
    () => horasPorRemarcar(sequencia.map((p) => p.ordem.agendada_para)),
    [sequencia]
  );

  if (comDia.length === 0) return null;

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-800">O dia pela estrada</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Quantos quilómetros custa o dia, e se outra ordem custaria menos.
          </p>
        </div>

        {comDia.length > 1 && (
          <Select
            value={escolhido}
            onChange={(e) => {
              setQuem(e.target.value);
              setPelaEstrada(false);
            }}
            className="w-full sm:w-52"
            aria-label="De quem é o dia"
          >
            {comDia.map((p) => (
              <option key={p.utilizador_id} value={p.utilizador_id}>
                {p.nome}
              </option>
            ))}
          </Select>
        )}
      </div>

      {paragens.length < 2 ? (
        <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2.5 text-xs leading-relaxed text-slate-500">
          {paragens.length === 0
            ? "Nenhuma ordem deste dia tem um ponto no mapa."
            : "Só uma ordem deste dia tem ponto no mapa — não há caminho para comparar."}{" "}
          Um local ganha ponto em <strong className="font-medium">Definições › Locais</strong>, com
          o GPS do telemóvel ou colando um link do Google Maps.
        </p>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Interruptor
              ligado={!pelaEstrada}
              onClick={() => setPelaEstrada(false)}
              rotulo="Pela hora marcada"
              valor={comoDistancia(comparacao.kmAtual)}
            />
            <Interruptor
              ligado={pelaEstrada}
              onClick={() => setPelaEstrada(true)}
              rotulo="Pela estrada"
              valor={comoDistancia(comparacao.kmMelhor)}
            />
          </div>

          {comparacao.valeAPena && (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs leading-relaxed text-emerald-900">
              <MapPin width={13} height={13} className="mt-0.5 shrink-0" />
              <span>
                Fazer as mesmas paragens por outra ordem poupa{" "}
                <strong className="font-semibold">{comoDistancia(comparacao.poupanca)}</strong>. A
                decisão é de quem coordena — pode haver uma hora combinada que este ecrã não sabe.
              </span>
            </p>
          )}

          <ol className="mt-4 space-y-1">
            {sequencia.map((p, i) => (
              <li key={p.id} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold tabular-nums text-slate-600">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1 border-b border-slate-100 pb-2">
                  <Link
                    to={`/ordens/${p.ordem.codigo}`}
                    className="group flex items-baseline gap-1.5 text-sm text-slate-800 hover:text-brand-800"
                  >
                    <span className="font-mono text-xs text-slate-400">{p.ordem.codigo}</span>
                    <span className="truncate font-medium">{p.ordem.titulo}</span>
                    <ChevronRight
                      width={13}
                      height={13}
                      className="shrink-0 text-slate-300 transition-colors group-hover:text-brand-700"
                    />
                  </Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                    <span className="truncate">{p.local.nome}</span>
                    {i > 0 && (
                      <span className="whitespace-nowrap tabular-nums text-slate-400">
                        + {comoDistancia(distanciaKm(sequencia[i - 1], p))}
                      </span>
                    )}
                    {p.ordem.agendada_para && (
                      <span className="whitespace-nowrap tabular-nums text-slate-400">
                        {new Date(p.ordem.agendada_para).toLocaleTimeString("pt-PT", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    )}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          {pelaEstrada && remarcar > 0 && (
            <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
              <AlertTriangle width={13} height={13} className="mt-0.5 shrink-0" />
              <span>
                Nesta ordem as horas ficam trocadas.{" "}
                <strong className="font-semibold">
                  {remarcar === 1 ? "1 visita teria" : `${remarcar} visitas teriam`}
                </strong>{" "}
                de ser remarcada{remarcar === 1 ? "" : "s"} com o cliente. Os quilómetros
                poupam-se, os telefonemas não.
              </span>
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs tabular-nums text-slate-500">
              {sequencia.length} paragens · cerca de {comoDistancia(km)} em linha reta
            </p>
            {linkDaRota ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => window.open(linkDaRota, "_blank", "noopener,noreferrer")}
              >
                <ExternalLink width={13} height={13} />
                Abrir a rota no Maps
              </Button>
            ) : (
              <span className="text-xs text-slate-400">
                Mais de {MAXIMO_DE_PARAGENS} paragens — o Maps não abre um link tão grande.
              </span>
            )}
          </div>

          {/* Em linha reta, e dito. Prometer quilómetros de estrada com um
              número de pássaro seria mentir com ar de rigor. */}
          <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
            Os quilómetros são em linha reta, de ponto a ponto. A estrada é sempre mais — servem
            para comparar duas ordens de visita, não para planear combustível.
          </p>
        </>
      )}

      {semSitio.length > 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
          <AlertTriangle width={13} height={13} className="mt-0.5 shrink-0" />
          <span>
            {semSitio.length === 1
              ? "1 ordem deste dia ficou de fora"
              : `${semSitio.length} ordens deste dia ficaram de fora`}{" "}
            por o local não ter ponto no mapa:{" "}
            {semSitio.map((o, i) => (
              <span key={o.id}>
                {i > 0 && ", "}
                <Link to={`/ordens/${o.codigo}`} className="font-mono underline-offset-2 hover:underline">
                  {o.codigo}
                </Link>
              </span>
            ))}
            .
          </span>
        </p>
      )}
    </Card>
  );
}

function Interruptor({
  ligado,
  onClick,
  rotulo,
  valor,
}: {
  ligado: boolean;
  onClick: () => void;
  rotulo: string;
  valor: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ligado}
      className={cx(
        "flex flex-col items-start rounded-lg px-3 py-1.5 text-left transition-colors",
        ligado
          ? "bg-brand-50 ring-1 ring-inset ring-brand-200"
          : "bg-slate-50 ring-1 ring-inset ring-transparent hover:bg-slate-100"
      )}
    >
      <span className={cx("text-xs", ligado ? "text-brand-800" : "text-slate-500")}>{rotulo}</span>
      <span
        className={cx(
          "text-sm font-semibold tabular-nums",
          ligado ? "text-brand-900" : "text-slate-700"
        )}
      >
        {valor}
      </span>
    </button>
  );
}
