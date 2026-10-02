import { useCallback, useEffect, useMemo, useState } from "react";
import { ErroDeEscrita } from "../lib/dados";
import {
  criarSkill,
  gravarModeloServico,
  listarServicosComModelo,
  listarSkills,
  sugerirModelos,
  type ServicoComModelo,
  type Skill,
  type TarefaServico,
} from "../lib/obras";
import { Badge, Button, Card, EmptyState, ErrorState, Input, Select, Skeleton, Textarea, cx } from "./ui";
import { Plus, X } from "./icons";
import { ObraModelo } from "./ObraIcones";
import { FASES_POR_DEFEITO, formatarMinutos } from "../domain/obras";

/**
 * Modelos por serviço: como se executa cada serviço do catálogo do CRM.
 *
 * Ao criar uma obra a partir de um contrato, cada linha vendida expande-se
 * nestes passos (tempo × quantidade), com dependências, pessoas e
 * especialidade. Um serviço sem modelo gera uma tarefa só, pela ficha
 * técnica. "Gerar sugestões" preenche os que faltam a partir de uma
 * biblioteca de valores razoáveis — depois afina-se aqui.
 */

type Filtro = "todos" | "sem" | "sugeridos" | "editados";

interface Linha {
  chave: string;
  nome: string;
  fase: string;
  mpu: string;
  fixos: string;
  pessoas: string;
  skill: string;
  depende: string;
  procedimento: string;
  materiais: string;
  ferramentas: string;
}

let seq = 0;
const nova = (): Linha => ({
  chave: `l${++seq}`,
  nome: "",
  fase: "3",
  mpu: "30",
  fixos: "0",
  pessoas: "1",
  skill: "",
  depende: "",
  procedimento: "",
  materiais: "",
  ferramentas: "",
});

const paraLinhas = (t: TarefaServico[]): Linha[] =>
  t.map((x) => ({
    chave: `l${++seq}`,
    nome: x.nome,
    fase: String(x.fase),
    mpu: String(x.minutos_por_unidade),
    fixos: String(x.minutos_fixos),
    pessoas: String(x.pessoas),
    skill: x.skill_id ?? "",
    depende: x.depende_ordem ? String(x.depende_ordem) : "",
    procedimento: x.procedimento ?? "",
    materiais: x.materiais ?? "",
    ferramentas: x.ferramentas ?? "",
  }));

const num = (s: string) => Number(String(s).replace(",", ".")) || 0;

/** Minutos (pessoa × tempo) de um serviço para `qt` unidades. */
export function minutosDoModelo(t: { minutos_por_unidade: number; minutos_fixos: number }[], qt: number): number {
  return Math.round(t.reduce((s, x) => s + x.minutos_fixos + x.minutos_por_unidade * qt, 0));
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

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const [s, k] = await Promise.all([listarServicosComModelo(orgId), listarSkills(orgId)]);
      setServicos(s);
      setSkills(k);
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

  if (aCarregar) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (erro) return <ErrorState message={erro} onRetry={() => setRecarga((x) => x + 1)} />;

  const semModelo = servicos.filter((s) => s.tarefas.length === 0).length;
  const contagem: Record<Filtro, number> = {
    todos: servicos.length,
    sem: semModelo,
    sugeridos: servicos.filter((s) => s.tarefas.length > 0 && !s.editado).length,
    editados: servicos.filter((s) => s.editado).length,
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-500">
          Como se executa cada serviço vendido. A obra criada a partir de um contrato junta estes passos, com o tempo ×
          quantidade.
        </p>
        {gere && semModelo > 0 && (
          <Button size="sm" onClick={() => void gerar()} disabled={aGerar}>
            {aGerar ? "A gerar…" : `Gerar sugestões para ${semModelo} sem modelo`}
          </Button>
        )}
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
        <div className="space-y-2">
          {visiveis.map((s) =>
            aberto === s.servico_id ? (
              <EditorServico
                key={s.servico_id}
                orgId={orgId}
                servico={s}
                skills={skills}
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
  return (
    <button
      type="button"
      onClick={aoAbrir}
      className="flex w-full items-start justify-between gap-3 rounded-xl bg-white px-4 py-3 text-left ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-slate-800">{s.nome}</span>
        <span className="block truncate text-xs text-slate-500">
          {[s.categoria, s.sku, ficha(s)].filter(Boolean).join(" · ")}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {s.tarefas.length === 0 ? (
          <Badge className="bg-amber-50 text-amber-800 ring-amber-200">sem modelo</Badge>
        ) : (
          <>
            <span className="font-mono text-xs tabular text-slate-500">
              {s.tarefas.length} passos · {formatarMinutos(porUnidade)}/un
            </span>
            {s.editado ? (
              <Badge className="bg-brand-50 text-brand-800 ring-brand-200">revisto</Badge>
            ) : (
              <Badge>sugerido</Badge>
            )}
          </>
        )}
      </span>
    </button>
  );
}

function EditorServico({
  orgId,
  servico,
  skills,
  gere,
  aoFechar,
  aoGravar,
  aoCriarSkill,
}: {
  orgId: string;
  servico: ServicoComModelo;
  skills: Skill[];
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

  const mudar = (i: number, campo: keyof Linha, v: string) =>
    setLinhas((ls) => ls.map((l, k) => (k === i ? { ...l, [campo]: v } : l)));

  const remover = (i: number) =>
    setLinhas((ls) =>
      ls
        .filter((_, k) => k !== i)
        // As dependências apontam para posições: corrigir as que mudam.
        .map((l) => {
          const d = Number(l.depende);
          if (!d) return l;
          if (d === i + 1) return { ...l, depende: "" };
          return d > i + 1 ? { ...l, depende: String(d - 1) } : l;
        })
    );

  const tarefas: TarefaServico[] = linhas.map((l) => ({
    nome: l.nome.trim(),
    fase: Number(l.fase),
    minutos_por_unidade: num(l.mpu),
    minutos_fixos: Math.round(num(l.fixos)),
    pessoas: Math.max(1, Math.round(num(l.pessoas))),
    skill_id: l.skill || null,
    depende_ordem: l.depende ? Number(l.depende) : null,
    procedimento: l.procedimento.trim() || null,
    materiais: l.materiais.trim() || null,
    ferramentas: l.ferramentas.trim() || null,
  }));
  const total = minutosDoModelo(tarefas, num(qt));

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

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">{servico.nome}</p>
          <p className="text-xs text-slate-500">{[servico.categoria, servico.sku, ficha(servico)].filter(Boolean).join(" · ")}</p>
        </div>
        <button type="button" onClick={aoFechar} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Fechar">
          <X width={16} height={16} />
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="w-6 py-1 font-normal">#</th>
              <th className="py-1 font-normal">Passo</th>
              <th className="py-1 font-normal">Fase</th>
              <th className="py-1 font-normal" title="Minutos de trabalho (pessoa × tempo) por unidade vendida">
                min/un
              </th>
              <th className="py-1 font-normal" title="Minutos fixos, seja qual for a quantidade">
                + fixos
              </th>
              <th className="py-1 font-normal">Pessoas</th>
              <th className="py-1 font-normal">Especialidade</th>
              <th className="py-1 font-normal">Depois de</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {linhas.map((l, i) => (
              <tr key={l.chave} className="align-top">
                <td className="py-1 pr-1 font-mono text-xs text-slate-400">{i + 1}</td>
                <td className="py-1 pr-2">
                  <Input value={l.nome} onChange={(e) => mudar(i, "nome", e.target.value)} placeholder="Ex.: Abrir roços" className="w-full" disabled={!gere} />
                  <button
                    type="button"
                    className="mt-0.5 text-xs text-slate-500 underline-offset-2 hover:underline"
                    onClick={() => setDetalhe(detalhe === l.chave ? null : l.chave)}
                  >
                    {detalhe === l.chave ? "esconder" : "procedimento, materiais, ferramentas"}
                  </button>
                  {detalhe === l.chave && (
                    <div className="mt-1 grid gap-1">
                      {(["procedimento", "materiais", "ferramentas"] as const).map((c) => (
                        <Textarea
                          key={c}
                          rows={2}
                          value={l[c]}
                          onChange={(e) => mudar(i, c, e.target.value)}
                          placeholder={c[0].toUpperCase() + c.slice(1)}
                          className="w-full text-xs"
                          disabled={!gere}
                        />
                      ))}
                    </div>
                  )}
                </td>
                <td className="py-1 pr-2">
                  <Select value={l.fase} onChange={(e) => mudar(i, "fase", e.target.value)} className="w-40" disabled={!gere}>
                    {FASES_POR_DEFEITO.map((n, k) => (
                      <option key={k} value={k + 1}>
                        {k + 1}. {n}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="py-1 pr-2">
                  <Input value={l.mpu} onChange={(e) => mudar(i, "mpu", e.target.value)} className="w-16 font-mono" inputMode="decimal" disabled={!gere} />
                </td>
                <td className="py-1 pr-2">
                  <Input value={l.fixos} onChange={(e) => mudar(i, "fixos", e.target.value)} className="w-16 font-mono" inputMode="numeric" disabled={!gere} />
                </td>
                <td className="py-1 pr-2">
                  <Input value={l.pessoas} onChange={(e) => mudar(i, "pessoas", e.target.value)} className="w-12 font-mono" inputMode="numeric" disabled={!gere} />
                </td>
                <td className="py-1 pr-2">
                  <Select value={l.skill} onChange={(e) => mudar(i, "skill", e.target.value)} className="w-36" disabled={!gere}>
                    <option value="">—</option>
                    {skills.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.nome}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="py-1 pr-2">
                  <Select value={l.depende} onChange={(e) => mudar(i, "depende", e.target.value)} className="w-36" disabled={!gere}>
                    <option value="">—</option>
                    {linhas.map((o, k) =>
                      k === i ? null : (
                        <option key={o.chave} value={k + 1}>
                          {k + 1}. {o.nome || "(sem nome)"}
                        </option>
                      )
                    )}
                  </Select>
                </td>
                <td className="py-1">
                  {gere && (
                    <button
                      type="button"
                      onClick={() => remover(i)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-50 hover:text-red-600"
                      aria-label="Remover passo"
                    >
                      <X width={14} height={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {gere && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-brand" onClick={() => setLinhas((ls) => [...ls, nova()])}>
            <Plus width={12} height={12} /> Passo
          </button>
          <span className="flex items-center gap-1 text-xs text-slate-500">
            Nova especialidade:
            <Input value={novaSkill} onChange={(e) => setNovaSkill(e.target.value)} placeholder="Ex.: Serralharia" className="w-36" />
            <Button size="sm" variant="secondary" onClick={() => void acrescentarSkill()} disabled={!novaSkill.trim()}>
              Criar
            </Button>
          </span>
        </div>
      )}

      <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        Para
        <Input value={qt} onChange={(e) => setQt(e.target.value)} className="w-16 font-mono" inputMode="decimal" aria-label="Quantidade de exemplo" />
        unidades: <strong className="font-mono text-slate-700">{formatarMinutos(total)}</strong> de trabalho (pessoa × tempo),
        em {linhas.length} passo{linhas.length === 1 ? "" : "s"}.
      </p>

      {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}

      {gere && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => void sugerirDeNovo()}>
            Sugerir de novo
          </Button>
          <Button variant="secondary" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button onClick={() => void gravar()} disabled={aGravar || linhas.some((l) => !l.nome.trim())}>
            {aGravar ? "A gravar…" : "Gravar modelo"}
          </Button>
        </div>
      )}
    </Card>
  );
}
