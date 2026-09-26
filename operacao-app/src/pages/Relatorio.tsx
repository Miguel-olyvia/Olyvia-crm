import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  ErroDeDados,
  alvosDaOrdem,
  anexosDaOrdem,
  listarClientes,
  medicoesDaOrdem,
  obterOrdem,
  opcoesDeMedicoes,
  sessoesDaOrdem,
  tarefasDaOrdem,
  urlsDosAnexos,
  type Anexo,
  type MedicaoDaTarefa,
  type OpcaoDeMedicao,
  type OrdemCompleta,
  type TarefaDaOrdem,
  assinaturaDaOrdem,
  type Assinatura,
} from "../lib/dados";
import { Button, ErrorState, Skeleton } from "../components/ui";
import { ChevronLeft } from "../components/icons";
import { data, dataHora } from "../lib/formatar";
import { formatarDuracao, tempoTotalSegundos, type Sessao } from "../domain/tempo";
import { ROTULO_ESTADO_TAREFA, type EstadoTarefa } from "../domain/tipos";

/**
 * O relatório que vai para o cliente.
 *
 * Sai em PDF pela impressão do browser, e não por uma biblioteca. Três razões,
 * e nenhuma é preguiça:
 *
 *  · O que se vê no ecrã é exatamente o que sai no PDF. Com uma biblioteca há
 *    sempre duas maquetas a divergirem, e a que o cliente recebe é a que
 *    ninguém olha;
 *  · funciona offline, sem CDN e sem 300 KB de JavaScript a mais;
 *  · o técnico escolhe entre guardar, imprimir ou enviar, no diálogo que já
 *    conhece do sistema dele.
 *
 * O que NÃO sai daqui, de propósito:
 *
 *  · tarefas e fotos marcadas como privadas — o cliente não precisa de saber
 *    onde está a chave escondida;
 *  · custos, tempos por técnico e nomes internos. O cliente comprou o
 *    resultado, não o processo. Quem quiser os números tem-nos na ficha.
 */

export default function Relatorio() {
  const { codigo = "" } = useParams();
  const { activeOrgId } = useAuth();

  const [ordem, setOrdem] = useState<OrdemCompleta | null>(null);
  const [tarefas, setTarefas] = useState<TarefaDaOrdem[]>([]);
  const [medicoes, setMedicoes] = useState<MedicaoDaTarefa[]>([]);
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [opcoes, setOpcoes] = useState<Map<string, string>>(new Map());
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [cliente, setCliente] = useState<string | null>(null);
  const [tempo, setTempo] = useState(0);
  const [alvos, setAlvos] = useState(0);
  const [assinatura, setAssinatura] = useState<Assinatura | null>(null);
  const [urlAssinatura, setUrlAssinatura] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(true);

  useEffect(() => {
    if (!activeOrgId) return;
    let vivo = true;
    (async () => {
      try {
        const o = await obterOrdem(codigo, activeOrgId);
        if (!o) {
          if (vivo) setErro("Ordem não encontrada, ou sem permissão para a ver.");
          return;
        }
        const [tfs, sss, cls, anx, als, ass] = await Promise.all([
          tarefasDaOrdem(o.id),
          sessoesDaOrdem(o.id),
          listarClientes(activeOrgId),
          anexosDaOrdem(o.id),
          alvosDaOrdem(o.id),
          assinaturaDaOrdem(o.id),
        ]);
        const meds = await medicoesDaOrdem(tfs.map((t) => t.id));
        // O nome da opção escolhida, para o relatório dizer "Ilegível" em vez
        // de "não conforme" — que é menos verdade e diz menos.
        const ops = await opcoesDeMedicoes([
          ...new Set(meds.filter((m) => m.tipo === "escolha").map((m) => m.medicao_def_id)),
        ]);

        if (!vivo) return;
        setOrdem(o);
        setTarefas(tfs);
        setMedicoes(meds);
        setOpcoes(new Map(ops.map((o: OpcaoDeMedicao) => [o.id, o.nome])));
        setAnexos(anx.filter((a) => !a.privado));
        setAssinatura(ass);
        if (ass) {
          const m = await urlsDosAnexos([ass.caminho]);
          if (vivo) setUrlAssinatura(m.get(ass.caminho) ?? null);
        }
        setAlvos(als.length);
        setCliente(cls.find((c) => c.id === o.cliente_id)?.nome ?? null);

        const dominio: Sessao[] = sss.map((s) => ({
          utilizadorId: s.utilizador_id,
          inicio: new Date(s.inicio),
          fim: s.fim ? new Date(s.fim) : null,
        }));
        setTempo(tempoTotalSegundos(dominio));
      } catch (e) {
        if (vivo) {
          setErro(e instanceof ErroDeDados ? e.message : "Algo correu mal a montar o relatório.");
        }
      } finally {
        if (vivo) setACarregar(false);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [activeOrgId, codigo]);

  useEffect(() => {
    const publicos = anexos.map((a) => a.caminho);
    if (publicos.length === 0) return;
    let vivo = true;
    void urlsDosAnexos(publicos).then((m) => {
      if (vivo) setUrls(m);
    });
    return () => {
      vivo = false;
    };
  }, [anexos]);

  // As privadas ficam de fora. É a mesma regra das fotos, e é o que a caixa
  // "Marcar como privada" do Infraspeak promete e o template de relatório
  // lá nem sempre cumpre.
  const publicas = useMemo(() => tarefas.filter((t) => !t.privada), [tarefas]);

  const medicoesPorTarefa = useMemo(() => {
    const m = new Map<string, MedicaoDaTarefa[]>();
    for (const x of medicoes) {
      if (x.lida_em == null) continue;
      const l = m.get(x.ordem_tarefa_id) ?? [];
      l.push(x);
      m.set(x.ordem_tarefa_id, l);
    }
    return m;
  }, [medicoes]);

  const naoConformes = publicas.filter((t) => t.estado === "nao_conforme");

  if (aCarregar) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  if (erro || !ordem) {
    return (
      <div className="space-y-4">
        <Link
          to="/ordens"
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-brand"
        >
          <ChevronLeft width={16} height={16} /> Ordens
        </Link>
        <ErrorState message={erro ?? "Ordem não encontrada."} />
      </div>
    );
  }

  return (
    <>
      {/* A barra de cima não sai no papel */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link
          to={`/ordens/${ordem.codigo}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 transition-colors hover:text-brand"
        >
          <ChevronLeft width={16} height={16} /> Voltar à ordem
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">
            Sem custos, sem tarefas privadas, sem nomes internos.
          </span>
          <Button onClick={() => window.print()}>Guardar em PDF ou imprimir</Button>
        </div>
      </div>

      {/* A folha. `print:` reduz margens e evita cortes a meio de um bloco. */}
      <article className="mx-auto max-w-3xl rounded-xl bg-white p-6 shadow-card print:max-w-none print:rounded-none print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Relatório de intervenção
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
              {ordem.titulo}
            </h1>
            <p className="mt-1 font-mono text-sm tabular text-slate-500">{ordem.codigo}</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-medium text-slate-800">{cliente ?? "—"}</p>
            {ordem.fechada_em && (
              <p className="mt-0.5 text-slate-500">Concluída a {data(ordem.fechada_em)}</p>
            )}
          </div>
        </header>

        <section className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <Facto rotulo="Data da intervenção" valor={data(ordem.iniciada_em ?? ordem.agendada_para)} />
          <Facto rotulo="Tempo no local" valor={tempo > 0 ? formatarDuracao(tempo) : "—"} />
          <Facto rotulo="Área" valor={[ordem.area, ordem.tipo].filter(Boolean).join(" › ") || "—"} />
          <Facto
            rotulo="Pontos verificados"
            valor={`${publicas.length}${alvos > 1 ? ` em ${alvos} alvos` : ""}`}
          />
        </section>

        {ordem.descricao && (
          <section className="mt-5">
            <Titulo>O que foi pedido</Titulo>
            <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-700">
              {ordem.descricao}
            </p>
          </section>
        )}

        {/* O resumo primeiro. Quem lê um relatório quer saber se há problema
            antes de percorrer a lista toda. */}
        {publicas.length > 0 && (
          <section className="mt-5 break-inside-avoid">
            <Titulo>Resultado</Titulo>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-700">
              {naoConformes.length === 0 ? (
                <>Verificaram-se {publicas.length} pontos. Estava tudo conforme.</>
              ) : (
                <>
                  Verificaram-se {publicas.length} pontos.{" "}
                  <strong className="font-semibold text-red-700">
                    {naoConformes.length === 1
                      ? "1 não estava conforme"
                      : `${naoConformes.length} não estavam conformes`}
                  </strong>
                  {": "}
                  {naoConformes.map((t) => t.nome).join(", ")}.
                </>
              )}
            </p>
          </section>
        )}

        {publicas.length > 0 && (
          <section className="mt-5">
            <Titulo>O que foi verificado</Titulo>
            <table className="mt-2 w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {publicas.map((t) => {
                  const meds = medicoesPorTarefa.get(t.id) ?? [];
                  return (
                    <tr key={t.id} className="break-inside-avoid align-top">
                      <td className="py-2 pr-3">
                        <p className="text-slate-800">{t.nome}</p>
                        {meds.length > 0 && (
                          <ul className="mt-0.5 space-y-0.5">
                            {meds.map((m) => (
                              <li key={m.id} className="font-mono text-xs tabular text-slate-500">
                                {m.nome}: {valorDaLeitura(m, opcoes)}
                                {m.conforme === false && (
                                  <span className="ml-1.5 font-sans text-red-600">fora do aceite</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                        {t.observacoes && (
                          <p className="mt-0.5 text-xs italic text-slate-500">{t.observacoes}</p>
                        )}
                      </td>
                      <td className="w-32 py-2 text-right">
                        <span
                          className={
                            t.estado === "nao_conforme"
                              ? "text-sm font-medium text-red-700"
                              : t.estado === "feita"
                                ? "text-sm text-emerald-700"
                                : "text-sm text-slate-400"
                          }
                        >
                          {ROTULO_ESTADO_TAREFA[t.estado as EstadoTarefa] ?? t.estado}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        {anexos.length > 0 && (
          <section className="mt-6">
            <Titulo>Registo fotográfico</Titulo>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {anexos
                .filter((a) => (a.mime ?? "").startsWith("image/"))
                .map((a) => (
                  <figure key={a.id} className="break-inside-avoid">
                    {urls.get(a.caminho) ? (
                      <img
                        src={urls.get(a.caminho)}
                        alt={a.legenda ?? a.nome}
                        className="w-full rounded-lg ring-1 ring-slate-200"
                      />
                    ) : (
                      <div className="aspect-[4/3] rounded-lg bg-slate-50 ring-1 ring-slate-200" />
                    )}
                    {a.legenda && (
                      <figcaption className="mt-1 text-xs text-slate-500">{a.legenda}</figcaption>
                    )}
                  </figure>
                ))}
            </div>
          </section>
        )}

        <footer className="mt-8 flex flex-wrap items-end justify-between gap-4 border-t border-slate-200 pt-4 text-xs text-slate-400">
          <p>
            Emitido a {dataHora(new Date().toISOString())} · {ordem.codigo}
          </p>
          {/* Com assinatura recolhida, a linha em branco desaparece. Deixar as
              duas seria convidar a assinar por cima do que já está assinado. */}
          {assinatura ? (
            <div className="text-right">
              {urlAssinatura ? (
                <img
                  src={urlAssinatura}
                  alt={`Assinatura de ${assinatura.nome}`}
                  className="mb-1 ml-auto h-10 w-auto max-w-[12rem] object-contain"
                />
              ) : (
                <div className="mb-1 h-10 w-48" />
              )}
              <p className="border-t border-slate-300 pt-1 text-slate-600">
                {assinatura.nome}
                {assinatura.qualidade ? ` · ${assinatura.qualidade}` : ""}
              </p>
              <p>Assinado a {dataHora(assinatura.assinada_em)}</p>
            </div>
          ) : (
            <div className="text-right">
              <div className="mb-1 h-10 w-48 border-b border-slate-300" />
              <p>Assinatura do cliente</p>
            </div>
          )}
        </footer>
      </article>
    </>
  );
}

function Titulo({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</h2>
  );
}

function Facto({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{rotulo}</p>
      <p className="mt-0.5 text-slate-800">{valor}</p>
    </div>
  );
}

/** Uma leitura escrita como se lê em voz alta, não como está na base. */
function valorDaLeitura(m: MedicaoDaTarefa, opcoes: ReadonlyMap<string, string>): string {
  if (m.valor_num != null) {
    return `${Number(m.valor_num).toLocaleString("pt-PT", { maximumFractionDigits: 3 })}${
      m.unidade ? ` ${m.unidade}` : ""
    }`;
  }
  if (m.valor_texto) return m.valor_texto;
  if (m.opcao_id) {
    return opcoes.get(m.opcao_id) ?? (m.conforme === false ? "não conforme" : "conforme");
  }
  return "—";
}
