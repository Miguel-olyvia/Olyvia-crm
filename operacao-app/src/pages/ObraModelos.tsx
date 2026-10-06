import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { ErroDeDados, ErroDeEscrita } from "../lib/dados";
import {
  gravarModelo,
  listarModelos,
  semearModeloExemplo,
  tornarTipoPorDefeito,
  type FaseParaGravar,
  type ModeloObra,
} from "../lib/obras";
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Select, Skeleton, Textarea, Toggle, cx } from "../components/ui";
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, Copy, Grip, Plus, X } from "../components/icons";
import { ObraModelo } from "../components/ObraIcones";
import { FASES_POR_DEFEITO, MINUTOS_POR_DIA, TIPOS_SERVICO, formatarMinutos, podePlanear, rotuloTipoServico } from "../domain/obras";
import ModelosServicos, { corDaFase } from "../components/ModelosServicos";
import CamposVisiveis from "../components/CamposVisiveis";
import { gravarPreferencia, lerPreferencia, moverNaLista, useArrastar } from "../components/arrastar";

/**
 * Modelos — de onde nasce o plano de uma obra:
 *
 *  · Serviços: como se executa cada serviço vendido (passos, tempo por
 *    unidade, pessoas, especialidade, dependências). A obra criada a partir
 *    de um contrato junta os passos de cada linha vendida.
 *  · Tipos de obra: as fases e as tarefas que existem em qualquer obra
 *    (arranque, proteção, limpeza, entrega). O "por defeito" vem escolhido.
 *
 * Mudar um modelo não mexe nas obras já criadas (copiaram-no). Ao gravar, as
 * tarefas mantêm o id — é o que deixa as métricas comparar o mesmo default
 * ao longo do tempo.
 *
 * O editor lê-se em árvore (Fase → Tarefa): as fases e as tarefas arrastam-se
 * pela pega, as tarefas também de uma fase para outra.
 */

interface TarefaRascunho {
  id?: string;
  chave: string;
  nome: string;
  minutos: string;
  procedimento: string;
  materiais: string;
  ferramentas: string;
}

interface FaseRascunho {
  chave: string;
  nome: string;
  tarefas: TarefaRascunho[];
}

interface Rascunho {
  id: string | null;
  nome: string;
  descricao: string;
  tipoServico: string;
  ativo: boolean;
  fases: FaseRascunho[];
}

let seq = 0;
const chave = () => `n${++seq}`;

const tarefaNova = (): TarefaRascunho => ({ chave: chave(), nome: "", minutos: "60", procedimento: "", materiais: "", ferramentas: "" });

function paraRascunho(m: ModeloObra | null, copia = false): Rascunho {
  if (!m) {
    return {
      id: null,
      nome: "",
      descricao: "",
      tipoServico: "",
      ativo: true,
      fases: FASES_POR_DEFEITO.map((nome) => ({ chave: chave(), nome, tarefas: [] })),
    };
  }
  return {
    id: copia ? null : m.id,
    nome: copia ? `${m.nome} (cópia)` : m.nome,
    descricao: m.descricao ?? "",
    tipoServico: m.tipo_servico ?? "",
    ativo: m.ativo,
    fases: [...m.fases]
      .sort((a, b) => a.ordem - b.ordem)
      .map((f) => ({
        chave: chave(),
        nome: f.nome,
        tarefas: f.tarefas.map((t) => ({
          id: copia ? undefined : t.id,
          chave: chave(),
          nome: t.nome,
          minutos: String(t.minutos_previstos),
          procedimento: t.procedimento ?? "",
          materiais: t.materiais ?? "",
          ferramentas: t.ferramentas ?? "",
        })),
      })),
  };
}

const dias = (min: number) => Math.ceil(min / MINUTOS_POR_DIA);

type CampoTipo = "procedimento" | "materiais" | "ferramentas" | "horas";
const CAMPOS_TIPO: readonly { chave: CampoTipo; rotulo: string; dica?: string }[] = [
  { chave: "horas", rotulo: "Tempo em horas/dias", dica: "Mostra os minutos também em h e dias úteis" },
  { chave: "procedimento", rotulo: "Procedimento" },
  { chave: "materiais", rotulo: "Materiais" },
  { chave: "ferramentas", rotulo: "Ferramentas" },
];
const CAMPOS_TIPO_DEFEITO: Record<CampoTipo, boolean> = { horas: true, procedimento: false, materiais: false, ferramentas: false };

export default function ObraModelos() {
  const { activeOrgId, funcao } = useAuth();
  const [modelos, setModelos] = useState<ModeloObra[]>([]);
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [aGravar, setAGravar] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [aba, setAba] = useState<"servicos" | "tipos">("servicos");
  const [filtroTipo, setFiltroTipo] = useState("");

  const gere = podePlanear(funcao);

  const porDefeito = async (id: string) => {
    setErroAcao(null);
    try {
      await tornarTipoPorDefeito(id);
      setRecarga((r) => r + 1);
    } catch (e) {
      setErroAcao(e instanceof ErroDeEscrita ? e.message : "Não foi possível mudar o tipo por defeito.");
    }
  };

  const carregar = useCallback(async () => {
    if (!activeOrgId) return;
    setErro(null);
    try {
      setModelos(await listarModelos(activeOrgId));
    } catch (e) {
      setErro(e instanceof ErroDeDados ? e.message : "Algo correu mal a carregar os modelos.");
    } finally {
      setACarregar(false);
    }
  }, [activeOrgId, recarga]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const semear = async () => {
    if (!activeOrgId) return;
    setErroAcao(null);
    try {
      await semearModeloExemplo(activeOrgId);
      setRecarga((r) => r + 1);
    } catch (e) {
      setErroAcao(e instanceof ErroDeEscrita ? e.message : "Não foi possível criar o exemplo.");
    }
  };

  const gravar = async () => {
    if (!activeOrgId || !rascunho) return;
    setAGravar(true);
    setErroAcao(null);
    try {
      const fases: FaseParaGravar[] = rascunho.fases.map((f, i) => ({
        ordem: i + 1,
        nome: f.nome.trim(),
        tarefas: f.tarefas.map((t) => ({
          id: t.id,
          nome: t.nome.trim(),
          minutos_previstos: Math.round(Number(t.minutos)),
          procedimento: t.procedimento,
          materiais: t.materiais,
          ferramentas: t.ferramentas,
        })),
      }));
      await gravarModelo({
        orgId: activeOrgId,
        modeloId: rascunho.id,
        nome: rascunho.nome,
        descricao: rascunho.descricao || null,
        tipoServico: rascunho.tipoServico || null,
        fases,
        ativo: rascunho.ativo,
      });
      setRascunho(null);
      setRecarga((r) => r + 1);
    } catch (e) {
      setErroAcao(e instanceof ErroDeEscrita ? e.message : "Não foi possível gravar.");
    } finally {
      setAGravar(false);
    }
  };

  const tiposUsados = useMemo(() => [...new Set(modelos.map((m) => m.tipo_servico).filter((x): x is string => !!x))], [modelos]);

  if (aCarregar) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (erro) return <ErrorState message={erro} onRetry={() => setRecarga((r) => r + 1)} />;

  const temExemplo = modelos.some((m) => m.nome === "Remodelação casa de banho");
  const listados = filtroTipo ? modelos.filter((m) => (m.tipo_servico ?? "") === filtroTipo) : modelos;

  return (
    <div className="space-y-4">
      <Link to="/obras" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ChevronLeft width={14} height={14} /> Obras
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Modelos</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            De onde nasce o plano de uma obra: os passos de cada serviço vendido e as tarefas de cada tipo de obra.
          </p>
        </div>
        {aba === "tipos" && gere && !rascunho && (
          <div className="flex gap-2">
            {!temExemplo && (
              <Button variant="secondary" size="sm" onClick={() => void semear()}>
                Criar exemplo "casa de banho"
              </Button>
            )}
            <Button size="sm" onClick={() => setRascunho(paraRascunho(null))}>
              <Plus width={14} height={14} /> Novo modelo
            </Button>
          </div>
        )}
      </div>

      <div className="grid w-full max-w-sm grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-sm">
        {(
          [
            ["servicos", "Serviços"],
            ["tipos", "Tipos de obra"],
          ] as const
        ).map(([a, r]) => (
          <button
            key={a}
            type="button"
            onClick={() => setAba(a)}
            className={cx("rounded-md px-3 py-1.5 transition-all", aba === a ? "bg-white font-medium text-slate-800 shadow-sm" : "text-slate-500")}
          >
            {r}
          </button>
        ))}
      </div>

      {erroAcao && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erroAcao}</p>}

      {aba === "servicos" && activeOrgId ? (
        <ModelosServicos orgId={activeOrgId} gere={gere} />
      ) : rascunho ? (
        <EditorTipo
          rascunho={rascunho}
          setRascunho={setRascunho}
          tiposUsados={tiposUsados}
          aGravar={aGravar}
          aoGravar={() => void gravar()}
          aoCancelar={() => setRascunho(null)}
        />
      ) : modelos.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ObraModelo width={22} height={22} />}
            title="Sem modelos"
            description="Um modelo traz as fases e as tarefas com o tempo previsto. Começa pelo exemplo da casa de banho."
            action={
              gere ? (
                <Button size="sm" onClick={() => void semear()}>
                  Criar exemplo "casa de banho"
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {tiposUsados.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              {["", ...tiposUsados].map((t) => (
                <button
                  key={t || "_"}
                  type="button"
                  onClick={() => setFiltroTipo(t)}
                  className={cx(
                    "rounded-full px-3 py-1 text-xs ring-1 ring-inset",
                    filtroTipo === t ? "bg-slate-800 text-white ring-slate-800" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                  )}
                >
                  {t ? rotuloTipoServico(t) : "Todos"}{" "}
                  <span className="opacity-60">{t ? modelos.filter((m) => m.tipo_servico === t).length : modelos.length}</span>
                </button>
              ))}
            </div>
          )}
          {listados.map((m) => {
            const porFase = [...m.fases].sort((a, b) => a.ordem - b.ordem).map((f) => f.tarefas.reduce((x, t) => x + t.minutos_previstos, 0));
            const total = porFase.reduce((s, x) => s + x, 0);
            const nTarefas = m.fases.reduce((s, f) => s + f.tarefas.length, 0);
            const aberto = aberta === m.id;
            return (
              <Card key={m.id} className={cx("p-4 transition-shadow", aberto && "ring-2 ring-brand/15")}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setAberta(aberto ? null : m.id)} aria-expanded={aberto}>
                    <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      {aberto ? <ChevronDown width={14} height={14} className="text-slate-400" /> : <ChevronRight width={14} height={14} className="text-slate-400" />}
                      {m.nome}
                      {m.tipo_servico && <Badge className="bg-slate-50 text-slate-600 ring-slate-200">{rotuloTipoServico(m.tipo_servico)}</Badge>}
                      {m.por_defeito && <Badge className="bg-brand-50 text-brand-800 ring-brand-200">por defeito</Badge>}
                      {!m.ativo && <Badge>inativo</Badge>}
                    </p>
                    <p className="pl-6 text-xs text-slate-500">
                      {m.fases.length} fases · {nTarefas} tarefas · {formatarMinutos(total)} ({dias(total)} dias úteis a 8 h)
                    </p>
                    <span className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-slate-100 pl-0 sm:ml-6 sm:w-64">
                      {porFase.map((x, i) =>
                        x > 0 ? <span key={i} className={cx("h-full", corDaFase(i + 1).ponto)} style={{ width: `${(x / Math.max(1, total)) * 100}%` }} /> : null
                      )}
                    </span>
                    {m.descricao && <p className="mt-1 pl-6 text-xs text-slate-400">{m.descricao}</p>}
                  </button>
                  {gere && (
                    <div className="flex flex-wrap gap-2">
                      {!m.por_defeito && (
                        <Button size="sm" variant="secondary" onClick={() => void porDefeito(m.id)}>
                          Tornar por defeito
                        </Button>
                      )}
                      <Button size="sm" variant="secondary" onClick={() => setRascunho(paraRascunho(m, true))} title="Criar um modelo novo a partir deste">
                        <Copy width={13} height={13} /> Duplicar
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => setRascunho(paraRascunho(m))}>
                        Editar
                      </Button>
                    </div>
                  )}
                </div>
                {aberto && (
                  <div className="animate-in-fade mt-3 space-y-2 border-t border-slate-100 pt-3">
                    {[...m.fases]
                      .sort((a, b) => a.ordem - b.ordem)
                      .map((f, i) => {
                        const cor = corDaFase(i + 1);
                        const minFase = porFase[i];
                        return (
                          <div key={f.id} className="relative pl-4">
                            <span className={cx("absolute bottom-1 left-0 top-1 w-1 rounded-full", cor.ponto)} />
                            <p className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-700">
                              <span className={cor.texto}>
                                {f.ordem}. {f.nome}
                                <span className="ml-1.5 font-normal text-slate-400">
                                  {f.tarefas.length} tarefa{f.tarefas.length === 1 ? "" : "s"}
                                </span>
                              </span>
                              <span className="font-mono tabular text-slate-500">
                                {formatarMinutos(minFase)}
                                <span className="ml-1 text-slate-400">{Math.round((minFase / Math.max(1, total)) * 100)}%</span>
                              </span>
                            </p>
                            <ul className="mt-0.5 space-y-0.5 border-l border-dashed border-slate-200 pl-3">
                              {f.tarefas.map((t, j) => (
                                <li key={t.id} className="flex justify-between gap-2 text-xs text-slate-600">
                                  <span className="truncate">
                                    <span className="mr-1 font-mono text-slate-400">
                                      {f.ordem}.{j + 1}
                                    </span>
                                    {t.nome}
                                    {(t.procedimento || t.materiais || t.ferramentas) && (
                                      <span className="ml-1 text-slate-400" title={[t.procedimento, t.materiais, t.ferramentas].filter(Boolean).join("\n")}>
                                        ·{[t.procedimento && " procedimento", t.materiais && " materiais", t.ferramentas && " ferramentas"].filter(Boolean).join(",")}
                                      </span>
                                    )}
                                  </span>
                                  <span className="shrink-0 font-mono tabular text-slate-400">{t.minutos_previstos} min</span>
                                </li>
                              ))}
                              {f.tarefas.length === 0 && <li className="text-xs text-slate-300">sem tarefas</li>}
                            </ul>
                          </div>
                        );
                      })}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────── Editor ─────────────────────────────── */

function EditorTipo({
  rascunho,
  setRascunho,
  tiposUsados,
  aGravar,
  aoGravar,
  aoCancelar,
}: {
  rascunho: Rascunho;
  setRascunho: (fn: (r: Rascunho | null) => Rascunho | null) => void;
  tiposUsados: string[];
  aGravar: boolean;
  aoGravar: () => void;
  aoCancelar: () => void;
}) {
  const [campos, setCampos] = useState<Record<CampoTipo, boolean>>(() => lerPreferencia("ops.modelos.tipos.campos", CAMPOS_TIPO_DEFEITO));
  const [fechadas, setFechadas] = useState<Set<string>>(new Set());
  const [detalhe, setDetalhe] = useState<string | null>(null);

  const mudar = (fn: (r: Rascunho) => Rascunho) => setRascunho((r) => (r ? fn(r) : r));
  const mudarFase = (k: string, fn: (f: FaseRascunho) => FaseRascunho) =>
    mudar((r) => ({ ...r, fases: r.fases.map((f) => (f.chave === k ? fn(f) : f)) }));
  const mudarTarefa = (fk: string, tk: string, campo: keyof TarefaRascunho, v: string) =>
    mudarFase(fk, (f) => ({ ...f, tarefas: f.tarefas.map((t) => (t.chave === tk ? { ...t, [campo]: v } : t)) }));

  /** Leva a tarefa `tk` para a fase `fk`, na posição `indice`. */
  const moverTarefa = (tk: string, fk: string, indice: number) =>
    mudar((r) => {
      const origem = r.fases.find((f) => f.tarefas.some((t) => t.chave === tk));
      if (!origem) return r;
      const t = origem.tarefas.find((x) => x.chave === tk)!;
      const posOrigem = origem.tarefas.indexOf(t);
      let i = indice;
      if (origem.chave === fk && posOrigem < i) i -= 1;
      return {
        ...r,
        fases: r.fases.map((f) => {
          let ts = f.tarefas.filter((x) => x.chave !== tk);
          if (f.chave === fk) {
            ts = [...ts];
            ts.splice(Math.max(0, Math.min(i, ts.length)), 0, t);
          }
          return { ...f, tarefas: ts };
        }),
      };
    });

  const arrastoTarefa = useArrastar((id, alvo) => moverTarefa(id, alvo.grupo, alvo.indice));
  const arrastoFase = useArrastar((id, alvo) =>
    mudar((r) => {
      const de = r.fases.findIndex((f) => f.chave === id);
      let para = alvo.indice;
      if (de < para) para -= 1;
      return { ...r, fases: moverNaLista(r.fases, de, para) };
    })
  );

  const mudarCampos = (v: Record<CampoTipo, boolean>) => {
    setCampos(v);
    gravarPreferencia("ops.modelos.tipos.campos", v);
  };

  const total = rascunho.fases.reduce((s, f) => s + f.tarefas.reduce((x, t) => x + (Number(t.minutos) || 0), 0), 0);
  const nTarefas = rascunho.fases.reduce((s, f) => s + f.tarefas.length, 0);
  const problemas = [
    !rascunho.nome.trim() && "O modelo precisa de nome.",
    !rascunho.tipoServico && "Escolhe o tipo de serviço.",
    rascunho.fases.length === 0 && "Um modelo precisa de pelo menos uma fase.",
    rascunho.fases.some((f) => !f.nome.trim()) && "Há uma fase sem nome.",
    rascunho.fases.some((f) => f.tarefas.some((t) => !t.nome.trim())) && "Há tarefas sem nome.",
    rascunho.fases.some((f) => f.tarefas.some((t) => !(Math.round(Number(t.minutos)) > 0))) && "Há tarefas sem tempo previsto.",
  ].filter(Boolean) as string[];
  const opcoesTipo = [
    ...TIPOS_SERVICO,
    // Valores antigos (de quando era campo livre) continuam a aparecer, para não se perderem.
    ...tiposUsados.filter((t) => !TIPOS_SERVICO.some((x) => x.valor === t)).map((t) => ({ valor: t, rotulo: `${t} (antigo)` })),
  ];
  const campoTexto = (["procedimento", "materiais", "ferramentas"] as const).filter((k) => campos[k]);

  return (
    <Card className="animate-in-pop space-y-4 p-4 ring-2 ring-brand/20">
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <Field label="Nome">
          <Input value={rascunho.nome} onChange={(e) => mudar((r) => ({ ...r, nome: e.target.value }))} className="w-full" />
        </Field>
        <Field label="Tipo de serviço">
          <Select value={rascunho.tipoServico} onChange={(e) => mudar((r) => ({ ...r, tipoServico: e.target.value }))} className="w-full" aria-label="Tipo de serviço">
            <option value="">Escolher…</option>
            {opcoesTipo.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.rotulo}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Descrição">
        <Textarea rows={2} value={rascunho.descricao} onChange={(e) => mudar((r) => ({ ...r, descricao: e.target.value }))} className="w-full" />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Toggle checked={rascunho.ativo} onChange={(v) => mudar((r) => ({ ...r, ativo: v }))} label="Ativo (aparece em Nova obra)" />
        <CamposVisiveis campos={CAMPOS_TIPO} visiveis={campos} aoMudar={mudarCampos} />
      </div>

      <div className="rounded-lg bg-slate-50 p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-slate-500">
          <span>
            {rascunho.fases.length} fases · {nTarefas} tarefas · <strong className="font-mono text-slate-700">{formatarMinutos(total)}</strong> ({dias(total)} dias
            úteis a 8 h)
          </span>
          <span className="text-slate-400">Arrasta pela pega para reordenar fases e tarefas.</span>
        </div>
        <span className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-white ring-1 ring-inset ring-slate-200">
          {rascunho.fases.map((f, i) => {
            const m = f.tarefas.reduce((x, t) => x + (Number(t.minutos) || 0), 0);
            return m > 0 ? (
              <span
                key={f.chave}
                className={cx("h-full transition-all duration-300", corDaFase(i + 1).ponto)}
                style={{ width: `${(m / Math.max(1, total)) * 100}%` }}
                title={`${i + 1}. ${f.nome}: ${formatarMinutos(m)}`}
              />
            ) : null;
          })}
        </span>
      </div>

      <div className="space-y-2">
        {rascunho.fases.map((f, i) => {
          const cor = corDaFase(i + 1);
          const minFase = f.tarefas.reduce((s, t) => s + (Number(t.minutos) || 0), 0);
          const fechada = fechadas.has(f.chave);
          return (
            <Fragment key={f.chave}>
              {arrastoFase.linhaAntes("fases", i) && <Insercao />}
              <div
                {...arrastoFase.item(f.chave, "fases", i)}
                className={cx(
                  "rounded-lg border border-slate-200 bg-white transition-all",
                  arrastoFase.aArrastar === f.chave && "opacity-30",
                  arrastoFase.recente === f.chave && "animate-realce"
                )}
              >
                <div className={cx("flex items-center gap-2 rounded-t-lg px-2 py-2", cor.fundo, fechada && "rounded-b-lg")} {...arrastoTarefa.grupo(f.chave, 0, "inicio")}>
                  <span {...arrastoFase.pega(f.chave)} className="flex h-7 w-5 items-center justify-center rounded text-slate-400 hover:bg-white/70" title="Arrastar a fase" aria-hidden>
                    <Grip width={14} height={14} />
                  </span>
                  <button
                    type="button"
                    className="rounded p-0.5 text-slate-500 hover:bg-white/70"
                    onClick={() =>
                      setFechadas((s) => {
                        const n = new Set(s);
                        if (n.has(f.chave)) n.delete(f.chave);
                        else n.add(f.chave);
                        return n;
                      })
                    }
                    aria-label={fechada ? "Abrir fase" : "Fechar fase"}
                  >
                    {fechada ? <ChevronRight width={14} height={14} /> : <ChevronDown width={14} height={14} />}
                  </button>
                  <span className={cx("h-2.5 w-2.5 shrink-0 rounded-full", cor.ponto)} />
                  <span className={cx("font-mono text-sm", cor.texto)}>{i + 1}.</span>
                  <Input value={f.nome} onChange={(e) => mudarFase(f.chave, (x) => ({ ...x, nome: e.target.value }))} className="min-w-0 flex-1 bg-white font-medium" aria-label="Nome da fase" />
                  <span className="shrink-0 text-xs text-slate-500">
                    {f.tarefas.length} tarefa{f.tarefas.length === 1 ? "" : "s"}
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular text-slate-600" title="Duração da fase = soma das tarefas">
                    {formatarMinutos(minFase)}
                  </span>
                  <button
                    type="button"
                    className="rounded p-1 text-slate-400 hover:bg-white hover:text-red-600 disabled:opacity-30"
                    disabled={f.tarefas.length > 0 || rascunho.fases.length === 1}
                    title={f.tarefas.length > 0 ? "Tira ou arrasta as tarefas desta fase primeiro" : "Remover fase"}
                    aria-label="Remover fase"
                    onClick={() => mudar((r) => ({ ...r, fases: r.fases.filter((x) => x.chave !== f.chave) }))}
                  >
                    <X width={14} height={14} />
                  </button>
                </div>
                {!fechada && (
                  <div className="space-y-1 p-2">
                    {f.tarefas.map((t, j) => {
                      const min = Math.round(Number(t.minutos)) || 0;
                      const aberto = detalhe === t.chave;
                      return (
                        <Fragment key={t.chave}>
                          {arrastoTarefa.linhaAntes(f.chave, j) && <Insercao />}
                          <div
                            {...arrastoTarefa.item(t.chave, f.chave, j)}
                            className={cx(
                              "rounded-md bg-slate-50 p-2 transition-all",
                              arrastoTarefa.aArrastar === t.chave && "opacity-30",
                              arrastoTarefa.recente === t.chave && "animate-realce",
                              aberto && "ring-1 ring-brand/30"
                            )}
                          >
                            <div className="flex items-center gap-2">
                              <span {...arrastoTarefa.pega(t.chave)} className="flex h-7 w-5 shrink-0 items-center justify-center rounded text-slate-300 hover:bg-white hover:text-slate-500" title="Arrastar" aria-hidden>
                                <Grip width={13} height={13} />
                              </span>
                              <span className={cx("shrink-0 font-mono text-[11px]", cor.texto)}>
                                {i + 1}.{j + 1}
                              </span>
                              <Input value={t.nome} placeholder="Tarefa" onChange={(e) => mudarTarefa(f.chave, t.chave, "nome", e.target.value)} className="min-w-0 flex-1" />
                              <Input
                                type="number"
                                min={1}
                                value={t.minutos}
                                onChange={(e) => mudarTarefa(f.chave, t.chave, "minutos", e.target.value)}
                                className="w-20"
                                aria-label="Minutos previstos"
                              />
                              <span className="text-xs text-slate-400">min</span>
                              {campos.horas && (
                                <span className="hidden w-20 shrink-0 font-mono text-[11px] text-slate-400 sm:block">
                                  {formatarMinutos(min)}
                                  {min >= MINUTOS_POR_DIA && ` · ${(min / MINUTOS_POR_DIA).toFixed(1).replace(".", ",")} d`}
                                </span>
                              )}
                              <button
                                type="button"
                                className={cx("rounded px-1.5 py-0.5 text-xs hover:bg-white", aberto ? "text-brand" : "text-slate-500")}
                                onClick={() => setDetalhe(aberto ? null : t.chave)}
                              >
                                detalhe
                              </button>
                              <BotaoIcone rotulo="Subir" disabled={i === 0 && j === 0} onClick={() => (j > 0 ? moverTarefa(t.chave, f.chave, j - 1) : moverTarefa(t.chave, rascunho.fases[i - 1].chave, Infinity))}>
                                <ArrowUp width={12} height={12} />
                              </BotaoIcone>
                              <BotaoIcone
                                rotulo="Descer"
                                disabled={i === rascunho.fases.length - 1 && j === f.tarefas.length - 1}
                                onClick={() => (j < f.tarefas.length - 1 ? moverTarefa(t.chave, f.chave, j + 2) : moverTarefa(t.chave, rascunho.fases[i + 1].chave, 0))}
                              >
                                <ArrowDown width={12} height={12} />
                              </BotaoIcone>
                              <BotaoIcone
                                rotulo="Duplicar"
                                onClick={() =>
                                  mudarFase(f.chave, (x) => {
                                    const ts = [...x.tarefas];
                                    ts.splice(j + 1, 0, { ...t, id: undefined, chave: chave(), nome: `${t.nome} (cópia)` });
                                    return { ...x, tarefas: ts };
                                  })
                                }
                              >
                                <Copy width={12} height={12} />
                              </BotaoIcone>
                              <BotaoIcone rotulo="Remover tarefa" perigo onClick={() => mudarFase(f.chave, (x) => ({ ...x, tarefas: x.tarefas.filter((y) => y.chave !== t.chave) }))}>
                                <X width={13} height={13} />
                              </BotaoIcone>
                            </div>
                            {(aberto || campoTexto.length > 0) && (
                              <div className={cx("mt-2 grid gap-2 pl-7", (aberto ? 3 : campoTexto.length) > 1 && "sm:grid-cols-3")}>
                                {(aberto ? (["procedimento", "materiais", "ferramentas"] as const) : campoTexto).map((campo) => (
                                  <label key={campo} className="block">
                                    <span className="text-[11px] text-slate-500">{campo[0].toUpperCase() + campo.slice(1)}</span>
                                    <Textarea rows={2} value={t[campo]} onChange={(e) => mudarTarefa(f.chave, t.chave, campo, e.target.value)} className="w-full text-xs" />
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        </Fragment>
                      );
                    })}
                    {arrastoTarefa.linhaAntes(f.chave, f.tarefas.length) && <Insercao />}
                    <div {...arrastoTarefa.grupo(f.chave, f.tarefas.length)}>
                      {f.tarefas.length === 0 && arrastoTarefa.aArrastar ? (
                        <div className="rounded-md border border-dashed border-brand/50 bg-brand-50/50 px-3 py-2 text-center text-xs text-brand-800">Larga aqui</div>
                      ) : (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 px-1 py-1 text-xs font-medium text-brand"
                          onClick={() => {
                            const n = tarefaNova();
                            mudarFase(f.chave, (x) => ({ ...x, tarefas: [...x.tarefas, n] }));
                            arrastoTarefa.marcarRecente(n.chave);
                          }}
                        >
                          <Plus width={12} height={12} /> Tarefa
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </Fragment>
          );
        })}
        {arrastoFase.linhaAntes("fases", rascunho.fases.length) && <Insercao />}
        <div {...arrastoFase.grupo("fases", rascunho.fases.length)}>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-brand hover:text-brand"
            onClick={() => mudar((r) => ({ ...r, fases: [...r.fases, { chave: chave(), nome: "", tarefas: [] }] }))}
          >
            <Plus width={12} height={12} /> Fase
          </button>
        </div>
      </div>

      {problemas.length > 0 && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{problemas[0]}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={aoCancelar}>
          Cancelar
        </Button>
        <Button onClick={aoGravar} disabled={aGravar || problemas.length > 0}>
          {aGravar ? "A gravar…" : "Gravar modelo"}
        </Button>
      </div>
    </Card>
  );
}

function Insercao() {
  return (
    <div className="relative h-0" aria-hidden>
      <div className="absolute inset-x-0 -top-px h-0.5 rounded-full bg-brand shadow-[0_0_0_3px_rgba(124,58,237,0.15)]" />
    </div>
  );
}

function BotaoIcone({
  rotulo,
  onClick,
  disabled,
  perigo,
  children,
}: {
  rotulo: string;
  onClick: () => void;
  disabled?: boolean;
  perigo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={rotulo}
      aria-label={rotulo}
      className={cx("rounded p-1 text-slate-400 transition-colors hover:bg-white disabled:opacity-30", perigo ? "hover:text-red-600" : "hover:text-slate-700")}
    >
      {children}
    </button>
  );
}
