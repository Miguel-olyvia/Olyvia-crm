import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ErroDeEscrita,
  agendarOrdem,
  atribuirOrdem,
  type AvisoDeAgenda,
  type Conflito,
  type MembroEquipa,
} from "../lib/dados";
import { Badge, Button, Card, Combobox, Field, Input, cx } from "./ui";
import { AlertTriangle, Check, Clock, User } from "./icons";
import { ROTULO_FUNCAO, type Funcao } from "../domain/tipos";

/**
 * Quem vai, e quando.
 *
 * Duas decisões que no Infraspeak vivem em ecrãs diferentes, e que aqui estão
 * lado a lado porque na prática tomam-se ao mesmo tempo: escolhe-se a pessoa
 * olhando para o dia dela.
 *
 * O choque de agenda AVISA, não impede. Há dias em que se marca mesmo duas
 * coisas seguidas e se sabe porquê; o que não pode acontecer é marcar-se sem
 * dar por isso. Por isso o aviso aparece depois de gravar, com o código da
 * outra ordem e um link para lá ir — e a marcação fica feita.
 */

export default function PainelDespacho({
  ordemId,
  estado,
  responsavelId,
  equipaDaOrdem,
  agendadaPara,
  janelaInicio,
  janelaFim,
  equipa,
  podeDespachar,
  aoGravar,
}: {
  ordemId: string;
  estado: string;
  responsavelId: string | null;
  equipaDaOrdem: readonly string[];
  agendadaPara: string | null;
  janelaInicio: string | null;
  janelaFim: string | null;
  equipa: readonly MembroEquipa[];
  /** Falso para um técnico: distribuir trabalho é de quem coordena. */
  podeDespachar: boolean;
  aoGravar: () => void;
}) {
  const [resp, setResp] = useState(responsavelId ?? "");
  const [extra, setExtra] = useState<string[]>(
    equipaDaOrdem.filter((u) => u !== responsavelId)
  );
  const [quando, setQuando] = useState(paraInput(agendadaPara));
  const [ini, setIni] = useState(paraInput(janelaInicio));
  const [fim, setFim] = useState(paraInput(janelaFim));

  const [aGravar, setAGravar] = useState<"atribuir" | "agendar" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [conflitos, setConflitos] = useState<Conflito[] | null>(null);
  const [avisos, setAvisos] = useState<AvisoDeAgenda[]>([]);

  const fechada = ["fechada", "confirmada", "cancelada"].includes(estado);
  const ativo = podeDespachar && !fechada;

  const correr = async (qual: "atribuir" | "agendar", fn: () => Promise<void>) => {
    setAGravar(qual);
    setErro(null);
    try {
      await fn();
      aoGravar();
    } catch (e) {
      setErro(
        e instanceof ErroDeEscrita
          ? e.message
          : "Não foi possível falar com o servidor. Tenta outra vez."
      );
    } finally {
      setAGravar(null);
    }
  };

  const gravarAtribuicao = () =>
    correr("atribuir", async () => {
      await atribuirOrdem({
        ordemId,
        responsavelId: resp || null,
        equipa: [...extra, ...(resp ? [resp] : [])],
      });
      setConflitos(null);
      setAvisos([]);
    });

  const gravarAgenda = () =>
    correr("agendar", async () => {
      const r = await agendarOrdem({
        ordemId,
        agendadaPara: new Date(quando).toISOString(),
        janelaInicio: ini ? new Date(ini).toISOString() : null,
        janelaFim: fim ? new Date(fim).toISOString() : null,
      });
      setConflitos(r.conflitos);
      setAvisos(r.avisos);
    });

  if (fechada) return null;

  const opcoes = equipa.map((m) => ({
    value: m.utilizador_id,
    label: `${m.nome} · ${ROTULO_FUNCAO[m.funcao as Funcao] ?? m.funcao}`,
  }));

  return (
    <Card className="p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-slate-800">Quem vai, e quando</h2>

      {!podeDespachar && (
        <p className="mt-2 text-sm text-slate-400">
          Quem coordena é que distribui o trabalho e marca as datas.
        </p>
      )}

      {podeDespachar && (
        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          {/* ── Atribuir ─────────────────────────────────────────────── */}
          <div className="space-y-3">
            <Field
              label="Responsável"
              hint="Quem entra na ordem passa a poder executá-la."
            >
              <Combobox
                value={resp}
                onChange={setResp}
                options={opcoes}
                placeholder="Por atribuir"
                className="w-full"
                disabled={!ativo}
                icon={<User width={14} height={14} />}
              />
            </Field>

            {equipa.length > 1 && (
              <div>
                <span className="text-[13px] font-medium text-slate-700">Vai mais alguém?</span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {equipa
                    .filter((m) => m.utilizador_id !== resp)
                    .map((m) => {
                      const dentro = extra.includes(m.utilizador_id);
                      return (
                        <button
                          key={m.utilizador_id}
                          type="button"
                          disabled={!ativo}
                          onClick={() =>
                            setExtra((xs) =>
                              dentro
                                ? xs.filter((x) => x !== m.utilizador_id)
                                : [...xs, m.utilizador_id]
                            )
                          }
                          className={cx(
                            "rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 transition-all",
                            "active:scale-[0.98] disabled:opacity-50",
                            dentro
                              ? "bg-brand text-white ring-brand"
                              : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300"
                          )}
                        >
                          {dentro && <Check width={11} height={11} className="mr-1 inline" />}
                          {m.nome}
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            <Button size="sm" disabled={!ativo || aGravar !== null} onClick={() => void gravarAtribuicao()}>
              {aGravar === "atribuir" ? "A gravar…" : "Gravar quem vai"}
            </Button>
          </div>

          {/* ── Agendar ──────────────────────────────────────────────── */}
          <div className="space-y-3 lg:border-l lg:border-slate-100 lg:pl-5">
            <Field label="Data e hora">
              <Input
                type="datetime-local"
                value={quando}
                disabled={!ativo}
                onChange={(e) => setQuando(e.target.value)}
                className="w-full"
              />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Janela — de" hint="Opcional.">
                <Input
                  type="datetime-local"
                  value={ini}
                  disabled={!ativo}
                  onChange={(e) => setIni(e.target.value)}
                  className="w-full"
                />
              </Field>
              <Field label="até">
                <Input
                  type="datetime-local"
                  value={fim}
                  disabled={!ativo}
                  onChange={(e) => setFim(e.target.value)}
                  className="w-full"
                />
              </Field>
            </div>

            <Button
              size="sm"
              disabled={!ativo || !quando || aGravar !== null}
              onClick={() => void gravarAgenda()}
            >
              <Clock width={14} height={14} />
              {aGravar === "agendar" ? "A gravar…" : "Marcar"}
            </Button>
          </div>
        </div>
      )}

      {erro && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

      {conflitos !== null && conflitos.length === 0 && avisos.length === 0 && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-emerald-700">
          <Check width={14} height={14} /> Marcado. Ninguém fica com duas coisas à mesma hora.
        </p>
      )}

      {/* Férias, horário e feriados, vindos da agenda do CRM. Nenhum destes
          impede a marcação — há dias em que se vai na mesma, e quem coordena
          é que decide. Por isso são avisos e não erros. */}
      {avisos.length > 0 && (
        <div className="mt-3 rounded-lg bg-sky-50 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-sm font-medium text-sky-900">
            <AlertTriangle width={14} height={14} />
            Marcado — mas repara nisto.
          </p>
          <ul className="mt-1.5 space-y-1">
            {avisos.map((a, i) => (
              <li key={`${a.tipo}-${i}`} className="text-sm text-sky-800">
                {a.tipo === "ausente" && (
                  <>
                    Esta pessoa tem ausência aprovada de{" "}
                    <strong>{new Date(a.desde).toLocaleDateString("pt-PT")}</strong> a{" "}
                    <strong>{new Date(a.ate).toLocaleDateString("pt-PT")}</strong>.
                  </>
                )}
                {a.tipo === "fora_de_horario" && "Está fora do horário declarado desta pessoa."}
                {a.tipo === "feriado" && <>É feriado: <strong>{a.detalhe}</strong>.</>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {conflitos !== null && conflitos.length > 0 && (
        <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2.5">
          <p className="flex items-center gap-1.5 text-sm font-medium text-amber-900">
            <AlertTriangle width={14} height={14} />
            Marcado — mas esta pessoa já tem trabalho a essa hora.
          </p>
          <ul className="mt-1.5 space-y-1">
            {conflitos.map((c) => (
              <li key={c.codigo} className="text-sm text-amber-800">
                <Link to={`/ordens/${c.codigo}`} className="font-mono font-medium underline">
                  {c.codigo}
                </Link>{" "}
                — {c.titulo}{" "}
                <Badge className="bg-white/70 text-amber-800 ring-amber-200">
                  {new Date(c.agendada_para).toLocaleString("pt-PT", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

/**
 * ISO → o formato que `<input type="datetime-local">` aceita.
 *
 * O input trabalha em hora local sem fuso, e uma string ISO com `Z` faz o
 * campo aparecer vazio, sem dizer porquê. Converte-se explicitamente.
 */
function paraInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
