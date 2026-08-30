import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import {
  ErroDeDados,
  ErroDeEscrita,
  alvosDosPlanos,
  experimentarRegra,
  gravarPlano,
  listarChecklists,
  listarClientes,
  listarEquipa,
  listarLocais,
  listarPlanos,
  materializarPlanos,
  type AlvoDoPlano,
  type LocalRow,
  type MembroEquipa,
  type PlanoRow,
} from "../lib/dados";
import {
  Badge,
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
import { AlertTriangle, Clock, Plus, Layers } from "../components/icons";
import { data } from "../lib/formatar";
import SeletorDeLocal from "../components/SeletorDeLocal";
import {
  DIAS,
  RECORRENCIA_VAZIA,
  avisoDaRecorrencia,
  deRRule,
  emPortugues,
  faltaNaRecorrencia,
  paraRRule,
  regraEmPortugues,
  type Frequencia,
  type Recorrencia,
} from "../domain/recorrencia";

/**
 * Planos preventivos — a manutenção que se faz antes de partir.
 *
 * O que este ecrã existe para evitar: uma regra de recorrência escrita à mão
 * que ninguém consegue ler. `FREQ=MONTHLY;BYDAY=1MO` é um bom formato para
 * guardar e um mau formato para mostrar a alguém que faz manutenção de
 * extintores.
 *
 * Por isso o formulário fala português, e mostra sempre duas coisas antes de
 * gravar: a frase ("Todos os meses, na primeira segunda-feira") e as próximas
 * seis datas, vindas do MESMO expansor que a base vai usar. Confiar numa
 * regra e verificá-la são coisas diferentes.
 */

export default function Planos() {
  const { activeOrgId } = useAuth();

  const [planos, setPlanos] = useState<PlanoRow[]>([]);
  const [alvos, setAlvos] = useState<AlvoDoPlano[]>([]);
  const [clientes, setClientes] = useState<Map<string, string>>(new Map());
  const [locais, setLocais] = useState<LocalRow[]>([]);
  const [equipa, setEquipa] = useState<MembroEquipa[]>([]);
  const [checklists, setChecklists] = useState<{ id: string; codigo: string; nome: string }[]>([]);
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [aGerar, setAGerar] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);

  const [aEditar, setAEditar] = useState<PlanoRow | "novo" | null>(null);

  const carregar = useCallback(async () => {
    if (!activeOrgId) return;
    setACarregar(true);
    setErro(null);
    try {
      const [ps, cs, ls, eq, cks] = await Promise.all([
        listarPlanos(activeOrgId),
        listarClientes(activeOrgId),
        listarLocais(activeOrgId),
        listarEquipa(activeOrgId),
        listarChecklists(activeOrgId),
      ]);
      const als = await alvosDosPlanos(ps.map((p) => p.id));
      setPlanos(ps);
      setClientes(new Map(cs.map((c) => [c.id, c.nome])));
      setLocais(ls);
      setEquipa(eq);
      setChecklists(cks);
      setAlvos(als);
    } catch (e) {
      setErro(e instanceof ErroDeDados ? e.message : "Algo correu mal a carregar os planos.");
    } finally {
      setACarregar(false);
    }
  }, [activeOrgId, recarga]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const alvosPorPlano = useMemo(() => {
    const m = new Map<string, AlvoDoPlano[]>();
    for (const a of alvos) {
      const l = m.get(a.plano_id) ?? [];
      l.push(a);
      m.set(a.plano_id, l);
    }
    return m;
  }, [alvos]);

  const gerar = async () => {
    setAGerar(true);
    setResultado(null);
    try {
      const r = await materializarPlanos();
      setResultado(
        r.ordens_criadas === 0
          ? "Não havia nada por gerar — a janela dos próximos 120 dias já estava feita."
          : `${r.ordens_criadas} ${r.ordens_criadas === 1 ? "ordem gerada" : "ordens geradas"} para os próximos 120 dias.`
      );
      setRecarga((x) => x + 1);
    } catch (e) {
      setResultado(e instanceof ErroDeEscrita ? e.message : "Não foi possível gerar as ordens.");
    } finally {
      setAGerar(false);
    }
  };

  if (aCarregar) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    );
  }

  if (erro) return <ErrorState message={erro} onRetry={() => setRecarga((r) => r + 1)} />;

  const ativos = planos.filter((p) => p.estado === "ativo").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Planos</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {ativos === 0
              ? "Nenhum plano ativo. A manutenção preventiva não se gera sozinha."
              : `${ativos} ${ativos === 1 ? "plano ativo" : "planos ativos"} a gerar ordens.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" disabled={aGerar} onClick={() => void gerar()}>
            <Clock width={14} height={14} />
            {aGerar ? "A gerar…" : "Gerar ordens agora"}
          </Button>
          <Button onClick={() => setAEditar("novo")}>
            <Plus width={15} height={15} /> Novo plano
          </Button>
        </div>
      </div>

      {resultado && (
        <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">{resultado}</p>
      )}

      {planos.length === 0 ? (
        <EmptyState
          icon={<Layers width={22} height={22} />}
          title="Ainda não há planos"
          description="Um plano diz o que se faz, onde, e de quanto em quanto tempo. As ordens nascem sozinhas a partir dele."
          action={<Button onClick={() => setAEditar("novo")}>Criar o primeiro</Button>}
        />
      ) : (
        <div className="space-y-2">
          {planos.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-medium tabular text-slate-500">
                      {p.codigo}
                    </span>
                    <EstadoPlano estado={p.estado} />
                    {p.tipo_recorrencia === "dinamica" && (
                      <Badge className="bg-amber-50 text-amber-800 ring-amber-200">dinâmico</Badge>
                    )}
                  </div>

                  <p className="mt-1 text-sm font-medium text-slate-800">{p.nome}</p>

                  <p className="mt-0.5 text-sm text-slate-600">
                    {p.tipo_recorrencia === "dinamica"
                      ? `${p.intervalo_horas} h depois de cada fecho`
                      : regraEmPortugues(p.regra_recorrencia)}
                    <span className="text-slate-400"> · às {p.hora_prevista?.slice(0, 5)}</span>
                  </p>

                  <p className="mt-0.5 text-xs text-slate-500">
                    {clientes.get(p.cliente_id) ?? "Cliente"}
                    {" · "}
                    {(alvosPorPlano.get(p.id) ?? []).length}{" "}
                    {(alvosPorPlano.get(p.id) ?? []).length === 1 ? "alvo" : "alvos"}
                    {p.materializado_ate && ` · gerado até ${data(p.materializado_ate)}`}
                  </p>
                </div>

                <Button size="sm" variant="secondary" onClick={() => setAEditar(p)}>
                  Editar
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {aEditar && (
        <FormularioPlano
          plano={aEditar === "novo" ? null : aEditar}
          alvos={aEditar === "novo" ? [] : (alvosPorPlano.get(aEditar.id) ?? [])}
          clientes={[...clientes].map(([id, nome]) => ({ id, nome }))}
          locais={locais}
          equipa={equipa}
          checklists={checklists}
          aoFechar={() => setAEditar(null)}
          aoGravar={() => {
            setAEditar(null);
            setRecarga((r) => r + 1);
          }}
          aoRecarregar={() => setRecarga((r) => r + 1)}
        />
      )}
    </div>
  );
}

/* ─────────────────────────── O formulário ────────────────────────────── */

function FormularioPlano({
  plano,
  alvos,
  clientes,
  locais,
  equipa,
  checklists,
  aoFechar,
  aoGravar,
  aoRecarregar,
}: {
  plano: PlanoRow | null;
  alvos: readonly AlvoDoPlano[];
  clientes: { id: string; nome: string }[];
  locais: readonly LocalRow[];
  equipa: readonly MembroEquipa[];
  checklists: readonly { id: string; codigo: string; nome: string }[];
  aoFechar: () => void;
  aoGravar: () => void;
  /** Criar um local aqui dentro obriga a lista do pai a atualizar-se. */
  aoRecarregar: () => void;
}) {
  const [nome, setNome] = useState(plano?.nome ?? "");
  const [clienteId, setClienteId] = useState(plano?.cliente_id ?? "");
  const [tipo, setTipo] = useState<"calendario" | "dinamica">(
    (plano?.tipo_recorrencia as "calendario" | "dinamica") ?? "calendario"
  );
  const [horas, setHoras] = useState(String(plano?.intervalo_horas ?? 72));
  const [hora, setHora] = useState((plano?.hora_prevista ?? "09:00").slice(0, 5));
  const [inicio, setInicio] = useState(plano?.inicio_em ?? "");
  const [fim, setFim] = useState(plano?.fim_em ?? "");
  const [estado, setEstado] = useState(plano?.estado ?? "ativo");
  const [responsavelId, setResponsavelId] = useState(plano?.responsavel_id ?? "");
  const [localId, setLocalId] = useState(alvos[0]?.local_id ?? "");
  const [checklistId, setChecklistId] = useState(alvos[0]?.checklist_id ?? "");

  // Uma regra que o formulário não sabe representar não se abre a fingir que
  // sabe: mostra-se o texto cru e avisa-se, para não gravar por cima.
  const lida = deRRule(plano?.regra_recorrencia);
  const [rec, setRec] = useState<Recorrencia>(lida ?? RECORRENCIA_VAZIA);
  const regraIlegivel = !!plano?.regra_recorrencia && lida === null;

  const [datas, setDatas] = useState<string[] | null>(null);
  const [erroRegra, setErroRegra] = useState<string | null>(null);
  const [aGravar, setAGravar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const regra = paraRRule(rec);
  const falta = tipo === "calendario" ? faltaNaRecorrencia(rec) : null;
  const aviso = tipo === "calendario" ? avisoDaRecorrencia(rec) : null;

  // As datas vêm do MESMO expansor que a base usa. Uma pré-visualização
  // calculada no browser mentiria exatamente nos casos difíceis.
  useEffect(() => {
    if (tipo !== "calendario" || falta) {
      setDatas(null);
      return;
    }
    let vivo = true;
    const t = setTimeout(() => {
      void experimentarRegra(regra, inicio || undefined).then((r) => {
        if (!vivo) return;
        setDatas(r.ok ? (r.datas ?? []) : null);
        setErroRegra(r.ok ? null : (r.erro ?? "Regra não aceite."));
      });
    }, 250);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [regra, inicio, tipo, falta]);

  const podeGravar =
    nome.trim().length > 0 &&
    clienteId.length > 0 &&
    !aGravar &&
    !regraIlegivel &&
    (tipo === "dinamica" ? Number(horas) > 0 : !falta);

  const gravar = async () => {
    if (!podeGravar) return;
    setAGravar(true);
    setErro(null);
    try {
      await gravarPlano({
        id: plano?.id ?? null,
        nome: nome.trim(),
        clienteId,
        tipoRecorrencia: tipo,
        regra: tipo === "calendario" ? regra : null,
        intervaloHoras: tipo === "dinamica" ? Number(horas) : null,
        horaPrevista: hora,
        inicioEm: inicio || null,
        fimEm: fim || null,
        responsavelId: responsavelId || null,
        estado,
        alvos:
          localId || checklistId
            ? [{ local_id: localId || null, checklist_id: checklistId || null }]
            : [],
      });
      aoGravar();
    } catch (e) {
      setErro(
        e instanceof ErroDeEscrita
          ? e.message
          : "Não foi possível falar com o servidor. Tenta outra vez."
      );
    } finally {
      setAGravar(false);
    }
  };

  return (
    <Modal
      title={plano ? `Editar ${plano.codigo}` : "Novo plano"}
      onClose={aoFechar}
      footer={
        <>
          <Button variant="secondary" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button onClick={() => void gravar()} disabled={!podeGravar}>
            {aGravar ? "A gravar…" : "Gravar"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {regraIlegivel && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            A regra deste plano (<code className="font-mono">{plano?.regra_recorrencia}</code>) não
            é das que este formulário sabe editar. Gravar aqui substituí-la-ia — por isso o botão
            está desligado.
          </p>
        )}

        <Field label="Nome" hint="É por ele que se encontra o plano na lista.">
          <Input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Extintores — verificação trimestral"
            className="w-full"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cliente">
            <Combobox
              value={clienteId}
              onChange={setClienteId}
              options={clientes.map((c) => ({ value: c.id, label: c.nome }))}
              placeholder="Escolher cliente"
              className="w-full"
            />
          </Field>
          <SeletorDeLocal
            clienteId={clienteId}
            locais={locais}
            valor={localId}
            aoEscolher={setLocalId}
            aoCriar={aoRecarregar}
          />
        </div>

        {checklists.length > 0 && (
          <Field
            label="Procedimento"
            hint="As tarefas vêm com cada ordem gerada, na versão do dia."
          >
            <Combobox
              value={checklistId}
              onChange={setChecklistId}
              options={checklists.map((c) => ({ value: c.id, label: `${c.nome} · ${c.codigo}` }))}
              placeholder="Nenhum"
              className="w-full"
            />
          </Field>
        )}

        {/* ── Quando ──────────────────────────────────────────────────── */}
        <div className="rounded-lg bg-slate-50/70 p-4">
          <div className="flex flex-wrap gap-2">
            <Escolha ligado={tipo === "calendario"} onClick={() => setTipo("calendario")}>
              Por calendário
            </Escolha>
            <Escolha ligado={tipo === "dinamica"} onClick={() => setTipo("dinamica")}>
              Depois de cada fecho
            </Escolha>
          </div>

          <p className="mt-2 text-xs text-slate-500">
            {tipo === "calendario"
              ? "As ordens nascem em datas fixas, mesmo que a anterior ainda esteja aberta."
              : "A próxima só nasce quando a anterior fechar. Serve para trabalho que depende do uso, não do calendário."}
          </p>

          {tipo === "dinamica" ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Horas depois do fecho">
                <Input
                  type="number"
                  min={1}
                  value={horas}
                  onChange={(e) => setHoras(e.target.value)}
                  className="w-full"
                />
              </Field>
              <Field label="Hora prevista">
                <Input
                  type="time"
                  value={hora}
                  onChange={(e) => setHora(e.target.value)}
                  className="w-full"
                />
              </Field>
            </div>
          ) : (
            <EditorRecorrencia
              rec={rec}
              aoMudar={setRec}
              hora={hora}
              aoMudarHora={setHora}
              desativado={regraIlegivel}
            />
          )}

          {aviso && (
            <p className="mt-2 inline-flex items-start gap-1.5 text-xs text-amber-800">
              <AlertTriangle width={13} height={13} className="mt-0.5 shrink-0" />
              {aviso}
            </p>
          )}

          {tipo === "calendario" && (
            <div className="mt-3 border-t border-slate-200/70 pt-3">
              <p className="text-sm font-medium text-slate-700">{emPortugues(rec)}</p>
              {falta ? (
                <p className="mt-1 text-xs text-slate-500">{falta}</p>
              ) : erroRegra ? (
                <p className="mt-1 text-xs text-red-700">{erroRegra}</p>
              ) : datas && datas.length > 0 ? (
                <>
                  <p className="mt-1.5 text-xs text-slate-500">As próximas seriam:</p>
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {datas.map((d) => (
                      <li
                        key={d}
                        className="rounded-md bg-white px-2 py-1 font-mono text-xs tabular text-slate-600 ring-1 ring-slate-200"
                      >
                        {data(d)}
                      </li>
                    ))}
                  </ul>
                </>
              ) : datas ? (
                <p className="mt-1 text-xs text-amber-800">
                  Esta regra não gera nenhuma data nos próximos dois anos.
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-400">a calcular…</p>
              )}
            </div>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Começa em">
            <Input
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              className="w-full"
            />
          </Field>
          <Field label="Acaba em" hint="Opcional.">
            <Input
              type="date"
              value={fim}
              onChange={(e) => setFim(e.target.value)}
              className="w-full"
            />
          </Field>
          <Field label="Estado">
            <Select value={estado} onChange={(e) => setEstado(e.target.value)} className="w-full">
              <option value="ativo">Ativo</option>
              <option value="suspenso">Suspenso</option>
              <option value="terminado">Terminado</option>
            </Select>
          </Field>
        </div>

        <Field label="Responsável habitual" hint="Opcional. Fica nas ordens que nascerem.">
          <Combobox
            value={responsavelId}
            onChange={setResponsavelId}
            options={equipa.map((m) => ({ value: m.utilizador_id, label: m.nome }))}
            placeholder="Por atribuir"
            className="w-full"
          />
        </Field>

        {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

        {plano?.materializado_ate && (
          <p className="text-xs text-slate-400">
            Gravar volta a abrir a janela: o job diário recalcula as ordens a partir do início.
          </p>
        )}
      </div>
    </Modal>
  );
}

/* ───────────────────── O editor da recorrência ────────────────────────── */

function EditorRecorrencia({
  rec,
  aoMudar,
  hora,
  aoMudarHora,
  desativado,
}: {
  rec: Recorrencia;
  aoMudar: (r: Recorrencia) => void;
  hora: string;
  aoMudarHora: (h: string) => void;
  desativado?: boolean;
}) {
  const set = (p: Partial<Recorrencia>) => aoMudar({ ...rec, ...p });
  const mensal = rec.frequencia === "MONTHLY" || rec.frequencia === "YEARLY";

  return (
    <div className="mt-3 space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Frequência">
          <Select
            value={rec.frequencia}
            disabled={desativado}
            onChange={(e) => set({ frequencia: e.target.value as Frequencia })}
            className="w-full"
          >
            <option value="DAILY">Diária</option>
            <option value="WEEKLY">Semanal</option>
            <option value="MONTHLY">Mensal</option>
            <option value="YEARLY">Anual</option>
          </Select>
        </Field>
        <Field label="De quantas em quantas">
          <Input
            type="number"
            min={1}
            value={rec.intervalo}
            disabled={desativado}
            onChange={(e) => set({ intervalo: Math.max(1, Number(e.target.value) || 1) })}
            className="w-full"
          />
        </Field>
        <Field label="Hora prevista">
          <Input
            type="time"
            value={hora}
            disabled={desativado}
            onChange={(e) => aoMudarHora(e.target.value)}
            className="w-full"
          />
        </Field>
      </div>

      {rec.frequencia === "WEEKLY" && (
        <div>
          <span className="text-[13px] font-medium text-slate-700">Em que dias</span>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {DIAS.map((d) => {
              const dentro = rec.dias.includes(d.chave);
              return (
                <Escolha
                  key={d.chave}
                  ligado={dentro}
                  desativado={desativado}
                  onClick={() =>
                    set({
                      dias: dentro
                        ? rec.dias.filter((x) => x !== d.chave)
                        : [...rec.dias, d.chave],
                    })
                  }
                >
                  {d.curto}
                </Escolha>
              );
            })}
          </div>
        </div>
      )}

      {mensal && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Escolha
              ligado={rec.ordinal == null}
              desativado={desativado}
              onClick={() => set({ ordinal: null, diaDoMes: rec.diaDoMes ?? 1, dias: [] })}
            >
              Num dia do mês
            </Escolha>
            <Escolha
              ligado={rec.ordinal != null}
              desativado={desativado}
              onClick={() => set({ ordinal: 1, diaDoMes: null, dias: rec.dias.slice(0, 1) })}
            >
              Numa semana do mês
            </Escolha>
          </div>

          {rec.ordinal == null ? (
            <Field label="Dia">
              <Input
                type="number"
                min={1}
                max={31}
                value={rec.diaDoMes ?? 1}
                disabled={desativado}
                onChange={(e) => set({ diaDoMes: Number(e.target.value) || 1 })}
                className="w-24"
              />
            </Field>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Qual">
                <Select
                  value={String(rec.ordinal)}
                  disabled={desativado}
                  onChange={(e) => set({ ordinal: Number(e.target.value) })}
                  className="w-full"
                >
                  <option value="1">A primeira</option>
                  <option value="2">A segunda</option>
                  <option value="3">A terceira</option>
                  <option value="4">A quarta</option>
                  <option value="-1">A última</option>
                </Select>
              </Field>
              <Field label="Dia da semana">
                <Select
                  value={rec.dias[0] ?? ""}
                  disabled={desativado}
                  onChange={(e) => set({ dias: [e.target.value] })}
                  className="w-full"
                >
                  <option value="">Escolher…</option>
                  {DIAS.map((d) => (
                    <option key={d.chave} value={d.chave}>
                      {d.nome}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ────────────────────────── Peças pequenas ───────────────────────────── */

function Escolha({
  ligado,
  desativado,
  onClick,
  children,
}: {
  ligado: boolean;
  desativado?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={desativado}
      onClick={onClick}
      className={cx(
        "rounded-lg px-3 py-1.5 text-xs font-medium ring-1 transition-all",
        "active:scale-[0.98] disabled:opacity-50",
        ligado
          ? "bg-brand text-white ring-brand"
          : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300"
      )}
    >
      {children}
    </button>
  );
}

const CORES_PLANO: Record<string, string> = {
  ativo: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  suspenso: "bg-amber-50 text-amber-800 ring-amber-200",
  terminado: "bg-slate-100 text-slate-500 ring-slate-200",
};

function EstadoPlano({ estado }: { estado: string }) {
  return (
    <Badge className={CORES_PLANO[estado] ?? CORES_PLANO.terminado}>
      {estado === "ativo" ? "Ativo" : estado === "suspenso" ? "Suspenso" : "Terminado"}
    </Badge>
  );
}
