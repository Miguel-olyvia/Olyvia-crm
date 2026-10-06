import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ErroDeDados, ErroDeEscrita, listarClientes, listarLocais, type Cliente, type LocalRow } from "../lib/dados";
import {
  gravarAtivo,
  gravarCategoria,
  gravarChecklist,
  gravarLocal,
  gravarMedicao,
  gravarPerfil,
  listarCategorias,
  listarMedicoes,
  listarTodasChecklists,
  medicoesDasTarefas,
  opcoesDasMedicoes,
  proximoCodigo,
  tarefasDaChecklist,
  type CategoriaAtivo,
  type Checklist,
  type MedicaoDef,
  type OpcaoDef,
  type TarefaParaGravar,
} from "../lib/config";
import { ativosDoLocal, type AtivoRow } from "../lib/dados";
import { gravarPlaneamentoPessoa, listarSkills, type Skill } from "../lib/obras";
import { listarEquipaCrm, type EquipaCrm, type PessoaEquipa } from "../lib/equipaCrm";
import {
  EquipaOrigem,
  EquipaPessoaCartao,
  camposCrm,
  camposRh,
  textoAusencia,
} from "../components/EquipaPessoa";
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
  Toggle,
  cx,
} from "../components/ui";
import { Building, Check, Layers, Plus, Settings, User, X } from "../components/icons";
import { gravarModulos, lerModulos, type Modulos } from "../lib/modulos";
import { minutosParaSegundos, segundosParaMinutos } from "../domain/tempo";
import { ROTULO_TIPO_TAREFA, TIPOS_TAREFA, type TipoTarefa } from "../domain/tipos";

/**
 * Onde se monta a operação.
 *
 * Até aqui, tudo o que o módulo faz dependia de dados que só se metiam por SQL
 * à mão. Construiu-se o carro todo e não havia forma de o abastecer.
 *
 * Três separadores, pela ordem em que se usam pela primeira vez:
 *
 *  1. Locais — onde é. Tudo pende daqui;
 *  2. Procedimentos — o que se faz lá, e o que se mede ao fazê-lo;
 *  3. Equipa — quem o faz, e quanto custa a hora.
 *
 * O separador fica no endereço (`?ver=equipa`), para se poder mandar um link
 * a alguém a dizer "vai aqui".
 */

type Separador = "locais" | "procedimentos" | "equipa" | "empresa";

export default function Definicoes() {
  const [params, setParams] = useSearchParams();
  const ver = (params.get("ver") as Separador) || "locais";

  const trocar = (s: Separador) => {
    const p = new URLSearchParams(params);
    p.set("ver", s);
    setParams(p, { replace: true });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Definições</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Onde se monta a operação: os sítios, os procedimentos, e quem os faz.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Aba ligado={ver === "locais"} onClick={() => trocar("locais")} Icone={Building}>
          Locais e equipamentos
        </Aba>
        <Aba ligado={ver === "procedimentos"} onClick={() => trocar("procedimentos")} Icone={Layers}>
          Procedimentos
        </Aba>
        <Aba ligado={ver === "equipa"} onClick={() => trocar("equipa")} Icone={User}>
          Equipa
        </Aba>
        <Aba ligado={ver === "empresa"} onClick={() => trocar("empresa")} Icone={Settings}>
          O que a empresa usa
        </Aba>
      </div>

      {ver === "locais" && <PainelLocais />}
      {ver === "procedimentos" && <PainelProcedimentos />}
      {ver === "equipa" && <PainelEquipa />}
      {ver === "empresa" && <PainelEmpresa />}
    </div>
  );
}

function Aba({
  ligado,
  onClick,
  Icone,
  children,
}: {
  ligado: boolean;
  onClick: () => void;
  Icone: (p: { width: number; height: number }) => JSX.Element;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
        "transition-all active:scale-[0.98]",
        ligado
          ? "bg-brand text-white shadow-sm"
          : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-300"
      )}
    >
      <Icone width={15} height={15} />
      {children}
    </button>
  );
}

/* ═══════════════════════ 1. Locais e equipamentos ═══════════════════════ */

function PainelLocais() {
  const { activeOrgId } = useAuth();
  const [locais, setLocais] = useState<LocalRow[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [categorias, setCategorias] = useState<CategoriaAtivo[]>([]);
  const [ativos, setAtivos] = useState<AtivoRow[]>([]);
  const [aberto, setAberto] = useState<string | null>(null);
  const [estado, setEstado] = useState<Estado>({ carregar: true, erro: null });
  const [recarga, setRecarga] = useState(0);

  const [formLocal, setFormLocal] = useState<LocalRow | "novo" | null>(null);
  const [formAtivo, setFormAtivo] = useState<{ localId: string; ativo: AtivoRow | null } | null>(null);
  const [formCategoria, setFormCategoria] = useState(false);

  useEffect(() => {
    if (!activeOrgId) return;
    let vivo = true;
    setEstado({ carregar: true, erro: null });
    (async () => {
      try {
        const [ls, cs, cats] = await Promise.all([
          listarLocais(activeOrgId),
          listarClientes(activeOrgId),
          listarCategorias(activeOrgId),
        ]);
        if (!vivo) return;
        setLocais(ls);
        setClientes(cs);
        setCategorias(cats);
        setEstado({ carregar: false, erro: null });
      } catch (e) {
        if (vivo) setEstado({ carregar: false, erro: mensagem(e, "os locais") });
      }
    })();
    return () => { vivo = false; };
  }, [activeOrgId, recarga]);

  useEffect(() => {
    if (!aberto) { setAtivos([]); return; }
    let vivo = true;
    void ativosDoLocal(aberto).then((as) => { if (vivo) setAtivos(as); });
    return () => { vivo = false; };
  }, [aberto, recarga]);

  const nomeCliente = useMemo(
    () => new Map(clientes.map((c) => [c.id, c.nome])),
    [clientes]
  );

  if (estado.carregar) return <Carregando />;
  if (estado.erro) return <ErrorState message={estado.erro} onRetry={() => setRecarga((r) => r + 1)} />;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          {locais.length === 0
            ? "Nenhum local ainda."
            : `${locais.length} ${locais.length === 1 ? "local" : "locais"} · ${categorias.length} ${categorias.length === 1 ? "categoria" : "categorias"} de equipamento`}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => setFormCategoria(true)}>
            <Plus width={14} height={14} /> Categoria
          </Button>
          <Button size="sm" onClick={() => setFormLocal("novo")}>
            <Plus width={14} height={14} /> Local
          </Button>
        </div>
      </div>

      {locais.length === 0 ? (
        <EmptyState
          icon={<Building width={22} height={22} />}
          title="Comece pelos sítios"
          description="Um local é uma morada, um edifício, um piso ou um espaço. Os equipamentos vivem dentro deles, e as ordens apontam para ambos."
          action={<Button onClick={() => setFormLocal("novo")}>Criar o primeiro local</Button>}
        />
      ) : (
        <div className="space-y-2">
          {locais.map((l) => (
            <Card key={l.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setAberto(aberto === l.id ? null : l.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm tabular text-slate-500">{l.codigo}</span>
                    <Badge className="bg-slate-100 text-slate-600 ring-slate-200">{l.tipo}</Badge>
                  </span>
                  <p className="mt-1 text-sm font-medium text-slate-800">{l.nome}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {nomeCliente.get(l.cliente_id) ?? "Cliente"}
                  </p>
                </button>
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setFormLocal(l)}>
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setFormAtivo({ localId: l.id, ativo: null })}
                  >
                    <Plus width={13} height={13} /> Equipamento
                  </Button>
                </div>
              </div>

              {aberto === l.id && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  {ativos.length === 0 ? (
                    <p className="text-sm text-slate-400">
                      Sem equipamentos. Sem eles, uma ordem só sabe dizer o sítio.
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {ativos.map((a) => (
                        <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                          <span className="min-w-0">
                            <span className="font-mono text-xs tabular text-slate-500">{a.codigo}</span>
                            <span className="ml-2 text-sm text-slate-700">{a.nome}</span>
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setFormAtivo({ localId: l.id, ativo: a })}
                          >
                            Editar
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {formLocal && (
        <FormLocal
          local={formLocal === "novo" ? null : formLocal}
          clientes={clientes}
          locais={locais}
          aoFechar={() => setFormLocal(null)}
          aoGravar={() => { setFormLocal(null); setRecarga((r) => r + 1); }}
        />
      )}

      {formAtivo && (
        <FormAtivo
          localId={formAtivo.localId}
          ativo={formAtivo.ativo}
          categorias={categorias}
          aoFechar={() => setFormAtivo(null)}
          aoGravar={() => { setFormAtivo(null); setRecarga((r) => r + 1); }}
        />
      )}

      {formCategoria && (
        <FormCategoria
          aoFechar={() => setFormCategoria(false)}
          aoGravar={() => { setFormCategoria(false); setRecarga((r) => r + 1); }}
        />
      )}
    </>
  );
}

function FormLocal({
  local,
  clientes,
  locais,
  aoFechar,
  aoGravar,
}: {
  local: LocalRow | null;
  clientes: readonly Cliente[];
  locais: readonly LocalRow[];
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const { activeOrgId } = useAuth();
  const [codigo, setCodigo] = useState(local?.codigo ?? "");
  const [nome, setNome] = useState(local?.nome ?? "");
  const [tipo, setTipo] = useState(local?.tipo ?? "espaco");
  const [clienteId, setClienteId] = useState(local?.cliente_id ?? "");
  const [parentId, setParentId] = useState(local?.parent_id ?? "");
  const { aGravar, erro, gravar } = useGravar();

  // O código gera-se sozinho para quem cria. Obrigar alguém a inventar um
  // código único é um convite ao engano, e o engano só aparece meses depois.
  useEffect(() => {
    if (local || codigo || !activeOrgId) return;
    void proximoCodigo(activeOrgId, "LOC").then(setCodigo).catch(() => {});
  }, [local, codigo, activeOrgId]);

  return (
    <Modal
      title={local ? `Editar ${local.codigo}` : "Novo local"}
      onClose={aoFechar}
      footer={
        <>
          <Button variant="secondary" onClick={aoFechar}>Cancelar</Button>
          <Button
            disabled={!nome.trim() || !clienteId || aGravar}
            onClick={() =>
              gravar(
                () =>
                  gravarLocal({
                    id: local?.id,
                    orgId: activeOrgId!,
                    clienteId,
                    codigo: codigo.trim(),
                    nome: nome.trim(),
                    tipo,
                    parentId: parentId || null,
                  }),
                aoGravar
              )
            }
          >
            {aGravar ? "A gravar…" : "Gravar"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nome" hint="Como as pessoas lhe chamam. Ex.: Torre A — Garagem −1">
          <Input value={nome} onChange={(e) => setNome(e.target.value)} className="w-full" autoFocus />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Cliente">
            <Combobox
              value={clienteId}
              onChange={setClienteId}
              options={clientes.map((c) => ({ value: c.id, label: c.nome }))}
              placeholder="Escolher"
              className="w-full"
            />
          </Field>
          <Field label="Tipo">
            <Select value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-full">
              <option value="morada">Morada</option>
              <option value="edificio">Edifício</option>
              <option value="piso">Piso</option>
              <option value="espaco">Espaço</option>
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Dentro de" hint="Opcional. Um piso vive num edifício.">
            <Combobox
              value={parentId}
              onChange={setParentId}
              options={locais
                .filter((l) => l.id !== local?.id)
                .map((l) => ({ value: l.id, label: `${l.nome} · ${l.codigo}` }))}
              placeholder="Nada"
              className="w-full"
            />
          </Field>
          <Field label="Código" hint="Gerado automaticamente. Podes mudá-lo.">
            <Input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              className="w-full font-mono"
            />
          </Field>
        </div>

        {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      </div>
    </Modal>
  );
}

function FormAtivo({
  localId,
  ativo,
  categorias,
  aoFechar,
  aoGravar,
}: {
  localId: string;
  ativo: AtivoRow | null;
  categorias: readonly CategoriaAtivo[];
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const { activeOrgId } = useAuth();
  const [codigo, setCodigo] = useState(ativo?.codigo ?? "");
  const [nome, setNome] = useState(ativo?.nome ?? "");
  const [categoriaId, setCategoriaId] = useState(ativo?.categoria_id ?? "");
  const [marca, setMarca] = useState(ativo?.marca ?? "");
  const [modelo, setModelo] = useState(ativo?.modelo ?? "");
  const [criticidade, setCriticidade] = useState(ativo?.criticidade ?? "normal");
  const { aGravar, erro, gravar } = useGravar();

  useEffect(() => {
    if (ativo || codigo || !activeOrgId) return;
    void proximoCodigo(activeOrgId, "AT").then(setCodigo).catch(() => {});
  }, [ativo, codigo, activeOrgId]);

  return (
    <Modal
      title={ativo ? `Editar ${ativo.codigo}` : "Novo equipamento"}
      onClose={aoFechar}
      footer={
        <>
          <Button variant="secondary" onClick={aoFechar}>Cancelar</Button>
          <Button
            disabled={!nome.trim() || aGravar}
            onClick={() =>
              gravar(
                () =>
                  gravarAtivo({
                    id: ativo?.id,
                    orgId: activeOrgId!,
                    localId,
                    categoriaId: categoriaId || null,
                    codigo: codigo.trim(),
                    nome: nome.trim(),
                    marca: marca.trim() || null,
                    modelo: modelo.trim() || null,
                    criticidade,
                  }),
                aoGravar
              )
            }
          >
            {aGravar ? "A gravar…" : "Gravar"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nome" hint="Ex.: Extintor ABC 6 kg — entrada sul">
          <Input value={nome} onChange={(e) => setNome(e.target.value)} className="w-full" autoFocus />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Categoria"
            hint={
              categorias.length === 0
                ? "Ainda não há categorias. Cria uma primeiro para poder ligar medições."
                : "É por aqui que as medições sabem a que equipamentos se aplicam."
            }
          >
            <Combobox
              value={categoriaId}
              onChange={setCategoriaId}
              options={categorias.map((c) => ({ value: c.id, label: c.nome }))}
              placeholder="Nenhuma"
              className="w-full"
              disabled={categorias.length === 0}
            />
          </Field>
          <Field label="Criticidade" hint="Alta e crítica sobem na lista de trabalho.">
            <Select
              value={criticidade}
              onChange={(e) => setCriticidade(e.target.value)}
              className="w-full"
            >
              <option value="baixa">Baixa</option>
              <option value="normal">Normal</option>
              <option value="alta">Alta</option>
              <option value="critica">Crítica</option>
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Marca">
            <Input value={marca} onChange={(e) => setMarca(e.target.value)} className="w-full" />
          </Field>
          <Field label="Modelo">
            <Input value={modelo} onChange={(e) => setModelo(e.target.value)} className="w-full" />
          </Field>
          <Field label="Código">
            <Input
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              className="w-full font-mono"
            />
          </Field>
        </div>

        {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      </div>
    </Modal>
  );
}

function FormCategoria({ aoFechar, aoGravar }: { aoFechar: () => void; aoGravar: () => void }) {
  const { activeOrgId } = useAuth();
  const [nome, setNome] = useState("");
  const [codigo, setCodigo] = useState("");
  const { aGravar, erro, gravar } = useGravar();

  useEffect(() => {
    if (codigo || !activeOrgId) return;
    void proximoCodigo(activeOrgId, "CAT").then(setCodigo).catch(() => {});
  }, [codigo, activeOrgId]);

  return (
    <Modal
      title="Nova categoria de equipamento"
      onClose={aoFechar}
      footer={
        <>
          <Button variant="secondary" onClick={aoFechar}>Cancelar</Button>
          <Button
            disabled={!nome.trim() || aGravar}
            onClick={() =>
              gravar(
                () =>
                  gravarCategoria({
                    orgId: activeOrgId!,
                    codigo: codigo.trim(),
                    nome: nome.trim(),
                  }),
                aoGravar
              )
            }
          >
            {aGravar ? "A gravar…" : "Gravar"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          Extintor, AVAC, elevador, portão. Serve para dizer que medições se fazem a que tipo de
          equipamento.
        </p>
        <Field label="Nome">
          <Input value={nome} onChange={(e) => setNome(e.target.value)} className="w-full" autoFocus />
        </Field>
        <Field label="Código">
          <Input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            className="w-full font-mono"
          />
        </Field>
        {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      </div>
    </Modal>
  );
}

/* ═════════════════════════ 2. Procedimentos ═════════════════════════════ */

function PainelProcedimentos() {
  const { activeOrgId } = useAuth();
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [medicoes, setMedicoes] = useState<MedicaoDef[]>([]);
  const [opcoes, setOpcoes] = useState<OpcaoDef[]>([]);
  const [categorias, setCategorias] = useState<CategoriaAtivo[]>([]);
  const [estado, setEstado] = useState<Estado>({ carregar: true, erro: null });
  const [recarga, setRecarga] = useState(0);

  const [formChecklist, setFormChecklist] = useState<Checklist | "novo" | null>(null);
  const [formMedicao, setFormMedicao] = useState<MedicaoDef | "nova" | null>(null);

  const carregar = useCallback(async () => {
    if (!activeOrgId) return;
    setEstado({ carregar: true, erro: null });
    try {
      const [cks, ms, cats] = await Promise.all([
        listarTodasChecklists(activeOrgId),
        listarMedicoes(activeOrgId),
        listarCategorias(activeOrgId),
      ]);
      const ops = await opcoesDasMedicoes(ms.filter((m) => m.tipo === "escolha").map((m) => m.id));
      setChecklists(cks);
      setMedicoes(ms);
      setOpcoes(ops);
      setCategorias(cats);
      setEstado({ carregar: false, erro: null });
    } catch (e) {
      setEstado({ carregar: false, erro: mensagem(e, "os procedimentos") });
    }
  }, [activeOrgId, recarga]);

  useEffect(() => { void carregar(); }, [carregar]);

  if (estado.carregar) return <Carregando />;
  if (estado.erro) return <ErrorState message={estado.erro} onRetry={() => setRecarga((r) => r + 1)} />;

  return (
    <>
      {/* Medições primeiro: uma checklist não as pode usar antes de existirem. */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Medições</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              O que se lê ao fazer o trabalho: 12,4 bar, "Conforme", 45 812 h de contador.
            </p>
          </div>
          <Button size="sm" onClick={() => setFormMedicao("nova")}>
            <Plus width={14} height={14} /> Medição
          </Button>
        </div>

        {medicoes.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">
            Sem medições, uma tarefa só se responde com conforme ou não conforme.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {medicoes.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="text-sm text-slate-800">{m.nome}</span>
                  <span className="ml-2 text-xs text-slate-400">
                    {m.tipo === "gama"
                      ? `${m.limite_min ?? "—"}–${m.limite_max ?? "—"}${m.unidade ? ` ${m.unidade}` : ""}`
                      : m.tipo === "escolha"
                        ? `${opcoes.filter((o) => o.medicao_def_id === m.id).length} opções`
                        : m.tipo === "acumulado"
                          ? `contador${m.unidade ? ` em ${m.unidade}` : ""}`
                          : "texto livre"}
                  </span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => setFormMedicao(m)}>
                  Editar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Checklists</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              A lista de tarefas que o técnico vai encontrar. Publicada, fica imutável.
            </p>
          </div>
          <Button size="sm" onClick={() => setFormChecklist("novo")}>
            <Plus width={14} height={14} /> Checklist
          </Button>
        </div>

        {checklists.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">
            Sem checklists, uma ordem preventiva nasce vazia.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {checklists.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="font-mono text-xs tabular text-slate-500">{c.codigo}</span>
                  <span className="ml-2 text-sm text-slate-800">{c.nome}</span>
                  <span className="ml-2 text-xs text-slate-400">v{c.versao}</span>
                  {c.estado === "publicada" ? (
                    <Badge className="ml-2 bg-emerald-50 text-emerald-700 ring-emerald-200">
                      publicada
                    </Badge>
                  ) : (
                    <Badge className="ml-2 bg-slate-100 text-slate-500 ring-slate-200">
                      rascunho
                    </Badge>
                  )}
                </span>
                <Button size="sm" variant="ghost" onClick={() => setFormChecklist(c)}>
                  Editar
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {formMedicao && (
        <FormMedicao
          medicao={formMedicao === "nova" ? null : formMedicao}
          opcoes={formMedicao === "nova" ? [] : opcoes.filter((o) => o.medicao_def_id === formMedicao.id)}
          categorias={categorias}
          aoFechar={() => setFormMedicao(null)}
          aoGravar={() => { setFormMedicao(null); setRecarga((r) => r + 1); }}
        />
      )}

      {formChecklist && (
        <FormChecklist
          checklist={formChecklist === "novo" ? null : formChecklist}
          medicoes={medicoes}
          aoFechar={() => setFormChecklist(null)}
          aoGravar={() => { setFormChecklist(null); setRecarga((r) => r + 1); }}
        />
      )}
    </>
  );
}

function FormMedicao({
  medicao,
  opcoes: opcoesIniciais,
  categorias,
  aoFechar,
  aoGravar,
}: {
  medicao: MedicaoDef | null;
  opcoes: readonly OpcaoDef[];
  categorias: readonly CategoriaAtivo[];
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const { activeOrgId } = useAuth();
  const [nome, setNome] = useState(medicao?.nome ?? "");
  const [tipo, setTipo] = useState(medicao?.tipo ?? "gama");
  const [unidade, setUnidade] = useState(medicao?.unidade ?? "");
  const [min, setMin] = useState(medicao?.limite_min?.toString() ?? "");
  const [max, setMax] = useState(medicao?.limite_max?.toString() ?? "");
  const [categoriaId, setCategoriaId] = useState(medicao?.categoria_ativo_id ?? "");
  const [opcoes, setOpcoes] = useState(
    opcoesIniciais.length > 0
      ? opcoesIniciais.map((o) => ({
          nome: o.nome,
          e_nao_conforme: o.e_nao_conforme,
          cria_corretiva: o.cria_corretiva,
        }))
      : [
          { nome: "Conforme", e_nao_conforme: false, cria_corretiva: false },
          { nome: "Não conforme", e_nao_conforme: true, cria_corretiva: true },
        ]
  );
  const { aGravar, erro, gravar } = useGravar();

  return (
    <Modal
      title={medicao ? `Editar ${medicao.nome}` : "Nova medição"}
      onClose={aoFechar}
      footer={
        <>
          <Button variant="secondary" onClick={aoFechar}>Cancelar</Button>
          <Button
            disabled={!nome.trim() || aGravar}
            onClick={() =>
              gravar(
                () =>
                  gravarMedicao({
                    id: medicao?.id,
                    orgId: activeOrgId!,
                    nome: nome.trim(),
                    tipo,
                    categoriaId: categoriaId || null,
                    unidade: unidade.trim() || null,
                    limiteMin: min.trim() ? Number(min.replace(",", ".")) : null,
                    limiteMax: max.trim() ? Number(max.replace(",", ".")) : null,
                    opcoes: tipo === "escolha" ? opcoes.filter((o) => o.nome.trim()) : [],
                  }),
                aoGravar
              )
            }
          >
            {aGravar ? "A gravar…" : "Gravar"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nome" hint="Ex.: Pressão do manómetro">
          <Input value={nome} onChange={(e) => setNome(e.target.value)} className="w-full" autoFocus />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Feitio">
            <Select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as MedicaoDef["tipo"])}
              className="w-full"
            >
              <option value="gama">Número com limites</option>
              <option value="escolha">Escolha de opções</option>
              <option value="acumulado">Contador (só sobe)</option>
              <option value="texto">Texto livre</option>
            </Select>
          </Field>
          <Field label="Aplica-se a" hint="Opcional. Que tipo de equipamento.">
            <Combobox
              value={categoriaId}
              onChange={setCategoriaId}
              options={categorias.map((c) => ({ value: c.id, label: c.nome }))}
              placeholder="Todos"
              className="w-full"
            />
          </Field>
        </div>

        {(tipo === "gama" || tipo === "acumulado") && (
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Unidade">
              <Input
                value={unidade}
                onChange={(e) => setUnidade(e.target.value)}
                placeholder="bar, °C, h"
                className="w-full"
              />
            </Field>
            {tipo === "gama" && (
              <>
                <Field label="Mínimo aceite">
                  <Input value={min} onChange={(e) => setMin(e.target.value)} className="w-full" />
                </Field>
                <Field label="Máximo aceite">
                  <Input value={max} onChange={(e) => setMax(e.target.value)} className="w-full" />
                </Field>
              </>
            )}
          </div>
        )}

        {tipo === "gama" && (
          <p className="text-xs text-slate-500">
            Um valor fora destes limites fica não conforme sozinho, e abre uma ordem corretiva.
          </p>
        )}

        {tipo === "escolha" && (
          <div>
            <span className="text-[13px] font-medium text-slate-700">Opções</span>
            <p className="mt-0.5 text-xs text-slate-500">
              A caixa &ldquo;abre corretiva&rdquo; é o que faz o ciclo fechar. No Infraspeak ela
              existe e está desligada — por isso as não conformidades morrem lá.
            </p>
            <ul className="mt-2 space-y-2">
              {opcoes.map((o, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <Input
                    value={o.nome}
                    onChange={(e) =>
                      setOpcoes((xs) => xs.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))
                    }
                    placeholder="Nome da opção"
                    className="min-w-0 flex-1"
                  />
                  <Escolha
                    ligado={o.e_nao_conforme}
                    onClick={() =>
                      setOpcoes((xs) =>
                        xs.map((x, j) => (j === i ? { ...x, e_nao_conforme: !x.e_nao_conforme } : x))
                      )
                    }
                  >
                    é problema
                  </Escolha>
                  <Escolha
                    ligado={o.cria_corretiva}
                    onClick={() =>
                      setOpcoes((xs) =>
                        xs.map((x, j) => (j === i ? { ...x, cria_corretiva: !x.cria_corretiva } : x))
                      )
                    }
                  >
                    abre corretiva
                  </Escolha>
                  <button
                    type="button"
                    onClick={() => setOpcoes((xs) => xs.filter((_, j) => j !== i))}
                    className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-red-600"
                    aria-label="Remover opção"
                  >
                    <X width={15} height={15} />
                  </button>
                </li>
              ))}
            </ul>
            <Button
              size="sm"
              variant="secondary"
              className="mt-2"
              onClick={() =>
                setOpcoes((xs) => [...xs, { nome: "", e_nao_conforme: false, cria_corretiva: false }])
              }
            >
              <Plus width={13} height={13} /> Opção
            </Button>
          </div>
        )}

        {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      </div>
    </Modal>
  );
}

function FormChecklist({
  checklist,
  medicoes,
  aoFechar,
  aoGravar,
}: {
  checklist: Checklist | null;
  medicoes: readonly MedicaoDef[];
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const { activeOrgId } = useAuth();
  const [nome, setNome] = useState(checklist?.nome ?? "");
  const [tarefas, setTarefas] = useState<TarefaParaGravar[]>([]);
  // O que se está a escrever no campo dos minutos, por tarefa — para "2," não
  // virar "2" a meio da escrita.
  const [rascunhoMinutos, setRascunhoMinutos] = useState<Record<number, string>>({});
  const [aCarregar, setACarregar] = useState(!!checklist);
  const { aGravar, erro, gravar } = useGravar();

  useEffect(() => {
    if (!checklist) return;
    let vivo = true;
    (async () => {
      const ts = await tarefasDaChecklist(checklist.id);
      const ms = await medicoesDasTarefas(ts.map((t) => t.id));
      if (!vivo) return;
      setTarefas(
        ts.map((t) => ({
          nome: t.nome,
          descricao: t.descricao,
          tipo: t.tipo,
          obrigatoria: t.obrigatoria,
          privada: t.privada,
          tempo_estimado: t.tempo_estimado ?? 0,
          medicoes: ms.filter((m) => m.checklist_tarefa_id === t.id).map((m) => m.medicao_def_id),
        }))
      );
      setACarregar(false);
    })();
    return () => { vivo = false; };
  }, [checklist]);

  const mudar = (i: number, p: Partial<TarefaParaGravar>) =>
    setTarefas((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const publicada = checklist?.estado === "publicada";

  return (
    <Modal
      title={checklist ? `Editar ${checklist.codigo}` : "Nova checklist"}
      onClose={aoFechar}
      footer={
        <>
          <Button variant="secondary" onClick={aoFechar}>Cancelar</Button>
          <Button
            variant="secondary"
            disabled={!nome.trim() || aGravar}
            onClick={() =>
              gravar(
                () =>
                  gravarChecklist({
                    id: checklist?.id,
                    orgId: activeOrgId!,
                    nome: nome.trim(),
                    publicar: false,
                    tarefas: tarefas.filter((t) => t.nome.trim()),
                  }),
                aoGravar
              )
            }
          >
            Guardar rascunho
          </Button>
          <Button
            disabled={!nome.trim() || tarefas.filter((t) => t.nome.trim()).length === 0 || aGravar}
            onClick={() =>
              gravar(
                () =>
                  gravarChecklist({
                    id: checklist?.id,
                    orgId: activeOrgId!,
                    nome: nome.trim(),
                    publicar: true,
                    tarefas: tarefas.filter((t) => t.nome.trim()),
                  }),
                aoGravar
              )
            }
          >
            {aGravar ? "A gravar…" : "Publicar"}
          </Button>
        </>
      }
    >
      {aCarregar ? (
        <Skeleton className="h-48 w-full rounded-lg" />
      ) : (
        <div className="space-y-4">
          {publicada && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Esta checklist está publicada. Gravar cria a <strong>versão {checklist!.versao + 1}</strong>;
              as ordens já criadas continuam a apontar para a v{checklist!.versao}.
            </p>
          )}

          <Field label="Nome" hint="Ex.: Extintor — verificação trimestral">
            <Input value={nome} onChange={(e) => setNome(e.target.value)} className="w-full" autoFocus />
          </Field>

          <div>
            <span className="text-[13px] font-medium text-slate-700">Tarefas</span>
            <p className="mt-0.5 text-xs text-slate-500">
              Pela ordem em que o técnico as vai encontrar.
            </p>

            {tarefas.length === 0 && (
              <p className="mt-2 text-sm text-slate-400">
                Ainda nenhuma. Uma checklist sem tarefas não manda fazer nada.
              </p>
            )}

            <ul className="mt-2 space-y-2">
              {tarefas.map((t, i) => (
                <li key={i} className="rounded-lg bg-slate-50/70 p-3">
                  <div className="flex items-start gap-2">
                    <span className="mt-2 font-mono text-xs tabular text-slate-400">{i + 1}</span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <Input
                        value={t.nome}
                        onChange={(e) => mudar(i, { nome: e.target.value })}
                        placeholder="O que há a fazer"
                        className="w-full"
                      />

                      <div className="flex flex-wrap items-center gap-2">
                        <Select
                          value={t.tipo}
                          onChange={(e) => mudar(i, { tipo: e.target.value })}
                          className="text-xs"
                        >
                          {TIPOS_TAREFA.map((x) => (
                            <option key={x} value={x}>
                              {ROTULO_TIPO_TAREFA[x as TipoTarefa]}
                            </option>
                          ))}
                        </Select>
                        <Escolha
                          ligado={t.obrigatoria}
                          onClick={() => mudar(i, { obrigatoria: !t.obrigatoria })}
                        >
                          obrigatória
                        </Escolha>
                        <Escolha ligado={t.privada} onClick={() => mudar(i, { privada: !t.privada })}>
                          não sai no relatório
                        </Escolha>
                        {/* O tempo estimado é o termo de comparação do tempo
                            real de cada tarefa. Em minutos, que é como se
                            pensa; a base guarda segundos. */}
                        <label className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={rascunhoMinutos[i] ?? segundosParaMinutos(t.tempo_estimado ?? 0)}
                            onChange={(e) => {
                              const v = e.target.value;
                              setRascunhoMinutos((r) => ({ ...r, [i]: v }));
                              mudar(i, { tempo_estimado: minutosParaSegundos(v) });
                            }}
                            placeholder="—"
                            className="w-16 py-1 text-right font-mono text-xs tabular"
                            aria-label={`Tempo estimado da tarefa ${i + 1}, em minutos`}
                          />
                          min estimados
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setTarefas((xs) => xs.filter((_, j) => j !== i));
                            setRascunhoMinutos({});
                          }}
                          className="ml-auto rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-red-600"
                          aria-label="Remover tarefa"
                        >
                          <X width={15} height={15} />
                        </button>
                      </div>

                      {medicoes.length > 0 && (
                        <div>
                          <span className="text-xs text-slate-500">O que se lê aqui:</span>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {medicoes.map((m) => {
                              const dentro = t.medicoes.includes(m.id);
                              return (
                                <Escolha
                                  key={m.id}
                                  ligado={dentro}
                                  onClick={() =>
                                    mudar(i, {
                                      medicoes: dentro
                                        ? t.medicoes.filter((x) => x !== m.id)
                                        : [...t.medicoes, m.id],
                                    })
                                  }
                                >
                                  {dentro && <Check width={11} height={11} className="mr-1 inline" />}
                                  {m.nome}
                                </Escolha>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <Button
              size="sm"
              variant="secondary"
              className="mt-2"
              onClick={() =>
                setTarefas((xs) => [
                  ...xs,
                  { nome: "", tipo: "inspecao", obrigatoria: true, privada: false, tempo_estimado: 0, medicoes: [] },
                ])
              }
            >
              <Plus width={13} height={13} /> Tarefa
            </Button>
          </div>

          {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
        </div>
      )}
    </Modal>
  );
}

/* ══════════════════════════════ 3. Equipa ═══════════════════════════════ */

/**
 * A equipa vem do Olyvia: as pessoas, o papel, a equipa, os distritos da
 * agenda e (havendo RH) a ficha. Nada disso se escreve aqui — mostra-se com a
 * origem ao lado. O que é de Operações (função, ativo, especialidades,
 * zona-base como override, custo/hora) continua a editar-se aqui.
 */
function PainelEquipa() {
  const { activeOrgId, businessUserId } = useAuth();
  const [equipa, setEquipa] = useState<EquipaCrm | null>(null);
  const [estado, setEstado] = useState<Estado>({ carregar: true, erro: null });
  const [recarga, setRecarga] = useState(0);
  const [aEditar, setAEditar] = useState<PessoaEquipa | null>(null);
  const [aAdicionar, setAAdicionar] = useState(false);
  const [aConvidar, setAConvidar] = useState(false);

  useEffect(() => {
    if (!activeOrgId) return;
    let vivo = true;
    setEstado({ carregar: true, erro: null });
    (async () => {
      try {
        const eq = await listarEquipaCrm(activeOrgId);
        if (!vivo) return;
        setEquipa(eq);
        setEstado({ carregar: false, erro: null });
      } catch (e) {
        if (vivo) setEstado({ carregar: false, erro: mensagem(e, "a equipa") });
      }
    })();
    return () => { vivo = false; };
  }, [activeOrgId, recarga]);

  if (estado.carregar) return <Carregando />;
  if (estado.erro || !equipa) {
    return <ErrorState message={estado.erro ?? "Algo correu mal a carregar a equipa."} onRetry={() => setRecarga((r) => r + 1)} />;
  }

  const { pessoas, rhDisponivel, podeVerCustos: vejoCustos, ligadaAoCrm } = equipa;
  const emOps = pessoas.filter((p) => p.em_operacoes);
  // Quem pode entrar: está no Olyvia, ainda não está em Operações e não é cliente.
  const fora = pessoas.filter((p) => !p.em_operacoes && !p.e_cliente);
  const ativos = emOps.filter((p) => p.ativo);
  const clientes = emOps.filter((p) => p.e_cliente);

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-500">
          {ativos.length === 0
            ? "Ainda ninguém em Operações."
            : `${ativos.length} ${ativos.length === 1 ? "pessoa ativa" : "pessoas ativas"} em Operações.`}{" "}
          As pessoas, o papel e os distritos vêm do CRM
          {rhDisponivel ? "; o cargo, o contrato e as ausências vêm do RH" : ""} — mudam-se lá. Os clientes
          do CRM nunca entram na equipa.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setAAdicionar(true)} disabled={fora.length === 0}>
            <Plus width={13} height={13} /> Adicionar pessoa
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setAConvidar(true)}>
            Convidar pessoa nova
          </Button>
        </div>
      </div>

      {!ligadaAoCrm && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Os dados do CRM e do RH aparecem depois de instalar <code>db/pessoas-crm.sql</code>. Até lá
          mostra-se só o que é de Operações.
        </p>
      )}

      <OficiosResumo pessoas={ativos.filter((p) => !p.e_cliente)} onEditar={setAEditar} />

      {clientes.length > 0 && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-800">
          {clientes.length === 1 ? "1 pessoa com perfil em Operações é só cliente" : `${clientes.length} pessoas com perfil em Operações são só clientes`}{" "}
          no CRM ({clientes.map((c) => c.nome).join(", ")}). Ficam inativas e não recebem trabalho nem avisos.
        </p>
      )}

      {emOps.length > 0 ? (
        <Card className="divide-y divide-slate-100">
          {emOps.map((p) => (
            <EquipaPessoaCartao
              key={p.utilizador_id}
              pessoa={p}
              eu={p.utilizador_id === businessUserId}
              rhDisponivel={rhDisponivel}
              acao={
                p.e_cliente ? (
                  <Badge className="bg-red-50 text-red-700 ring-red-200">Cliente no CRM</Badge>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => setAEditar(p)}>
                    Editar
                  </Button>
                )
              }
            />
          ))}
        </Card>
      ) : (
        <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
          Ainda ninguém na equipa. Adicione as pessoas que fazem o trabalho no terreno e diga o que cada uma faz.
        </p>
      )}

      {!vejoCustos && (
        <p className="text-xs text-slate-400">
          Não vês os custos por hora porque não tens a permissão <code>operations.costs.view</code>.
          Não é um erro — é o que essa permissão faz.
        </p>
      )}

      {aAdicionar && (
        <AdicionarPessoa
          pessoas={fora}
          aoFechar={() => setAAdicionar(false)}
          aoEscolher={(p) => {
            setAAdicionar(false);
            setAEditar(p);
          }}
        />
      )}

      {aConvidar && <ConvidarPessoa aoFechar={() => setAConvidar(false)} />}

      {aEditar && (
        <FormPerfil
          pessoa={aEditar}
          podeVerCusto={vejoCustos}
          rhDisponivel={rhDisponivel}
          aoFechar={() => setAEditar(null)}
          aoGravar={() => { setAEditar(null); setRecarga((r) => r + 1); }}
        />
      )}
    </>
  );
}

/**
 * Quem faz o quê, num relance: cada ofício com as pessoas que o têm. Um
 * ofício sem ninguém fica a vermelho — é o que faz a distribuição automática
 * e o aviso ao marmorista não terem a quem chegar.
 */
function OficiosResumo({
  pessoas,
  onEditar,
}: {
  pessoas: PessoaEquipa[];
  onEditar: (p: PessoaEquipa) => void;
}) {
  const { activeOrgId } = useAuth();
  const [skills, setSkills] = useState<Skill[]>([]);
  useEffect(() => {
    if (!activeOrgId) return;
    let vivo = true;
    listarSkills(activeOrgId)
      .then((k) => { if (vivo) setSkills(k); })
      .catch(() => undefined);
    return () => { vivo = false; };
  }, [activeOrgId]);

  if (skills.length === 0) return null;
  const vazios = skills.filter((k) => !pessoas.some((p) => p.skills.includes(k.id)));

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-800">Quem faz o quê</h2>
        <p className="text-xs text-slate-500">
          {vazios.length === 0
            ? "Todos os ofícios têm alguém."
            : `${vazios.length} ${vazios.length === 1 ? "ofício sem ninguém" : "ofícios sem ninguém"} — as tarefas desses ofícios não têm a quem ir.`}
        </p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {skills.map((k) => {
          const quem = pessoas.filter((p) => p.skills.includes(k.id));
          return (
            <li
              key={k.id}
              data-testid={`oficio-${k.nome}`}
              className={cx(
                "rounded-lg px-3 py-2 ring-1 ring-inset",
                quem.length === 0 ? "bg-red-50 ring-red-200" : "bg-white ring-slate-200"
              )}
            >
              <p className={cx("text-xs font-semibold", quem.length === 0 ? "text-red-800" : "text-slate-700")}>
                {k.nome}
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {quem.length === 0 ? (
                  <span className="text-xs text-red-700">ninguém</span>
                ) : (
                  quem.map((p) => (
                    <button
                      key={p.utilizador_id}
                      type="button"
                      onClick={() => onEditar(p)}
                      title={`Editar ${p.nome}`}
                      className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-800 ring-1 ring-inset ring-brand-200 hover:bg-brand-100"
                    >
                      {p.nome.split(" ")[0]}
                    </button>
                  ))
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/** Escolher alguém que já está no Olyvia (nunca um cliente) para a equipa. */
function AdicionarPessoa({
  pessoas,
  aoFechar,
  aoEscolher,
}: {
  pessoas: PessoaEquipa[];
  aoFechar: () => void;
  aoEscolher: (p: PessoaEquipa) => void;
}) {
  const [pesquisa, setPesquisa] = useState("");
  const lista = useMemo(() => {
    const q = pesquisa.trim().toLowerCase();
    const xs = q
      ? pessoas.filter((p) =>
          [p.nome, p.email, p.papel_crm, p.cargo_crm].some((v) => (v ?? "").toLowerCase().includes(q))
        )
      : pessoas;
    return xs.slice(0, 50);
  }, [pessoas, pesquisa]);

  return (
    <Modal title="Adicionar pessoa à equipa" onClose={aoFechar}>
      <div className="space-y-3">
        <p className="text-sm text-slate-500">
          Pessoas que já estão no Olyvia com um papel de colaborador. Os clientes não aparecem.
        </p>
        <Input
          autoFocus
          placeholder="Pesquisar por nome, email ou papel…"
          value={pesquisa}
          onChange={(e) => setPesquisa(e.target.value)}
          className="w-full"
        />
        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {lista.map((p) => (
            <li key={p.utilizador_id}>
              <button
                type="button"
                onClick={() => aoEscolher(p)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-800">{p.nome}</span>
                  <span className="block truncate text-xs text-slate-400">{p.email}</span>
                </span>
                <span className="shrink-0 text-xs text-slate-500">{p.papel_crm ?? ""}</span>
              </button>
            </li>
          ))}
          {lista.length === 0 && <li className="px-1 text-sm text-slate-400">Ninguém encontrado.</li>}
        </ul>
      </div>
    </Modal>
  );
}

const OLYVIA_URL = ((import.meta.env.VITE_OLYVIA_URL as string) || "https://www.olyvia-ai.com").replace(/\/$/, "");

/**
 * Uma pessoa que ainda não existe no Olyvia cria-se no CRM, pelo caminho
 * oficial (Utilizadores): é lá que nasce a conta, o convite por email e o
 * papel. Não se criam contas a partir de Operações.
 */
function ConvidarPessoa({ aoFechar }: { aoFechar: () => void }) {
  return (
    <Modal
      title="Convidar pessoa nova"
      onClose={aoFechar}
      footer={
        <>
          <Button variant="secondary" onClick={aoFechar}>Fechar</Button>
          <a
            href={`${OLYVIA_URL}/users`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Abrir Utilizadores no CRM
          </a>
        </>
      }
    >
      <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-600">
        <li>
          No CRM, em <b>Utilizadores</b>, crie a pessoa (nome, email e telemóvel). Ela recebe o convite por email.
        </li>
        <li>
          Dê-lhe nesta empresa um papel de colaborador — por exemplo <b>Técnico de Operações</b> ou{" "}
          <b>Supervisor de Operações</b>. Nunca o papel de cliente.
        </li>
        <li>
          Volte aqui, carregue em <b>Adicionar pessoa</b>, escolha-a e marque os ofícios que faz.
        </li>
      </ol>
    </Modal>
  );
}

function FormPerfil({
  pessoa,
  podeVerCusto,
  rhDisponivel,
  aoFechar,
  aoGravar,
}: {
  pessoa: PessoaEquipa;
  podeVerCusto: boolean;
  rhDisponivel: boolean;
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const { activeOrgId } = useAuth();
  const [funcao, setFuncao] = useState(pessoa.funcao ?? "tecnico");
  const [custo, setCusto] = useState(pessoa.custo_hora?.toString() ?? "");
  const [ativo, setAtivo] = useState(pessoa.ativo ?? true);
  const [zona, setZona] = useState(pessoa.zona_base ?? "");
  const [skills, setSkills] = useState<Skill[]>([]);
  const [minhas, setMinhas] = useState<string[]>(pessoa.skills);
  const { aGravar, erro, gravar } = useGravar();

  // As especialidades da organização, para escolher. As desta pessoa já vêm
  // com ela (rpc_ops_equipa_crm).
  useEffect(() => {
    if (!activeOrgId) return;
    let vivo = true;
    listarSkills(activeOrgId)
      .then((k) => { if (vivo) setSkills(k); })
      .catch(() => undefined);
    return () => { vivo = false; };
  }, [activeOrgId]);

  const crm = camposCrm(pessoa);
  const rh = pessoa.rh_ligado ? camposRh(pessoa) : [];
  const ausencia = textoAusencia(pessoa);
  const distritos = pessoa.distritos?.length ? pessoa.distritos.join(", ") : null;

  // A zona e as especialidades só se gravam se mudaram: quem dá uma função a
  // alguém novo não tem de passar pela regra do planeamento.
  const mudouPlaneamento =
    (zona.trim() || null) !== (pessoa.zona_base ?? null) ||
    minhas.length !== pessoa.skills.length ||
    minhas.some((s) => !pessoa.skills.includes(s));

  return (
    <Modal
      title={pessoa.em_operacoes ? `Editar ${pessoa.nome}` : `Dar acesso a Operações — ${pessoa.nome}`}
      onClose={aoFechar}
      footer={
        <>
          <Button variant="secondary" onClick={aoFechar}>Cancelar</Button>
          <Button
            disabled={aGravar}
            onClick={() =>
              gravar(
                () =>
                  gravarPerfil({
                    orgId: activeOrgId!,
                    utilizadorId: pessoa.utilizador_id,
                    funcao,
                    custoHora: podeVerCusto && custo.trim() ? Number(custo.replace(",", ".")) : null,
                    ativo,
                  }).then(() =>
                    mudouPlaneamento
                      ? gravarPlaneamentoPessoa({
                          orgId: activeOrgId!,
                          utilizadorId: pessoa.utilizador_id,
                          zona: zona.trim() || null,
                          skills: minhas,
                        })
                      : undefined
                  ),
                aoGravar
              )
            }
          >
            {aGravar ? "A gravar…" : pessoa.em_operacoes ? "Gravar" : "Dar acesso"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {(crm.length > 0 || rh.length > 0 || ausencia) && (
          <div className="space-y-1.5 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
              Só de leitura — muda-se no {rhDisponivel ? "CRM ou no RH" : "CRM"}
            </p>
            {crm.map(([k, v]) => (
              <p key={`crm-${k}`} className="flex flex-wrap items-baseline gap-2">
                <EquipaOrigem de="crm" />
                <span className="text-slate-400">{k}:</span> {v}
              </p>
            ))}
            {rh.map(([k, v]) => (
              <p key={`rh-${k}`} className="flex flex-wrap items-baseline gap-2">
                <EquipaOrigem de="rh" />
                <span className="text-slate-400">{k}:</span> {v}
              </p>
            ))}
            {ausencia && (
              <p className="flex flex-wrap items-baseline gap-2">
                <EquipaOrigem de={pessoa.ausencia_origem ?? "crm"} />
                <span className="font-medium text-amber-700">{ausencia}</span>
              </p>
            )}
          </div>
        )}

        <Field
          label="Função em Operações"
          hint="Um técnico executa. Um supervisor acompanha e valida o trabalho feito, sem mexer em definições nem custos. Um gestor distribui, marca datas e vê custos."
        >
          <Select value={funcao} onChange={(e) => setFuncao(e.target.value)} className="w-full">
            <option value="tecnico">Técnico</option>
            <option value="operador">Operador</option>
            <option value="supervisor">Supervisor</option>
            <option value="gestor">Gestor</option>
            <option value="admin">Administrador</option>
          </Select>
        </Field>

        {podeVerCusto && (
          <Field
            label="Custo por hora"
            hint="É este número que faz o custo real de mão de obra existir. Sem ele, o gasto de uma ordem fica sempre incompleto."
          >
            <Input
              value={custo}
              onChange={(e) => setCusto(e.target.value)}
              placeholder="18.50"
              className="w-40 font-mono"
            />
          </Field>
        )}

        <Field
          label="Zona-base (override de Operações)"
          hint={
            distritos
              ? `A agenda do CRM já diz: ${distritos}. Escreve aqui só se, para as obras, a zona for outra.`
              : "A agenda do CRM não tem distritos para esta pessoa. Ex.: Lisboa, Margem Sul — quem é da zona da obra é escolhido primeiro."
          }
        >
          <Input
            value={zona}
            onChange={(e) => setZona(e.target.value)}
            placeholder={distritos ?? "Lisboa"}
            className="w-56"
          />
        </Field>

        {skills.length > 0 && (
          <Field label="Especialidades" hint="As tarefas que pedem uma especialidade vão primeiro para quem a tem.">
            <div className="flex flex-wrap gap-2">
              {skills.map((k) => {
                const tem = minhas.includes(k.id);
                return (
                  <button
                    key={k.id}
                    type="button"
                    aria-pressed={tem}
                    onClick={() => setMinhas((m) => (tem ? m.filter((x) => x !== k.id) : [...m, k.id]))}
                    className={
                      tem
                        ? "rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-800 ring-1 ring-inset ring-brand-200"
                        : "rounded-full bg-white px-3 py-1 text-xs text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
                    }
                  >
                    {k.nome}
                  </button>
                );
              })}
            </div>
          </Field>
        )}

        <Toggle
          checked={ativo}
          onChange={setAtivo}
          label="Ativo em Operações"
          hint="Desligado, deixa de aparecer para atribuição — sem perder o histórico."
        />

        {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      </div>
    </Modal>
  );
}

/* ═════════════════════════ 4. O que a empresa usa ═════════════════════════ */

type Escolha3 = "auto" | "sim" | "nao";
const paraEscolha = (v: boolean | null): Escolha3 => (v === null ? "auto" : v ? "sim" : "nao");
const deEscolha = (e: Escolha3): boolean | null => (e === "auto" ? null : e === "sim");

/**
 * Manutenção (ordens, planos, locais) e Obras (obras, modelos, orçamentos,
 * validar). Uma empresa que só faz obras deixa de ver a Manutenção no menu —
 * e vice-versa. As páginas continuam a abrir pelo endereço.
 */
function PainelEmpresa() {
  const { activeOrgId, funcao } = useAuth();
  const [m, setM] = useState<Modulos | null>(null);
  const [man, setMan] = useState<Escolha3>("auto");
  const [obr, setObr] = useState<Escolha3>("auto");
  const [aGravar, setAGravar] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  const pode = funcao === "admin" || funcao === "gestor";

  useEffect(() => {
    if (!activeOrgId) return;
    let vivo = true;
    lerModulos(activeOrgId).then((x) => {
      if (!vivo) return;
      setM(x);
      setMan(paraEscolha(x.escolhido.manutencao));
      setObr(paraEscolha(x.escolhido.obras));
    });
    return () => { vivo = false; };
  }, [activeOrgId]);

  if (!m) return <Carregando />;

  const linha = (
    titulo: string,
    descricao: string,
    valor: Escolha3,
    mudar: (v: Escolha3) => void,
    efetivo: boolean,
    existe: boolean
  ) => (
    <div className="flex flex-wrap items-start justify-between gap-3 p-4">
      <div className="min-w-0 max-w-xl">
        <p className="text-sm font-medium text-slate-800">{titulo}</p>
        <p className="mt-0.5 text-xs text-slate-500">{descricao}</p>
        <p className="mt-1 text-xs text-slate-400">
          Agora: <b className={efetivo ? "text-brand-800" : "text-slate-500"}>{efetivo ? "no menu" : "escondido"}</b>
          {valor === "auto" && ` — automático (${existe ? "a empresa já tem dados desta área" : "ainda não há dados desta área"})`}
        </p>
      </div>
      <Select
        value={valor}
        disabled={!pode}
        onChange={(e) => mudar(e.target.value as Escolha3)}
        aria-label={titulo}
        className="w-48"
      >
        <option value="auto">Automático</option>
        <option value="sim">Sempre no menu</option>
        <option value="nao">Esconder</option>
      </Select>
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        O menu mostra só as áreas que a empresa usa. Em automático, decide-se pelo que já existe.
      </p>
      <Card className="divide-y divide-slate-100">
        {linha(
          "Manutenção",
          "Ordens de trabalho, planos preventivos e locais/equipamentos — a manutenção de edifícios.",
          man,
          setMan,
          m.manutencao,
          m.existe.manutencao
        )}
        {linha(
          "Obras",
          "Obras, modelos de serviço, orçamentos aceites e validação de tarefas — as remodelações.",
          obr,
          setObr,
          m.obras,
          m.existe.obras
        )}
      </Card>
      {!pode && <p className="text-xs text-slate-400">Só um administrador ou gestor muda isto.</p>}
      {msg && (
        <p className={cx("rounded-lg px-3 py-2 text-sm", msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700")}>
          {msg.texto}
        </p>
      )}
      {pode && (
        <Button
          disabled={aGravar || (man === "nao" && obr === "nao")}
          onClick={async () => {
            if (!activeOrgId) return;
            setAGravar(true);
            setMsg(null);
            try {
              const x = await gravarModulos(activeOrgId, deEscolha(man), deEscolha(obr));
              setM(x);
              setMsg({ ok: true, texto: "Gravado. O menu já mostra só o que a empresa usa." });
            } catch (e) {
              setMsg({ ok: false, texto: e instanceof Error && e.message ? e.message : "Não foi possível gravar." });
            } finally {
              setAGravar(false);
            }
          }}
        >
          {aGravar ? "A gravar…" : "Gravar"}
        </Button>
      )}
      {man === "nao" && obr === "nao" && (
        <p className="text-xs text-red-700">Tem de ficar pelo menos uma área no menu.</p>
      )}
    </div>
  );
}

/* ════════════════════════════ Peças comuns ══════════════════════════════ */

interface Estado {
  carregar: boolean;
  erro: string | null;
}

function mensagem(e: unknown, o: string): string {
  return e instanceof ErroDeDados ? e.message : `Algo correu mal a carregar ${o}.`;
}

function Carregando() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-20 w-full rounded-xl" />
      <Skeleton className="h-20 w-full rounded-xl" />
    </div>
  );
}

/**
 * Gravar, com o erro do servidor à vista.
 *
 * As RPCs escrevem mensagens para serem lidas por pessoas ("Uma gama sem
 * limites nunca dá veredicto nenhum"). Trocá-las por uma genérica seria deitar
 * fora a parte útil.
 */
function useGravar() {
  const [aGravar, setAGravar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const gravar = async (fn: () => Promise<unknown>, aoAcabar: () => void) => {
    setAGravar(true);
    setErro(null);
    try {
      await fn();
      aoAcabar();
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

  return { aGravar, erro, gravar };
}

function Escolha({
  ligado,
  onClick,
  children,
}: {
  ligado: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 transition-all active:scale-[0.98]",
        ligado
          ? "bg-brand text-white ring-brand"
          : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300"
      )}
    >
      {children}
    </button>
  );
}
