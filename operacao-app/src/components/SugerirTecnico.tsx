import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Badge,
  Button,
  Modal,
  Spinner,
  cx,
} from "./ui";
import { AlertTriangle, Check, Clock, MapPin, Robo, User } from "./icons";
import {
  comoDia,
  comoHoras,
  comoKm,
  diasAOlhar,
  pontosDosLocais,
  sugerirTecnicos,
  type Candidato,
  type Sugestao,
} from "../domain/sugerir-tecnico";
import {
  ErroDeDados,
  compromissosDoCRM,
  especialidadesDaOrdem,
  indisponibilidadesDoPeriodo,
  listarLocais,
  ordensDoPeriodo,
  type LocalRow,
  type MembroEquipa,
} from "../lib/dados";
import { listarEspecialidades, quemTemCadaEspecialidade } from "../lib/config";
import { ROTULO_FUNCAO, type Funcao } from "../domain/tipos";

/**
 * O botão que responde a "quem é que devia ir a isto".
 *
 * A conta está toda em `domain/sugerir-tecnico.ts`, que é puro e testado.
 * Aqui só se vai buscar o que ela precisa — a agenda de toda a gente, as
 * especialidades, e onde ficam os locais — e se desenha o resultado.
 *
 * ⚠ **Mostra sempre o porquê.** Uma lista ordenada sem razões seria um
 * oráculo, e quem coordena tem de conseguir discordar com fundamento: às vezes
 * a pessoa certa é a terceira, porque o cliente a conhece ou porque a carrinha
 * dela tem a peça. Por isso cada linha traz o que pesou, e nenhuma delas
 * desaparece por ter um impedimento.
 */

/** Quantos dias se olham para a frente. Duas semanas cobrem a marcação real. */
const HORIZONTE = 14;

export default function SugerirTecnico({
  ordemId,
  orgId,
  local,
  agendadaPara,
  equipa,
  aoEscolher,
  desativado,
}: {
  ordemId: string;
  orgId: string;
  /** O local da ordem, para se saber a distância. Sem ele, não se mede. */
  local: LocalRow | null;
  agendadaPara: string | null;
  equipa: readonly MembroEquipa[];
  /** Recebe quem foi escolhido, e o dia proposto quando a ordem não tem data. */
  aoEscolher: (utilizadorId: string, dia: Date | null) => void;
  desativado?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [aPensar, setAPensar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sugestoes, setSugestoes] = useState<Sugestao[] | null>(null);
  const [pediuEspecialidades, setPediuEspecialidades] = useState<string[]>([]);
  const [semPontoNoMapa, setSemPontoNoMapa] = useState(false);

  const hora = agendadaPara ? new Date(agendadaPara) : null;

  const pensar = async () => {
    setAberto(true);
    setAPensar(true);
    setErro(null);
    setSugestoes(null);

    try {
      const inicio = hora ?? new Date();
      const dias = diasAOlhar(inicio, HORIZONTE);
      const ate = dias[dias.length - 1];

      const [exigidas, especialidades, quemTem, marcadas, impedimentos, compromissos, locais] =
        await Promise.all([
          especialidadesDaOrdem(ordemId),
          listarEspecialidades(orgId).catch(() => []),
          quemTemCadaEspecialidade(orgId),
          ordensDoPeriodo(orgId, dias[0], ate),
          indisponibilidadesDoPeriodo(orgId, dias[0], ate),
          compromissosDoCRM(orgId, dias[0], ate),
          listarLocais(orgId).catch(() => [] as LocalRow[]),
        ]);

      // O mapa vem invertido — especialidade → pessoas — porque é assim que o
      // filtro da agenda o usa. Aqui a pergunta é ao contrário.
      const minhas = new Map<string, string[]>();
      for (const [skill, users] of quemTem) {
        for (const u of users) {
          const lista = minhas.get(u) ?? [];
          lista.push(skill);
          minhas.set(u, lista);
        }
      }

      const candidatos: Candidato[] = equipa.map((m) => ({
        utilizador_id: m.utilizador_id,
        nome: m.nome,
        funcao: m.funcao,
        especialidades: minhas.get(m.utilizador_id) ?? [],
      }));

      const pontos = pontosDosLocais(locais);
      const destino = local ? (pontos.get(local.id) ?? null) : null;

      setPediuEspecialidades(
        exigidas.map((id) => especialidades.find((e) => e.id === id)?.nome ?? "—")
      );
      setSemPontoNoMapa(!destino);
      setSugestoes(
        sugerirTecnicos({
          ordemId,
          candidatos,
          exigidas,
          nomes: new Map(especialidades.map((e) => [e.id, e.nome])),
          destino,
          marcadas,
          pontos,
          impedimentos,
          compromissos,
          dias,
          hora,
        })
      );
    } catch (e) {
      setErro(
        e instanceof ErroDeDados
          ? e.message
          : "Não foi possível ler a agenda da equipa. Tenta outra vez."
      );
    } finally {
      setAPensar(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={desativado || equipa.length === 0}
        onClick={() => void pensar()}
        title="Ver quem está mais indicado, e porquê"
      >
        <Robo width={15} height={15} className="text-brand" />
        Sugerir
      </Button>

      {aberto && (
        <Modal
          size="lg"
          title="Quem devia ir"
          onClose={() => setAberto(false)}
          footer={
            <Button variant="secondary" onClick={() => setAberto(false)}>
              Fechar
            </Button>
          }
        >
          <div className="space-y-4">
            <Criterios
              exigidas={pediuEspecialidades}
              comHora={!!hora}
              semPontoNoMapa={semPontoNoMapa}
            />

            {aPensar && <Spinner label="A ler a agenda da equipa…" />}

            {erro && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>
            )}

            {sugestoes?.length === 0 && (
              <p className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-500">
                Não há ninguém em Operações para sugerir. Acrescenta pessoas em{" "}
                <Link to="/definicoes" className="font-medium text-brand underline">
                  Definições › Equipa
                </Link>
                .
              </p>
            )}

            {sugestoes && sugestoes.length > 0 && (
              <ol className="space-y-2">
                {sugestoes.map((s, i) => (
                  <LinhaDeSugestao
                    key={s.utilizador_id}
                    sugestao={s}
                    lugar={i + 1}
                    semData={!hora}
                    aoEscolher={(dia) => {
                      aoEscolher(s.utilizador_id, dia);
                      setAberto(false);
                    }}
                  />
                ))}
              </ol>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

/**
 * O que é que a sugestão pesou, dito antes de se ver o resultado.
 *
 * Vem primeiro de propósito: quem lê a lista já sabe com que régua ela foi
 * medida, e por isso consegue discordar de um lugar em concreto em vez de
 * desconfiar da coisa toda.
 */
function Criterios({
  exigidas,
  comHora,
  semPontoNoMapa,
}: {
  exigidas: readonly string[];
  comHora: boolean;
  semPontoNoMapa: boolean;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-3.5 text-sm text-slate-600">
      <p className="font-medium text-slate-700">Três perguntas, por esta ordem de peso:</p>
      <ul className="mt-2 space-y-1.5">
        <li className="flex gap-2">
          <User width={14} height={14} className="mt-0.5 shrink-0 text-slate-400" />
          <span>
            <strong className="font-medium text-slate-700">Sabe fazer isto?</strong>{" "}
            {exigidas.length > 0 ? (
              <>
                As tarefas desta ordem pedem{" "}
                <strong className="font-medium text-slate-800">{exigidas.join(", ")}</strong>.
              </>
            ) : (
              <span className="text-slate-500">
                Nenhuma tarefa desta ordem pede especialidade — por isso esta pergunta não
                conta para o lugar de ninguém.
              </span>
            )}
          </span>
        </li>
        <li className="flex gap-2">
          <Clock width={14} height={14} className="mt-0.5 shrink-0 text-slate-400" />
          <span>
            <strong className="font-medium text-slate-700">Está livre?</strong>{" "}
            {comHora
              ? "Quanto é que já tem marcado nesse dia, mais férias, feriados e choques de hora."
              : `Como a ordem ainda não tem data, conta quão cedo é que cabe nos próximos ${HORIZONTE} dias.`}
          </span>
        </li>
        <li className="flex gap-2">
          <MapPin width={14} height={14} className="mt-0.5 shrink-0 text-slate-400" />
          <span>
            <strong className="font-medium text-slate-700">Está perto?</strong>{" "}
            {semPontoNoMapa ? (
              <span className="text-slate-500">
                Este local não tem ponto no mapa, por isso a distância não conta para ninguém.
                Marca-o na ficha do local para esta pergunta passar a valer.
              </span>
            ) : (
              "Distância em linha reta à paragem mais próxima que a pessoa já tem nesse dia."
            )}
          </span>
        </li>
      </ul>
      <p className="mt-2.5 border-t border-slate-200 pt-2 text-xs text-slate-500">
        Isto sugere, não decide — a escolha é sempre de quem coordena.{" "}
        <Link
          to="/ajuda?ver=funciona#sugerir"
          className="font-medium text-brand underline underline-offset-2"
        >
          A conta está explicada na Ajuda.
        </Link>
      </p>
    </div>
  );
}

function LinhaDeSugestao({
  sugestao: s,
  lugar,
  semData,
  aoEscolher,
}: {
  sugestao: Sugestao;
  lugar: number;
  semData: boolean;
  aoEscolher: (dia: Date | null) => void;
}) {
  const bloqueado = s.bloqueios.length > 0;

  return (
    <li
      className={cx(
        "rounded-xl border p-3 transition-colors",
        lugar === 1 && !bloqueado
          ? "border-brand-200 bg-brand-50/40"
          : "border-slate-200 bg-white"
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cx(
            "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
            lugar === 1 && !bloqueado
              ? "bg-brand text-white"
              : "bg-slate-100 text-slate-500"
          )}
        >
          {lugar}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-medium text-slate-800">{s.nome}</span>
            <span className="text-xs text-slate-400">
              {ROTULO_FUNCAO[s.funcao as Funcao] ?? s.funcao}
            </span>
            {s.perfil && s.perfil.falta.length === 0 && (
              <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">
                <Check width={11} height={11} />
                Tem o perfil
              </Badge>
            )}
            {s.km !== null && (
              <Badge className="bg-slate-50 text-slate-600 ring-slate-200">
                <MapPin width={11} height={11} />
                {comoKm(s.km)}
              </Badge>
            )}
            {!bloqueado && s.horasNoDia > 0 && (
              <Badge className="bg-slate-50 text-slate-600 ring-slate-200">
                <Clock width={11} height={11} />
                {comoHoras(s.horasNoDia)} nesse dia
              </Badge>
            )}
          </div>

          {/* A pontuação como barra, e não só como número: entre 74 e 61 o
              olho não vê diferença nenhuma; entre duas barras vê. */}
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 w-full max-w-[10rem] overflow-hidden rounded-full bg-slate-100">
              <div
                className={cx(
                  "h-full rounded-full transition-[width] duration-500",
                  bloqueado ? "bg-slate-300" : "bg-brand"
                )}
                style={{ width: `${Math.max(2, s.pontos)}%` }}
              />
            </div>
            <span className="shrink-0 text-xs font-medium tabular-nums text-slate-500">
              {s.pontos}
            </span>
          </div>

          <ul className="mt-2 space-y-0.5">
            {s.porque.map((p, i) => (
              <li key={i} className="text-xs leading-relaxed text-slate-500">
                {p}
              </li>
            ))}
          </ul>

          {bloqueado && (
            <ul className="mt-2 space-y-1">
              {s.bloqueios.map((b, i) => (
                <li
                  key={i}
                  className="flex items-start gap-1.5 text-xs leading-relaxed text-amber-800"
                >
                  <AlertTriangle width={12} height={12} className="mt-0.5 shrink-0" />
                  {b.texto}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={() => aoEscolher(null)}>
          Escolher
        </Button>
        {/* Escolher e marcar são dois gestos que aqui se fazem num só: a
            pergunta "quem" e a pergunta "quando" foram respondidas ao mesmo
            tempo, e obrigar a repetir a segunda à mão seria deitar fora
            metade da resposta. */}
        {semData && s.primeiroDiaLivre && (
          <Button size="sm" onClick={() => aoEscolher(s.primeiroDiaLivre)}>
            <Clock width={14} height={14} />
            Escolher e marcar para {comoDia(s.primeiroDiaLivre)}
          </Button>
        )}
      </div>
    </li>
  );
}
