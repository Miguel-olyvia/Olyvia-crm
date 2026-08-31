import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ErroDeDados, ErroDeEscrita, listarClientes, listarLocais, type Cliente, type LocalRow } from "../lib/dados";
import {
  custosHora,
  gravarAtivo,
  gravarCategoria,
  gravarChecklist,
  gravarLocal,
  gravarMedicao,
  gravarPerfil,
  listarCategorias,
  listarMedicoes,
  listarPessoas,
  listarTodasChecklists,
  medicoesDasTarefas,
  opcoesDasMedicoes,
  proximoCodigo,
  tarefasDaChecklist,
  type CategoriaAtivo,
  type Checklist,
  type MedicaoDef,
  type OpcaoDef,
  type Pessoa,
  type TarefaParaGravar,
} from "../lib/config";
import { ativosDoLocal, type AtivoRow } from "../lib/dados";
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
import PainelPacks from "../components/PainelPacks";
import { Building, Check, Layers, Plus, User, X } from "../components/icons";
import { euros } from "../lib/formatar";
import { ROTULO_FUNCAO, ROTULO_TIPO_TAREFA, TIPOS_TAREFA, type Funcao, type TipoTarefa } from "../domain/tipos";

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

type Separador = "locais" | "procedimentos" | "equipa";

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
      </div>

      {ver === "locais" && <PainelLocais />}
      {ver === "procedimentos" && <PainelProcedimentos />}
      {ver === "equipa" && <PainelEquipa />}
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
      {/* O pack antes de tudo: se a organização está vazia, é o caminho mais
          curto entre abrir isto e ter uma checklist a sério. */}
      <PainelPacks
        orgId={activeOrgId}
        vazio={checklists.length === 0 && medicoes.length === 0}
        aoInstalar={() => setRecarga((r) => r + 1)}
      />

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
                        <button
                          type="button"
                          onClick={() => setTarefas((xs) => xs.filter((_, j) => j !== i))}
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
                  { nome: "", tipo: "inspecao", obrigatoria: true, privada: false, medicoes: [] },
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

function PainelEquipa() {
  const { activeOrgId, businessUserId } = useAuth();
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [custos, setCustos] = useState<Map<string, number | null>>(new Map());
  const [estado, setEstado] = useState<Estado>({ carregar: true, erro: null });
  const [recarga, setRecarga] = useState(0);
  const [aEditar, setAEditar] = useState<Pessoa | null>(null);

  useEffect(() => {
    if (!activeOrgId) return;
    let vivo = true;
    setEstado({ carregar: true, erro: null });
    (async () => {
      try {
        const [ps, cs] = await Promise.all([listarPessoas(activeOrgId), custosHora(activeOrgId)]);
        if (!vivo) return;
        setPessoas(ps);
        setCustos(cs);
        setEstado({ carregar: false, erro: null });
      } catch (e) {
        if (vivo) setEstado({ carregar: false, erro: mensagem(e, "a equipa") });
      }
    })();
    return () => { vivo = false; };
  }, [activeOrgId, recarga]);

  if (estado.carregar) return <Carregando />;
  if (estado.erro) return <ErrorState message={estado.erro} onRetry={() => setRecarga((r) => r + 1)} />;

  const dentro = pessoas.filter((p) => p.em_operacoes && p.ativo);
  const vejoCustos = custos.size > 0;

  return (
    <>
      <p className="text-sm text-slate-500">
        {dentro.length === 0
          ? "Ainda ninguém em Operações."
          : `${dentro.length} ${dentro.length === 1 ? "pessoa" : "pessoas"} em Operações, de ${pessoas.length} com acesso ao Olyvia.`}
      </p>

      <Card className="divide-y divide-slate-100">
        {pessoas.map((p) => (
          <div key={p.utilizador_id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800">
                {p.nome}
                {p.utilizador_id === businessUserId && (
                  <span className="ml-2 text-xs font-normal text-slate-400">(tu)</span>
                )}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">{p.email}</p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {p.em_operacoes ? (
                <>
                  <Badge
                    className={
                      p.ativo
                        ? "bg-brand-50 text-brand-800 ring-brand-200"
                        : "bg-slate-100 text-slate-500 ring-slate-200"
                    }
                  >
                    {ROTULO_FUNCAO[p.funcao as Funcao] ?? p.funcao}
                    {!p.ativo && " · inativo"}
                  </Badge>
                  {vejoCustos && (
                    <span className="font-mono text-xs tabular text-slate-500">
                      {custos.get(p.utilizador_id) != null
                        ? `${euros(custos.get(p.utilizador_id))}/h`
                        : "sem custo/h"}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-xs text-slate-400">fora de Operações</span>
              )}

              <Button size="sm" variant="secondary" onClick={() => setAEditar(p)}>
                {p.em_operacoes ? "Editar" : "Adicionar"}
              </Button>
            </div>
          </div>
        ))}
      </Card>

      {!vejoCustos && (
        <p className="text-xs text-slate-400">
          Não vês os custos por hora porque não tens a permissão <code>operations.costs.view</code>.
          Não é um erro — é o que essa permissão faz.
        </p>
      )}

      {aEditar && (
        <FormPerfil
          pessoa={aEditar}
          custoAtual={custos.get(aEditar.utilizador_id) ?? null}
          podeVerCusto={vejoCustos}
          aoFechar={() => setAEditar(null)}
          aoGravar={() => { setAEditar(null); setRecarga((r) => r + 1); }}
        />
      )}
    </>
  );
}

function FormPerfil({
  pessoa,
  custoAtual,
  podeVerCusto,
  aoFechar,
  aoGravar,
}: {
  pessoa: Pessoa;
  custoAtual: number | null;
  podeVerCusto: boolean;
  aoFechar: () => void;
  aoGravar: () => void;
}) {
  const { activeOrgId } = useAuth();
  const [funcao, setFuncao] = useState(pessoa.funcao ?? "tecnico");
  const [custo, setCusto] = useState(custoAtual?.toString() ?? "");
  const [ativo, setAtivo] = useState(pessoa.ativo ?? true);
  const { aGravar, erro, gravar } = useGravar();

  return (
    <Modal
      title={pessoa.em_operacoes ? `Editar ${pessoa.nome}` : `Adicionar ${pessoa.nome}`}
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
        <Field
          label="Função"
          hint="Um técnico executa. Um gestor distribui, marca datas e vê custos."
        >
          <Select value={funcao} onChange={(e) => setFuncao(e.target.value)} className="w-full">
            <option value="tecnico">Técnico</option>
            <option value="operador">Operador</option>
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
