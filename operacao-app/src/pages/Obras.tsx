import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  ErroDeDados,
  ErroDeEscrita,
  listarClientes,
  listarEquipa,
  listarOrcamentos,
  type Cliente,
  type MembroEquipa,
  type OrcamentoAceite,
} from "../lib/dados";
import {
  alertasDaOrganizacao,
  criarObra,
  listarContratos,
  listarModelos,
  listarObras,
  moradaSugerida,
  orcamentosComObra,
  previsaoDoOrcamento,
  type AlertaObra,
  type ContratoAssinado,
  type ModeloObra,
  type ObraResumo,
  type PrevisaoOrcamento,
} from "../lib/obras";
import {
  Badge,
  Barra,
  Button,
  Card,
  Combobox,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  Select,
  Skeleton,
  cx,
} from "../components/ui";
import { AlertTriangle, MapPin, Plus } from "../components/icons";
import { ObraEstadoBadge } from "../components/ObraEstadoBadge";
import { ObraCapacete, ObraMetricas, ObraModelo, ObraValidar } from "../components/ObraIcones";
import {
  formatarMinutos,
  hojeIso,
  podePlanear,
  podeValidar,
  somarDiasUteis,
} from "../domain/obras";
import { data as formatarData, euros } from "../lib/formatar";

/**
 * Obras — a lista, e a porta de entrada: "Nova obra" a partir de um orçamento
 * aceite, de um contrato assinado, ou em branco, escolhendo o modelo.
 */



export default function Obras() {
  const { activeOrgId, funcao } = useAuth();
  const [obras, setObras] = useState<ObraResumo[]>([]);
  const [alertas, setAlertas] = useState<AlertaObra[]>([]);
  const [clientes, setClientes] = useState<Map<string, string>>(new Map());
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [nova, setNova] = useState(false);
  const [filtro, setFiltro] = useState<"abertas" | "todas">("abertas");

  const planeia = podePlanear(funcao);

  const carregar = useCallback(async () => {
    if (!activeOrgId) return;
    setACarregar(true);
    setErro(null);
    try {
      const [os, al, cs] = await Promise.all([
        listarObras(activeOrgId),
        alertasDaOrganizacao(activeOrgId),
        listarClientes(activeOrgId),
      ]);
      setObras(os);
      setAlertas(al);
      setClientes(new Map(cs.map((c) => [c.id, c.nome])));
    } catch (e) {
      setErro(e instanceof ErroDeDados ? e.message : "Algo correu mal a carregar as obras.");
    } finally {
      setACarregar(false);
    }
  }, [activeOrgId, recarga]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const visiveis = useMemo(
    () => (filtro === "todas" ? obras : obras.filter((o) => o.estado !== "concluida" && o.estado !== "cancelada")),
    [obras, filtro]
  );

  const alertasPorObra = useMemo(() => {
    const m = new Map<string, AlertaObra[]>();
    for (const a of alertas) m.set(a.obra_id, [...(m.get(a.obra_id) ?? []), a]);
    return m;
  }, [alertas]);

  if (aCarregar) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    );
  }
  if (erro) return <ErrorState message={erro} onRetry={() => setRecarga((r) => r + 1)} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Obras</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Fases, tarefas e o mapa de atividades. O real contra o previsto, tarefa a tarefa.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {podeValidar(funcao) && (
            <Link to="/validar">
              <Button variant="secondary" size="sm">
                <ObraValidar width={14} height={14} /> Validar
              </Button>
            </Link>
          )}
          {(planeia || (funcao as string | null) === "supervisor") && (
            <Link to="/obras/metricas">
              <Button variant="secondary" size="sm">
                <ObraMetricas width={14} height={14} /> Métricas
              </Button>
            </Link>
          )}
          <Link to="/obras/modelos">
            <Button variant="secondary" size="sm">
              <ObraModelo width={14} height={14} /> Modelos
            </Button>
          </Link>
          {planeia && (
            <Button size="sm" onClick={() => setNova(true)}>
              <Plus width={14} height={14} /> Nova obra
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-1 rounded-lg bg-slate-100 p-1 text-sm sm:w-fit">
        {(["abertas", "todas"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(f)}
            className={cx(
              "flex-1 rounded-md px-3 py-1.5 transition-colors sm:flex-none",
              filtro === f ? "bg-white font-medium text-slate-800 shadow-sm" : "text-slate-500"
            )}
          >
            {f === "abertas" ? "Em aberto" : "Todas"}
          </button>
        ))}
      </div>

      {visiveis.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ObraCapacete width={22} height={22} />}
            title="Sem obras"
            description={
              planeia
                ? "Abre a primeira a partir de um orçamento aceite ou de um contrato assinado."
                : "Quando o gestor te puser numa obra, aparece aqui."
            }
            action={
              planeia ? (
                <Button size="sm" onClick={() => setNova(true)}>
                  <Plus width={14} height={14} /> Nova obra
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {visiveis.map((o) => {
            const al = alertasPorObra.get(o.id) ?? [];
            const excedidos = al.filter((a) => a.nivel === "excedido").length;
            const progresso = o.n_tarefas ? Math.round((o.n_feitas / o.n_tarefas) * 100) : 0;
            return (
              <Link key={o.id} to={`/obras/${o.codigo}`} className="block">
                <Card className="h-full p-4 transition-shadow hover:shadow-elevated">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-medium tabular text-slate-500">{o.codigo}</span>
                        <ObraEstadoBadge estado={o.estado} />
                      </div>
                      <p className="mt-1 truncate text-sm font-semibold text-slate-800">{o.titulo}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {o.cliente_id ? clientes.get(o.cliente_id) ?? "Cliente" : "Sem cliente"}
                        {o.morada && (
                          <>
                            {" · "}
                            <MapPin width={11} height={11} className="inline text-slate-400" /> {o.morada}
                          </>
                        )}
                      </p>
                    </div>
                    {al.length > 0 && (
                      <span
                        className={cx(
                          "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                          excedidos ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"
                        )}
                        title="Tarefas a ≥ 80 % do previsto ou acima"
                      >
                        <AlertTriangle width={12} height={12} /> {al.length}
                      </span>
                    )}
                  </div>
                  <Barra percentagem={progresso} className="mt-3" />
                  <div className="mt-2 flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span>
                      {o.n_feitas}/{o.n_tarefas} tarefas · {o.n_validadas} validadas
                      {o.n_por_validar > 0 && <b className="text-brand-800"> · {o.n_por_validar} por validar</b>}
                    </span>
                    <span className="font-mono tabular">
                      {formatarMinutos(o.minutos_reais)} / {formatarMinutos(o.minutos_previstos)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {formatarData(o.inicio_planeado)} → {formatarData(o.fim_planeado)}
                    {o.n_extras > 0 && <> · {o.n_extras} extra(s) por decidir</>}
                  </p>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {nova && activeOrgId && (
        <NovaObra orgId={activeOrgId} aoFechar={() => setNova(false)} aoCriar={() => setRecarga((r) => r + 1)} />
      )}
    </div>
  );
}

/* ─────────────────────────────── Nova obra ─────────────────────────────── */

type Fonte = "orcamento" | "contrato" | "branco";

function NovaObra({ orgId, aoFechar, aoCriar }: { orgId: string; aoFechar: () => void; aoCriar: () => void }) {
  const navegar = useNavigate();
  const [fonte, setFonte] = useState<Fonte>("orcamento");
  const [orcamentos, setOrcamentos] = useState<OrcamentoAceite[]>([]);
  const [contratos, setContratos] = useState<ContratoAssinado[]>([]);
  const [semContratos, setSemContratos] = useState(false);
  const [modelos, setModelos] = useState<ModeloObra[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [equipa, setEquipa] = useState<MembroEquipa[]>([]);
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [orcamentoId, setOrcamentoId] = useState("");
  const [contratoId, setContratoId] = useState("");
  const [modeloId, setModeloId] = useState("");
  const [titulo, setTitulo] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [morada, setMorada] = useState("");
  const [inicio, setInicio] = useState(somarDiasUteis(hojeIso(), 1));
  const [inicioAuto, setInicioAuto] = useState(true);
  const [supervisorId, setSupervisorId] = useState("");
  const [aGravar, setAGravar] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [os, comObra, ct, ms, cs, eq] = await Promise.all([
          listarOrcamentos(orgId),
          orcamentosComObra(orgId),
          listarContratos(orgId),
          listarModelos(orgId),
          listarClientes(orgId),
          listarEquipa(orgId),
        ]);
        if (!vivo) return;
        setOrcamentos(os.filter((o) => !comObra.has(o.id)));
        setContratos(ct.contratos.filter((c) => !c.tem_obra));
        setSemContratos(ct.indisponivel);
        setModelos(ms.filter((m) => m.ativo));
        setClientes(cs);
        setEquipa(eq);
      } catch (e) {
        if (vivo) setErro(e instanceof ErroDeDados ? e.message : "Não foi possível carregar as fontes.");
      } finally {
        if (vivo) setACarregar(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [orgId]);

  // O tipo de obra vem escolhido: o "por defeito" (arranque, proteção,
  // limpeza, entrega), a que se juntam os serviços vendidos. Em branco, sem
  // por defeito, o primeiro — senão nascia vazia.
  useEffect(() => {
    const def = modelos.find((m) => m.por_defeito);
    setModeloId(def ? def.id : fonte === "branco" && modelos.length ? modelos[0].id : "");
  }, [fonte, modelos]);

  const fonteId = fonte === "orcamento" ? orcamentoId : fonte === "contrato" ? contratoId : "";
  const [previsao, setPrevisao] = useState<PrevisaoOrcamento | null>(null);
  const [erroPrevisao, setErroPrevisao] = useState<string | null>(null);
  useEffect(() => {
    setPrevisao(null);
    setErroPrevisao(null);
    if (!fonteId) return;
    let vivo = true;
    previsaoDoOrcamento({
      orgId,
      orcamentoId: fonte === "orcamento" ? fonteId : null,
      contratoId: fonte === "contrato" ? fonteId : null,
    })
      .then((p) => vivo && setPrevisao(p))
      .catch((e) => vivo && setErroPrevisao(e instanceof ErroDeEscrita ? e.message : "Não foi possível ler os serviços."));
    return () => {
      vivo = false;
    };
  }, [orgId, fonte, fonteId, modeloId]);

  // A morada vem preenchida (orçamento/contrato, ou a do cliente); quem abre
  // pode corrigir. Mudar a fonte volta a sugerir.
  useEffect(() => {
    const cliente = fonte === "branco" ? clienteId : "";
    if (!fonteId && !cliente) {
      setMorada("");
      return;
    }
    let vivo = true;
    moradaSugerida({
      orgId,
      clienteId: cliente || null,
      orcamentoId: fonte === "orcamento" ? fonteId : null,
      contratoId: fonte === "contrato" ? fonteId : null,
    })
      .then((m) => vivo && setMorada(m ?? ""))
      .catch(() => vivo && setMorada(""));
    return () => {
      vivo = false;
    };
  }, [orgId, fonte, fonteId, clienteId]);

  const nomeCliente = useMemo(() => new Map(clientes.map((c) => [c.id, c.nome])), [clientes]);
  const supervisores = equipa.filter((m) => ["supervisor", "gestor", "admin"].includes(m.funcao));
  const modelo = modelos.find((m) => m.id === modeloId);
  const totalModelo = modelo?.fases.reduce((s, f) => s + f.tarefas.reduce((x, t) => x + t.minutos_previstos, 0), 0) ?? 0;

  const pronto =
    (fonte === "orcamento" && orcamentoId) ||
    (fonte === "contrato" && contratoId) ||
    (fonte === "branco" && titulo.trim() && clienteId);

  const abrir = async () => {
    setAGravar(true);
    setErro(null);
    try {
      const r = await criarObra({
        orgId,
        orcamentoId: fonte === "orcamento" ? orcamentoId : null,
        contratoId: fonte === "contrato" ? contratoId : null,
        titulo: fonte === "branco" ? titulo : titulo.trim() || null,
        clienteId: fonte === "branco" ? clienteId : null,
        morada: morada.trim() || null,
        modeloId: modeloId || null,
        dataInicio: inicioAuto ? null : inicio || null,
        supervisorId: supervisorId || null,
      });
      aoCriar();
      navegar(`/obras/${r.codigo}`);
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível falar com o servidor.");
    } finally {
      setAGravar(false);
    }
  };

  return (
    <Modal
      title="Nova obra"
      size="lg"
      onClose={aoFechar}
      footer={
        <>
          <Button variant="secondary" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button onClick={() => void abrir()} disabled={!pronto || aGravar}>
            {aGravar ? "A abrir…" : "Abrir obra"}
          </Button>
        </>
      }
    >
      {aCarregar ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1 text-sm">
            {(
              [
                ["orcamento", `Orçamento aceite (${orcamentos.length})`],
                ["contrato", `Contrato assinado (${contratos.length})`],
                ["branco", "Em branco"],
              ] as const
            ).map(([f, r]) => (
              <button
                key={f}
                type="button"
                onClick={() => setFonte(f)}
                className={cx(
                  "rounded-md px-2 py-1.5 text-xs transition-colors sm:text-sm",
                  fonte === f ? "bg-white font-medium text-slate-800 shadow-sm" : "text-slate-500"
                )}
              >
                {r}
              </button>
            ))}
          </div>

          {fonte === "orcamento" &&
            (orcamentos.length === 0 ? (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
                Nenhum orçamento aceite sem obra. Os aceites aparecem aqui quando o comercial os fecha no CRM.
              </p>
            ) : (
              <div className="max-h-56 space-y-1.5 overflow-y-auto">
                {orcamentos.map((o) => (
                  <Escolha
                    key={o.id}
                    on={orcamentoId === o.id}
                    aoEscolher={() => setOrcamentoId(o.id)}
                    titulo={`${o.numero} · ${o.titulo}`}
                    sub={`${o.cliente_id ? nomeCliente.get(o.cliente_id) ?? "Cliente" : "Sem cliente"}${o.obra_endereco ? " · " + o.obra_endereco : ""}`}
                    dir={euros(o.total)}
                  />
                ))}
              </div>
            ))}

          {fonte === "contrato" &&
            (semContratos ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                A ligação aos contratos (ops_v_contrato) ainda não está instalada nesta base.
              </p>
            ) : contratos.length === 0 ? (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">Nenhum contrato assinado sem obra.</p>
            ) : (
              <div className="max-h-56 space-y-1.5 overflow-y-auto">
                {contratos.map((c) => (
                  <Escolha
                    key={c.id}
                    on={contratoId === c.id}
                    aoEscolher={() => setContratoId(c.id)}
                    titulo={`${c.numero} · ${c.titulo}`}
                    sub={`${c.cliente_id ? nomeCliente.get(c.cliente_id) ?? "Cliente" : "Sem cliente"} · assinado ${formatarData(c.assinado_em)}`}
                    dir={euros(c.valor)}
                  />
                ))}
              </div>
            ))}

          {fonte === "branco" && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Título">
                <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="w-full" />
              </Field>
              <Field label="Cliente">
                <Combobox
                  value={clienteId}
                  onChange={setClienteId}
                  placeholder="Escolher cliente…"
                  options={clientes.map((c) => ({ value: c.id, label: c.nome }))}
                />
              </Field>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Tipo de obra"
              hint={
                modelo
                  ? `+ ${modelo.fases.reduce((s, f) => s + f.tarefas.length, 0)} tarefas do tipo (${formatarMinutos(totalModelo)})` +
                    (fonte === "branco" ? "" : ", além dos serviços vendidos")
                  : fonte === "branco"
                    ? "Sem tipo: 4 fases vazias."
                    : "Só os serviços vendidos."
              }
            >
              <Select value={modeloId} onChange={(e) => setModeloId(e.target.value)} className="w-full">
                <option value="">{fonte === "branco" ? "— nenhum —" : "— nenhum (só os serviços) —"}</option>
                {modelos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nome}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Começa a"
              hint={inicioAuto ? "Automático: o primeiro dia útil em que a equipa está livre." : "As tarefas planeiam-se a partir daqui."}
            >
              <div className="flex items-center gap-2">
                <label className="flex shrink-0 items-center gap-1 text-xs text-slate-600">
                  <input type="checkbox" checked={inicioAuto} onChange={(e) => setInicioAuto(e.target.checked)} />
                  automático
                </label>
                {!inicioAuto && (
                  <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="w-full" />
                )}
              </div>
            </Field>
            <Field label="Supervisor" hint="Quem valida o que a equipa dá por feito.">
              <Select value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)} className="w-full">
                <option value="">— escolher depois —</option>
                {supervisores.map((m) => (
                  <option key={m.utilizador_id} value={m.utilizador_id}>
                    {m.nome} ({m.funcao})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Morada da obra" hint="Vem do orçamento ou do cliente. Podes corrigir.">
              <Input value={morada} onChange={(e) => setMorada(e.target.value)} className="w-full" />
            </Field>
          </div>

          {fonteId && <PrevisaoTarefas previsao={previsao} erro={erroPrevisao} />}

          {modelos.length === 0 && fonte === "branco" && (
            <p className="text-xs text-slate-500">
              Ainda não há modelos.{" "}
              <Link to="/obras/modelos" className="font-medium text-brand underline">
                Criar o exemplo "Remodelação casa de banho"
              </Link>
            </p>
          )}

          {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
        </div>
      )}
    </Modal>
  );
}

const NOMES_FASE = ["", "Preparação e demolições", "Instalações técnicas", "Acabamentos", "Limpeza e entrega"];

function PrevisaoTarefas({ previsao, erro }: { previsao: PrevisaoOrcamento | null; erro: string | null }) {
  if (erro) return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>;
  if (!previsao) return <Skeleton className="h-20 w-full" />;
  if (previsao.tarefas.length === 0) {
    return (
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
        Este orçamento não tem serviços (só produtos ou linhas soltas). A obra nasce só com as tarefas do tipo de obra —
        acrescenta as outras depois.
      </p>
    );
  }
  const fases = [1, 2, 3, 4].map((f) => ({ f, tarefas: previsao.tarefas.filter((t) => t.fase === f) })).filter((x) => x.tarefas.length);
  return (
    <div className="space-y-2 rounded-lg bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
      <p className="text-sm font-medium text-slate-700">
        Dos serviços vendidos: {previsao.tarefas.length} tarefa{previsao.tarefas.length === 1 ? "" : "s"} ·{" "}
        {formatarMinutos(previsao.minutos)} previstos. Datas, equipa e supervisor são planeados ao abrir.
      </p>
      {previsao.sem_ficha > 0 && (
        <p className="text-xs text-amber-700">
          {previsao.sem_ficha} serviço{previsao.sem_ficha === 1 ? "" : "s"} sem modelo nem horas na ficha técnica: fica
          {previsao.sem_ficha === 1 ? "" : "m"} com 1 h. Cria o modelo em Obras → Modelos, ou ajusta na obra.
        </p>
      )}
      <div className="max-h-56 space-y-2 overflow-y-auto">
        {fases.map(({ f, tarefas }) => (
          <div key={f}>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {f}. {NOMES_FASE[f]}
            </p>
            <ul className="mt-0.5 space-y-0.5">
              {tarefas.map((t, i) => (
                <li key={i} className="flex justify-between gap-3 text-sm text-slate-700">
                  <span className="min-w-0 truncate">
                    {t.nome}
                    {t.sem_ficha && <span className="ml-1 text-xs text-amber-700">(sem ficha)</span>}
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular text-slate-500">{formatarMinutos(t.minutos)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function Escolha({
  on,
  aoEscolher,
  titulo,
  sub,
  dir,
}: {
  on: boolean;
  aoEscolher: () => void;
  titulo: string;
  sub: string;
  dir: string;
}) {
  return (
    <button
      type="button"
      onClick={aoEscolher}
      aria-pressed={on}
      className={cx(
        "flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2 text-left ring-1 ring-inset transition-colors",
        on ? "bg-brand-50 ring-brand" : "bg-white ring-slate-200 hover:bg-slate-50"
      )}
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-slate-800">{titulo}</span>
        <span className="block truncate text-xs text-slate-500">{sub}</span>
      </span>
      <span className="shrink-0 font-mono text-xs tabular text-slate-600">{dir}</span>
    </button>
  );
}
