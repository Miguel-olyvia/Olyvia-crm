import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { ErroDeDados, ErroDeEscrita } from "../lib/dados";
import {
  iniciarTarefa,
  meuRegistoAberto,
  minhasTarefas,
  registosDasTarefas,
  terminarTarefa,
  type RegistoObra,
  type TarefaObra,
} from "../lib/obras";
import { Button, Card, EmptyState, ErrorState, Skeleton, cx } from "../components/ui";
import { AlertTriangle, ChevronRight, MapPin, Pause, Play, CheckCircle } from "../components/icons";
import { ObraCronometro, ObraExtra } from "../components/ObraIcones";
import { ObraTarefaEstadoBadge } from "../components/ObraEstadoBadge";
import ObraJustificacao from "../components/ObraJustificacao";
import { RegistarExtra } from "../components/ObraExtras";
import {
  acoesDoExecutor,
  formatarCronometro,
  formatarMinutos,
  hojeIso,
  nivelDeAlerta,
  percentagemGasta,
  precisaJustificacao,
  type MotivoDesvio,
} from "../domain/obras";
import { data as formatarData } from "../lib/formatar";

/**
 * As minhas tarefas — o ecrã do executor, no telemóvel, em obra.
 *
 * Um toque para Iniciar, um toque para Terminar. O relógio corre à vista,
 * contra o previsto, e muda de cor aos 80 % e aos 100 %. Só aparece mais um
 * passo quando é mesmo preciso: acima do previsto + tolerância, a folha de
 * justificação — uma lista de motivos em botões grandes.
 */

export default function MinhasTarefas() {
  const { activeOrgId, businessUserId } = useAuth();
  const [tarefas, setTarefas] = useState<TarefaObra[]>([]);
  const [meus, setMeus] = useState<RegistoObra[]>([]);
  const [aberto, setAberto] = useState<RegistoObra | null>(null);
  const [lidoEm, setLidoEm] = useState(() => Date.now());
  const [agora, setAgora] = useState(() => Date.now());
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [aGravar, setAGravar] = useState<string | null>(null);
  const [expandida, setExpandida] = useState<string | null>(null);
  const [justificar, setJustificar] = useState<{ tarefa: TarefaObra; obrigatoria: boolean; reais: number } | null>(null);
  const [extra, setExtra] = useState<TarefaObra | null>(null);

  const carregar = useCallback(async () => {
    if (!activeOrgId || !businessUserId) return;
    setErro(null);
    try {
      const [ts, ab] = await Promise.all([minhasTarefas(activeOrgId, businessUserId), meuRegistoAberto(businessUserId)]);
      const rs = await registosDasTarefas(ts.map((t) => t.id));
      setTarefas(ts);
      setAberto(ab);
      setMeus(rs.filter((r) => r.utilizador_id === businessUserId));
      setLidoEm(Date.now());
    } catch (e) {
      setErro(e instanceof ErroDeDados ? e.message : "Algo correu mal a carregar as tuas tarefas.");
    } finally {
      setACarregar(false);
    }
  }, [activeOrgId, businessUserId, recarga]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // O relógio. Só bate quando há alguma coisa a correr.
  const algoACorrer = tarefas.some((t) => t.a_correr > 0);
  useEffect(() => {
    if (!algoACorrer) return;
    const id = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [algoACorrer]);

  /** O real da tarefa, ao segundo: o que a base disse + o que passou desde então. */
  const reaisAoVivo = (t: TarefaObra) => t.minutos_reais + (t.a_correr * Math.max(0, agora - lidoEm)) / 60_000;

  const hoje = hojeIso();
  const grupos = useMemo(() => {
    const aCorrer = tarefas.filter((t) => aberto?.tarefa_id === t.id);
    const resto = tarefas.filter((t) => aberto?.tarefa_id !== t.id);
    return {
      aCorrer,
      rejeitadas: resto.filter((t) => t.estado === "rejeitada"),
      hoje: resto.filter(
        (t) =>
          (t.estado === "por_fazer" || t.estado === "em_curso") &&
          (t.estado === "em_curso" || !t.inicio_planeado || t.inicio_planeado <= hoje)
      ),
      proximas: resto.filter((t) => t.estado === "por_fazer" && !!t.inicio_planeado && t.inicio_planeado > hoje),
      feitas: resto.filter((t) => t.estado === "feita"),
    };
  }, [tarefas, aberto, hoje]);

  const correr = async (t: TarefaObra, acao: "iniciar" | "pausar" | "concluir") => {
    setErroAcao(null);
    if (acao === "concluir") {
      const reais = reaisAoVivo(t);
      const obrigatoria = precisaJustificacao(reais, t.minutos_previstos, t.tolerancia_percent);
      if (obrigatoria) {
        setJustificar({ tarefa: t, obrigatoria, reais });
        return;
      }
      await concluir(t, null, "");
      return;
    }
    setAGravar(t.id);
    try {
      if (acao === "iniciar") await iniciarTarefa(t.id);
      else await terminarTarefa({ tarefaId: t.id, concluir: false });
      setRecarga((r) => r + 1);
    } catch (e) {
      setErroAcao(e instanceof ErroDeEscrita ? e.message : "Sem ligação. Tenta outra vez.");
    } finally {
      setAGravar(null);
    }
  };

  const concluir = async (t: TarefaObra, motivo: MotivoDesvio | null, nota: string) => {
    setAGravar(t.id);
    setErroAcao(null);
    try {
      await terminarTarefa({ tarefaId: t.id, concluir: true, motivo, nota: nota || null });
      setJustificar(null);
      setRecarga((r) => r + 1);
    } catch (e) {
      const msg = e instanceof ErroDeEscrita ? e.message : "Sem ligação. Tenta outra vez.";
      // A base contou mais do que o ecrã: abre a folha em vez de só falhar.
      if (msg.includes("Justificação obrigatória")) {
        setJustificar({ tarefa: t, obrigatoria: true, reais: reaisAoVivo(t) });
      } else if (justificar) {
        setErroAcao(msg);
      } else {
        setErroAcao(msg);
      }
    } finally {
      setAGravar(null);
    }
  };

  if (aCarregar) {
    return (
      <div className="mx-auto max-w-xl space-y-3">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }
  if (erro) return <ErrorState message={erro} onRetry={() => setRecarga((r) => r + 1)} />;
  if (!businessUserId) return <ErrorState message="Sem utilizador de negócio associado a esta sessão." />;

  const cartao = (t: TarefaObra, destaque = false) => {
    const aCorrerAqui = aberto?.tarefa_id === t.id;
    const dep = t.depende_de ? tarefas.find((x) => x.id === t.depende_de) : null;
    const { acoes, bloqueio } = acoesDoExecutor({
      estado: t.estado,
      obraEstado: t.obra_estado,
      aCorrerAqui,
      aCorrerNoutra: !!aberto && !aCorrerAqui,
      // Uma dependência fora da minha lista não sei se está feita: a base decide.
      dependenciaPorFazer: !!dep && dep.estado !== "feita" && dep.estado !== "validada",
    });
    const reais = reaisAoVivo(t);
    const nivel = nivelDeAlerta(reais, t.minutos_previstos);
    const pct = percentagemGasta(reais, t.minutos_previstos);
    const meuSeg = aCorrerAqui && aberto ? (agora - new Date(aberto.inicio).getTime()) / 1000 : 0;
    const meusMin = meus.filter((r) => r.tarefa_id === t.id && r.fim).reduce(
      (s, r) => s + (new Date(r.fim!).getTime() - new Date(r.inicio).getTime()) / 60_000,
      0
    );
    const aberta = expandida === t.id || destaque;

    return (
      <Card
        key={t.id}
        className={cx(
          "overflow-hidden",
          destaque && "ring-2 ring-brand",
          destaque && nivel === "aviso" && "ring-amber-500",
          destaque && nivel === "excedido" && "ring-red-500"
        )}
      >
        <button
          type="button"
          onClick={() => setExpandida(aberta && !destaque ? null : t.id)}
          className="flex w-full items-start gap-3 p-4 text-left"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-400">
              {t.obra_codigo} · {t.fase_ordem}. {t.fase_nome}
            </p>
            <p className="mt-0.5 text-base font-semibold leading-snug text-slate-900">{t.nome}</p>
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {t.obra_titulo}
              {t.obra_morada && (
                <>
                  {" · "}
                  <MapPin width={11} height={11} className="inline" /> {t.obra_morada}
                </>
              )}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <ObraTarefaEstadoBadge estado={t.estado} />
              <span className="text-xs text-slate-500">
                previsto <b className="font-mono tabular">{formatarMinutos(t.minutos_previstos)}</b>
              </span>
              {t.inicio_planeado && <span className="text-xs text-slate-400">{formatarData(t.inicio_planeado)}</span>}
            </div>
          </div>
          {!destaque && (
            <ChevronRight
              width={16}
              height={16}
              className={cx("mt-1 shrink-0 text-slate-300 transition-transform", aberta && "rotate-90")}
            />
          )}
        </button>

        {(destaque || t.a_correr > 0 || reais > 0) && (
          <div className="px-4 pb-3">
            {destaque && (
              <p
                className={cx(
                  "text-center font-mono text-5xl font-semibold tabular",
                  nivel === "excedido" ? "text-red-600" : nivel === "aviso" ? "text-amber-600" : "text-slate-900"
                )}
                aria-live="polite"
              >
                {formatarCronometro(meuSeg)}
              </p>
            )}
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className={cx(
                  "h-full rounded-full transition-[width]",
                  nivel === "excedido" ? "bg-red-500" : nivel === "aviso" ? "bg-amber-500" : "bg-brand"
                )}
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
            <p
              className={cx(
                "mt-1 flex items-center justify-between text-xs",
                nivel === "excedido" ? "text-red-700" : nivel === "aviso" ? "text-amber-700" : "text-slate-500"
              )}
            >
              <span className="flex items-center gap-1">
                {nivel !== "ok" && <AlertTriangle width={12} height={12} />}
                {nivel === "excedido"
                  ? "Passou o previsto"
                  : nivel === "aviso"
                    ? "Perto do previsto"
                    : `${formatarMinutos(reais)} de ${formatarMinutos(t.minutos_previstos)}`}
              </span>
              <span className="font-mono tabular">{pct} %</span>
            </p>
            {meusMin > 0 && (
              <p className="mt-0.5 text-[11px] text-slate-400">Tu, até agora: {formatarMinutos(meusMin + meuSeg / 60)}</p>
            )}
          </div>
        )}

        {t.estado === "rejeitada" && t.motivo_rejeicao && (
          <p className="mx-4 mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
            <b>Rejeitada pelo supervisor:</b> {t.motivo_rejeicao}
          </p>
        )}

        {aberta && (
          <div className="space-y-3 border-t border-slate-100 bg-slate-50/50 px-4 py-3">
            {[
              ["Procedimento", t.procedimento],
              ["Materiais", t.materiais],
              ["Ferramentas", t.ferramentas],
            ].map(([titulo, texto]) =>
              texto ? (
                <div key={titulo}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{titulo}</p>
                  <p className="mt-0.5 whitespace-pre-line text-sm text-slate-700">{texto}</p>
                </div>
              ) : null
            )}
            {dep && (
              <p className="text-xs text-slate-500">
                Só depois de: <b>{dep.nome}</b>
              </p>
            )}
            <button
              type="button"
              onClick={() => setExtra(t)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-brand"
            >
              <ObraExtra width={15} height={15} /> Encontrei um imprevisto (trabalho extra)
            </button>
          </div>
        )}

        {(acoes.length > 0 || bloqueio) && (
          <div className="border-t border-slate-100 p-3">
            {bloqueio && <p className="mb-2 text-center text-xs text-slate-500">{bloqueio}</p>}
            <div className="flex gap-2">
              {acoes.includes("iniciar") && (
                <Button
                  className="h-14 flex-1 text-base"
                  disabled={aGravar === t.id}
                  onClick={() => void correr(t, "iniciar")}
                >
                  <Play width={20} height={20} /> {t.estado === "em_curso" ? "Juntar-me" : "Iniciar"}
                </Button>
              )}
              {acoes.includes("pausar") && (
                <Button
                  variant="secondary"
                  className="h-14 flex-1 text-base"
                  disabled={aGravar === t.id}
                  onClick={() => void correr(t, "pausar")}
                >
                  <Pause width={20} height={20} /> Pausar
                </Button>
              )}
              {acoes.includes("concluir") && (
                <Button
                  variant={acoes.includes("iniciar") ? "secondary" : "primary"}
                  className={cx("h-14 flex-1 text-base", !acoes.includes("iniciar") && "bg-emerald-600 hover:bg-emerald-700")}
                  disabled={aGravar === t.id}
                  onClick={() => void correr(t, "concluir")}
                >
                  <CheckCircle width={20} height={20} /> Terminar
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>
    );
  };

  const secao = (titulo: string, lista: TarefaObra[], tom = "text-slate-500") =>
    lista.length > 0 && (
      <section className="space-y-2">
        <h2 className={cx("text-xs font-semibold uppercase tracking-wide", tom)}>
          {titulo} <span className="text-slate-400">({lista.length})</span>
        </h2>
        {lista.map((t) => cartao(t))}
      </section>
    );

  const nada = tarefas.length === 0;

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">As minhas tarefas</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          {new Date().toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </div>

      {erroAcao && (
        <p className="rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700" role="alert">
          {erroAcao}
        </p>
      )}

      {aberto && !grupos.aCorrer.length && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Tens um relógio a correr numa tarefa que já não está na tua lista. Pede ao gestor para o fechar.
        </p>
      )}

      {grupos.aCorrer.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-brand">A correr</h2>
          {grupos.aCorrer.map((t) => cartao(t, true))}
        </section>
      )}

      {nada ? (
        <Card>
          <EmptyState
            icon={<ObraCronometro width={22} height={22} />}
            title="Sem tarefas atribuídas"
            description="Quando o gestor te puser numa tarefa de obra, aparece aqui."
          />
        </Card>
      ) : (
        <>
          {secao("Para refazer", grupos.rejeitadas, "text-red-600")}
          {secao("Hoje", grupos.hoje)}
          {secao("Próximas", grupos.proximas)}
          {secao("À espera de validação", grupos.feitas)}
        </>
      )}

      {justificar && (
        <ObraJustificacao
          reais={justificar.reais}
          previstos={justificar.tarefa.minutos_previstos}
          tolerancia={justificar.tarefa.tolerancia_percent}
          obrigatoria={justificar.obrigatoria}
          aGravar={aGravar === justificar.tarefa.id}
          erro={erroAcao}
          aoCancelar={() => {
            setJustificar(null);
            setErroAcao(null);
          }}
          aoConfirmar={(m, n) => void concluir(justificar.tarefa, m, n)}
        />
      )}

      {extra && (
        <RegistarExtra
          obraId={extra.obra_id}
          tarefaId={extra.id}
          aoFechar={() => setExtra(null)}
          aoGravar={() => setRecarga((r) => r + 1)}
        />
      )}
    </div>
  );
}
