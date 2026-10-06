import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ErroDeDados, ErroDeEscrita, listarClientes, listarEquipa, type MembroEquipa } from "../lib/dados";
import {
  atrasosDaObra,
  type AtrasoTarefa,
  atualizarObra,
  conflitosDaObra,
  extrasDaObra,
  fasesDaObra,
  mudarEstadoObra,
  obterObra,
  planearTarefa,
  renomearFase,
  replanearObra,
  distribuirEquipa,
  gravarDependencias,
  tarefasDaObra,
  type ConflitoObra,
  type ConflitoRpc,
  type ExtraObra,
  type FaseObra,
  type ObraResumo,
  type TarefaObra,
} from "../lib/obras";
import {
  Badge,
  Barra,
  Button,
  Card,
  ErrorState,
  Field,
  Input,
  Modal,
  Select,
  Skeleton,
  Textarea,
  Toggle,
  cx,
} from "../components/ui";
import { AlertTriangle, ChevronLeft, MapPin, Plus } from "../components/icons";
import ObraGantt from "../components/ObraGantt";
import FichaLocal from "../components/FichaLocal";
import ObraAvisoBancada from "../components/ObraAvisoBancada";
import ObraPorqueInicio from "../components/ObraPorqueInicio";
import { etiquetaServico, nomesCurtos, servicosDistintos } from "../domain/nomesTarefas";
import ObraTarefaPainel from "../components/ObraTarefaPainel";
import { ClienteAvisado } from "../components/ObraAtraso";
import { diasDeDesvio, formatarDesvio, rotuloMotivoAtraso } from "../domain/atrasos";
import ObraPrevistoReal from "../components/ObraPrevistoReal";
import ObraExtras from "../components/ObraExtras";
import { ObraEstadoBadge } from "../components/ObraEstadoBadge";
import {
  formatarMinutos,
  hojeIso,
  podeDecidirExtras,
  podePlanear,
  sobrecargas,
  type EstadoObra,
  type Intervalo,
} from "../domain/obras";
import type { TarefaGantt } from "../domain/obras-gantt";
import { rotuloOrigem } from "../domain/planeamento";
import { data as formatarData } from "../lib/formatar";

/**
 * A ficha da obra: o Gantt do gestor, o previsto contra o real, os extras.
 *
 * Não escreve em tabela nenhuma. Arrastar uma barra chama
 * `rpc_ops_obra_planear_tarefa`, que verifica se quem arrasta pode planear e
 * devolve os choques de agenda.
 */

type Separador = "mapa" | "previsto" | "extras";

const TRANSICOES: Record<EstadoObra, { para: EstadoObra; rotulo: string; motivo: boolean }[]> = {
  planeada: [
    { para: "em_curso", rotulo: "Arrancar", motivo: false },
    { para: "suspensa", rotulo: "Suspender", motivo: true },
    { para: "cancelada", rotulo: "Cancelar", motivo: true },
  ],
  em_curso: [
    { para: "concluida", rotulo: "Concluir", motivo: false },
    { para: "suspensa", rotulo: "Suspender", motivo: true },
    { para: "cancelada", rotulo: "Cancelar", motivo: true },
  ],
  suspensa: [
    { para: "em_curso", rotulo: "Retomar", motivo: false },
    { para: "cancelada", rotulo: "Cancelar", motivo: true },
  ],
  concluida: [],
  cancelada: [],
};

export default function ObraDetalhe() {
  const { codigo = "" } = useParams();
  const { activeOrgId, funcao, orgs, setActiveOrgId, businessUserId } = useAuth();
  const [obra, setObra] = useState<ObraResumo | null>(null);
  const [fases, setFases] = useState<FaseObra[]>([]);
  const [tarefas, setTarefas] = useState<TarefaObra[]>([]);
  const [conflitos, setConflitos] = useState<ConflitoObra[]>([]);
  const [extras, setExtras] = useState<ExtraObra[]>([]);
  const [atrasos, setAtrasos] = useState<AtrasoTarefa[]>([]);
  const [avisarCliente, setAvisarCliente] = useState<AtrasoTarefa | null>(null);
  const [equipa, setEquipa] = useState<MembroEquipa[]>([]);
  const [cliente, setCliente] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(true);
  const [recarga, setRecarga] = useState(0);
  const [separador, setSeparador] = useState<Separador>("mapa");

  // ?tarefa=… (vindo de um alerta) abre logo a ficha dessa tarefa.
  const [params] = useSearchParams();
  const [selecionada, setSelecionada] = useState<string | null>(() => params.get("tarefa"));
  const [novaNaFase, setNovaNaFase] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; conflitos?: ConflitoRpc[] } | null>(null);
  const [transicao, setTransicao] = useState<{ para: EstadoObra; rotulo: string; motivo: boolean } | null>(null);
  const [motivo, setMotivo] = useState("");
  const [editar, setEditar] = useState(false);
  const [replanear, setReplanear] = useState(false);
  const [faseAEditar, setFaseAEditar] = useState<FaseObra | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  const planeia = podePlanear(funcao);
  const recarregar = () => setRecarga((r) => r + 1);
  const [aDistribuir, setADistribuir] = useState(false);
  const distribuir = async () => {
    if (!obra) return;
    setADistribuir(true);
    try {
      const r = await distribuirEquipa(obra.id, true);
      setAviso({ texto: `Equipa distribuída por ${r.tarefas} tarefa${r.tarefas === 1 ? "" : "s"} (as já começadas ficaram como estavam).` });
      recarregar();
    } catch (e) {
      setAviso({ texto: e instanceof ErroDeEscrita ? e.message : "Não foi possível distribuir a equipa." });
    } finally {
      setADistribuir(false);
    }
  };

  const carregar = useCallback(async () => {
    if (!activeOrgId) return;
    setErro(null);
    try {
      const o = await obterObra(codigo, activeOrgId);
      if (!o) {
        setErro("Obra não encontrada, ou sem permissão para a ver.");
        return;
      }
      // A obra é de outra empresa que a pessoa também vê: passa para essa
      // (a equipa, os clientes e as permissões são os dela). Recarrega sozinho.
      if (o.organization_id !== activeOrgId && orgs.some((g) => g.id === o.organization_id)) {
        setActiveOrgId(o.organization_id);
        return;
      }
      const [fs, ts, cs, ex, eq, cls, at] = await Promise.all([
        fasesDaObra(o.id),
        tarefasDaObra(o.id),
        conflitosDaObra(o.id),
        extrasDaObra(o.id),
        listarEquipa(activeOrgId),
        listarClientes(activeOrgId),
        // Sem o SQL dos atrasos aplicado, a obra abre na mesma (sem atrasos).
        atrasosDaObra(o.id).catch(() => [] as AtrasoTarefa[]),
      ]);
      setAtrasos(at);
      setObra(o);
      setFases(fs);
      setTarefas(ts);
      setConflitos(cs);
      setExtras(ex);
      setEquipa(eq);
      setCliente(cls.find((c) => c.id === o.cliente_id)?.nome ?? null);
    } catch (e) {
      setErro(e instanceof ErroDeDados ? e.message : "Algo correu mal a carregar a obra.");
    } finally {
      setACarregar(false);
    }
  }, [activeOrgId, codigo, recarga, orgs, setActiveOrgId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const nomes = useMemo(() => new Map(equipa.map((m) => [m.utilizador_id, m.nome])), [equipa]);
  const comConflito = useMemo(() => new Set(conflitos.map((c) => c.tarefa_id)), [conflitos]);

  const tarefasGantt: TarefaGantt[] = useMemo(() => {
    // "<serviço>: <passo>" → só o passo; o serviço numa etiqueta, se houver mais do que um.
    const curtos = nomesCurtos(tarefas);
    const varios = servicosDistintos(curtos) > 1;
    return tarefas.map((t) => {
      const c = curtos.get(t.id);
      return {
        id: t.id,
        faseId: t.fase_id,
        ordem: t.ordem,
        nome: c?.curto ?? t.nome,
        nomeCompleto: t.nome,
        servico: varios && c?.servico ? etiquetaServico(c.servico) : null,
        estado: t.estado,
        minutosPrevistos: t.minutos_previstos,
        minutosReais: t.minutos_reais,
        inicio: t.inicio_planeado,
        fim: t.fim_planeado,
        pessoas: t.pessoas,
        aCorrer: t.a_correr,
        dependeDe: t.depende_de,
        dependencias: t.dependencias,
        esperaAntesHoras: t.espera_antes_horas == null ? null : Number(t.espera_antes_horas),
        origemTempo: rotuloOrigem(t.minutos_origem, t.ritmo_n) || null,
        inicioOriginal: t.inicio_original ?? null,
        fimOriginal: t.fim_original ?? null,
        atrasadaInicio: t.atrasada_inicio ?? false,
        atraso: t.ultimo_atraso
          ? {
              motivo: t.ultimo_atraso.motivo,
              contexto: t.ultimo_atraso.contexto,
              minutosExtra: t.ultimo_atraso.minutos_extra,
              clienteAvisado: t.ultimo_atraso.cliente_avisado,
              n: t.n_atrasos ?? 1,
            }
          : null,
      };
    });
  }, [tarefas]);

  // Ligar duas tarefas no Gantt: junta a nova dependência às que a tarefa já tem.
  const ligar = async (tarefaId: string, dependeDeId: string) => {
    const atual = tarefas.find((t) => t.id === tarefaId)?.dependencias ?? [];
    if (atual.includes(dependeDeId)) return;
    try {
      const r = await gravarDependencias(tarefaId, [...atual, dependeDeId]);
      if (r.antes_de_acabar?.length) {
        setAviso({ texto: "Ligadas. Atenção: a tarefa começa antes de a outra acabar — arrasta-a ou replaneia." });
      }
      recarregar();
    } catch (e) {
      setAviso({ texto: e instanceof ErroDeEscrita ? e.message : "Não foi possível ligar as tarefas." });
    }
  };

  const sobrecarga = useMemo(
    () =>
      sobrecargas(
        tarefas.flatMap((t) =>
          t.pessoas.map((p) => ({
            tarefaId: t.id,
            obraId: t.obra_id,
            utilizadorId: p,
            inicio: t.inicio_planeado,
            fim: t.fim_planeado,
            minutos: t.minutos_previstos,
            estado: t.estado,
          }))
        )
      ),
    [tarefas]
  );

  const mudarDatas = async (tarefaId: string, i: Intervalo) => {
    // Otimista: o Gantt mexe já; a base confirma ou desfaz.
    setTarefas((ts) => ts.map((t) => (t.id === tarefaId ? { ...t, inicio_planeado: i.inicio, fim_planeado: i.fim } : t)));
    try {
      const r = await planearTarefa(tarefaId, i.inicio, i.fim);
      if (r.conflitos?.length) setAviso({ texto: "Datas gravadas, mas há choque de agenda:", conflitos: r.conflitos });
      recarregar();
    } catch (e) {
      setAviso({ texto: e instanceof ErroDeEscrita ? e.message : "Não foi possível mudar as datas." });
      recarregar();
    }
  };

  const mudarEstado = async () => {
    if (!obra || !transicao) return;
    setErroAcao(null);
    try {
      await mudarEstadoObra(obra.id, transicao.para, motivo || null);
      setTransicao(null);
      recarregar();
    } catch (e) {
      setErroAcao(e instanceof ErroDeEscrita ? e.message : "Não foi possível mudar o estado.");
    }
  };

  if (aCarregar) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }
  if (erro || !obra) return <ErrorState message={erro ?? "Obra não encontrada."} onRetry={recarregar} />;

  const tarefaSel = tarefas.find((t) => t.id === selecionada) ?? null;
  const progresso = obra.n_tarefas ? Math.round((obra.n_feitas / obra.n_tarefas) * 100) : 0;
  const editavel = planeia && obra.estado !== "concluida" && obra.estado !== "cancelada";
  // Atrasos: o gestor/admin, ou o supervisor DESTA obra (a base verifica na mesma).
  const geraAtrasos = planeia || (!!businessUserId && obra.supervisor_id === businessUserId);
  const porAvisar = atrasos.filter((a) => !a.cliente_avisado);
  const nomeTarefa = new Map(tarefas.map((t) => [t.id, t.nome]));
  const desvioObra = diasDeDesvio(obra.fim_original, obra.fim_planeado);

  return (
    <div className="space-y-4">
      <Link to="/obras" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ChevronLeft width={14} height={14} /> Obras
      </Link>

      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-medium tabular text-slate-500">{obra.codigo}</span>
              <ObraEstadoBadge estado={obra.estado} />
              {obra.orcamento_id && <Badge>do orçamento</Badge>}
              {obra.contrato_id && <Badge>do contrato</Badge>}
            </div>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">{obra.titulo}</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {cliente ?? "Sem cliente"}
              {obra.morada && (
                <>
                  {" · "}
                  <MapPin width={12} height={12} className="inline text-slate-400" /> {obra.morada}
                </>
              )}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Gestor: {obra.gestor_id ? nomes.get(obra.gestor_id) ?? "—" : "—"} · Supervisor:{" "}
              {obra.supervisor_id ? nomes.get(obra.supervisor_id) ?? "—" : "por definir"} · Tolerância{" "}
              {obra.tolerancia_percent} %
            </p>
          </div>
          <div className="w-full shrink-0 sm:w-64">
            <div className="flex justify-between text-xs text-slate-500">
              <span>
                {obra.n_feitas}/{obra.n_tarefas} feitas · {obra.n_validadas} validadas
              </span>
              <span>{progresso} %</span>
            </div>
            <Barra percentagem={progresso} className="mt-1" />
            <p className="mt-1.5 font-mono text-xs tabular text-slate-600">
              {formatarMinutos(obra.minutos_reais)} reais / {formatarMinutos(obra.minutos_previstos)} previstos
            </p>
            <p className="text-xs text-slate-400">
              {formatarData(obra.inicio_planeado)} → {formatarData(obra.fim_planeado)}
            </p>
            <p className={cx("text-xs", desvioObra > 0 ? "font-medium text-amber-700" : "text-slate-500")}>
              Fim previsto: {formatarData(obra.fim_planeado)}
              {desvioObra !== 0 && obra.fim_original && (
                <>
                  {" "}
                  (original {formatarData(obra.fim_original)}, {formatarDesvio(desvioObra)})
                </>
              )}
            </p>
            {!!obra.n_alertas && (
              <p className="mt-0.5 inline-flex items-center gap-1 text-xs font-medium text-red-700">
                <AlertTriangle width={11} height={11} /> {obra.n_alertas} alerta{obra.n_alertas === 1 ? "" : "s"}
              </p>
            )}
          </div>
        </div>

        {planeia && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            {TRANSICOES[obra.estado].map((t) => (
              <Button
                key={t.para}
                size="sm"
                variant={t.para === "cancelada" ? "ghost" : t.para === "suspensa" ? "secondary" : "primary"}
                onClick={() => {
                  setTransicao(t);
                  setMotivo("");
                  setErroAcao(null);
                }}
              >
                {t.rotulo}
              </Button>
            ))}
            {editavel && (
              <>
                <Button size="sm" variant="secondary" onClick={() => setEditar(true)}>
                  Editar dados
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setReplanear(true)}>
                  Replanear datas
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void distribuir()} disabled={aDistribuir}>
                  {aDistribuir ? "A distribuir…" : "Distribuir equipa"}
                </Button>
              </>
            )}
          </div>
        )}
      </Card>

      <ObraPorqueInicio obraId={obra.id} estado={obra.estado} recarga={recarga} />
      <FichaLocal obraId={obra.id} />
      <ObraAvisoBancada obraId={obra.id} recarga={recarga} />

      {aviso && (
        <div className="flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
          <div>
            <p className="flex items-center gap-1.5 font-medium">
              <AlertTriangle width={14} height={14} /> {aviso.texto}
            </p>
            {aviso.conflitos?.map((c, i) => (
              <p key={i} className="text-xs">
                {c.nome} já está em <b>{c.obra_codigo}</b> — {c.tarefa} ({formatarData(c.inicio)} → {formatarData(c.fim)})
              </p>
            ))}
          </div>
          <button type="button" className="text-xs underline" onClick={() => setAviso(null)}>
            fechar
          </button>
        </div>
      )}

      {porAvisar.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-900" data-testid="avisar-cliente">
          <p className="flex items-center gap-1.5 font-medium">
            <AlertTriangle width={14} height={14} /> Avisar o cliente: {porAvisar.length} atraso
            {porAvisar.length === 1 ? "" : "s"} ainda não comunicado{porAvisar.length === 1 ? "" : "s"}
            {desvioObra > 0 && <> · a obra acaba {formatarDesvio(desvioObra)} depois do previsto</>}
          </p>
          <ul className="mt-1 space-y-1 text-xs">
            {porAvisar.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-2">
                <span>
                  <b>{nomeTarefa.get(a.tarefa_id) ?? "Tarefa"}</b> — {rotuloMotivoAtraso(a.motivo)}: {a.contexto}
                  {a.novo_fim && <> · novo fim {formatarData(a.novo_fim)}</>}
                </span>
                {geraAtrasos && (
                  <button type="button" className="font-medium text-brand underline" onClick={() => setAvisarCliente(a)}>
                    Cliente avisado…
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto rounded-lg bg-slate-100 p-1 text-sm sm:w-fit">
        {(
          [
            ["mapa", "Mapa de atividades"],
            ["previsto", "Previsto vs real"],
            ["extras", `Trabalhos extra${extras.length ? ` (${extras.length})` : ""}`],
          ] as const
        ).map(([s, r]) => (
          <button
            key={s}
            type="button"
            onClick={() => setSeparador(s)}
            className={cx(
              "whitespace-nowrap rounded-md px-3 py-1.5 transition-colors",
              separador === s ? "bg-white font-medium text-slate-800 shadow-sm" : "text-slate-500"
            )}
          >
            {r}
          </button>
        ))}
      </div>

      {separador === "mapa" && (
        <div className="space-y-3">
          {(conflitos.length > 0 || sobrecarga.length > 0) && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {conflitos.length > 0 && (
                <p>
                  <b>{new Set(conflitos.map((c) => c.tarefa_id)).size}</b> tarefa(s) com alguém que está noutra obra nos
                  mesmos dias (assinaladas com <AlertTriangle width={11} height={11} className="inline" />).
                </p>
              )}
              {sobrecarga.slice(0, 3).map((s) => (
                <p key={`${s.utilizadorId}${s.dia}`}>
                  {nomes.get(s.utilizadorId) ?? "Alguém"} tem {formatarMinutos(s.minutos)} planeados a {formatarData(s.dia)} (mais
                  de um dia de trabalho).
                </p>
              ))}
            </div>
          )}

          <ObraGantt
            fases={fases.map((f) => ({ id: f.id, ordem: f.ordem, nome: f.nome }))}
            tarefas={tarefasGantt}
            hoje={hojeIso()}
            podeEditar={editavel}
            nomes={nomes}
            comConflito={comConflito}
            selecionada={selecionada}
            aoSelecionar={setSelecionada}
            aoMudarDatas={(id, i) => void mudarDatas(id, i)}
            aoLigar={editavel ? (id, dep) => void ligar(id, dep) : undefined}
          />

          {editavel && (
            <div className="flex flex-wrap gap-2">
              {fases.map((f) => (
                <span key={f.id} className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white text-xs">
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-slate-600 hover:bg-slate-50"
                    onClick={() => setNovaNaFase(f.id)}
                  >
                    <Plus width={12} height={12} /> Tarefa em {f.ordem}. {f.nome}
                  </button>
                  <button
                    type="button"
                    className="border-l border-slate-200 px-2 text-slate-400 hover:bg-slate-50"
                    onClick={() => setFaseAEditar(f)}
                    title="Mudar o nome da fase"
                  >
                    ✎
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {separador === "previsto" && <ObraPrevistoReal obraId={obra.id} recarga={recarga} />}

      {separador === "extras" && (
        <ObraExtras
          obraId={obra.id}
          extras={extras}
          tarefas={tarefas}
          podeDecidir={podeDecidirExtras(funcao)}
          nomes={nomes}
          aoMudar={recarregar}
        />
      )}

      {(tarefaSel || novaNaFase) && (
        <ObraTarefaPainel
          key={tarefaSel?.id ?? `nova-${novaNaFase}`}
          obraId={obra.id}
          orgId={obra.organization_id}
          tarefa={tarefaSel}
          fases={fases}
          tarefas={tarefas}
          equipa={equipa}
          conflitos={conflitos}
          podeEditar={editavel}
          faseNova={novaNaFase}
          podeRegistarAtraso={geraAtrasos && obra.estado !== "concluida" && obra.estado !== "cancelada"}
          podeAvisarCliente={geraAtrasos}
          aoFechar={() => {
            setSelecionada(null);
            setNovaNaFase(null);
          }}
          aoGravar={recarregar}
        />
      )}

      {transicao && (
        <Modal
          title={`${transicao.rotulo} a obra`}
          size="sm"
          onClose={() => setTransicao(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setTransicao(null)}>
                Voltar
              </Button>
              <Button
                variant={transicao.para === "cancelada" ? "danger" : "primary"}
                disabled={transicao.motivo && !motivo.trim()}
                onClick={() => void mudarEstado()}
              >
                {transicao.rotulo}
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            {transicao.para === "concluida" && (
              <p className="text-sm text-slate-600">Só se conclui com todas as tarefas validadas pelo supervisor.</p>
            )}
            {transicao.para === "suspensa" && (
              <p className="text-sm text-slate-600">Suspender pára os relógios de quem estiver a trabalhar nela.</p>
            )}
            {transicao.motivo && (
              <Field label="Motivo">
                <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} className="w-full" />
              </Field>
            )}
            {erroAcao && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erroAcao}</p>}
          </div>
        </Modal>
      )}

      {avisarCliente && (
        <ClienteAvisado
          atrasoId={avisarCliente.id}
          titulo={nomeTarefa.get(avisarCliente.tarefa_id) ?? "Atraso"}
          detalhe={`${rotuloMotivoAtraso(avisarCliente.motivo)}: ${avisarCliente.contexto}`}
          aoFechar={() => setAvisarCliente(null)}
          aoGravar={recarregar}
        />
      )}

      {editar && <EditarObra obra={obra} equipa={equipa} aoFechar={() => setEditar(false)} aoGravar={recarregar} />}
      {replanear && <Replanear obra={obra} aoFechar={() => setReplanear(false)} aoGravar={recarregar} />}
      {faseAEditar && <RenomearFase fase={faseAEditar} aoFechar={() => setFaseAEditar(null)} aoGravar={recarregar} />}
    </div>
  );
}

function EditarObra({
  obra,
  equipa,
  aoFechar,
  aoGravar,
}: {
  obra: ObraResumo;
  equipa: readonly MembroEquipa[];
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const [titulo, setTitulo] = useState(obra.titulo);
  const [morada, setMorada] = useState(obra.morada ?? "");
  const [gestor, setGestor] = useState(obra.gestor_id ?? "");
  const [supervisor, setSupervisor] = useState(obra.supervisor_id ?? "");
  const [tol, setTol] = useState(String(obra.tolerancia_percent));
  const [erro, setErro] = useState<string | null>(null);

  const gravar = async () => {
    setErro(null);
    try {
      await atualizarObra({
        obraId: obra.id,
        titulo,
        morada: morada || null,
        gestorId: gestor || null,
        supervisorId: supervisor || null,
        tolerancia: Number(tol),
      });
      aoGravar();
      aoFechar();
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível gravar.");
    }
  };

  return (
    <Modal
      title="Dados da obra"
      onClose={aoFechar}
      footer={
        <>
          <Button variant="secondary" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button onClick={() => void gravar()}>Gravar</Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Título">
          <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="w-full" />
        </Field>
        <Field label="Morada">
          <Input value={morada} onChange={(e) => setMorada(e.target.value)} className="w-full" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Gestor">
            <Select value={gestor} onChange={(e) => setGestor(e.target.value)} className="w-full">
              <option value="">—</option>
              {equipa
                .filter((m) => m.funcao === "gestor" || m.funcao === "admin")
                .map((m) => (
                  <option key={m.utilizador_id} value={m.utilizador_id}>
                    {m.nome}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Supervisor">
            <Select value={supervisor} onChange={(e) => setSupervisor(e.target.value)} className="w-full">
              <option value="">—</option>
              {equipa
                .filter((m) => ["supervisor", "gestor", "admin"].includes(m.funcao))
                .map((m) => (
                  <option key={m.utilizador_id} value={m.utilizador_id}>
                    {m.nome} ({m.funcao})
                  </option>
                ))}
            </Select>
          </Field>
        </div>
        <Field label="Tolerância (%)" hint="Acima de previsto + tolerância, terminar uma tarefa exige justificação.">
          <Input type="number" min={0} max={100} value={tol} onChange={(e) => setTol(e.target.value)} className="w-32" />
        </Field>
        {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      </div>
    </Modal>
  );
}

function Replanear({ obra, aoFechar, aoGravar }: { obra: ObraResumo; aoFechar: () => void; aoGravar: () => void }) {
  const [inicio, setInicio] = useState(obra.data_inicio_prevista ?? hojeIso());
  const [erro, setErro] = useState<string | null>(null);
  const [auto, setAuto] = useState(true);
  const gravar = async () => {
    setErro(null);
    try {
      await replanearObra(obra.id, auto ? null : inicio);
      aoGravar();
      aoFechar();
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível replanear.");
    }
  };
  return (
    <Modal
      title="Replanear datas"
      size="sm"
      onClose={aoFechar}
      footer={
        <>
          <Button variant="secondary" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button onClick={() => void gravar()}>Replanear</Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-slate-600">
          Volta a planear todas as tarefas (em paralelo dentro de cada fase, 8 h por dia útil). As datas que arrastaste à
          mão perdem-se.
        </p>
        <Toggle
          checked={auto}
          onChange={setAuto}
          label="Primeira data com a equipa livre"
          hint="Procura o primeiro dia sem choques com outras obras e volta a distribuir a equipa nas tarefas por começar."
        />
        {!auto && (
          <Field label="Começa a">
            <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="w-full" />
          </Field>
        )}
        {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      </div>
    </Modal>
  );
}

function RenomearFase({ fase, aoFechar, aoGravar }: { fase: FaseObra; aoFechar: () => void; aoGravar: () => void }) {
  const [nome, setNome] = useState(fase.nome);
  const [erro, setErro] = useState<string | null>(null);
  const gravar = async () => {
    setErro(null);
    try {
      await renomearFase(fase.id, nome);
      aoGravar();
      aoFechar();
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível gravar.");
    }
  };
  return (
    <Modal
      title={`Fase ${fase.ordem}`}
      size="sm"
      onClose={aoFechar}
      footer={
        <>
          <Button variant="secondary" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button onClick={() => void gravar()}>Gravar</Button>
        </>
      }
    >
      <Field label="Nome da fase">
        <Input value={nome} onChange={(e) => setNome(e.target.value)} className="w-full" />
      </Field>
      {erro && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
    </Modal>
  );
}
