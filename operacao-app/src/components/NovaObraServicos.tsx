import { useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { MateriaisStock } from "./MateriaisStock";
import type { MembroEquipa } from "../lib/dados";
import {
  estadoDoStock,
  ligarMaterial,
  minutosDoServico,
  minutosTotais,
  mudarMinutos,
  mudarTarefa,
  necessidadesDeMateriais,
  novaTarefa,
  removerTarefa,
  todasAsTarefas,
  type MaterialLigado,
  type PrevisaoContrato,
  type ProdutoStock,
  type ServicoEditavel,
  type TarefaEditavel,
} from "../domain/novaObra";
import { formatarMinutos } from "../domain/obras";
import { descreverFatores, formatarEspera, rotuloOrigem, unidadeDaMedida } from "../domain/planeamento";
import { data as formatarData } from "../lib/formatar";
import { Badge, Button, IconButton, Input, Select, Skeleton, Textarea, cx } from "./ui";
import { AlertTriangle, ChevronDown, ChevronRight, Plus, Search, X } from "./icons";

/**
 * Nova obra, passo 2 — "Serviços do contrato". Uma secção por serviço
 * vendido, com as tarefas sugeridas automaticamente (do modelo do serviço,
 * ou da biblioteca), cada uma editável: nome, fase, minutos (já × qt),
 * pessoas, técnicos (só aparecem os livres nesses dias), "depois de",
 * materiais (da ficha, do contrato ou do stock, com o disponível).
 */

export interface StockCarregado {
  com_inventario: boolean;
  produtos: Map<string, ProdutoStock>;
}

const NOMES_FASE = ["", "Preparação e demolições", "Instalações técnicas", "Acabamentos", "Limpeza e entrega"];
const nomeFase = (f: number) => NOMES_FASE[f] ?? `Fase ${f}`;
const qtd = (x: number | null | undefined) =>
  x == null ? "—" : Number.isInteger(x) ? String(x) : x.toLocaleString("pt-PT", { maximumFractionDigits: 2 });

export function NovaObraServicos({
  previsao,
  erro,
  servicos,
  aoMudar,
  equipa,
  stock,
  pesquisarStock,
  aRecalcular,
  aoRecalcular,
}: {
  previsao: PrevisaoContrato | null;
  erro: string | null;
  servicos: ServicoEditavel[];
  aoMudar: (s: ServicoEditavel[]) => void;
  equipa: MembroEquipa[];
  stock: StockCarregado | null;
  pesquisarStock: (texto: string) => Promise<ProdutoStock[]>;
  aRecalcular: boolean;
  aoRecalcular: () => void;
}) {
  // Quem pode fazer as tarefas: técnicos e operadores (senão, toda a gente) —
  // a mesma regra da distribuição automática.
  const executores = useMemo(() => {
    const t = equipa.filter((m) => m.funcao === "tecnico" || m.funcao === "operador");
    return t.length ? t : equipa;
  }, [equipa]);
  const nomes = useMemo(() => new Map(equipa.map((m) => [m.utilizador_id, m.nome])), [equipa]);
  const tarefas = useMemo(() => todasAsTarefas(servicos), [servicos]);
  const necessidades = useMemo(() => necessidadesDeMateriais(servicos), [servicos]);
  const totalPorProduto = useMemo(() => new Map(necessidades.map((x) => [x.produto_id, x.quantidade])), [necessidades]);

  if (erro) return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>;
  if (!previsao) {
    return (
      <div className="space-y-2" aria-label="A preparar os serviços">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }
  if (servicos.length === 0) {
    return (
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
        Este contrato não tem serviços (só produtos ou linhas soltas). A obra nasce só com as tarefas do tipo de obra —
        acrescenta as outras depois, no mapa.
      </p>
    );
  }

  const mudar = (chave: string, f: (t: TarefaEditavel) => TarefaEditavel) => aoMudar(mudarTarefa(servicos, chave, f));
  const total = minutosTotais(servicos);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-inset ring-slate-200">
        <p className="text-sm text-slate-700">
          <b>{servicos.length}</b> serviço{servicos.length === 1 ? "" : "s"} · <b>{tarefas.length}</b> tarefa
          {tarefas.length === 1 ? "" : "s"} · <b className="font-mono tabular">{formatarMinutos(total)}</b> previstos
          {previsao.outras.length > 0 && (
            <span className="text-slate-500">
              {" "}
              + {previsao.outras.length} do tipo de obra (equipa e ligações automáticas)
            </span>
          )}
        </p>
        <Button variant="secondary" size="sm" onClick={aoRecalcular} disabled={aRecalcular}>
          {aRecalcular ? "A recalcular…" : "Recalcular datas e equipa"}
        </Button>
      </div>

      {servicos.map((s) => (
        <section key={s.linha_id} className="rounded-xl ring-1 ring-slate-200" aria-label={s.nome}>
          <header className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-800">{s.nome}</p>
              <p className="text-xs text-slate-500">
                {qtd(s.quantidade)} {s.unidade ?? "un"} · {s.tarefas.length} tarefa{s.tarefas.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {s.sugerido ? (
                <Badge className="bg-brand-50 text-brand-800">sugestão automática</Badge>
              ) : s.com_modelo ? (
                <Badge className="bg-slate-100 text-slate-600">do modelo</Badge>
              ) : null}
              {s.sem_ficha && <Badge className="bg-amber-50 text-amber-800">sem horas na ficha</Badge>}
              <span className="font-mono text-xs font-medium tabular text-slate-700">{formatarMinutos(minutosDoServico(s))}</span>
            </div>
          </header>
          <div className="divide-y divide-slate-100">
            {s.tarefas.map((t) => (
              <LinhaTarefa
                key={t.chave}
                t={t}
                servico={s}
                outras={tarefas.filter((x) => x.chave !== t.chave)}
                executores={executores}
                nomes={nomes}
                stock={stock}
                totalPorProduto={totalPorProduto}
                produtosContrato={previsao.produtos}
                pesquisarStock={pesquisarStock}
                aoMudar={(f) => mudar(t.chave, f)}
                aoRemover={() => aoMudar(removerTarefa(servicos, t.chave))}
              />
            ))}
          </div>
          <div className="px-3 py-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                aoMudar(servicos.map((x) => (x.linha_id === s.linha_id ? { ...x, tarefas: [...x.tarefas, novaTarefa(x)] } : x)))
              }
            >
              <Plus width={13} height={13} /> Acrescentar tarefa
            </Button>
          </div>
        </section>
      ))}

      <ResumoMateriais necessidades={necessidades} stock={stock} />
    </div>
  );
}

/* ───────────────────────────── Uma tarefa ───────────────────────────── */

function LinhaTarefa({
  t,
  servico,
  outras,
  executores,
  nomes,
  stock,
  totalPorProduto,
  produtosContrato,
  pesquisarStock,
  aoMudar,
  aoRemover,
}: {
  t: TarefaEditavel;
  servico: ServicoEditavel;
  outras: TarefaEditavel[];
  executores: MembroEquipa[];
  nomes: Map<string, string>;
  stock: StockCarregado | null;
  totalPorProduto: Map<string, number>;
  produtosContrato: PrevisaoContrato["produtos"];
  pesquisarStock: (texto: string) => Promise<ProdutoStock[]>;
  aoMudar: (f: (t: TarefaEditavel) => TarefaEditavel) => void;
  aoRemover: () => void;
}) {
  const [aberta, setAberta] = useState(false);
  const { activeOrgId } = useAuth();
  const livres = t.livres ? new Set(t.livres) : null;
  const motivos = new Map(t.ocupados.map((o) => [o.utilizador_id, o.motivo]));
  // Só se escolhem as pessoas LIVRES nesses dias. As outras aparecem
  // desativadas, com o motivo ("indisponível: ausência: Férias").
  const escolhiveis = executores.filter((m) => !t.pessoas.includes(m.utilizador_id) && (!livres || livres.has(m.utilizador_id)));
  const indisponiveis = livres
    ? executores.filter((m) => !t.pessoas.includes(m.utilizador_id) && !livres.has(m.utilizador_id))
    : [];

  return (
    <div className="space-y-2 px-3 py-2.5">
      <div className="grid grid-cols-[1fr_auto] items-start gap-2 sm:grid-cols-[1fr_9rem_5.5rem_4.5rem_auto]">
        <Input
          aria-label="Nome da tarefa"
          value={t.nome}
          onChange={(e) => aoMudar((x) => ({ ...x, nome: e.target.value }))}
          className="col-span-1 py-1.5"
        />
        <IconButton label="Tirar a tarefa" onClick={aoRemover} className="sm:order-last">
          <X width={14} height={14} />
        </IconButton>
        <Select
          aria-label="Fase"
          value={t.fase}
          onChange={(e) => aoMudar((x) => ({ ...x, fase: Number(e.target.value) }))}
          className="py-1.5 text-xs"
        >
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((f) => (
            <option key={f} value={f}>
              {f}. {nomeFase(f)}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-1 text-xs text-slate-500">
          <Input
            aria-label="Minutos previstos"
            type="number"
            min={1}
            value={Number.isFinite(t.minutos) ? t.minutos : ""}
            onChange={(e) => aoMudar((x) => mudarMinutos(x, Number(e.target.value)))}
            className="py-1.5 text-right font-mono"
          />
          min
        </label>
        <label className="flex items-center gap-1 text-xs text-slate-500" title="Pessoas previstas">
          <Input
            aria-label="Pessoas previstas"
            type="number"
            min={1}
            max={20}
            value={t.pessoas_previstas}
            onChange={(e) => aoMudar((x) => ({ ...x, pessoas_previstas: Math.max(1, Number(e.target.value) || 1) }))}
            className="py-1.5 text-right font-mono"
          />
          p.
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-slate-400">
          {t.inicio ? `${formatarData(t.inicio)}${t.fim && t.fim !== t.inicio ? " → " + formatarData(t.fim) : ""}` : "datas ao recalcular"}
          {" · "}
          {formatarMinutos(t.minutos)}
          {t.skill_nome && ` · ${t.skill_nome}`}
        </span>
        {/* Planeamento automático: de onde veio o tempo, a medida, a espera. */}
        {t.minutos_origem && (
          <span title={t.fatores_chave ? `Para: ${descreverFatores(t.fatores_chave)}` : undefined}>
            <Badge
              className={
                t.minutos_origem === "aprendido"
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                  : t.minutos_origem === "manual"
                    ? "bg-amber-50 text-amber-800 ring-amber-200"
                    : undefined
              }
            >
              {rotuloOrigem(t.minutos_origem, t.ritmo_n)}
            </Badge>
          </span>
        )}
        {t.medida && t.medida !== "fixo" && t.medida !== "qt" && t.medida_qt != null && (
          <span className="text-slate-500" title="A medida que o tempo usou (da visita, ou a de referência do pacote)">
            {String(t.medida_qt).replace(".", ",")} {unidadeDaMedida(t.medida)}
          </span>
        )}
        {!!t.espera_antes_horas && (
          <span
            className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800 ring-1 ring-amber-200"
            title="Tempo corrido antes de começar (cura, secagem, fabrico): ninguém trabalha, mas o relógio conta"
          >
            espera {formatarEspera(t.espera_antes_horas)}
          </span>
        )}
        {!!t.minutos_juntos && (
          <span className="text-slate-500" title="Minutos de extras do orçamento juntos a este passo">
            inclui {formatarMinutos(t.minutos_juntos)} de extras
          </span>
        )}
        {t.pessoas.map((u) => {
          const ocupado = !!livres && !livres.has(u);
          return (
            <span
              key={u}
              className={cx(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
                ocupado ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200" : "bg-brand-50 text-brand-800"
              )}
              title={ocupado ? `Indisponível nesses dias: ${motivos.get(u) ?? "agenda cheia"}` : undefined}
            >
              {ocupado && <AlertTriangle width={11} height={11} />}
              {nomes.get(u) ?? "Pessoa"}
              {ocupado && <span className="opacity-80">· {motivos.get(u) ?? "indisponível"}</span>}
              <button
                type="button"
                aria-label={`Tirar ${nomes.get(u) ?? "pessoa"}`}
                className="text-current opacity-60 hover:opacity-100"
                onClick={() => aoMudar((x) => ({ ...x, pessoas: x.pessoas.filter((p) => p !== u), pessoas_manuais: true }))}
              >
                <X width={10} height={10} />
              </button>
            </span>
          );
        })}
        {t.pessoas.length === 0 && <span className="text-slate-400">equipa automática</span>}
        <Select
          aria-label="Acrescentar técnico"
          value=""
          onChange={(e) => {
            const u = e.target.value;
            if (u) aoMudar((x) => ({ ...x, pessoas: [...x.pessoas, u], pessoas_manuais: true }));
          }}
          className="py-0.5 text-xs"
        >
          <option value="">+ técnico</option>
          {escolhiveis.map((m) => (
            <option key={m.utilizador_id} value={m.utilizador_id}>
              {m.nome}
            </option>
          ))}
          {indisponiveis.map((m) => (
            <option key={m.utilizador_id} value={m.utilizador_id} disabled>
              {m.nome} — indisponível: {motivos.get(m.utilizador_id) ?? "agenda cheia"}
            </option>
          ))}
        </Select>
        {t.materiais_crm.length > 0 && (
          <span className="text-slate-500">· {t.materiais_crm.length} material(is)</span>
        )}
        <button
          type="button"
          className="ml-auto inline-flex items-center gap-0.5 text-slate-500 hover:text-slate-800"
          onClick={() => setAberta((a) => !a)}
          aria-expanded={aberta}
        >
          {aberta ? <ChevronDown width={13} height={13} /> : <ChevronRight width={13} height={13} />} Detalhes
        </button>
      </div>

      {aberta && (
        <div className="space-y-3 rounded-lg bg-slate-50 p-2.5">
          <DepoisDe t={t} outras={outras} aoMudar={aoMudar} />
          {activeOrgId ? (
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Materiais do stock</p>
              <MateriaisStock
                orgId={activeOrgId}
                servicoId={servico.servico_id}
                quantidadeServico={servico.quantidade ?? 1}
                // Só os ligados a um produto vão para o componente; os outros ficam como estão.
                valor={t.materiais_crm
                  .filter((m) => m.produto_id)
                  .map((m) => ({
                    produto_id: m.produto_id as string,
                    nome: m.nome,
                    quantidade: m.quantidade ?? 0,
                    unidade: m.unidade ?? null,
                    disponivel: m.disponivel ?? null,
                  }))}
                onChange={(lista) =>
                  aoMudar((x) => ({
                    ...x,
                    materiais_crm: [
                      ...x.materiais_crm.filter((y) => !y.produto_id),
                      ...lista.map((y) => ({
                        ...y,
                        origem: x.materiais_crm.find((z) => z.produto_id === y.produto_id)?.origem ?? ("stock" as const),
                      })),
                    ],
                  }))
                }
              />
            </div>
          ) : (
            <Materiais
              t={t}
              servico={servico}
              stock={stock}
              totalPorProduto={totalPorProduto}
              produtosContrato={produtosContrato}
              pesquisarStock={pesquisarStock}
              aoMudar={aoMudar}
            />
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block space-y-1 text-xs text-slate-600">
              Materiais (texto)
              <Textarea rows={2} value={t.materiais} onChange={(e) => aoMudar((x) => ({ ...x, materiais: e.target.value }))} />
            </label>
            <label className="block space-y-1 text-xs text-slate-600">
              Ferramentas
              <Textarea rows={2} value={t.ferramentas} onChange={(e) => aoMudar((x) => ({ ...x, ferramentas: e.target.value }))} />
            </label>
          </div>
          <label className="block space-y-1 text-xs text-slate-600">
            Procedimento
            <Textarea rows={2} value={t.procedimento} onChange={(e) => aoMudar((x) => ({ ...x, procedimento: e.target.value }))} />
          </label>
        </div>
      )}
    </div>
  );
}

/** "Depois de": várias tarefas da obra (as deste passo). */
function DepoisDe({
  t,
  outras,
  aoMudar,
}: {
  t: TarefaEditavel;
  outras: TarefaEditavel[];
  aoMudar: (f: (t: TarefaEditavel) => TarefaEditavel) => void;
}) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-xs font-medium text-slate-600">Depois de (começa quando estas acabarem)</legend>
      {outras.length === 0 ? (
        <p className="text-xs text-slate-400">Não há outras tarefas.</p>
      ) : (
        <div className="max-h-28 space-y-0.5 overflow-y-auto">
          {outras.map((o) => (
            <label key={o.chave} className="flex items-center gap-1.5 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={t.depende.includes(o.chave)}
                onChange={(e) =>
                  aoMudar((x) => ({
                    ...x,
                    depende: e.target.checked ? [...x.depende, o.chave] : x.depende.filter((d) => d !== o.chave),
                  }))
                }
              />
              <span className="truncate">{o.nome || "(sem nome)"}</span>
            </label>
          ))}
        </div>
      )}
      <p className="text-[11px] text-slate-400">
        Sem nada marcado, a tarefa corre em paralelo. As do tipo de obra (arranque, proteção, limpeza e entrega) ligam-se sozinhas.
      </p>
    </fieldset>
  );
}

/** Os materiais ligados à tarefa: da ficha, do contrato, ou do stock, com o disponível. */
function Materiais({
  t,
  servico,
  stock,
  totalPorProduto,
  produtosContrato,
  pesquisarStock,
  aoMudar,
}: {
  t: TarefaEditavel;
  servico: ServicoEditavel;
  stock: StockCarregado | null;
  totalPorProduto: Map<string, number>;
  produtosContrato: PrevisaoContrato["produtos"];
  pesquisarStock: (texto: string) => Promise<ProdutoStock[]>;
  aoMudar: (f: (t: TarefaEditavel) => TarefaEditavel) => void;
}) {
  const [pesquisa, setPesquisa] = useState("");
  const [resultados, setResultados] = useState<ProdutoStock[] | null>(null);
  const [aProcurar, setAProcurar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const ligados = new Set(t.materiais_crm.map((m) => m.produto_id).filter(Boolean));
  const sugestoes: MaterialLigado[] = [
    ...servico.materiais_ficha,
    ...produtosContrato.map((p) => ({ ...p, origem: "contrato" as const })),
  ].filter((m) => m.produto_id && !ligados.has(m.produto_id));

  const procurar = async () => {
    if (pesquisa.trim().length < 2) return;
    setAProcurar(true);
    setErro(null);
    try {
      setResultados(await pesquisarStock(pesquisa.trim()));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível pesquisar.");
    } finally {
      setAProcurar(false);
    }
  };

  const ligar = (m: MaterialLigado) => aoMudar((x) => ligarMaterial(x, m));

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-slate-600">Materiais ligados</p>
      {t.materiais_crm.length === 0 && <p className="text-xs text-slate-400">Nenhum.</p>}
      {t.materiais_crm.map((m, i) => {
        const s = m.produto_id ? stock?.produtos.get(m.produto_id) : undefined;
        const est = m.produto_id
          ? estadoDoStock(totalPorProduto.get(m.produto_id) ?? 0, s, !!stock?.com_inventario)
          : null;
        return (
          <div key={`${m.produto_id ?? m.nome}-${i}`} className="flex flex-wrap items-center gap-2 text-xs">
            <span className="min-w-0 flex-1 truncate text-slate-700">
              {m.nome}
              <span className="ml-1 text-slate-400">({m.origem === "ficha" ? "ficha" : m.origem === "contrato" ? "contrato" : "stock"})</span>
            </span>
            <Input
              aria-label={`Quantidade de ${m.nome}`}
              type="number"
              min={0}
              step="any"
              value={m.quantidade ?? ""}
              onChange={(e) =>
                aoMudar((x) => ({
                  ...x,
                  materiais_crm: x.materiais_crm.map((y, k) =>
                    k === i ? { ...y, quantidade: e.target.value === "" ? null : Number(e.target.value) } : y
                  ),
                }))
              }
              className="w-20 py-1 text-right font-mono text-xs"
            />
            <span className="w-8 text-slate-500">{m.unidade ?? s?.unidade ?? "un"}</span>
            {est && <EstadoStockTexto est={est} unidade={m.unidade ?? s?.unidade ?? "un"} />}
            <IconButton
              label={`Desligar ${m.nome}`}
              className="h-6 w-6"
              onClick={() => aoMudar((x) => ({ ...x, materiais_crm: x.materiais_crm.filter((_, k) => k !== i) }))}
            >
              <X width={11} height={11} />
            </IconButton>
          </div>
        );
      })}

      {sugestoes.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {sugestoes.map((m) => (
            <button
              key={`${m.origem}-${m.produto_id}`}
              type="button"
              onClick={() => ligar({ ...m })}
              className="rounded-full bg-white px-2 py-0.5 text-[11px] text-slate-600 ring-1 ring-slate-200 hover:bg-brand-50 hover:text-brand-800"
            >
              + {m.nome} × {qtd(m.quantidade)} <span className="text-slate-400">({m.origem})</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1.5">
        <Input
          aria-label="Procurar no stock"
          placeholder="Procurar no stock (nome ou SKU)…"
          value={pesquisa}
          onChange={(e) => setPesquisa(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void procurar();
            }
          }}
          className="py-1 text-xs"
        />
        <Button variant="secondary" size="sm" onClick={() => void procurar()} disabled={aProcurar || pesquisa.trim().length < 2}>
          <Search width={12} height={12} /> {aProcurar ? "…" : "Procurar"}
        </Button>
      </div>
      {erro && <p className="text-xs text-red-700">{erro}</p>}
      {resultados && (
        <ul className="max-h-36 space-y-0.5 overflow-y-auto rounded-lg bg-white p-1 ring-1 ring-slate-200">
          {resultados.length === 0 && <li className="px-2 py-1 text-xs text-slate-400">Nada encontrado.</li>}
          {resultados.map((p) => (
            <li key={p.produto_id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs hover:bg-slate-50"
                onClick={() => {
                  ligar({
                    produto_id: p.produto_id,
                    nome: p.nome,
                    quantidade: 1,
                    unidade: p.unidade,
                    disponivel: p.disponivel,
                    origem: "stock",
                  });
                  setResultados(null);
                  setPesquisa("");
                }}
              >
                <span className="min-w-0 truncate">
                  {p.nome}
                  {p.sku && <span className="ml-1 text-slate-400">{p.sku}</span>}
                </span>
                <span className={cx("shrink-0 font-mono", (p.disponivel ?? 0) > 0 ? "text-emerald-700" : "text-red-700")}>
                  {p.disponivel == null ? "sem stock registado" : `${qtd(p.disponivel)} ${p.unidade ?? "un"} disp.`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EstadoStockTexto({ est, unidade }: { est: ReturnType<typeof estadoDoStock>; unidade: string }) {
  if (est.tipo === "sem_inventario") return <span className="text-slate-400">sem inventário</span>;
  if (est.tipo === "sem_registo") return <span className="text-slate-400">sem stock registado</span>;
  if (est.tipo === "chega")
    return <span className="text-emerald-700">{qtd(est.disponivel)} {unidade} disp.</span>;
  return (
    <span className="inline-flex items-center gap-1 font-medium text-red-700">
      <AlertTriangle width={11} height={11} /> faltam {qtd(est.falta)} {unidade} — encomendar
    </span>
  );
}

/** O total de materiais da obra contra o stock disponível. */
function ResumoMateriais({
  necessidades,
  stock,
}: {
  necessidades: ReturnType<typeof necessidadesDeMateriais>;
  stock: StockCarregado | null;
}) {
  if (necessidades.length === 0) {
    return <p className="text-xs text-slate-400">Sem materiais do CRM ligados às tarefas.</p>;
  }
  const estados = necessidades.map((x) => ({
    x,
    s: stock?.produtos.get(x.produto_id),
    est: estadoDoStock(x.quantidade, stock?.produtos.get(x.produto_id), !!stock?.com_inventario),
  }));
  const emFalta = estados.filter((e) => e.est.tipo === "falta").length;
  return (
    <div className="space-y-1.5 rounded-lg p-3 ring-1 ring-inset ring-slate-200" aria-label="Materiais da obra">
      <p className="text-sm font-medium text-slate-700">
        Materiais da obra contra o stock
        {emFalta > 0 ? (
          <span className="ml-2 text-xs font-medium text-red-700">
            {emFalta} em falta — encomendar
          </span>
        ) : stock?.com_inventario ? (
          <span className="ml-2 text-xs text-emerald-700">o stock chega</span>
        ) : null}
      </p>
      <table className="w-full text-xs">
        <thead className="text-left text-slate-400">
          <tr>
            <th className="py-0.5 font-normal">Material</th>
            <th className="py-0.5 text-right font-normal">Preciso</th>
            <th className="py-0.5 text-right font-normal">Disponível</th>
            <th className="py-0.5 pl-2 font-normal">Estado</th>
          </tr>
        </thead>
        <tbody>
          {estados.map(({ x, s, est }) => {
            const un = x.unidade ?? s?.unidade ?? "un";
            return (
              <tr key={x.produto_id} className="border-t border-slate-100">
                <td className="py-1 pr-2 text-slate-700">{x.nome}</td>
                <td className="py-1 text-right font-mono">{qtd(x.quantidade)} {un}</td>
                <td className="py-1 text-right font-mono">{s?.disponivel == null ? "—" : `${qtd(s.disponivel)} ${un}`}</td>
                <td className="py-1 pl-2">
                  <EstadoStockTexto est={est} unidade={un} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-[11px] text-slate-400">
        Disponível = stock nos armazéns ativos − reservas das encomendas de cliente. Nada é reservado nem encomendado a partir daqui.
      </p>
    </div>
  );
}
