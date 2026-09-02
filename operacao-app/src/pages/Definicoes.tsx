import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ErroDeDados, ErroDeEscrita } from "../lib/dados";
import {
  custosHora,
  gravarChecklist,
  gravarMedicao,
  gravarPerfil,
  listarCategorias,
  listarMedicoes,
  listarPessoas,
  listarTodasChecklists,
  medicoesDasTarefas,
  opcoesDasMedicoes,
  tarefasDaChecklist,
  type CategoriaAtivo,
  type Checklist,
  type MedicaoDef,
  type OpcaoDef,
  type Pessoa,
  type TarefaParaGravar,
} from "../lib/config";
import {
  Badge,
  Button,
  Card,
  Combobox,
  ErrorState,
  Field,
  Input,
  Modal,
  Select,
  Skeleton,
  Escolha,
  Toggle,
  cx,
  useGravar,
} from "../components/ui";
import PainelPacks from "../components/PainelPacks";
import PainelAutomatico from "../components/PainelAutomatico";
import PainelTiposECustos from "../components/PainelTiposECustos";
import PainelListas from "../components/PainelListas";
import PainelVocabulario from "../components/PainelVocabulario";
import FormCategoria from "../components/FormCategoria";
import { Check, Euro, Layers, List, Plus, Robo, User, X } from "../components/icons";
import { euros } from "../lib/formatar";
import { ROTULO_FUNCAO, type Funcao } from "../domain/tipos";
import { useRotulos } from "../auth/Rotulos";

/**
 * Onde se monta a operação.
 *
 * Até aqui, tudo o que o módulo faz dependia de dados que só se metiam por SQL
 * à mão. Construiu-se o carro todo e não havia forma de o abastecer.
 *
 * ⚠ **Os sítios não estão aqui, e é de propósito.** Um local não é uma
 * definição: é trabalho do dia. Quem chega a uma morada nova está a abrir uma
 * ordem, ou está na árvore dos locais — não vem a Definições. Criam-se em
 * `/locais` e dentro da própria ordem. O que ficou aqui foram as **categorias
 * de equipamento**, que são mesmo um catálogo, e vivem ao lado das medições e
 * das checklists que se lhes penduram.
 *
 * Cinco separadores, pela ordem em que se usam pela primeira vez:
 *
 *  1. Procedimentos — o que um equipamento é (categorias), o que se lhe faz
 *     (checklists) e o que se lê ao fazê-lo (medições);
 *  2. Equipa — quem o faz, e quanto custa a hora;
 *  3. Tipos e custos — como se classifica o trabalho (tipos, centros de
 *     custo, motivos de pausa, áreas), e a que conta ele vai;
 *  4. Vocabulário — o nome que esta empresa dá às listas que vêm no código,
 *     e as especialidades da equipa;
 *  5. Automático — o que a aplicação faz sem ninguém carregar em nada.
 *
 * O separador fica no endereço (`?ver=equipa`), para se poder mandar um link
 * a alguém a dizer "vai aqui".
 */

type Separador =
  | "procedimentos"
  | "equipa"
  | "tipos"
  | "vocabulario"
  | "automatico";

export default function Definicoes() {
  const [params, setParams] = useSearchParams();
  const ver = (params.get("ver") as Separador) || "procedimentos";

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
          Onde se monta a operação: os procedimentos, quem os faz, e como se classifica o trabalho.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Aba ligado={ver === "procedimentos"} onClick={() => trocar("procedimentos")} Icone={Layers}>
          Procedimentos
        </Aba>
        <Aba ligado={ver === "equipa"} onClick={() => trocar("equipa")} Icone={User}>
          Equipa
        </Aba>
        <Aba ligado={ver === "tipos"} onClick={() => trocar("tipos")} Icone={Euro}>
          Tipos e custos
        </Aba>
        <Aba ligado={ver === "vocabulario"} onClick={() => trocar("vocabulario")} Icone={List}>
          Vocabulário
        </Aba>
        <Aba ligado={ver === "automatico"} onClick={() => trocar("automatico")} Icone={Robo}>
          Automático
        </Aba>
      </div>

      {ver === "procedimentos" && <PainelProcedimentos />}
      {ver === "equipa" && <PainelEquipa />}
      {ver === "tipos" && (
        <div className="space-y-4">
          <PainelTiposECustos />
          <PainelListas />
        </div>
      )}
      {ver === "vocabulario" && <PainelVocabulario />}
      {ver === "automatico" && <PainelAutomatico />}
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
  const [formCategoria, setFormCategoria] = useState(false);

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

      {/*
        Para que serve isto tudo, em quatro linhas.

        Quem abriu este separador pela primeira vez perguntou “não estou a ver
        o benefício, é para associar a ordens?”. Era uma pergunta justa: o ecrã
        mostrava três listas e nunca dizia para onde é que elas iam.
      */}
      <Card className="border-brand-100 bg-brand-50/40 p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-brand-900">
          O guião do trabalho
        </h2>
        <p className="mt-1 text-sm text-brand-900/80">
          Isto é o que o técnico vê no telemóvel quando abre uma ordem — e o que
          sai escrito no relatório do cliente. Sem isto, uma ordem é uma caixa de
          texto e a prova do trabalho é a palavra de quem lá esteve.
        </p>
        <ul className="mt-3 space-y-1.5 text-sm text-brand-900/80">
          <li>
            <strong>Categoria</strong> — o que o equipamento <em>é</em>. Extintor,
            elevador, quadro.
          </li>
          <li>
            <strong>Medição</strong> — o que se lê nele. 12,4 bar. Pendura-se numa
            categoria, e só aparece nos equipamentos dessa categoria.
          </li>
          <li>
            <strong>Checklist</strong> — a lista de tarefas. Escolhe-se ao abrir a
            ordem, e as tarefas <strong>vêm com ela</strong>, congeladas na versão
            de hoje. Mudar a checklist amanhã não mexe nas ordens de ontem.
          </li>
          <li>
            <strong>Plano</strong> (em <code>/planos</code>) — a mesma checklist, mas
            a nascer sozinha todos os meses.
          </li>
        </ul>
      </Card>

      {/* As categorias vieram para aqui quando os locais saíram das Definições:
          uma categoria não é um sítio, é a etiqueta a que as medições e as
          checklists se penduram. Estava no separador errado. */}
      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">
              Categorias de equipamento
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              O que um equipamento é. Começa por aqui: as medições penduram-se
              nelas.
            </p>
          </div>
          <Button size="sm" onClick={() => setFormCategoria(true)}>
            <Plus width={14} height={14} /> Categorias
          </Button>
        </div>

        {categorias.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">
            Nenhuma ainda. Há um catálogo por ofício no botão acima — escolhem-se
            várias de uma vez.
          </p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {categorias.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs ring-1 ring-slate-200"
              >
                <span className="font-mono text-slate-400">{c.codigo}</span>
                <span className="text-slate-700">{c.nome}</span>
              </span>
            ))}
          </div>
        )}
      </Card>

      {/* Medições depois das categorias: uma medição pendura-se numa delas. */}
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

      {formCategoria && (
        <FormCategoria
          jaExistem={categorias}
          aoFechar={() => setFormCategoria(false)}
          aoGravar={() => { setFormCategoria(false); setRecarga((r) => r + 1); }}
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
  const rotulos = useRotulos();
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
                          {rotulos.opcoes("tipo_tarefa").map((x) => (
                            <option key={x.valor} value={x.valor}>
                              {x.nome}
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

