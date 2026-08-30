import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ErroDeEscrita,
  responderMedicao,
  responderTarefa,
  type MedicaoDaTarefa,
  type OpcaoDeMedicao,
  type TarefaDaOrdem,
} from "../lib/dados";
import {
  Badge,
  Barra,
  Button,
  Card,
  EstadoTarefaBadge,
  Input,
  Spinner,
  Textarea,
  cx,
} from "./ui";
import { AlertTriangle, Check, CheckCircle, ChevronDown, ChevronRight, X } from "./icons";
import {
  comoSeResponde,
  faltaParaGravar,
  progressoDeExecucao,
  resumirLeituras,
  veredictoDeGama,
  type Leitura,
  type Permissao,
} from "../domain/respostas";
import { ROTULO_TIPO_TAREFA, type EstadoTarefa, type TipoTarefa } from "../domain/tipos";

/**
 * O ecrã onde o trabalho acontece.
 *
 * É aqui que o técnico passa 90% do tempo, com o telemóvel numa mão e o
 * equipamento na outra. Três decisões que vêm daí:
 *
 *  · Uma resposta = um toque, sempre que possível. Escolher "Conforme" grava.
 *    Não há "escolher e depois gravar" — é um passo que ninguém dá em pé.
 *
 *  · O veredicto aparece ANTES de gravar. Escrever 8 numa gama de 10–15 mostra
 *    logo "vai ficar não conforme". No Infraspeak isso só se sabe depois, e
 *    quem se enganou já gerou uma ordem que ninguém pediu.
 *
 *  · Quando uma não conformidade gera trabalho, o código da ordem nova
 *    aparece ali, com link. É o instante em que essa informação vale alguma
 *    coisa — no relatório de amanhã já não vale.
 */

type Rascunho = { num: string; texto: string };

export default function PainelTarefas({
  tarefas,
  medicoes,
  opcoes,
  permissao,
  aoGravar,
}: {
  tarefas: readonly TarefaDaOrdem[];
  medicoes: readonly MedicaoDaTarefa[];
  opcoes: readonly OpcaoDeMedicao[];
  permissao: Permissao;
  /** Recarrega a ordem. A app não adivinha o novo estado — vai buscá-lo. */
  aoGravar: () => void;
}) {
  const [aberta, setAberta] = useState<string | null>(null);
  const [rascunhos, setRascunhos] = useState<Record<string, Rascunho>>({});
  const [aGravar, setAGravar] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [corretivas, setCorretivas] = useState<Record<string, string>>({});

  const porTarefa = useMemo(() => {
    const m = new Map<string, Leitura[]>();
    for (const x of medicoes) {
      const lista = m.get(x.ordem_tarefa_id) ?? [];
      lista.push({
        id: x.id,
        medicaoDefId: x.medicao_def_id,
        nome: x.nome,
        tipo: x.tipo,
        unidade: x.unidade,
        limiteMin: x.limite_min == null ? null : Number(x.limite_min),
        limiteMax: x.limite_max == null ? null : Number(x.limite_max),
        valorNum: x.valor_num == null ? null : Number(x.valor_num),
        valorTexto: x.valor_texto,
        opcaoId: x.opcao_id,
        conforme: x.conforme,
        lidaEm: x.lida_em,
        corretivaOrdemId: x.corretiva_ordem_id,
      });
      m.set(x.ordem_tarefa_id, lista);
    }
    return m;
  }, [medicoes]);

  const opcoesPorDef = useMemo(() => {
    const m = new Map<string, OpcaoDeMedicao[]>();
    for (const o of opcoes) {
      const lista = m.get(o.medicao_def_id) ?? [];
      lista.push(o);
      m.set(o.medicao_def_id, lista);
    }
    return m;
  }, [opcoes]);

  const prog = progressoDeExecucao(
    tarefas.map((t) => ({ estado: t.estado as EstadoTarefa, obrigatoria: t.obrigatoria }))
  );

  // A primeira tarefa por responder abre-se sozinha. Quem chega ao local quer
  // começar, não escolher por onde começar.
  const jaAbriu = useRef(false);
  useEffect(() => {
    if (jaAbriu.current || !permissao.pode) return;
    const primeira = tarefas.find((t) => t.estado === "pendente");
    if (primeira) {
      setAberta(primeira.id);
      jaAbriu.current = true;
    }
  }, [tarefas, permissao.pode]);

  const gravar = async (chave: string, fn: () => Promise<{ corretiva_gerada: string | null }>) => {
    setAGravar(chave);
    setErros((e) => ({ ...e, [chave]: "" }));
    try {
      const r = await fn();
      if (r.corretiva_gerada) {
        setCorretivas((c) => ({ ...c, [chave]: r.corretiva_gerada as string }));
      }
      aoGravar();
    } catch (e) {
      // A base escreve mensagens para serem lidas por pessoas. Mostrar a dela
      // é melhor do que uma genérica — só se troca quando não houve resposta.
      setErros((er) => ({
        ...er,
        [chave]:
          e instanceof ErroDeEscrita
            ? e.message
            : "Não foi possível falar com o servidor. Tenta outra vez.",
      }));
    } finally {
      setAGravar(null);
    }
  };

  if (tarefas.length === 0) return null;

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-800">Trabalho a fazer</h2>
        <span className="font-mono text-xs tabular text-slate-500">
          {prog.respondidas}/{prog.total} respondidas
          {prog.naoConformes > 0 && (
            <span className="ml-2 text-red-600">{prog.naoConformes} não conforme</span>
          )}
        </span>
      </div>
      <Barra percentagem={prog.percentagem} className="mt-2" />

      {!permissao.pode && permissao.motivo && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {permissao.motivo}
        </p>
      )}

      {permissao.pode && prog.obrigatoriasPorResponder > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          Faltam {prog.obrigatoriasPorResponder}{" "}
          {prog.obrigatoriasPorResponder === 1 ? "resposta obrigatória" : "respostas obrigatórias"}{" "}
          para poderes fechar a ordem.
        </p>
      )}

      <ul className="mt-3 divide-y divide-slate-100">
        {tarefas.map((t) => {
          const leituras = porTarefa.get(t.id) ?? [];
          const resumo = resumirLeituras(leituras);
          const estaAberta = aberta === t.id;
          const caminho = comoSeResponde(leituras);

          return (
            <li key={t.id} className="py-1">
              <button
                type="button"
                onClick={() => setAberta(estaAberta ? null : t.id)}
                className="flex w-full items-start gap-2.5 rounded-lg px-1 py-2 text-left transition-colors hover:bg-slate-50"
                aria-expanded={estaAberta}
              >
                <span className="mt-0.5 shrink-0 text-slate-400">
                  {estaAberta ? (
                    <ChevronDown width={16} height={16} />
                  ) : (
                    <ChevronRight width={16} height={16} />
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm text-slate-800">{t.nome}</span>
                    {t.obrigatoria && (
                      <span className="text-red-400" title="Obrigatória">
                        *
                      </span>
                    )}
                    {t.privada && (
                      <Badge className="bg-slate-100 text-slate-500 ring-slate-200">
                        não sai no relatório
                      </Badge>
                    )}
                  </span>

                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
                    <span>{ROTULO_TIPO_TAREFA[t.tipo as TipoTarefa] ?? t.tipo}</span>
                    {resumo.total > 0 && (
                      <span className="tabular">
                        · {resumo.total - resumo.porLer}/{resumo.total} leituras
                      </span>
                    )}
                    {t.observacoes && !estaAberta && (
                      <span className="min-w-0 truncate italic">· {t.observacoes}</span>
                    )}
                  </span>
                </span>

                <span className="shrink-0">
                  <EstadoTarefaBadge estado={t.estado as EstadoTarefa} />
                </span>
              </button>

              {estaAberta && (
                <div className="ml-[26px] space-y-3 border-l-2 border-slate-100 pl-3.5 pb-3 pt-1">
                  {caminho === "medicoes" ? (
                    leituras.map((l) => (
                      <BlocoMedicao
                        key={l.id}
                        leitura={l}
                        opcoes={opcoesPorDef.get(l.medicaoDefId) ?? []}
                        ativo={permissao.pode}
                        aGravar={aGravar === l.id}
                        erro={erros[l.id]}
                        corretiva={corretivas[l.id]}
                        rascunho={rascunhos[l.id]}
                        aoMudar={(r) => setRascunhos((x) => ({ ...x, [l.id]: r }))}
                        aoResponder={(args) =>
                          gravar(l.id, () =>
                            responderMedicao({
                              tarefaId: t.id,
                              medicaoDefId: l.medicaoDefId,
                              ...args,
                            })
                          )
                        }
                      />
                    ))
                  ) : (
                    <BlocoVeredicto
                      tarefa={t}
                      ativo={permissao.pode}
                      aGravar={aGravar === t.id}
                      erro={erros[t.id]}
                      corretiva={corretivas[t.id]}
                      rascunho={rascunhos[t.id]}
                      aoMudar={(r) => setRascunhos((x) => ({ ...x, [t.id]: r }))}
                      aoResponder={(args) =>
                        gravar(t.id, () => responderTarefa({ tarefaId: t.id, ...args }))
                      }
                    />
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

/* ─────────────────────────── Uma medição ─────────────────────────────── */

function BlocoMedicao({
  leitura: l,
  opcoes,
  ativo,
  aGravar,
  erro,
  corretiva,
  rascunho,
  aoMudar,
  aoResponder,
}: {
  leitura: Leitura;
  opcoes: readonly OpcaoDeMedicao[];
  ativo: boolean;
  aGravar: boolean;
  erro?: string;
  corretiva?: string;
  rascunho?: Rascunho;
  aoMudar: (r: Rascunho) => void;
  aoResponder: (args: {
    valorNum?: number | null;
    valorTexto?: string | null;
    opcaoId?: string | null;
  }) => void;
}) {
  // O que já está gravado é o ponto de partida; o rascunho só existe a partir
  // do momento em que alguém escreve.
  const num = rascunho?.num ?? (l.valorNum == null ? "" : String(l.valorNum));
  const texto = rascunho?.texto ?? l.valorTexto ?? "";
  const mudar = (p: Partial<Rascunho>) => aoMudar({ num, texto, ...p });

  const valor = num.trim() === "" ? null : Number(num.replace(",", "."));
  const previsto = l.tipo === "gama" ? veredictoDeGama(valor, l.limiteMin, l.limiteMax) : null;
  const falta = faltaParaGravar(l.tipo, {
    valorNum: valor,
    valorTexto: texto,
    opcaoId: l.opcaoId,
  });

  const gravarValor = () => {
    if (l.tipo === "texto") aoResponder({ valorTexto: texto });
    else aoResponder({ valorNum: valor, valorTexto: texto.trim() || null });
  };

  return (
    <div className="rounded-lg bg-slate-50/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-slate-700">
          {l.nome}
          {l.unidade && <span className="ml-1 font-normal text-slate-400">({l.unidade})</span>}
        </span>
        <SeloLeitura leitura={l} />
      </div>

      {(l.limiteMin != null || l.limiteMax != null) && (
        <p className="mt-0.5 font-mono text-xs tabular text-slate-400">
          aceite entre {l.limiteMin ?? "—"} e {l.limiteMax ?? "—"}
          {l.unidade ? ` ${l.unidade}` : ""}
        </p>
      )}

      {l.tipo === "escolha" ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {opcoes.map((o) => (
            <button
              key={o.id}
              type="button"
              disabled={!ativo || aGravar}
              onClick={() => aoResponder({ opcaoId: o.id })}
              className={cx(
                "rounded-lg px-3 py-2 text-sm font-medium ring-1 transition-all active:scale-[0.98] disabled:opacity-50",
                l.opcaoId === o.id
                  ? o.e_nao_conforme
                    ? "bg-red-600 text-white ring-red-600"
                    : "bg-emerald-600 text-white ring-emerald-600"
                  : o.e_nao_conforme
                    ? "bg-white text-red-700 ring-red-200 hover:bg-red-50"
                    : "bg-white text-slate-700 ring-slate-200 hover:bg-white hover:ring-slate-300"
              )}
            >
              {o.nome}
              {/* Dizer de antemão que esta resposta abre uma ordem. Ninguém
                  gosta de descobrir que criou trabalho sem saber. */}
              {o.cria_corretiva && l.opcaoId !== o.id && (
                <span className="ml-1.5 text-[11px] font-normal opacity-70">abre corretiva</span>
              )}
            </button>
          ))}
        </div>
      ) : l.tipo === "texto" ? (
        <div className="mt-2 space-y-2">
          <Textarea
            rows={2}
            value={texto}
            disabled={!ativo || aGravar}
            onChange={(e) => mudar({ texto: e.target.value })}
            placeholder="O que observaste"
          />
          <BotaoGravar ativo={ativo} aGravar={aGravar} falta={falta} onClick={gravarValor} />
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="text"
              inputMode="decimal"
              className="w-32 font-mono tabular"
              value={num}
              disabled={!ativo || aGravar}
              onChange={(e) => mudar({ num: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !falta) gravarValor();
              }}
              placeholder={l.unidade ?? "valor"}
              aria-label={`Valor de ${l.nome}`}
            />
            {previsto === "nao_conforme" && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700">
                <AlertTriangle width={13} height={13} />
                fora dos limites — vai ficar não conforme
              </span>
            )}
            {previsto === "conforme" && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                <Check width={13} height={13} />
                dentro dos limites
              </span>
            )}
          </div>
          <BotaoGravar ativo={ativo} aGravar={aGravar} falta={falta} onClick={gravarValor} />
        </div>
      )}

      <Avisos erro={erro} corretiva={corretiva} />
    </div>
  );
}

/* ──────────────── Uma tarefa sem medições: o veredicto à mão ─────────── */

function BlocoVeredicto({
  tarefa: t,
  ativo,
  aGravar,
  erro,
  corretiva,
  rascunho,
  aoMudar,
  aoResponder,
}: {
  tarefa: TarefaDaOrdem;
  ativo: boolean;
  aGravar: boolean;
  erro?: string;
  corretiva?: string;
  rascunho?: Rascunho;
  aoMudar: (r: Rascunho) => void;
  aoResponder: (args: {
    estado?: string;
    valorNum?: number | null;
    observacoes?: string | null;
  }) => void;
}) {
  const num = rascunho?.num ?? (t.valor_num == null ? "" : String(t.valor_num));
  const texto = rascunho?.texto ?? "";
  const temLimites = t.limite_min != null || t.limite_max != null;
  const valor = num.trim() === "" ? null : Number(num.replace(",", "."));
  const previsto = temLimites
    ? veredictoDeGama(
        valor,
        t.limite_min == null ? null : Number(t.limite_min),
        t.limite_max == null ? null : Number(t.limite_max)
      )
    : null;

  const responder = (estado: string) =>
    aoResponder({ estado, valorNum: valor, observacoes: texto.trim() || null });

  return (
    <div className="space-y-2.5">
      {temLimites && (
        <div className="rounded-lg bg-slate-50/70 p-3">
          <p className="font-mono text-xs tabular text-slate-400">
            aceite entre {t.limite_min ?? "—"} e {t.limite_max ?? "—"}
            {t.unidade ? ` ${t.unidade}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Input
              type="text"
              inputMode="decimal"
              className="w-32 font-mono tabular"
              value={num}
              disabled={!ativo || aGravar}
              onChange={(e) => aoMudar({ num: e.target.value, texto })}
              placeholder={t.unidade ?? "valor"}
              aria-label={`Valor de ${t.nome}`}
            />
            {previsto === "nao_conforme" && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700">
                <AlertTriangle width={13} height={13} />
                fora dos limites
              </span>
            )}
          </div>
          {/* Com limites, o valor decide sozinho: o botão diz isso, em vez de
              pedir um veredicto que a base vai ignorar. */}
          <div className="mt-2">
            <Button
              size="sm"
              disabled={!ativo || aGravar || valor == null}
              onClick={() => aoResponder({ valorNum: valor, observacoes: texto.trim() || null })}
            >
              {aGravar ? "A gravar…" : "Gravar o valor"}
            </Button>
          </div>
        </div>
      )}

      {!temLimites && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={!ativo || aGravar}
            onClick={() => responder("feita")}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <Check width={14} height={14} /> Conforme
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={!ativo || aGravar}
            onClick={() => responder("nao_conforme")}
          >
            <X width={14} height={14} /> Não conforme
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!ativo || aGravar}
            onClick={() => responder("nao_aplicavel")}
          >
            Não aplicável
          </Button>
        </div>
      )}

      <Textarea
        rows={2}
        value={texto}
        disabled={!ativo || aGravar}
        onChange={(e) => aoMudar({ num, texto: e.target.value })}
        placeholder={
          // O que o técnico escreve aqui vai parar à ordem corretiva, se ela
          // nascer. Dizê-lo muda o que as pessoas escrevem.
          "Observações — vão com a ordem corretiva, se houver"
        }
      />

      {t.observacoes && (
        <p className="text-xs italic text-slate-500">Última nota: {t.observacoes}</p>
      )}

      {aGravar && <Spinner label="A gravar" />}
      <Avisos erro={erro} corretiva={corretiva} />
    </div>
  );
}

/* ───────────────────────────── Peças pequenas ────────────────────────── */

function BotaoGravar({
  ativo,
  aGravar,
  falta,
  onClick,
}: {
  ativo: boolean;
  aGravar: boolean;
  falta: string | null;
  onClick: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" disabled={!ativo || aGravar || !!falta} onClick={onClick}>
        {aGravar ? "A gravar…" : "Gravar"}
      </Button>
      {falta && ativo && <span className="text-xs text-slate-400">{falta}</span>}
    </div>
  );
}

function SeloLeitura({ leitura: l }: { leitura: Leitura }) {
  if (l.lidaEm == null) {
    return <Badge className="bg-slate-100 text-slate-500 ring-slate-200">por ler</Badge>;
  }
  if (l.conforme === false) {
    return (
      <Badge className="bg-red-50 text-red-700 ring-red-200">
        <X width={11} height={11} /> não conforme
      </Badge>
    );
  }
  if (l.conforme === true) {
    return (
      <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">
        <Check width={11} height={11} /> conforme
      </Badge>
    );
  }
  // Um contador ou um texto: lido, sem veredicto a dar.
  return <Badge className="bg-slate-100 text-slate-600 ring-slate-200">lido</Badge>;
}

function Avisos({ erro, corretiva }: { erro?: string; corretiva?: string }) {
  return (
    <>
      {erro && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>
      )}
      {corretiva && (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
          <CheckCircle width={14} height={14} />
          Abriu-se a ordem
          <Link to={`/ordens/${corretiva}`} className="font-mono font-medium underline">
            {corretiva}
          </Link>
          para tratar disto.
        </p>
      )}
    </>
  );
}
