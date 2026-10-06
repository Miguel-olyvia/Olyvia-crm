import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ErroDeEscrita } from "../lib/dados";
import {
  criarSkill,
  gravarModeloServico,
  listarServicosComModelo,
  listarSkills,
  ritmosAprendidos,
  semearTemposPadrao,
  sugerirModelos,
  type RitmoAprendido,
  type ServicoComModelo,
  type Skill,
  type TarefaServico,
} from "../lib/obras";
import { FATORES_CONHECIDOS, MEDIDAS, formatarEspera, rotuloDoFator, unidadeDaMedida } from "../domain/planeamento";
import { Badge, Button, Card, EmptyState, ErrorState, Input, Select, Skeleton, Textarea, cx } from "./ui";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Copy, Grip, Plus, X } from "./icons";
import { ObraModelo } from "./ObraIcones";
import { FASES_POR_DEFEITO, formatarMinutos } from "../domain/obras";
import CamposVisiveis from "./CamposVisiveis";
import { gravarPreferencia, lerPreferencia, useArrastar, type AlvoArrasto } from "./arrastar";

/**
 * Modelos por serviço: como se executa cada serviço do catálogo do CRM.
 *
 * Ao criar uma obra a partir de um contrato, cada linha vendida expande-se
 * nestes passos (tempo × quantidade), com dependências, pessoas e
 * especialidade. Um serviço sem modelo gera uma tarefa só, pela ficha
 * técnica. "Gerar sugestões" preenche os que faltam a partir de uma
 * biblioteca de valores razoáveis — depois afina-se aqui.
 *
 * Leitura em hierarquia: Categoria → Serviço na lista; Fase → Passo (e o
 * passo que depende de outro, recuado debaixo dele) no editor. Os passos
 * arrastam-se pela pega — dentro da fase ou para outra fase.
 */

type Filtro = "todos" | "sem" | "sugeridos" | "editados";

interface Linha {
  /** Chave interna da linha (as dependências apontam para ela, não para a posição). */
  chave: string;
  nome: string;
  fase: string;
  mpu: string;
  fixos: string;
  pessoas: string;
  skill: string;
  dependeDe: string | null;
  procedimento: string;
  materiais: string;
  ferramentas: string;
  id: string | null;
  /** O código estável do passo ("3.3") — a coluna `chave` da base. */
  passo: string;
  dependeChaves: string[];
  espera: string;
  medida: string;
  encaixe: TarefaServico["encaixe"];
  condicao: TarefaServico["condicao"];
  fatores: string[];
  /** Só se mandam à base a condição e os fatores que o ecrã mudou. */
  mexeuCondicao: boolean;
  mexeuFatores: boolean;
}

let seq = 0;
const novaChave = () => `l${++seq}`;

const nova = (fase = "3"): Linha => ({
  chave: novaChave(),
  nome: "",
  fase,
  mpu: "30",
  fixos: "0",
  pessoas: "1",
  skill: "",
  dependeDe: null,
  procedimento: "",
  materiais: "",
  ferramentas: "",
  id: null,
  passo: "",
  dependeChaves: [],
  espera: "0",
  medida: "qt",
  encaixe: null,
  condicao: null,
  fatores: [],
  mexeuCondicao: false,
  mexeuFatores: false,
});

/** Mantém a lista agrupada por fase (estável): o que se vê é a ordem que se grava. */
const porFase = (ls: Linha[]) =>
  ls
    .map((l, i) => [l, i] as const)
    .sort((a, b) => Number(a[0].fase) - Number(b[0].fase) || a[1] - b[1])
    .map(([l]) => l);

function paraLinhas(t: TarefaServico[]): Linha[] {
  const chaves = t.map(() => novaChave());
  const ls = t.map((x, i) => {
    // depende_ordem aponta para a ordem gravada (= posição quando veio da base).
    const alvo = x.depende_ordem
      ? Math.max(
          t.findIndex((y) => y.ordem === x.depende_ordem),
          t.some((y) => y.ordem != null) ? -1 : x.depende_ordem - 1
        )
      : -1;
    return {
      chave: chaves[i],
      nome: x.nome,
      fase: String(x.fase),
      mpu: String(x.minutos_por_unidade),
      fixos: String(x.minutos_fixos),
      pessoas: String(x.pessoas),
      skill: x.skill_id ?? "",
      dependeDe: alvo >= 0 && alvo !== i ? chaves[alvo] : null,
      procedimento: x.procedimento ?? "",
      materiais: x.materiais ?? "",
      ferramentas: x.ferramentas ?? "",
      id: x.id ?? null,
      passo: x.chave ?? "",
      dependeChaves: x.depende_chaves ?? [],
      espera: String(x.espera_antes_horas ?? 0),
      medida: x.medida ?? "qt",
      encaixe: x.encaixe ?? null,
      condicao: x.condicao ?? null,
      fatores: x.fatores ?? [],
      mexeuCondicao: false,
      mexeuFatores: false,
    };
  });
  return porFase(ls);
}

const TIPO: Record<string, string> = { casa_banho: "casa de banho", cozinha: "cozinha" };

/** Uma cor por fase, para a hierarquia se ler de relance. */
export const COR_FASE = [
  { ponto: "bg-amber-400", texto: "text-amber-700", fundo: "bg-amber-50", anel: "ring-amber-200" },
  { ponto: "bg-sky-500", texto: "text-sky-700", fundo: "bg-sky-50", anel: "ring-sky-200" },
  { ponto: "bg-emerald-500", texto: "text-emerald-700", fundo: "bg-emerald-50", anel: "ring-emerald-200" },
  { ponto: "bg-violet-500", texto: "text-violet-700", fundo: "bg-violet-50", anel: "ring-violet-200" },
  { ponto: "bg-rose-400", texto: "text-rose-700", fundo: "bg-rose-50", anel: "ring-rose-200" },
  { ponto: "bg-slate-400", texto: "text-slate-600", fundo: "bg-slate-50", anel: "ring-slate-200" },
];
export const corDaFase = (n: number) => COR_FASE[(Math.max(1, n) - 1) % COR_FASE.length];

/** "junta-se a 2.1 (casa de banho) · entre 2.4 e 3.2 (cozinha)". */
function descreverEncaixe(e: Linha["encaixe"]): string {
  if (!e) return "";
  return Object.entries(e)
    .filter(([k]) => k !== "*")
    .map(([k, v]) =>
      v.modo === "junta"
        ? `junta-se a ${v.alvo} (${TIPO[k] ?? k})`
        : v.modo === "entre" && Array.isArray(v.alvo)
          ? `entre ${v.alvo[0]} e ${v.alvo[1]} (${TIPO[k] ?? k})`
          : ""
    )
    .filter(Boolean)
    .join(" · ");
}

const num = (s: string) => Number(String(s).replace(",", ".")) || 0;

/** Minutos (pessoa × tempo) de um serviço para `qt` unidades. */
export function minutosDoModelo(t: { minutos_por_unidade: number; minutos_fixos: number }[], qt: number): number {
  return Math.round(t.reduce((s, x) => s + x.minutos_fixos + x.minutos_por_unidade * qt, 0));
}

/** Minutos por fase (1..4) para `qt` unidades — para as barras. */
function minutosPorFase(t: { fase: number; minutos_por_unidade: number; minutos_fixos: number }[], qt: number) {
  const r = FASES_POR_DEFEITO.map(() => 0);
  for (const x of t) {
    const k = Math.min(Math.max(1, x.fase), r.length) - 1;
    r[k] += x.minutos_fixos + x.minutos_por_unidade * qt;
  }
  return r;
}

/** A barra com o peso de cada fase. */
function BarraFases({ minutos, className }: { minutos: number[]; className?: string }) {
  const total = minutos.reduce((s, x) => s + x, 0);
  if (!total) return <span className={cx("block h-1.5 rounded-full bg-slate-100", className)} />;
  return (
    <span className={cx("flex h-1.5 overflow-hidden rounded-full bg-slate-100", className)}>
      {minutos.map((m, i) =>
        m > 0 ? (
          <span
            key={i}
            className={cx("h-full transition-all duration-300", corDaFase(i + 1).ponto)}
            style={{ width: `${(m / total) * 100}%` }}
            title={`${i + 1}. ${FASES_POR_DEFEITO[i]}: ${formatarMinutos(Math.round(m))}`}
          />
        ) : null
      )}
    </span>
  );
}

export default function ModelosServicos({ orgId, gere }: { orgId: string; gere: boolean }) {
  const [servicos, setServicos] = useState<ServicoComModelo[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [aGerar, setAGerar] = useState(false);
  const [ritmos, setRitmos] = useState<RitmoAprendido[]>([]);
  const [agrupar, setAgrupar] = useState(() => lerPreferencia("ops.modelos.agrupar", { categoria: true }).categoria);
  const [fechadas, setFechadas] = useState<Set<string>>(new Set());

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const [s, k, r] = await Promise.all([listarServicosComModelo(orgId), listarSkills(orgId), ritmosAprendidos(orgId)]);
      setServicos(s);
      setSkills(k);
      setRitmos(r);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Algo correu mal a carregar os serviços.");
    } finally {
      setACarregar(false);
    }
  }, [orgId, recarga]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const gerar = async () => {
    setAGerar(true);
    setAviso(null);
    try {
      const r = await sugerirModelos({ orgId });
      setAviso(
        r.servicos
          ? `Gerados ${r.servicos} modelo${r.servicos === 1 ? "" : "s"} (${r.tarefas} passos). Revê os tempos dos mais vendidos.`
          : "Todos os serviços já tinham modelo."
      );
      setRecarga((x) => x + 1);
    } catch (e) {
      setAviso(e instanceof ErroDeEscrita ? e.message : "Não foi possível gerar os modelos.");
    } finally {
      setAGerar(false);
    }
  };

  const carregarPadrao = async () => {
    setAGerar(true);
    setAviso(null);
    try {
      const r = await semearTemposPadrao(orgId);
      const saltados = r.saltados?.length ? ` ${r.saltados.length} com modelo revisto à mão ficaram como estavam.` : "";
      setAviso(
        `Tempos padrão carregados em ${r.servicos} serviço${r.servicos === 1 ? "" : "s"} (${r.passos} passos).${saltados}` +
          (r.nao_encontrados?.length ? ` ${r.nao_encontrados.length} serviço(s) dos manuais não existem neste catálogo.` : "")
      );
      setRecarga((x) => x + 1);
    } catch (e) {
      setAviso(e instanceof ErroDeEscrita ? e.message : "Não foi possível carregar os tempos padrão.");
    } finally {
      setAGerar(false);
    }
  };

  const visiveis = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return servicos.filter((s) => {
      if (b && !`${s.nome} ${s.categoria ?? ""} ${s.sku ?? ""}`.toLowerCase().includes(b)) return false;
      if (filtro === "sem") return s.tarefas.length === 0;
      if (filtro === "sugeridos") return s.tarefas.length > 0 && !s.editado;
      if (filtro === "editados") return s.editado;
      return true;
    });
  }, [servicos, filtro, busca]);

  const grupos = useMemo(() => {
    if (!agrupar) return [{ nome: "", servicos: visiveis }];
    const m = new Map<string, ServicoComModelo[]>();
    for (const s of visiveis) {
      const k = s.categoria?.trim() || "Sem categoria";
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return [...m.entries()]
      .sort(([a], [b]) => (a === "Sem categoria" ? 1 : b === "Sem categoria" ? -1 : a.localeCompare(b, "pt")))
      .map(([nome, servicos]) => ({ nome, servicos }));
  }, [visiveis, agrupar]);

  if (aCarregar) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (erro) return <ErrorState message={erro} onRetry={() => setRecarga((x) => x + 1)} />;

  const semModelo = servicos.filter((s) => s.tarefas.length === 0).length;
  const contagem: Record<Filtro, number> = {
    todos: servicos.length,
    sem: semModelo,
    sugeridos: servicos.filter((s) => s.tarefas.length > 0 && !s.editado).length,
    editados: servicos.filter((s) => s.editado).length,
  };

  const linhaOuEditor = (s: ServicoComModelo) =>
    aberto === s.servico_id ? (
      <EditorServico
        key={s.servico_id}
        orgId={orgId}
        servico={s}
        servicos={servicos}
        skills={skills}
        ritmos={ritmos}
        gere={gere}
        aoFechar={() => setAberto(null)}
        aoGravar={() => {
          setAberto(null);
          setRecarga((x) => x + 1);
        }}
        aoCriarSkill={(k) => setSkills((x) => [...x, k].sort((a, b) => a.nome.localeCompare(b.nome)))}
      />
    ) : (
      <LinhaServico key={s.servico_id} s={s} aoAbrir={() => setAberto(s.servico_id)} />
    );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          Como se executa cada serviço vendido. A obra criada a partir de um contrato junta estes passos, com o tempo ×
          quantidade.
        </p>
        <span className="flex flex-wrap gap-2">
          {gere && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void carregarPadrao()}
              disabled={aGerar}
              title="Os tempos dos manuais operacionais de remodelação de casa de banho e de cozinha (pacotes e extras)"
            >
              Carregar tempos padrão
            </Button>
          )}
          {gere && semModelo > 0 && (
            <Button size="sm" onClick={() => void gerar()} disabled={aGerar}>
              {aGerar ? "A gerar…" : `Gerar sugestões para ${semModelo} sem modelo`}
            </Button>
          )}
        </span>
      </div>

      {aviso && <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">{aviso}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procurar serviço…" className="w-56" />
        {(
          [
            ["todos", "Todos"],
            ["sem", "Sem modelo"],
            ["sugeridos", "Sugeridos"],
            ["editados", "Revistos"],
          ] as [Filtro, string][]
        ).map(([f, r]) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(f)}
            className={cx(
              "rounded-full px-3 py-1 text-xs ring-1 ring-inset",
              filtro === f ? "bg-slate-800 text-white ring-slate-800" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
            )}
          >
            {r} <span className="opacity-60">{contagem[f]}</span>
          </button>
        ))}
        <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-500">
          <input
            type="checkbox"
            className="accent-brand"
            checked={agrupar}
            onChange={(e) => {
              setAgrupar(e.target.checked);
              gravarPreferencia("ops.modelos.agrupar", { categoria: e.target.checked });
            }}
          />
          Agrupar por categoria
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
        {FASES_POR_DEFEITO.map((n, i) => (
          <span key={n} className="inline-flex items-center gap-1">
            <span className={cx("h-2 w-2 rounded-full", corDaFase(i + 1).ponto)} />
            {i + 1}. {n}
          </span>
        ))}
      </div>

      {servicos.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ObraModelo width={22} height={22} />}
            title="Sem serviços no catálogo"
            description="Os serviços vêm do CRM (Catálogo → Serviços) desta empresa."
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {grupos.map((g) =>
            !g.nome ? (
              <div key="_" className="space-y-2">
                {g.servicos.map(linhaOuEditor)}
              </div>
            ) : (
              <section key={g.nome} className="rounded-xl bg-slate-50/70 p-1.5 ring-1 ring-inset ring-slate-200/70">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-white"
                  onClick={() =>
                    setFechadas((f) => {
                      const n = new Set(f);
                      if (n.has(g.nome)) n.delete(g.nome);
                      else n.add(g.nome);
                      return n;
                    })
                  }
                  aria-expanded={!fechadas.has(g.nome)}
                >
                  {fechadas.has(g.nome) ? (
                    <ChevronRight width={14} height={14} className="text-slate-400" />
                  ) : (
                    <ChevronDown width={14} height={14} className="text-slate-400" />
                  )}
                  <span className="text-sm font-semibold text-slate-700">{g.nome}</span>
                  <span className="text-xs text-slate-400">
                    {g.servicos.length} serviço{g.servicos.length === 1 ? "" : "s"}
                  </span>
                  {g.servicos.some((s) => s.tarefas.length === 0) && (
                    <Badge className="bg-amber-50 text-amber-800 ring-amber-200">
                      {g.servicos.filter((s) => s.tarefas.length === 0).length} sem modelo
                    </Badge>
                  )}
                  <BarraFases
                    className="ml-auto w-24"
                    minutos={minutosPorFase(
                      g.servicos.flatMap((s) => s.tarefas),
                      1
                    )}
                  />
                </button>
                {!fechadas.has(g.nome) && (
                  <div className="mt-1 space-y-1.5 border-l-2 border-slate-200 pl-2 sm:ml-3">{g.servicos.map(linhaOuEditor)}</div>
                )}
              </section>
            )
          )}
          {visiveis.length === 0 && <p className="px-1 text-sm text-slate-400">Nenhum serviço com este filtro.</p>}
        </div>
      )}
    </div>
  );
}

function ficha(s: ServicoComModelo): string {
  if (!s.horas) return "sem horas na ficha técnica";
  const p = s.pessoas ?? 1;
  return `ficha: ${String(s.horas).replace(".", ",")} h × ${p} pessoa${p === 1 ? "" : "s"} por unidade`;
}

function LinhaServico({ s, aoAbrir }: { s: ServicoComModelo; aoAbrir: () => void }) {
  const porUnidade = minutosDoModelo(s.tarefas, 1);
  const fases = minutosPorFase(s.tarefas, 1);
  return (
    <button
      type="button"
      onClick={aoAbrir}
      className="group flex w-full items-center justify-between gap-3 rounded-xl bg-white px-4 py-3 text-left ring-1 ring-inset ring-slate-200 transition-all hover:-translate-y-px hover:shadow-card hover:ring-slate-300"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-800">{s.nome}</span>
        <span className="block truncate text-xs text-slate-500">{[s.categoria, s.sku, ficha(s)].filter(Boolean).join(" · ")}</span>
        {s.tarefas.length > 0 && (
          <span className="mt-1 flex items-center gap-2">
            <BarraFases minutos={fases} className="w-32" />
            <span className="flex gap-1">
              {fases.map((m, i) =>
                m > 0 ? (
                  <span key={i} className={cx("rounded px-1 font-mono text-[10px]", corDaFase(i + 1).fundo, corDaFase(i + 1).texto)}>
                    F{i + 1}·{s.tarefas.filter((t) => Math.min(Math.max(1, t.fase), 4) === i + 1).length}
                  </span>
                ) : null
              )}
            </span>
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {s.perfil?.tipo && <Badge className="bg-sky-50 text-sky-800 ring-sky-200">pacote {TIPO[s.perfil.tipo] ?? s.perfil.tipo}</Badge>}
        {s.perfil && !s.perfil.planear ? (
          <Badge>não é trabalho no local</Badge>
        ) : s.perfil?.medida_para ? (
          <Badge>dá a medida ao pacote</Badge>
        ) : s.tarefas.length === 0 ? (
          <Badge className="bg-amber-50 text-amber-800 ring-amber-200">sem modelo</Badge>
        ) : (
          <>
            <span className="font-mono text-xs tabular text-slate-500">
              {s.tarefas.length} passos{s.perfil?.tipo ? "" : ` · ${formatarMinutos(porUnidade)}/un`}
            </span>
            {s.editado ? (
              <Badge className="bg-brand-50 text-brand-800 ring-brand-200">revisto</Badge>
            ) : s.padrao ? (
              <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">tempos padrão</Badge>
            ) : (
              <Badge>sugerido</Badge>
            )}
          </>
        )}
        <ChevronRight width={14} height={14} className="text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-slate-500" />
      </span>
    </button>
  );
}

/* ─────────────────────────────── Editor ─────────────────────────────── */

type Campo = "medida" | "mpu" | "fixos" | "pessoas" | "skill" | "depende" | "espera" | "chave" | "tempo" | "aprendido";

const CAMPOS: readonly { chave: Campo; rotulo: string; dica?: string }[] = [
  { chave: "medida", rotulo: "Medida", dica: "O que multiplica os minutos" },
  { chave: "mpu", rotulo: "min/un", dica: "Minutos por unidade da medida" },
  { chave: "fixos", rotulo: "+ fixos", dica: "Minutos seja qual for a quantidade" },
  { chave: "pessoas", rotulo: "Pessoas" },
  { chave: "skill", rotulo: "Especialidade" },
  { chave: "depende", rotulo: "Depois de" },
  { chave: "espera", rotulo: "Espera (h)", dica: "Cura, secagem, fabrico — horas de relógio" },
  { chave: "chave", rotulo: "Código do passo", dica: "Ex.: 3.3 — para os extras se encaixarem" },
  { chave: "tempo", rotulo: "Tempo no exemplo", dica: "Trabalho e duração para a quantidade de exemplo" },
  { chave: "aprendido", rotulo: "Ritmo aprendido", dica: "O que as obras validadas ensinaram" },
];

const CAMPOS_DEFEITO: Record<Campo, boolean> = {
  medida: true,
  mpu: true,
  fixos: true,
  pessoas: true,
  skill: true,
  depende: true,
  espera: true,
  chave: false,
  tempo: true,
  aprendido: false,
};

function EditorServico({
  orgId,
  servico,
  servicos,
  skills,
  ritmos,
  gere,
  aoFechar,
  aoGravar,
  aoCriarSkill,
}: {
  orgId: string;
  servico: ServicoComModelo;
  servicos: ServicoComModelo[];
  skills: Skill[];
  ritmos: RitmoAprendido[];
  gere: boolean;
  aoFechar: () => void;
  aoGravar: () => void;
  aoCriarSkill: (k: Skill) => void;
}) {
  const [linhas, setLinhas] = useState<Linha[]>(() => paraLinhas(servico.tarefas));
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [qt, setQt] = useState("10");
  const [aGravar, setAGravar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [novaSkill, setNovaSkill] = useState("");
  const [campos, setCampos] = useState<Record<Campo, boolean>>(() => lerPreferencia("ops.modelos.campos", CAMPOS_DEFEITO));
  const [fasesFechadas, setFasesFechadas] = useState<Set<number>>(new Set());
  const [mexeu, setMexeu] = useState(false);

  const mudarCampos = (v: Record<Campo, boolean>) => {
    setCampos(v);
    gravarPreferencia("ops.modelos.campos", v);
  };

  const editar = (fn: (ls: Linha[]) => Linha[]) => {
    setMexeu(true);
    setLinhas((ls) => porFase(fn(ls)));
  };

  const mudar = <K extends keyof Linha>(k: string, campo: K, v: Linha[K]) =>
    editar((ls) => ls.map((l) => (l.chave === k ? { ...l, [campo]: v } : l)));

  /** Põe a linha `k` na fase `fase`, na posição `indice` do grupo. */
  const mover = useCallback((k: string, fase: number, indice: number) => {
    setMexeu(true);
    setLinhas((ls) => {
      const de = ls.findIndex((l) => l.chave === k);
      if (de < 0) return ls;
      const original = ls[de];
      const grupoAntes = ls.filter((l) => Number(l.fase) === fase);
      const posNoGrupo = grupoAntes.findIndex((l) => l.chave === k);
      let i = indice;
      if (posNoGrupo >= 0 && posNoGrupo < i) i -= 1; // já lá estava, acima do alvo
      const resto = ls.filter((_, j) => j !== de);
      const grupo = resto.map((l, j) => [l, j] as const).filter(([l]) => Number(l.fase) === fase);
      let pos: number;
      if (i < grupo.length) pos = grupo[Math.max(0, i)][1];
      else if (grupo.length) pos = grupo[grupo.length - 1][1] + 1;
      else {
        pos = resto.findIndex((l) => Number(l.fase) > fase);
        if (pos < 0) pos = resto.length;
      }
      resto.splice(pos, 0, { ...original, fase: String(fase) });
      return resto;
    });
  }, []);

  const arrasto = useArrastar((id: string, alvo: AlvoArrasto) => mover(id, Number(alvo.grupo), alvo.indice));

  const remover = (k: string) =>
    editar((ls) => ls.filter((l) => l.chave !== k).map((l) => (l.dependeDe === k ? { ...l, dependeDe: null } : l)));

  const duplicar = (k: string) =>
    editar((ls) => {
      const i = ls.findIndex((l) => l.chave === k);
      const c = { ...ls[i], chave: novaChave(), id: null, passo: "", nome: `${ls[i].nome} (cópia)`, mexeuCondicao: true, mexeuFatores: true };
      const r = [...ls];
      r.splice(i + 1, 0, c);
      return r;
    });

  const acrescentar = (fase: number) => {
    const l = nova(String(fase));
    editar((ls) => [...ls, l]);
    setDetalhe(null);
    arrasto.marcarRecente(l.chave);
  };

  /** Dá um código "fase.n" aos passos sem código (sem repetir os que existem). */
  const gerarCodigos = () =>
    editar((ls) => {
      const usados = new Set(ls.map((l) => l.passo).filter(Boolean));
      const conta: Record<string, number> = {};
      return ls.map((l) => {
        conta[l.fase] = (conta[l.fase] ?? 0) + 1;
        if (l.passo) return l;
        let n = conta[l.fase];
        while (usados.has(`${l.fase}.${n}`)) n++;
        usados.add(`${l.fase}.${n}`);
        return { ...l, passo: `${l.fase}.${n}` };
      });
    });

  const indice = new Map(linhas.map((l, i) => [l.chave, i]));
  const porChave = new Map(linhas.map((l) => [l.chave, l]));

  // Profundidade na árvore: um passo que depende de outro da mesma fase fica debaixo dele.
  const profundidade = (l: Linha, vistos = new Set<string>()): number => {
    const p = l.dependeDe ? porChave.get(l.dependeDe) : undefined;
    if (!p || p.fase !== l.fase || vistos.has(l.chave) || (indice.get(p.chave) ?? 0) > (indice.get(l.chave) ?? 0)) return 0;
    vistos.add(l.chave);
    return Math.min(3, 1 + profundidade(p, vistos));
  };

  const emCiclo = (l: Linha) => {
    let c = l.dependeDe;
    for (let n = 0; c && n <= linhas.length; n++) {
      if (c === l.chave) return true;
      c = porChave.get(c)?.dependeDe ?? null;
    }
    return false;
  };
  const ciclos = linhas.filter(emCiclo);
  const codigosRepetidos = linhas.filter((l) => l.passo && linhas.some((o) => o !== l && o.passo === l.passo));
  const codigosInvalidos = linhas.filter((l) => l.passo && !/^[0-9A-Za-z._-]{1,12}$/.test(l.passo));
  const semTempo = linhas.filter((l) => num(l.mpu) <= 0 && num(l.fixos) <= 0);

  const tarefas: TarefaServico[] = linhas.map((l) => ({
    nome: l.nome.trim(),
    fase: Number(l.fase),
    minutos_por_unidade: num(l.mpu),
    minutos_fixos: Math.round(num(l.fixos)),
    pessoas: Math.max(1, Math.round(num(l.pessoas))),
    skill_id: l.skill || null,
    depende_ordem: l.dependeDe && indice.has(l.dependeDe) ? (indice.get(l.dependeDe) ?? 0) + 1 : null,
    procedimento: l.procedimento.trim() || null,
    materiais: l.materiais.trim() || null,
    ferramentas: l.ferramentas.trim() || null,
    chave: l.passo.trim() || null,
    depende_chaves: l.dependeChaves,
    espera_antes_horas: Math.max(0, num(l.espera)),
    medida: l.medida,
    ...(l.mexeuCondicao ? { condicao: l.condicao } : {}),
    ...(l.mexeuFatores ? { fatores: l.fatores } : {}),
  }));
  const total = minutosDoModelo(tarefas, num(qt));
  const fasesMin = minutosPorFase(tarefas, num(qt));
  const fichaMin = servico.horas ? servico.horas * 60 * (servico.pessoas ?? 1) : null;
  const porUnidade = minutosDoModelo(tarefas, 1);
  // O ritmo aprendido de cada passo (o geral, sem combinação de fatores).
  const aprendido = (id: string | null) => ritmos.find((r) => r.servico_tarefa_id === id && r.fatores_chave === "");
  const nomeServico = (id: string) => servicos.find((s) => s.servico_id === id)?.nome ?? "serviço apagado";

  const bloqueio =
    linhas.some((l) => !l.nome.trim())
      ? "Há passos sem nome."
      : ciclos.length
        ? "As dependências fecham um ciclo."
        : codigosRepetidos.length
          ? "Há dois passos com o mesmo código."
          : codigosInvalidos.length
            ? "Há códigos de passo inválidos (até 12 letras, números, . _ -)."
            : semTempo.length
              ? "Há passos sem tempo (por unidade ou fixo)."
              : null;

  const gravar = async () => {
    setAGravar(true);
    setErro(null);
    try {
      await gravarModeloServico(orgId, servico.servico_id, tarefas);
      aoGravar();
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível gravar.");
    } finally {
      setAGravar(false);
    }
  };

  const sugerirDeNovo = async () => {
    setErro(null);
    try {
      await sugerirModelos({ orgId, servicoId: servico.servico_id, substituir: true });
      aoGravar();
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível gerar a sugestão.");
    }
  };

  const acrescentarSkill = async () => {
    const nome = novaSkill.trim();
    if (!nome) return;
    try {
      const r = await criarSkill(orgId, nome);
      aoCriarSkill({ id: r.id, nome });
      setNovaSkill("");
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível criar a especialidade.");
    }
  };

  const c = campos;
  const nColunas = 3 + (Object.keys(c) as Campo[]).filter((k) => c[k]).length;
  const rotuloLinha = (l: Linha) => `${(indice.get(l.chave) ?? 0) + 1}. ${l.nome || "(sem nome)"}`;

  return (
    <Card className="animate-in-pop space-y-4 p-4 ring-2 ring-brand/20">
      {/* Cabeçalho: o serviço e o resumo do modelo */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-slate-400">{[servico.categoria, servico.sku].filter(Boolean).join(" · ") || "Serviço"}</p>
          <p className="text-base font-semibold text-slate-800">{servico.nome}</p>
          <p className="text-xs text-slate-500">{ficha(servico)}</p>
        </div>
        <div className="flex items-center gap-2">
          <CamposVisiveis campos={CAMPOS} visiveis={campos} aoMudar={mudarCampos} />
          <button type="button" onClick={aoFechar} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Fechar">
            <X width={16} height={16} />
          </button>
        </div>
      </div>

      <div className="grid gap-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-[1fr_auto]">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>
              Para
              <Input
                value={qt}
                onChange={(e) => setQt(e.target.value)}
                className="mx-1 inline-block w-16 py-1 font-mono"
                inputMode="decimal"
                aria-label="Quantidade de exemplo"
              />
              unidades: <strong className="font-mono text-slate-700">{formatarMinutos(total)}</strong> de trabalho (pessoa × tempo),
              em {linhas.length} passo{linhas.length === 1 ? "" : "s"}.
            </span>
          </div>
          <BarraFases minutos={fasesMin} className="h-2.5" />
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
            {fasesMin.map((m, i) =>
              m > 0 ? (
                <span key={i} className="inline-flex items-center gap-1">
                  <span className={cx("h-2 w-2 rounded-full", corDaFase(i + 1).ponto)} />
                  {FASES_POR_DEFEITO[i]} <span className="font-mono">{formatarMinutos(Math.round(m))}</span>
                  <span className="text-slate-400">({Math.round((m / Math.max(1, total)) * 100)}%)</span>
                </span>
              ) : null
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center sm:w-72">
          <Indicador rotulo="por unidade" valor={formatarMinutos(porUnidade)} />
          <Indicador
            rotulo="vs ficha"
            valor={fichaMin ? `${porUnidade >= fichaMin ? "+" : "−"}${Math.round((Math.abs(porUnidade - fichaMin) / fichaMin) * 100)}%` : "—"}
            tom={fichaMin ? (Math.abs(porUnidade - fichaMin) / fichaMin > 0.3 ? "aviso" : "ok") : undefined}
            dica={fichaMin ? `Ficha técnica: ${formatarMinutos(fichaMin)} por unidade` : "A ficha técnica não tem horas"}
          />
          <Indicador
            rotulo="esperas"
            valor={(() => {
              const h = linhas.reduce((s, l) => s + num(l.espera), 0);
              return h ? formatarEspera(h) : "—";
            })()}
          />
        </div>
      </div>

      {gere && linhas.length > 1 && (
        <p className="text-xs text-slate-400">
          Arrasta pela pega <Grip width={11} height={11} className="inline" /> para mudar a ordem ou levar um passo para outra fase. Um
          passo que depende de outro da mesma fase aparece debaixo dele.
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="w-6" />
              <th className="w-10 py-1 font-normal">#</th>
              <th className="py-1 font-normal">Passo</th>
              {c.chave && <th className="py-1 font-normal">Código</th>}
              {c.medida && (
                <th className="py-1 font-normal" title="O que multiplica os minutos: a quantidade vendida, ou uma medida da divisão">
                  Medida
                </th>
              )}
              {c.mpu && (
                <th className="py-1 font-normal" title="Minutos de trabalho (pessoa × tempo) por unidade da medida">
                  min/un
                </th>
              )}
              {c.fixos && (
                <th className="py-1 font-normal" title="Minutos fixos, seja qual for a quantidade">
                  + fixos
                </th>
              )}
              {c.pessoas && <th className="py-1 font-normal">Pessoas</th>}
              {c.skill && <th className="py-1 font-normal">Especialidade</th>}
              {c.depende && <th className="py-1 font-normal">Depois de</th>}
              {c.espera && (
                <th className="py-1 font-normal" title="Horas de relógio de espera antes de começar (cura, secagem, fabrico)">
                  Espera (h)
                </th>
              )}
              {c.tempo && <th className="py-1 text-right font-normal">Para {qt || 0} un</th>}
              {c.aprendido && <th className="py-1 font-normal">Aprendido</th>}
              <th />
            </tr>
          </thead>
          {FASES_POR_DEFEITO.map((nomeFase, fi) => {
            const fase = fi + 1;
            const cor = corDaFase(fase);
            const doGrupo = linhas.filter((l) => Number(l.fase) === fase);
            const fechada = fasesFechadas.has(fase);
            const minFase = fasesMin[fi];
            return (
              <tbody key={fase}>
                <tr {...(gere ? arrasto.grupo(String(fase), fechada ? doGrupo.length : 0, "inicio") : {})}>
                  <td colSpan={nColunas} className="pt-3">
                    <div
                      className={cx(
                        "flex items-center gap-2 rounded-lg px-2 py-1.5 ring-1 ring-inset transition-colors",
                        cor.fundo,
                        cor.anel,
                        arrasto.aArrastar && arrasto.alvo?.grupo === String(fase) && "ring-2 ring-brand"
                      )}
                    >
                      <button
                        type="button"
                        className="rounded p-0.5 text-slate-500 hover:bg-white/70"
                        onClick={() =>
                          setFasesFechadas((f) => {
                            const n = new Set(f);
                            if (n.has(fase)) n.delete(fase);
                            else n.add(fase);
                            return n;
                          })
                        }
                        aria-label={fechada ? "Abrir fase" : "Fechar fase"}
                        aria-expanded={!fechada}
                      >
                        {fechada ? <ChevronRight width={14} height={14} /> : <ChevronDown width={14} height={14} />}
                      </button>
                      <span className={cx("h-2.5 w-2.5 rounded-full", cor.ponto)} />
                      <span className={cx("text-xs font-semibold uppercase tracking-wide", cor.texto)}>
                        Fase {fase} · {nomeFase}
                      </span>
                      <span className="text-xs text-slate-500">
                        {doGrupo.length} passo{doGrupo.length === 1 ? "" : "s"}
                      </span>
                      <span className="ml-auto font-mono text-xs tabular text-slate-600" title={`Trabalho da fase para ${qt} un`}>
                        {minFase ? formatarMinutos(Math.round(minFase)) : "—"}
                      </span>
                      {gere && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs font-medium text-brand hover:bg-white/70"
                          onClick={() => acrescentar(fase)}
                        >
                          <Plus width={11} height={11} /> Passo
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {!fechada &&
                  doGrupo.map((l, gi) => {
                    const i = indice.get(l.chave) ?? 0;
                    const prof = profundidade(l);
                    const pai = l.dependeDe ? porChave.get(l.dependeDe) : undefined;
                    const paiDepois = pai && Number(pai.fase) > Number(l.fase);
                    const r = aprendido(l.id);
                    const minLinha = num(l.fixos) + num(l.mpu) * num(qt);
                    const pess = Math.max(1, Math.round(num(l.pessoas)));
                    const aberto = detalhe === l.chave;
                    const problema = emCiclo(l) || codigosRepetidos.includes(l) || codigosInvalidos.includes(l) || semTempo.includes(l) || !l.nome.trim();
                    return (
                      <Fragment key={l.chave}>
                        {arrasto.linhaAntes(String(fase), gi) && <LinhaInsercao colunas={nColunas} />}
                        <tr
                          {...(gere ? arrasto.item(l.chave, String(fase), gi) : {})}
                          className={cx(
                            "align-top transition-opacity",
                            arrasto.aArrastar === l.chave && "opacity-30",
                            arrasto.recente === l.chave && "animate-realce",
                            aberto && "bg-brand-50/40"
                          )}
                        >
                          <td className="py-1.5 pr-1">
                            {gere && (
                              <span
                                {...arrasto.pega(l.chave)}
                                className="flex h-8 w-5 items-center justify-center rounded text-slate-300 hover:bg-slate-100 hover:text-slate-500"
                                title="Arrastar"
                                aria-hidden
                              >
                                <Grip width={14} height={14} />
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 pr-1">
                            <span className={cx("inline-block rounded px-1 py-1 font-mono text-[11px]", cor.fundo, cor.texto)}>
                              {l.passo || `${fase}.${gi + 1}`}
                            </span>
                          </td>
                          <td className="py-1.5 pr-2">
                            <div className="flex items-start" style={{ paddingLeft: prof * 16 }}>
                              {prof > 0 && (
                                <span className="mr-1 mt-1.5 h-3 w-3 shrink-0 rounded-bl border-b-2 border-l-2 border-slate-300" aria-hidden />
                              )}
                              <div className="min-w-0 flex-1">
                                <Input
                                  value={l.nome}
                                  onChange={(e) => mudar(l.chave, "nome", e.target.value)}
                                  placeholder="Ex.: Abrir roços"
                                  className={cx("w-full", problema && "border-amber-300")}
                                  disabled={!gere}
                                />
                                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                                  <button
                                    type="button"
                                    className={cx("underline-offset-2 hover:underline", aberto && "font-medium text-brand")}
                                    onClick={() => setDetalhe(aberto ? null : l.chave)}
                                  >
                                    {aberto ? "esconder detalhe" : "detalhe"}
                                  </button>
                                  {(l.procedimento || l.materiais || l.ferramentas) && !aberto && (
                                    <span title={[l.procedimento, l.materiais, l.ferramentas].filter(Boolean).join("\n")}>
                                      {[l.procedimento && "procedimento", l.materiais && "materiais", l.ferramentas && "ferramentas"]
                                        .filter(Boolean)
                                        .join(" · ")}
                                    </span>
                                  )}
                                  {l.encaixe && <span className="text-sky-700">{descreverEncaixe(l.encaixe)}</span>}
                                  {l.condicao && (
                                    <span className="text-amber-700" title="Só entra se o orçamento ou a visita o pedirem">
                                      condicional
                                    </span>
                                  )}
                                  {l.fatores.length > 0 && (
                                    <span title="Características que mudam o ritmo">
                                      fatores: {l.fatores.map(rotuloDoFator).join(", ")}
                                    </span>
                                  )}
                                  {!c.aprendido && r && (
                                    <span className="text-emerald-700" title={`Padrão: ${r.padrao_por_unidade} min/un + ${r.padrao_fixos} fixos`}>
                                      aprendido: {String(r.minutos_por_unidade).replace(".", ",")} min/un + {Math.round(r.minutos_fixos)} fixos ({r.n}{" "}
                                      {r.n === 1 ? "tarefa" : "tarefas"})
                                    </span>
                                  )}
                                  {paiDepois && <span className="text-amber-700">depende de um passo de uma fase mais à frente</span>}
                                  {emCiclo(l) && <span className="text-red-600">ciclo nas dependências</span>}
                                </div>
                              </div>
                            </div>
                          </td>
                          {c.chave && (
                            <td className="py-1.5 pr-2">
                              <Input
                                value={l.passo}
                                onChange={(e) => mudar(l.chave, "passo", e.target.value.trim())}
                                placeholder={`${fase}.${gi + 1}`}
                                className={cx("w-16 font-mono", (codigosRepetidos.includes(l) || codigosInvalidos.includes(l)) && "border-red-300")}
                                disabled={!gere}
                                aria-label="Código do passo"
                              />
                            </td>
                          )}
                          {c.medida && (
                            <td className="py-1.5 pr-2">
                              <Select value={l.medida} onChange={(e) => mudar(l.chave, "medida", e.target.value)} className="w-36" disabled={!gere}>
                                {MEDIDAS.map((m) => (
                                  <option key={m.valor} value={m.valor}>
                                    {m.rotulo}
                                  </option>
                                ))}
                              </Select>
                            </td>
                          )}
                          {c.mpu && (
                            <td className="py-1.5 pr-2">
                              <Input
                                value={l.mpu}
                                onChange={(e) => mudar(l.chave, "mpu", e.target.value)}
                                className="w-16 font-mono"
                                inputMode="decimal"
                                disabled={!gere || l.medida === "fixo"}
                                title={unidadeDaMedida(l.medida) ? `minutos por ${unidadeDaMedida(l.medida)}` : undefined}
                              />
                            </td>
                          )}
                          {c.fixos && (
                            <td className="py-1.5 pr-2">
                              <Input value={l.fixos} onChange={(e) => mudar(l.chave, "fixos", e.target.value)} className="w-16 font-mono" inputMode="numeric" disabled={!gere} />
                            </td>
                          )}
                          {c.pessoas && (
                            <td className="py-1.5 pr-2">
                              <Input value={l.pessoas} onChange={(e) => mudar(l.chave, "pessoas", e.target.value)} className="w-12 font-mono" inputMode="numeric" disabled={!gere} />
                            </td>
                          )}
                          {c.skill && (
                            <td className="py-1.5 pr-2">
                              <Select value={l.skill} onChange={(e) => mudar(l.chave, "skill", e.target.value)} className="w-36" disabled={!gere}>
                                <option value="">—</option>
                                {skills.map((k) => (
                                  <option key={k.id} value={k.id}>
                                    {k.nome}
                                  </option>
                                ))}
                              </Select>
                            </td>
                          )}
                          {c.depende && (
                            <td className="py-1.5 pr-2">
                              <Select
                                value={l.dependeDe ?? ""}
                                onChange={(e) => mudar(l.chave, "dependeDe", e.target.value || null)}
                                className={cx("w-40", paiDepois && "border-amber-300")}
                                disabled={!gere}
                                aria-label="Depois de"
                              >
                                <option value="">—</option>
                                {linhas.map((o) =>
                                  o.chave === l.chave ? null : (
                                    <option key={o.chave} value={o.chave}>
                                      {rotuloLinha(o)}
                                    </option>
                                  )
                                )}
                              </Select>
                              {l.dependeChaves.length > 0 && (
                                <p className="mt-0.5 font-mono text-xs text-slate-500" title="Depois destes passos (pelo código)">
                                  + {l.dependeChaves.join(", ")}
                                </p>
                              )}
                            </td>
                          )}
                          {c.espera && (
                            <td className="py-1.5 pr-2">
                              <Input
                                value={l.espera}
                                onChange={(e) => mudar(l.chave, "espera", e.target.value)}
                                className="w-16 font-mono"
                                inputMode="decimal"
                                disabled={!gere}
                                title={num(l.espera) > 0 ? formatarEspera(num(l.espera)) : "sem espera"}
                              />
                            </td>
                          )}
                          {c.tempo && (
                            <td className="py-1.5 pr-2 text-right font-mono text-xs tabular">
                              <span className="block pt-2 text-slate-700">{formatarMinutos(Math.round(minLinha))}</span>
                              {pess > 1 && (
                                <span className="block text-slate-400" title="Duração com as pessoas a trabalhar em paralelo">
                                  ≈ {formatarMinutos(Math.round(minLinha / pess))} com {pess}
                                </span>
                              )}
                            </td>
                          )}
                          {c.aprendido && (
                            <td className="py-1.5 pr-2 text-xs">
                              {r ? (
                                <span
                                  className={cx(
                                    "block pt-2 font-mono",
                                    r.minutos_por_unidade > num(l.mpu) * 1.15
                                      ? "text-red-600"
                                      : r.minutos_por_unidade < num(l.mpu) * 0.85
                                        ? "text-emerald-700"
                                        : "text-slate-600"
                                  )}
                                  title={`${r.n} ${r.n === 1 ? "tarefa validada" : "tarefas validadas"} · padrão ${r.padrao_por_unidade} min/un`}
                                >
                                  {String(r.minutos_por_unidade).replace(".", ",")}/un · {r.n}×
                                </span>
                              ) : (
                                <span className="block pt-2 text-slate-300">—</span>
                              )}
                            </td>
                          )}
                          <td className="py-1.5">
                            {gere && (
                              <span className="flex items-center gap-0.5 pt-1">
                                <BotaoIcone
                                  rotulo="Subir"
                                  disabled={fase === 1 && gi === 0}
                                  onClick={() => (gi > 0 ? mover(l.chave, fase, gi - 1) : mover(l.chave, Math.max(1, fase - 1), Infinity))}
                                >
                                  <ArrowUp width={12} height={12} />
                                </BotaoIcone>
                                <BotaoIcone
                                  rotulo="Descer"
                                  disabled={fase === FASES_POR_DEFEITO.length && gi === doGrupo.length - 1}
                                  onClick={() =>
                                    gi < doGrupo.length - 1
                                      ? mover(l.chave, fase, gi + 2)
                                      : mover(l.chave, Math.min(FASES_POR_DEFEITO.length, fase + 1), 0)
                                  }
                                >
                                  <ArrowDown width={12} height={12} />
                                </BotaoIcone>
                                <BotaoIcone rotulo="Duplicar passo" onClick={() => duplicar(l.chave)}>
                                  <Copy width={12} height={12} />
                                </BotaoIcone>
                                <BotaoIcone rotulo="Remover passo" perigo onClick={() => remover(l.chave)}>
                                  <X width={13} height={13} />
                                </BotaoIcone>
                              </span>
                            )}
                          </td>
                        </tr>
                        {aberto && (
                          <tr className="bg-brand-50/40">
                            <td />
                            <td colSpan={nColunas - 1} className="pb-3 pr-2">
                              <DetalhePasso
                                l={l}
                                fase={fase}
                                linhas={linhas}
                                servicos={servicos}
                                servicoId={servico.servico_id}
                                gere={gere}
                                nomeServico={nomeServico}
                                mudar={(campo, v) => mudar(l.chave, campo, v)}
                                aoMudarFase={(f) => mover(l.chave, f, Infinity)}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                {!fechada && arrasto.linhaAntes(String(fase), doGrupo.length) && <LinhaInsercao colunas={nColunas} />}
                {!fechada && doGrupo.length === 0 && (
                  <tr {...(gere ? arrasto.grupo(String(fase), 0) : {})}>
                    <td colSpan={nColunas} className="py-1">
                      <div
                        className={cx(
                          "rounded-lg border border-dashed px-3 py-2 text-center text-xs transition-colors",
                          arrasto.aArrastar ? "border-brand/50 bg-brand-50/50 text-brand-800" : "border-slate-200 text-slate-400"
                        )}
                      >
                        {arrasto.aArrastar ? "Larga aqui para levar o passo para esta fase" : "Sem passos nesta fase"}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            );
          })}
        </table>
      </div>

      {gere && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-brand" onClick={() => acrescentar(3)}>
            <Plus width={12} height={12} /> Passo
          </button>
          {linhas.some((l) => !l.passo) && (
            <button
              type="button"
              className="text-xs text-slate-500 underline-offset-2 hover:underline"
              onClick={gerarCodigos}
              title="Dá um código fase.n a cada passo sem código — é o que os extras usam para se encaixarem"
            >
              Dar código aos passos sem código
            </button>
          )}
          <span className="flex items-center gap-1 text-xs text-slate-500">
            Nova especialidade:
            <Input value={novaSkill} onChange={(e) => setNovaSkill(e.target.value)} placeholder="Ex.: Serralharia" className="w-36" />
            <Button size="sm" variant="secondary" onClick={() => void acrescentarSkill()} disabled={!novaSkill.trim()}>
              Criar
            </Button>
          </span>
        </div>
      )}

      {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      {gere && bloqueio && mexeu && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{bloqueio}</p>}

      {gere && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {mexeu && <span className="mr-auto text-xs text-slate-400">Alterações por gravar</span>}
          <Button variant="secondary" onClick={() => void sugerirDeNovo()}>
            Sugerir de novo
          </Button>
          <Button variant="secondary" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button onClick={() => void gravar()} disabled={aGravar || !!bloqueio}>
            {aGravar ? "A gravar…" : "Gravar modelo"}
          </Button>
        </div>
      )}
    </Card>
  );
}

function Indicador({ rotulo, valor, tom, dica }: { rotulo: string; valor: string; tom?: "ok" | "aviso"; dica?: string }) {
  return (
    <div className="rounded-lg bg-white px-2 py-1.5 ring-1 ring-inset ring-slate-200" title={dica}>
      <p className={cx("font-mono text-sm font-semibold tabular", tom === "aviso" ? "text-amber-700" : tom === "ok" ? "text-emerald-700" : "text-slate-800")}>
        {valor}
      </p>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{rotulo}</p>
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
      className={cx(
        "rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 disabled:opacity-30",
        perigo ? "hover:text-red-600" : "hover:text-slate-700"
      )}
    >
      {children}
    </button>
  );
}

function LinhaInsercao({ colunas }: { colunas: number }) {
  return (
    <tr aria-hidden>
      <td colSpan={colunas} className="p-0">
        <div className="relative h-0">
          <div className="absolute inset-x-0 -top-px h-0.5 rounded-full bg-brand shadow-[0_0_0_3px_rgba(124,58,237,0.15)]">
            <span className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-brand" />
          </div>
        </div>
      </td>
    </tr>
  );
}

/** Tudo o que um passo tem, para além das colunas: textos, códigos, condição, fatores, encaixe. */
function DetalhePasso({
  l,
  fase,
  linhas,
  servicos,
  servicoId,
  gere,
  nomeServico,
  mudar,
  aoMudarFase,
}: {
  l: Linha;
  fase: number;
  linhas: Linha[];
  servicos: ServicoComModelo[];
  servicoId: string;
  gere: boolean;
  nomeServico: (id: string) => string;
  mudar: <K extends keyof Linha>(campo: K, v: Linha[K]) => void;
  aoMudarFase: (f: number) => void;
}) {
  const outrosComCodigo = linhas.filter((o) => o.chave !== l.chave && o.passo);
  const condServicos = l.condicao?.servicos ?? [];
  const mudarCondicao = (servicosCond: string[]) => {
    const ficha = l.condicao?.ficha;
    const nova = servicosCond.length || ficha ? { ...(servicosCond.length ? { servicos: servicosCond } : {}), ...(ficha ? { ficha } : {}) } : null;
    mudar("condicao", nova);
    mudar("mexeuCondicao", true);
  };

  return (
    <div className="animate-in-fade grid gap-3 rounded-lg bg-white p-3 ring-1 ring-inset ring-slate-200 lg:grid-cols-[1.2fr_1fr]">
      <div className="space-y-2">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Como se faz</p>
        {(["procedimento", "materiais", "ferramentas"] as const).map((campo) => (
          <label key={campo} className="block">
            <span className="text-xs text-slate-500">{campo[0].toUpperCase() + campo.slice(1)}</span>
            <Textarea rows={campo === "procedimento" ? 3 : 2} value={l[campo]} onChange={(e) => mudar(campo, e.target.value)} className="w-full text-xs" disabled={!gere} />
          </label>
        ))}
      </div>

      <div className="space-y-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Planeamento</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-xs text-slate-500">Fase</span>
            <Select value={String(fase)} onChange={(e) => aoMudarFase(Number(e.target.value))} className="w-full" disabled={!gere}>
              {FASES_POR_DEFEITO.map((n, k) => (
                <option key={k} value={k + 1}>
                  {k + 1}. {n}
                </option>
              ))}
            </Select>
          </label>
          <label className="block">
            <span className="text-xs text-slate-500">Código do passo</span>
            <Input value={l.passo} onChange={(e) => mudar("passo", e.target.value.trim())} placeholder="ex.: 3.3" className="w-full font-mono" disabled={!gere} />
          </label>
        </div>

        <div>
          <span className="text-xs text-slate-500">Também depois de (pelo código)</span>
          {outrosComCodigo.length === 0 ? (
            <p className="text-xs text-slate-400">Nenhum outro passo tem código — dá códigos aos passos para os ligares assim.</p>
          ) : (
            <div className="mt-1 flex flex-wrap gap-1">
              {outrosComCodigo.map((o) => {
                const on = l.dependeChaves.includes(o.passo);
                return (
                  <button
                    key={o.chave}
                    type="button"
                    disabled={!gere}
                    onClick={() => mudar("dependeChaves", on ? l.dependeChaves.filter((x) => x !== o.passo) : [...l.dependeChaves, o.passo])}
                    className={cx(
                      "rounded-full px-2 py-0.5 text-xs ring-1 ring-inset transition-colors",
                      on ? "bg-brand text-white ring-brand" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                    )}
                    title={o.nome}
                  >
                    <span className="font-mono">{o.passo}</span> {o.nome.length > 18 ? `${o.nome.slice(0, 18)}…` : o.nome}
                  </button>
                );
              })}
              {l.dependeChaves
                .filter((k) => !outrosComCodigo.some((o) => o.passo === k))
                .map((k) => (
                  <span key={k} className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-500" title="Código que já não existe neste serviço">
                    {k}?
                  </span>
                ))}
            </div>
          )}
        </div>

        <div>
          <span className="text-xs text-slate-500">Fatores que mudam o ritmo (para aprender por caso)</span>
          <div className="mt-1 flex flex-wrap gap-1">
            {FATORES_CONHECIDOS.map((f) => {
              const on = l.fatores.includes(f);
              return (
                <button
                  key={f}
                  type="button"
                  disabled={!gere}
                  onClick={() => {
                    mudar("fatores", on ? l.fatores.filter((x) => x !== f) : [...l.fatores, f]);
                    mudar("mexeuFatores", true);
                  }}
                  className={cx(
                    "rounded-full px-2 py-0.5 text-xs ring-1 ring-inset transition-colors",
                    on ? "bg-slate-800 text-white ring-slate-800" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                  )}
                >
                  {rotuloDoFator(f)}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span className="text-xs text-slate-500">Só entra se o orçamento tiver…</span>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {condServicos.map((id) => (
              <span key={id} className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">
                {nomeServico(id)}
                {gere && (
                  <button type="button" onClick={() => mudarCondicao(condServicos.filter((x) => x !== id))} aria-label="Tirar da condição">
                    <X width={10} height={10} />
                  </button>
                )}
              </span>
            ))}
            {gere && (
              <Select
                value=""
                onChange={(e) => e.target.value && mudarCondicao([...condServicos, e.target.value])}
                className="w-48 py-1 text-xs"
                aria-label="Acrescentar serviço à condição"
              >
                <option value="">{condServicos.length ? "+ outro serviço" : "sempre (escolher serviço…)"}</option>
                {servicos
                  .filter((s) => s.servico_id !== servicoId && !condServicos.includes(s.servico_id))
                  .map((s) => (
                    <option key={s.servico_id} value={s.servico_id}>
                      {s.nome}
                    </option>
                  ))}
              </Select>
            )}
          </div>
          {l.condicao?.ficha && (
            <p className="mt-1 text-xs text-slate-500">
              ou se a ficha do local disser <strong>{l.condicao.ficha.campo}</strong> = {l.condicao.ficha.valores.join(" / ")}
            </p>
          )}
        </div>

        {l.encaixe && (
          <div>
            <span className="text-xs text-slate-500">Encaixe (extra dentro de um pacote)</span>
            <p className="text-xs text-sky-800">{descreverEncaixe(l.encaixe) || "livre"}</p>
          </div>
        )}
      </div>
    </div>
  );
}
