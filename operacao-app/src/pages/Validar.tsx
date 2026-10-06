import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ErroDeDados, ErroDeEscrita, listarEquipa } from "../lib/dados";
import {
  EVENTO_ALERTAS,
  alertasDeSupervisao,
  registosDasTarefas,
  tarefasPorValidar,
  validarTarefa,
  type AlertaSupervisao,
  type RegistoObra,
  type TarefaObra,
} from "../lib/obras";
import { fotosDasTarefas } from "../lib/obrasFotos";
import AlertasSupervisao from "../components/AlertasSupervisao";
import {
  Badge,
  Barra,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Modal,
  Select,
  Skeleton,
  Textarea,
  cx,
} from "../components/ui";
import { AlertTriangle, Check, ChevronDown, ChevronRight, X } from "../components/icons";
import { ObraValidar } from "../components/ObraIcones";
import { FichaLeitura } from "../components/ObraTarefaPainel";
import FotosTarefa from "../components/FotosTarefa";
import {
  ROTULO_MOTIVO,
  formatarMinutos,
  nivelDeAlerta,
  percentagemGasta,
  podeValidar,
} from "../domain/obras";
import { dataHora } from "../lib/formatar";
import NomeTarefa from "../components/NomeTarefa";

/**
 * A fila do supervisor: o que a equipa deu por feito e espera o segundo par
 * de olhos. Validar é um toque; rejeitar exige motivo — é o que a equipa vai
 * ler no telemóvel para corrigir.
 *
 * Layout pensado para filas longas: uma linha compacta por tarefa, agrupadas
 * por obra (recolhíveis), filtros no topo e o detalhe (fotos, ficha) num
 * painel lateral no computador ou aberto por baixo da linha no telemóvel.
 * Os alertas ficam no seu separador, para não empurrarem a fila para baixo.
 *
 * Quem fez a tarefa não a valida (a base recusa); o ecrã avisa antes.
 */

type Separador = "fila" | "alertas";

/** ≥ lg: detalhe no painel lateral; abaixo disso, aberto por baixo da linha. */
function useEcraLargo(): boolean {
  const consulta = "(min-width: 1024px)";
  const [largo, setLargo] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(consulta).matches
      : false
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(consulta);
    const f = () => setLargo(mq.matches);
    mq.addEventListener?.("change", f);
    return () => mq.removeEventListener?.("change", f);
  }, []);
  return largo;
}

function corDoTempo(reais: number, previstos: number): string {
  const nivel = nivelDeAlerta(reais, previstos);
  return nivel === "excedido"
    ? "bg-red-50 text-red-700 ring-red-200"
    : nivel === "aviso"
      ? "bg-amber-50 text-amber-800 ring-amber-200"
      : "bg-slate-50 text-slate-600 ring-slate-200";
}

export default function Validar() {
  const { activeOrgId, funcao, businessUserId } = useAuth();
  const largo = useEcraLargo();
  const [tarefas, setTarefas] = useState<TarefaObra[]>([]);
  const [registos, setRegistos] = useState<RegistoObra[]>([]);
  const [fotos, setFotos] = useState<Map<string, number>>(new Map());
  const [nomes, setNomes] = useState<Map<string, string>>(new Map());
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [aRejeitar, setARejeitar] = useState<TarefaObra | null>(null);
  const [motivo, setMotivo] = useState("");
  const [aGravar, setAGravar] = useState<string | null>(null);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [alertas, setAlertas] = useState<AlertaSupervisao[]>([]);
  const [erroAlertas, setErroAlertas] = useState<string | null>(null);
  const [separador, setSeparador] = useState<Separador>("fila");
  const [filtroObra, setFiltroObra] = useState("");
  const [filtroPessoa, setFiltroPessoa] = useState("");
  const [soDesvio, setSoDesvio] = useState(false);
  const [soFotos, setSoFotos] = useState(false);
  const [abertas, setAbertas] = useState<Set<string> | null>(null);
  const [emLote, setEmLote] = useState<{ codigo: string; lista: TarefaObra[] } | null>(null);
  const [loteAGravar, setLoteAGravar] = useState(false);

  const carregar = useCallback(async () => {
    if (!activeOrgId) return;
    setErro(null);
    try {
      const [ts, eq] = await Promise.all([tarefasPorValidar(activeOrgId), listarEquipa(activeOrgId)]);
      setTarefas(ts);
      setRegistos(await registosDasTarefas(ts.map((t) => t.id)));
      setNomes(new Map(eq.map((m) => [m.utilizador_id, m.nome])));
      // Só a contagem de fotos (sem URLs): as imagens carregam no detalhe.
      try {
        const ids = ts.map((t) => t.id);
        const n = new Map<string, number>();
        for (let i = 0; i < ids.length; i += 150) {
          for (const f of await fotosDasTarefas(ids.slice(i, i + 150))) {
            n.set(f.tarefa_id, (n.get(f.tarefa_id) ?? 0) + 1);
          }
        }
        setFotos(n);
      } catch {
        setFotos(new Map());
      }
      // Os alertas não travam a fila: se falharem, diz-se e a fila aparece.
      try {
        setAlertas(await alertasDeSupervisao(activeOrgId));
        setErroAlertas(null);
      } catch (e) {
        setAlertas([]);
        setErroAlertas(e instanceof ErroDeDados ? e.message : "Não foi possível carregar os alertas.");
      }
    } catch (e) {
      setErro(e instanceof ErroDeDados ? e.message : "Algo correu mal a carregar a fila.");
    } finally {
      setACarregar(false);
    }
  }, [activeOrgId, recarga]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Um atraso registado noutro sítio (ex.: na ficha da tarefa) atualiza os alertas.
  useEffect(() => {
    const f = () => setRecarga((r) => r + 1);
    window.addEventListener(EVENTO_ALERTAS, f);
    return () => window.removeEventListener(EVENTO_ALERTAS, f);
  }, []);

  /** Quem trabalhou em cada tarefa (dos registos de tempo). */
  const quemFez = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of registos) {
      const l = m.get(r.tarefa_id) ?? [];
      if (!l.includes(r.utilizador_id)) l.push(r.utilizador_id);
      m.set(r.tarefa_id, l);
    }
    return m;
  }, [registos]);

  const temDesvio = useCallback(
    (t: TarefaObra) => !!t.motivo_desvio || nivelDeAlerta(t.minutos_reais, t.minutos_previstos) === "excedido",
    []
  );
  const fizEu = useCallback(
    (t: TarefaObra) => !!businessUserId && (quemFez.get(t.id) ?? []).includes(businessUserId),
    [businessUserId, quemFez]
  );

  const pessoas = useMemo(() => {
    const ids = new Set<string>();
    for (const l of quemFez.values()) l.forEach((u) => ids.add(u));
    return [...ids]
      .map((id) => ({ id, nome: nomes.get(id) ?? "—" }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt"));
  }, [quemFez, nomes]);

  const obrasDaFila = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tarefas) m.set(t.obra_codigo, t.obra_titulo);
    return [...m].map(([codigo, titulo]) => ({ codigo, titulo }));
  }, [tarefas]);

  const filtradas = useMemo(
    () =>
      tarefas.filter(
        (t) =>
          (!filtroObra || t.obra_codigo === filtroObra) &&
          (!filtroPessoa || (quemFez.get(t.id) ?? []).includes(filtroPessoa)) &&
          (!soDesvio || temDesvio(t)) &&
          (!soFotos || (fotos.get(t.id) ?? 0) > 0)
      ),
    [tarefas, filtroObra, filtroPessoa, soDesvio, soFotos, quemFez, fotos, temDesvio]
  );

  // Por obra, a que tem mais por validar primeiro.
  const porObra = useMemo(() => {
    const m = new Map<string, TarefaObra[]>();
    for (const t of filtradas) m.set(t.obra_codigo, [...(m.get(t.obra_codigo) ?? []), t]);
    return [...m].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [filtradas]);

  // Abertas por defeito: a primeira obra (todas, se forem poucas).
  const abertasEfetivas = useMemo(
    () => abertas ?? new Set(porObra.length <= 2 ? porObra.map(([c]) => c) : porObra.slice(0, 1).map(([c]) => c)),
    [abertas, porObra]
  );
  const alternarObra = (codigo: string) => {
    const s = new Set(abertasEfetivas);
    if (s.has(codigo)) s.delete(codigo);
    else s.add(codigo);
    setAbertas(s);
  };

  // A selecionada tem de estar visível; senão, a primeira da 1.ª obra aberta.
  const visiveis = useMemo(
    () => porObra.filter(([c]) => abertasEfetivas.has(c)).flatMap(([, l]) => l),
    [porObra, abertasEfetivas]
  );
  const atual = useMemo(() => {
    const s = visiveis.find((t) => t.id === selecionada);
    if (s) return s;
    // Computador: há sempre uma no painel. Telemóvel: a 1.ª abre ao entrar;
    // "" = a pessoa fechou-a.
    if (largo || selecionada === null) return visiveis[0] ?? null;
    return null;
  }, [visiveis, selecionada, largo]);

  const decidir = async (t: TarefaObra, aprovar: boolean, m?: string) => {
    setAGravar(t.id);
    setErroAcao(null);
    try {
      await validarTarefa(t.id, aprovar, m);
      setARejeitar(null);
      // Passa à seguinte da fila visível, para rever de seguida.
      const i = visiveis.findIndex((x) => x.id === t.id);
      const seguinte = visiveis[i + 1] ?? visiveis[i - 1] ?? null;
      setSelecionada(seguinte?.id ?? null);
      setTarefas((ts) => ts.filter((x) => x.id !== t.id));
    } catch (e) {
      setErroAcao(e instanceof ErroDeEscrita ? e.message : "Sem ligação. Tenta outra vez.");
    } finally {
      setAGravar(null);
    }
  };

  /** Validar todas as de uma obra que posso validar — uma a uma, pára no 1.º erro. */
  const validarLote = async (lista: TarefaObra[]) => {
    setLoteAGravar(true);
    setErroAcao(null);
    const feitas: string[] = [];
    try {
      for (const t of lista) {
        await validarTarefa(t.id, true);
        feitas.push(t.id);
      }
    } catch (e) {
      setErroAcao(
        (e instanceof ErroDeEscrita ? e.message : "Sem ligação.") +
          ` Ficaram validadas ${feitas.length} de ${lista.length}.`
      );
    } finally {
      setTarefas((ts) => ts.filter((x) => !feitas.includes(x.id)));
      setLoteAGravar(false);
      setEmLote(null);
    }
  };

  if (!podeValidar(funcao)) {
    return <ErrorState message="Validar tarefas é para o supervisor de obra ou o gestor." />;
  }
  if (aCarregar) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    );
  }
  if (erro) return <ErrorState message={erro} onRetry={() => setRecarga((r) => r + 1)} />;

  const nDesvio = tarefas.filter(temDesvio).length;
  const nFotos = tarefas.filter((t) => (fotos.get(t.id) ?? 0) > 0).length;
  const filtrosAtivos = !!filtroObra || !!filtroPessoa || soDesvio || soFotos;

  const detalhe = (t: TarefaObra) => {
    const quem = quemFez.get(t.id) ?? [];
    const eu = fizEu(t);
    const nivel = nivelDeAlerta(t.minutos_reais, t.minutos_previstos);
    const pct = percentagemGasta(t.minutos_reais, t.minutos_previstos);
    return (
      <div className="space-y-3" data-testid="detalhe-validar">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-400">
            {t.fase_ordem}. {t.fase_nome}
          </p>
          <NomeTarefa nome={t.nome} className="text-base font-semibold text-slate-800" />
          <p className="mt-0.5 text-xs text-slate-500">
            <Link to={`/obras/${t.obra_codigo}`} className="hover:text-brand">
              {t.obra_codigo} · {t.obra_titulo}
            </Link>
          </p>
          {t.obra_morada && <p className="mt-0.5 truncate text-xs text-slate-400">{t.obra_morada}</p>}
          <p className="mt-1 text-xs text-slate-500">
            {quem.map((u) => nomes.get(u) ?? "—").join(", ") || "—"} · feita {dataHora(t.terminada_em)}
          </p>
        </div>

        <div className="space-y-1">
          <p className={cx("font-mono text-xs tabular", nivel === "excedido" ? "text-red-700" : "text-slate-600")}>
            {formatarMinutos(t.minutos_reais)} reais / {formatarMinutos(t.minutos_previstos)} previstos ({pct} %)
          </p>
          <Barra percentagem={pct} />
        </div>

        {t.motivo_desvio && (
          <p className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs text-amber-800">
            <AlertTriangle width={11} height={11} /> {ROTULO_MOTIVO[t.motivo_desvio]}
            {t.nota_desvio && <> — {t.nota_desvio}</>}
          </p>
        )}

        <div className="flex gap-2">
          <Button
            variant="secondary"
            className="h-11 flex-1"
            disabled={aGravar === t.id}
            onClick={() => {
              setARejeitar(t);
              setMotivo("");
            }}
          >
            <X width={16} height={16} /> Rejeitar
          </Button>
          <Button
            className="h-11 flex-1 bg-emerald-600 hover:bg-emerald-700"
            disabled={aGravar === t.id || eu}
            title={eu ? "Trabalhaste nesta tarefa: outra pessoa tem de a validar." : undefined}
            onClick={() => void decidir(t, true)}
          >
            <Check width={16} height={16} /> Validar
          </Button>
        </div>
        {eu && (
          <p className="text-xs text-slate-500">Trabalhaste nesta tarefa — a validação tem de ser de outra pessoa.</p>
        )}

        <div className="border-t border-slate-100 pt-3">
          <FotosTarefa key={t.id} tarefa={t} podeEnviar={false} euId={businessUserId} nomes={nomes} />
        </div>
        <div className="border-t border-slate-100 pt-3">
          <FichaLeitura tarefa={t} nomes={nomes} />
        </div>
      </div>
    );
  };

  const linha = (t: TarefaObra) => {
    const quem = quemFez.get(t.id) ?? [];
    const eu = fizEu(t);
    const ativa = atual?.id === t.id;
    const nf = fotos.get(t.id) ?? 0;
    return (
      <li key={t.id} className={cx("border-t border-slate-100 first:border-t-0", ativa && "bg-brand-50/50")}>
        <div className="flex items-center gap-2 px-3 py-2">
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            aria-expanded={!largo ? ativa : undefined}
            aria-current={largo && ativa ? "true" : undefined}
            onClick={() => setSelecionada(ativa && !largo ? "" : t.id)}
          >
            <span className="flex items-center gap-1.5">
              {t.motivo_desvio && (
                <AlertTriangle width={12} height={12} className="shrink-0 text-amber-600" aria-label="Com desvio justificado" />
              )}
              <NomeTarefa nome={t.nome} className="truncate text-sm font-medium text-slate-800" />
            </span>
            <span className="mt-0.5 block truncate text-xs text-slate-500">
              {quem.map((u) => nomes.get(u) ?? "—").join(", ") || "—"} · {dataHora(t.terminada_em)}
            </span>
          </button>
          <span
            className={cx(
              "hidden shrink-0 rounded-full px-2 py-0.5 font-mono text-[11px] tabular ring-1 ring-inset sm:inline-flex",
              corDoTempo(t.minutos_reais, t.minutos_previstos)
            )}
            title={`${formatarMinutos(t.minutos_reais)} reais / ${formatarMinutos(t.minutos_previstos)} previstos`}
          >
            {percentagemGasta(t.minutos_reais, t.minutos_previstos)} %
          </span>
          {nf > 0 && (
            <span className="hidden shrink-0 text-[11px] text-slate-500 sm:inline" title={`${nf} foto(s)`}>
              {nf} {nf === 1 ? "foto" : "fotos"}
            </span>
          )}
          <IconButton
            label={`Rejeitar ${t.nome}`}
            disabled={aGravar === t.id}
            onClick={() => {
              setARejeitar(t);
              setMotivo("");
            }}
            className="hover:bg-red-50 hover:text-red-700"
          >
            <X width={15} height={15} />
          </IconButton>
          <IconButton
            label={eu ? "Trabalhaste nesta tarefa: outra pessoa tem de a validar." : `Validar ${t.nome}`}
            disabled={aGravar === t.id || eu}
            onClick={() => void decidir(t, true)}
            className="text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-40"
          >
            <Check width={16} height={16} />
          </IconButton>
        </div>
        {!largo && ativa && <div className="border-t border-slate-100 bg-white px-3 py-3">{detalhe(t)}</div>}
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Validar</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {tarefas.length === 0
              ? "Nada por validar."
              : `${tarefas.length} tarefa(s) feitas à espera do segundo par de olhos, em ${obrasDaFila.length} obra(s).`}
          </p>
        </div>
        <div role="tablist" aria-label="Validar" className="inline-flex rounded-lg bg-slate-100 p-0.5 text-sm">
          {(
            [
              ["fila", `Por validar · ${tarefas.length}`],
              ["alertas", `Alertas · ${alertas.length}`],
            ] as const
          ).map(([id, rotulo]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={separador === id}
              onClick={() => setSeparador(id)}
              className={cx(
                "rounded-md px-3 py-1.5 font-medium transition-colors",
                separador === id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700",
                id === "alertas" && alertas.length > 0 && separador !== id && "text-amber-700"
              )}
            >
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      {erroAcao && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erroAcao}</p>}

      {separador === "alertas" ? (
        <>
          {erroAlertas && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{erroAlertas}</p>}
          {alertas.length === 0 && !erroAlertas ? (
            <Card>
              <EmptyState icon={<Check width={22} height={22} />} title="Sem alertas" description="Nenhuma obra tem atrasos por tratar." />
            </Card>
          ) : (
            <AlertasSupervisao alertas={alertas} aoMudar={() => setRecarga((r) => r + 1)} />
          )}
        </>
      ) : tarefas.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ObraValidar width={22} height={22} />}
            title="Fila vazia"
            description="Quando a equipa der uma tarefa por feita, aparece aqui."
          />
        </Card>
      ) : (
        <>
          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label="Filtrar por obra"
              value={filtroObra}
              onChange={(e) => setFiltroObra(e.target.value)}
              className="min-w-0 max-w-full py-1.5 sm:max-w-[16rem]"
            >
              <option value="">Todas as obras ({obrasDaFila.length})</option>
              {obrasDaFila.map((o) => (
                <option key={o.codigo} value={o.codigo}>
                  {o.codigo} · {o.titulo}
                </option>
              ))}
            </Select>
            <Select
              aria-label="Filtrar por pessoa"
              value={filtroPessoa}
              onChange={(e) => setFiltroPessoa(e.target.value)}
              className="min-w-0 max-w-full py-1.5 sm:max-w-[12rem]"
            >
              <option value="">Todas as pessoas</option>
              {pessoas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </Select>
            {(
              [
                ["Com desvio", nDesvio, soDesvio, setSoDesvio],
                ["Com fotos", nFotos, soFotos, setSoFotos],
              ] as const
            ).map(([rotulo, n, ligado, set]) => (
              <button
                key={rotulo}
                type="button"
                aria-pressed={ligado}
                onClick={() => set(!ligado)}
                className={cx(
                  "rounded-full px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition-colors",
                  ligado ? "bg-brand text-white ring-brand" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                )}
              >
                {rotulo} · {n}
              </button>
            ))}
            {filtrosAtivos && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFiltroObra("");
                  setFiltroPessoa("");
                  setSoDesvio(false);
                  setSoFotos(false);
                }}
              >
                Limpar filtros
              </Button>
            )}
            <span className="ml-auto text-xs text-slate-500">
              {filtradas.length} de {tarefas.length}
            </span>
          </div>

          {filtradas.length === 0 ? (
            <Card>
              <EmptyState icon={<ObraValidar width={22} height={22} />} title="Nada com estes filtros" description="Muda ou limpa os filtros." />
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
              {/* A fila, por obra */}
              <div className="space-y-2">
                {porObra.map(([codigo, lista]) => {
                  const aberta = abertasEfetivas.has(codigo);
                  const nDesvioObra = lista.filter(temDesvio).length;
                  const posso = lista.filter((t) => !fizEu(t));
                  return (
                    <Card key={codigo} className="overflow-hidden">
                      <div className="flex items-center gap-2 bg-slate-50/70 px-3 py-2">
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          aria-expanded={aberta}
                          onClick={() => alternarObra(codigo)}
                        >
                          {aberta ? (
                            <ChevronDown width={14} height={14} className="shrink-0 text-slate-400" />
                          ) : (
                            <ChevronRight width={14} height={14} className="shrink-0 text-slate-400" />
                          )}
                          <span className="min-w-0 truncate text-sm font-semibold text-slate-800">
                            {codigo} <span className="font-normal text-slate-500">· {lista[0].obra_titulo}</span>
                          </span>
                          <Badge>{lista.length}</Badge>
                          {nDesvioObra > 0 && (
                            <Badge className="bg-amber-50 text-amber-800 ring-amber-200">
                              {nDesvioObra} c/ desvio
                            </Badge>
                          )}
                        </button>
                        {posso.length > 1 && (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="shrink-0"
                            disabled={loteAGravar}
                            onClick={() => setEmLote({ codigo, lista: posso })}
                          >
                            <Check width={13} height={13} /> Validar todas ({posso.length})
                          </Button>
                        )}
                      </div>
                      {aberta && <ul>{lista.map(linha)}</ul>}
                    </Card>
                  );
                })}
              </div>

              {/* Detalhe (computador) */}
              {largo && (
                <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
                  <Card className="p-4">
                    {atual ? (
                      detalhe(atual)
                    ) : (
                      <p className="text-sm text-slate-500">Escolhe uma tarefa para ver as fotos e a ficha.</p>
                    )}
                  </Card>
                </aside>
              )}
            </div>
          )}
        </>
      )}

      {aRejeitar && (
        <Modal
          title={`Rejeitar — ${aRejeitar.nome}`}
          size="sm"
          onClose={() => setARejeitar(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setARejeitar(null)}>
                Voltar
              </Button>
              <Button
                variant="danger"
                disabled={!motivo.trim() || aGravar === aRejeitar.id}
                onClick={() => void decidir(aRejeitar, false, motivo)}
              >
                Rejeitar
              </Button>
            </>
          }
        >
          <Field label="O que tem de ser corrigido" hint="A equipa lê isto no telemóvel, na tarefa.">
            <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} className="w-full" />
          </Field>
        </Modal>
      )}

      {emLote && (
        <ConfirmDialog
          title={`Validar ${emLote.lista.length} tarefas de ${emLote.codigo}`}
          message={
            <>
              Ficam todas validadas de uma vez. Vê antes as que têm desvio ou fotos.
              {emLote.lista.length < (porObra.find(([c]) => c === emLote.codigo)?.[1].length ?? 0) && (
                <> As tarefas em que trabalhaste ficam de fora (outra pessoa tem de as validar).</>
              )}
            </>
          }
          confirmLabel={loteAGravar ? "A validar…" : "Validar todas"}
          onConfirm={() => void validarLote(emLote.lista)}
          onCancel={() => setEmLote(null)}
        />
      )}
    </div>
  );
}
