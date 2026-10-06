import { useCallback, useEffect, useState } from "react";
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
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Skeleton, Textarea, Toggle, cx } from "../components/ui";
import { ChevronLeft, Plus, X } from "../components/icons";
import { ObraModelo } from "../components/ObraIcones";
import { FASES_POR_DEFEITO, formatarMinutos, podePlanear } from "../domain/obras";
import ModelosServicos from "../components/ModelosServicos";

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
 */

interface Rascunho {
  id: string | null;
  nome: string;
  descricao: string;
  tipoServico: string;
  ativo: boolean;
  fases: {
    ordem: number;
    nome: string;
    tarefas: {
      id?: string;
      chave: string;
      nome: string;
      minutos: string;
      procedimento: string;
      materiais: string;
      ferramentas: string;
    }[];
  }[];
}

let seq = 0;
const chave = () => `n${++seq}`;

function paraRascunho(m: ModeloObra | null): Rascunho {
  if (!m) {
    return {
      id: null,
      nome: "",
      descricao: "",
      tipoServico: "",
      ativo: true,
      fases: FASES_POR_DEFEITO.map((nome, i) => ({ ordem: i + 1, nome, tarefas: [] })),
    };
  }
  return {
    id: m.id,
    nome: m.nome,
    descricao: m.descricao ?? "",
    tipoServico: m.tipo_servico ?? "",
    ativo: m.ativo,
    fases: m.fases.map((f) => ({
      ordem: f.ordem,
      nome: f.nome,
      tarefas: f.tarefas.map((t) => ({
        id: t.id,
        chave: t.id,
        nome: t.nome,
        minutos: String(t.minutos_previstos),
        procedimento: t.procedimento ?? "",
        materiais: t.materiais ?? "",
        ferramentas: t.ferramentas ?? "",
      })),
    })),
  };
}

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
      const fases: FaseParaGravar[] = rascunho.fases.map((f) => ({
        ordem: f.ordem,
        nome: f.nome,
        tarefas: f.tarefas.map((t) => ({
          id: t.id,
          nome: t.nome,
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

  const mudarFase = (i: number, fn: (f: Rascunho["fases"][number]) => Rascunho["fases"][number]) =>
    setRascunho((r) => (r ? { ...r, fases: r.fases.map((f, k) => (k === i ? fn(f) : f)) } : r));

  if (aCarregar) return <Skeleton className="h-64 w-full rounded-xl" />;
  if (erro) return <ErrorState message={erro} onRetry={() => setRecarga((r) => r + 1)} />;

  const temExemplo = modelos.some((m) => m.nome === "Remodelação casa de banho");

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
            className={cx("rounded-md px-3 py-1.5", aba === a ? "bg-white font-medium text-slate-800 shadow-sm" : "text-slate-500")}
          >
            {r}
          </button>
        ))}
      </div>

      {erroAcao && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erroAcao}</p>}

      {aba === "servicos" && activeOrgId ? (
        <ModelosServicos orgId={activeOrgId} gere={gere} />
      ) : rascunho ? (
        <Card className="space-y-4 p-4">
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <Field label="Nome">
              <Input value={rascunho.nome} onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })} className="w-full" />
            </Field>
            <Field label="Tipo de serviço">
              <Input
                value={rascunho.tipoServico}
                onChange={(e) => setRascunho({ ...rascunho, tipoServico: e.target.value })}
                placeholder="remodelacao, pintura…"
                className="w-full"
              />
            </Field>
          </div>
          <Field label="Descrição">
            <Textarea rows={2} value={rascunho.descricao} onChange={(e) => setRascunho({ ...rascunho, descricao: e.target.value })} className="w-full" />
          </Field>
          <Toggle checked={rascunho.ativo} onChange={(v) => setRascunho({ ...rascunho, ativo: v })} label="Ativo (aparece em Nova obra)" />

          {rascunho.fases.map((f, i) => {
            const total = f.tarefas.reduce((s, t) => s + (Number(t.minutos) || 0), 0);
            return (
              <div key={f.ordem} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-slate-400">{f.ordem}.</span>
                  <Input value={f.nome} onChange={(e) => mudarFase(i, (x) => ({ ...x, nome: e.target.value }))} className="flex-1 font-medium" />
                  <span className="shrink-0 font-mono text-xs tabular text-slate-500" title="Duração da fase = soma das tarefas">
                    {formatarMinutos(total)}
                  </span>
                </div>
                <div className="mt-2 space-y-2">
                  {f.tarefas.map((t, j) => (
                    <div key={t.chave} className="rounded-md bg-slate-50 p-2">
                      <div className="flex items-center gap-2">
                        <Input
                          value={t.nome}
                          placeholder="Tarefa"
                          onChange={(e) =>
                            mudarFase(i, (x) => ({
                              ...x,
                              tarefas: x.tarefas.map((y, k) => (k === j ? { ...y, nome: e.target.value } : y)),
                            }))
                          }
                          className="min-w-0 flex-1"
                        />
                        <Input
                          type="number"
                          min={1}
                          value={t.minutos}
                          onChange={(e) =>
                            mudarFase(i, (x) => ({
                              ...x,
                              tarefas: x.tarefas.map((y, k) => (k === j ? { ...y, minutos: e.target.value } : y)),
                            }))
                          }
                          className="w-20"
                          aria-label="Minutos previstos"
                        />
                        <span className="text-xs text-slate-400">min</span>
                        <button
                          type="button"
                          className="rounded p-1 text-slate-400 hover:bg-white hover:text-red-600"
                          onClick={() => mudarFase(i, (x) => ({ ...x, tarefas: x.tarefas.filter((_, k) => k !== j) }))}
                          aria-label="Remover tarefa"
                        >
                          <X width={14} height={14} />
                        </button>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-3">
                        {(["procedimento", "materiais", "ferramentas"] as const).map((campo) => (
                          <Textarea
                            key={campo}
                            rows={2}
                            placeholder={campo[0].toUpperCase() + campo.slice(1)}
                            value={t[campo]}
                            onChange={(e) =>
                              mudarFase(i, (x) => ({
                                ...x,
                                tarefas: x.tarefas.map((y, k) => (k === j ? { ...y, [campo]: e.target.value } : y)),
                              }))
                            }
                            className="w-full text-xs"
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-xs font-medium text-brand"
                    onClick={() =>
                      mudarFase(i, (x) => ({
                        ...x,
                        tarefas: [
                          ...x.tarefas,
                          { chave: chave(), nome: "", minutos: "60", procedimento: "", materiais: "", ferramentas: "" },
                        ],
                      }))
                    }
                  >
                    <Plus width={12} height={12} /> Tarefa
                  </button>
                </div>
              </div>
            );
          })}

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRascunho(null)}>
              Cancelar
            </Button>
            <Button onClick={() => void gravar()} disabled={aGravar || !rascunho.nome.trim()}>
              {aGravar ? "A gravar…" : "Gravar modelo"}
            </Button>
          </div>
        </Card>
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
          {modelos.map((m) => {
            const total = m.fases.reduce((s, f) => s + f.tarefas.reduce((x, t) => x + t.minutos_previstos, 0), 0);
            const nTarefas = m.fases.reduce((s, f) => s + f.tarefas.length, 0);
            return (
              <Card key={m.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setAberta(aberta === m.id ? null : m.id)}>
                    <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      {m.nome}
                      {m.por_defeito && <Badge className="bg-brand-50 text-brand-800 ring-brand-200">por defeito</Badge>}
                      {!m.ativo && <Badge>inativo</Badge>}
                    </p>
                    <p className="text-xs text-slate-500">
                      {m.fases.length} fases · {nTarefas} tarefas · {formatarMinutos(total)} ({Math.ceil(total / 480)} dias úteis a 8 h)
                    </p>
                    {m.descricao && <p className="mt-1 text-xs text-slate-400">{m.descricao}</p>}
                  </button>
                  {gere && (
                    <div className="flex gap-2">
                      {!m.por_defeito && (
                        <Button size="sm" variant="secondary" onClick={() => void porDefeito(m.id)}>
                          Tornar por defeito
                        </Button>
                      )}
                      <Button size="sm" variant="secondary" onClick={() => setRascunho(paraRascunho(m))}>
                        Editar
                      </Button>
                    </div>
                  )}
                </div>
                {aberta === m.id && (
                  <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                    {m.fases.map((f) => (
                      <div key={f.id}>
                        <p className="flex justify-between text-xs font-semibold text-slate-700">
                          <span>
                            {f.ordem}. {f.nome}
                          </span>
                          <span className="font-mono tabular text-slate-500">
                            {formatarMinutos(f.tarefas.reduce((s, t) => s + t.minutos_previstos, 0))}
                          </span>
                        </p>
                        <ul className="mt-0.5 space-y-0.5">
                          {f.tarefas.map((t) => (
                            <li key={t.id} className={cx("flex justify-between gap-2 pl-3 text-xs text-slate-600")}>
                              <span className="truncate">{t.nome}</span>
                              <span className="shrink-0 font-mono tabular text-slate-400">{t.minutos_previstos} min</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
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
