import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ErroDeEscrita,
  acrescentarTarefa,
  type MedicaoDaTarefa,
  type OpcaoDeMedicao,
  type TarefaDaOrdem,
} from "../lib/dados";
import {
  responderMedicaoOuGuardar,
  responderTarefaOuGuardar,
  type Resultado,
} from "../lib/fila";
import {
  Badge,
  Barra,
  Button,
  Card,
  EstadoTarefaBadge,
  Input,
  Escolha,
  Spinner,
  Textarea,
  cx,
} from "./ui";
import {
  AlertTriangle,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Clock,
  Plus,
  X,
} from "./icons";
import {
  comoSeResponde,
  faltaParaGravar,
  progressoDeExecucao,
  resumirLeituras,
  veredictoDeGama,
  type Leitura,
  type Permissao,
} from "../domain/respostas";
import { ROTULO_ESTADO_TAREFA, type EstadoTarefa } from "../domain/tipos";
import { useRotulos } from "../auth/Rotulos";

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
  ordemId,
  tarefas,
  medicoes,
  opcoes,
  permissao,
  aoGravar,
}: {
  ordemId: string;
  tarefas: readonly TarefaDaOrdem[];
  medicoes: readonly MedicaoDaTarefa[];
  opcoes: readonly OpcaoDeMedicao[];
  permissao: Permissao;
  /** Recarrega a ordem. A app não adivinha o novo estado — vai buscá-lo. */
  aoGravar: () => void;
}) {
  const rotulos = useRotulos();
  const [aberta, setAberta] = useState<string | null>(null);
  const [rascunhos, setRascunhos] = useState<Record<string, Rascunho>>({});
  const [aGravar, setAGravar] = useState<string | null>(null);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [corretivas, setCorretivas] = useState<Record<string, string>>({});
  /** As que ficaram no telemóvel à espera de rede. */
  const [naFila, setNaFila] = useState<Record<string, boolean>>({});

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

  /**
   * A primeira tarefa abre-se sozinha — mas **só numa ordem por começar**.
   *
   * Quem chega ao local quer começar, não escolher por onde começar. Mas
   * depois de a primeira resposta estar dada, isto passa a atrapalhar: cada
   * resposta recarregava a ordem, o painel voltava a montar-se, e a tarefa
   * seguinte abria-se sozinha — a desfazer o fecho que se tinha acabado de
   * ver. O `useRef` não chegava, porque um `ref` novo nasce a cada montagem.
   *
   * A condição certa não é "é a primeira vez que isto corre": é "ainda
   * ninguém respondeu a nada".
   */
  const jaAbriu = useRef(false);
  useEffect(() => {
    if (jaAbriu.current || !permissao.pode) return;
    if (tarefas.some((t) => t.estado !== "pendente")) {
      jaAbriu.current = true;
      return;
    }
    const primeira = tarefas.find((t) => t.estado === "pendente");
    if (primeira) {
      setAberta(primeira.id);
      jaAbriu.current = true;
    }
  }, [tarefas, permissao.pode]);

  /**
   * Grava — ou guarda no telemóvel, se a rede tiver ido embora.
   *
   * Os três fins são coisas diferentes e o ecrã diz qual foi. Chamar
   * "gravado" a uma resposta que ainda está no telemóvel seria a maneira mais
   * rápida de se perder a confiança nisto.
   */
  /**
   * As tarefas que alguém reabriu para mudar a resposta.
   *
   * Uma tarefa respondida fecha-se e mostra só o que ficou registado. Manter
   * os botões à vista depois de responder dá uma lista onde tudo parece por
   * fazer — e num telemóvel, onde cabem três tarefas no ecrã, isso é a
   * diferença entre ver o progresso e não ver nada.
   */
  const [aAlterar, setAAlterar] = useState<Set<string>>(new Set());
  const [aAcrescentar, setAAcrescentar] = useState(false);
  const [aAcrescentando, setAAcrescentando] = useState(false);
  const [erroAcrescentar, setErroAcrescentar] = useState<string | null>(null);

  const deixarAlterar = (id: string) =>
    setAAlterar((s) => {
      const n = new Set(s);
      n.add(id);
      return n;
    });

  const gravar = async (chave: string, fn: () => Promise<Resultado>, tarefaId?: string) => {
    setAGravar(chave);
    setErros((e) => ({ ...e, [chave]: "" }));
    try {
      const r = await fn();
      if (r.fim === "recusado") {
        setErros((er) => ({ ...er, [chave]: r.motivo }));
        return;
      }
      if (r.fim === "na_fila") {
        setNaFila((f) => ({ ...f, [chave]: true }));
        return;
      }
      setNaFila((f) => ({ ...f, [chave]: false }));
      if (r.corretiva) setCorretivas((c) => ({ ...c, [chave]: r.corretiva as string }));
      // Respondida, fecha-se. O próximo passo é a tarefa seguinte, e não
      // voltar a olhar para esta.
      if (tarefaId) {
        setAAlterar((x) => {
          const n = new Set(x);
          n.delete(tarefaId);
          return n;
        });
        setAberta((x) => (x === tarefaId ? null : x));
      }
      aoGravar();
    } finally {
      setAGravar(null);
    }
  };

  // Sem tarefas, o cartão continua a aparecer para quem pode acrescentar. Uma
  // ordem vazia é precisamente o caso em que faz falta um botão.
  if (tarefas.length === 0 && !permissao.pode) return null;

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-800">Trabalho a fazer</h2>
        <div className="flex flex-wrap items-center gap-3">
          {tarefas.length > 0 && (
            <span className="font-mono text-xs tabular text-slate-500">
              {prog.respondidas}/{prog.total} respondidas
              {prog.naoConformes > 0 && (
                <span className="ml-2 text-red-600">{prog.naoConformes} não conforme</span>
              )}
            </span>
          )}
          {permissao.pode && !aAcrescentar && (
            <Button size="sm" variant="secondary" onClick={() => setAAcrescentar(true)}>
              <Plus width={13} height={13} /> Tarefa
            </Button>
          )}
        </div>
      </div>
      {tarefas.length > 0 && <Barra percentagem={prog.percentagem} className="mt-2" />}

      {/*
        O caminho curto.

        O longo — criar a medição em Definições, pendurá-la numa checklist,
        publicar, e escolher a checklist ao abrir a ordem — continua a ser o
        certo para o trabalho que se repete: é o que faz doze visitas serem
        comparáveis. Mas o trabalho que NÃO se repete não cabe lá, e o técnico
        que chega ao local e encontra mais uma coisa não vai a Definições
        publicar uma checklist nova. Ou regista aqui, ou não regista.
      */}
      {aAcrescentar && (
        <FormTarefaNova
          aFechar={() => setAAcrescentar(false)}
          aGravar={aAcrescentando}
          erro={erroAcrescentar}
          aoGravar={async (t) => {
            setAAcrescentando(true);
            setErroAcrescentar(null);
            try {
              await acrescentarTarefa({ ordemId, ...t });
              setAAcrescentar(false);
              aoGravar();
            } catch (e) {
              setErroAcrescentar(
                e instanceof ErroDeEscrita ? e.message : "Não foi possível acrescentar."
              );
            } finally {
              setAAcrescentando(false);
            }
          }}
        />
      )}

      {!permissao.pode && permissao.motivo && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {permissao.motivo}
        </p>
      )}

      {/* Numa ordem agendada, responder inicia-a. Dizer isto antes evita a
          surpresa de ver o estado mudar sozinho — automatizar um passo não é
          esconder que ele acontece. */}
      {permissao.pode && permissao.aviso && (
        <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">
          {permissao.aviso}
        </p>
      )}

      {permissao.pode && prog.obrigatoriasPorResponder > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          {prog.obrigatoriasPorResponder === 1
            ? "Falta 1 resposta obrigatória"
            : `Faltam ${prog.obrigatoriasPorResponder} respostas obrigatórias`}{" "}
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
                    <span>{rotulos.nome("tipo_tarefa", t.tipo)}</span>
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
                        naFila={naFila[l.id]}
                        rascunho={rascunhos[l.id]}
                        aoMudar={(r) => setRascunhos((x) => ({ ...x, [l.id]: r }))}
                        aoResponder={(args) =>
                          gravar(
                            l.id,
                            () =>
                              responderMedicaoOuGuardar(ordemId, {
                                tarefaId: t.id,
                                medicaoDefId: l.medicaoDefId,
                                ...args,
                              }),
                            // Só se fecha a tarefa quando a última leitura dela
                            // ficar respondida: fechar à primeira escondia as
                            // outras cinco.
                            resumo.porLer <= 1 ? t.id : undefined
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
                      naFila={naFila[t.id]}
                      respondida={t.estado !== "pendente" && !aAlterar.has(t.id)}
                      aoAlterar={() => deixarAlterar(t.id)}
                      aoResponder={(args) =>
                        gravar(
                          t.id,
                          () => responderTarefaOuGuardar(ordemId, { tarefaId: t.id, ...args }),
                          t.id
                        )
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
  naFila,
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
  naFila?: boolean;
  rascunho?: Rascunho;
  aoMudar: (r: Rascunho) => void;
  aoResponder: (args: {
    valorNum?: number | null;
    valorTexto?: string | null;
    opcaoId?: string | null;
  }) => void | Promise<void>;
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

      <Avisos erro={erro} corretiva={corretiva} naFila={naFila} />
    </div>
  );
}

/* ──────────────── Uma tarefa sem medições: o veredicto à mão ─────────── */

function BlocoVeredicto({
  tarefa: t,
  ativo,
  aGravar,
  erro,
  respondida,
  aoAlterar,
  corretiva,
  naFila,
  rascunho,
  aoMudar,
  aoResponder,
}: {
  tarefa: TarefaDaOrdem;
  ativo: boolean;
  aGravar: boolean;
  erro?: string;
  corretiva?: string;
  naFila?: boolean;
  rascunho?: Rascunho;
  /** Já respondida, e ninguém pediu para mudar. Mostra-se o que ficou. */
  respondida?: boolean;
  aoAlterar?: () => void;
  aoMudar: (r: Rascunho) => void;
  aoResponder: (args: {
    estado?: string;
    valorNum?: number | null;
    observacoes?: string | null;
  }) => void | Promise<void>;
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

  /*
    Respondida, mostra-se o que ficou e mais nada.

    Quem pediu isto disse-o assim: "se clica conforme, então fica conforme,
    desaparecem os botões e só aparece alterar em pequeno". Manter três botões
    grandes debaixo de uma tarefa já feita dá uma lista onde tudo parece por
    fazer — e faz o polegar acertar no botão errado.

    "Alterar" fica pequeno de propósito: mudar uma resposta é raro, e uma coisa
    rara não merece o mesmo tamanho que a coisa comum.
  */
  if (respondida) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-sm text-slate-600">
          {t.valor_num != null ? (
            <span className="font-mono tabular">
              {t.valor_num}
              {t.unidade ? ` ${t.unidade}` : ""}
            </span>
          ) : (
            ROTULO_ESTADO_TAREFA[t.estado as EstadoTarefa] ?? t.estado
          )}
        </span>
        {t.observacoes && (
          <span className="min-w-0 flex-1 truncate text-xs italic text-slate-400">
            {t.observacoes}
          </span>
        )}
        {ativo && aoAlterar && (
          <button
            type="button"
            onClick={aoAlterar}
            className="shrink-0 text-xs text-slate-400 underline-offset-2 hover:text-slate-700 hover:underline"
          >
            alterar
          </button>
        )}
        {corretiva && (
          <span className="text-xs text-amber-700">corretiva {corretiva}</span>
        )}
      </div>
    );
  }

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
      <Avisos erro={erro} corretiva={corretiva} naFila={naFila} />
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

function Avisos({
  erro,
  corretiva,
  naFila,
}: {
  erro?: string;
  corretiva?: string;
  naFila?: boolean;
}) {
  return (
    <>
      {erro && (
        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>
      )}
      {/* Guardado não é gravado, e o ecrã diz qual dos dois é. Chamar
          "gravado" a uma resposta que ainda está no telemóvel seria a maneira
          mais rápida de se perder a confiança nisto. */}
      {naFila && (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <Clock width={14} height={14} className="shrink-0" />
          <span>
            Sem rede. <strong className="font-semibold">A resposta ficou guardada</strong> e sai
            sozinha quando houver sinal — podes continuar.
          </span>
        </p>
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

/**
 * A tarefa acrescentada à mão.
 *
 * Quatro feitios, e mais nenhum — são os que uma pessoa em pé consegue
 * escolher sem pensar. Com limites, a tarefa passa a ser uma leitura com
 * veredicto automático, sem precisar de definição de medição nenhuma: a
 * própria tarefa já guarda unidade, mínimo, máximo e valor.
 *
 * ⚠ Vive **só nesta ordem**. Não entra em checklist, não passa à visita
 * seguinte. Se entrasse, a decisão de um técnico num dia passava a ser
 * procedimento da casa sem ninguém decidir.
 */
function FormTarefaNova({
  aFechar,
  aGravar,
  erro,
  aoGravar,
}: {
  aFechar: () => void;
  aGravar: boolean;
  erro: string | null;
  aoGravar: (t: {
    nome: string;
    tipo: string;
    obrigatoria: boolean;
    unidade: string | null;
    limiteMin: number | null;
    limiteMax: number | null;
  }) => void | Promise<void>;
}) {
  const [nome, setNome] = useState("");
  const [feitio, setFeitio] = useState<"verificar" | "numero" | "texto" | "foto">("verificar");
  const [unidade, setUnidade] = useState("");
  const [minimo, setMinimo] = useState("");
  const [maximo, setMaximo] = useState("");
  const [obrigatoria, setObrigatoria] = useState(true);

  const numero = (t: string) => (t.trim() === "" ? null : Number(t.replace(",", ".")));

  const gravar = () =>
    aoGravar({
      nome: nome.trim(),
      tipo: feitio === "verificar" ? "inspecao" : feitio,
      obrigatoria,
      unidade: feitio === "numero" ? unidade.trim() || null : null,
      limiteMin: feitio === "numero" ? numero(minimo) : null,
      limiteMax: feitio === "numero" ? numero(maximo) : null,
    });

  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-slate-700">Tarefa nova</span>
        <button
          type="button"
          onClick={aFechar}
          aria-label="Fechar"
          className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-white hover:text-slate-600"
        >
          <X width={15} height={15} />
        </button>
      </div>

      <div className="mt-2 space-y-3">
        <Input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && nome.trim() && !aGravar) void gravar();
          }}
          placeholder="Ex.: Verificar a válvula de corte"
          className="w-full"
          autoFocus
        />

        <div className="flex flex-wrap gap-1.5">
          <Escolha ligado={feitio === "verificar"} onClick={() => setFeitio("verificar")}>
            Conforme / não conforme
          </Escolha>
          <Escolha ligado={feitio === "numero"} onClick={() => setFeitio("numero")}>
            Número
          </Escolha>
          <Escolha ligado={feitio === "texto"} onClick={() => setFeitio("texto")}>
            Texto
          </Escolha>
          <Escolha ligado={feitio === "foto"} onClick={() => setFeitio("foto")}>
            Foto
          </Escolha>
        </div>

        {feitio === "numero" && (
          <div className="grid gap-2 sm:grid-cols-3">
            <Input
              value={unidade}
              onChange={(e) => setUnidade(e.target.value)}
              placeholder="unidade (bar, °C…)"
              className="w-full"
            />
            <Input
              value={minimo}
              onChange={(e) => setMinimo(e.target.value)}
              inputMode="decimal"
              placeholder="mínimo aceite"
              className="w-full font-mono tabular"
            />
            <Input
              value={maximo}
              onChange={(e) => setMaximo(e.target.value)}
              inputMode="decimal"
              placeholder="máximo aceite"
              className="w-full font-mono tabular"
            />
          </div>
        )}

        {feitio === "numero" && (
          <p className="text-xs text-slate-400">
            Com limites, o valor decide sozinho se está conforme. Sem limites,
            fica só registado — serve para contadores.
          </p>
        )}

        <label className="flex items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={obrigatoria}
            onChange={(e) => setObrigatoria(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-slate-300 text-brand focus:ring-brand/40"
          />
          Obrigatória para fechar a ordem
        </label>

        {erro && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>
        )}

        <Button size="sm" disabled={!nome.trim() || aGravar} onClick={() => void gravar()}>
          {aGravar ? "A acrescentar…" : "Acrescentar"}
        </Button>
      </div>
    </div>
  );
}
