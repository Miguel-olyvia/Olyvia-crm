import { useMemo, useState } from "react";
import {
  duplicarLocal,
  moverAtivo,
  removerAtivo,
  removerLocal,
  type CategoriaAtivo,
  type CentroCusto,
} from "../lib/config";
import { ErroDeEscrita, type AtivoRow, type Cliente, type LocalRow } from "../lib/dados";
import { arvoreDe, type ComFilhos } from "../domain/arvore-de-locais";
import { Button, Card, ConfirmDialog, Input, Modal, cx } from "./ui";
import {
  Building,
  ChevronDown,
  ChevronRight,
  Layers,
  MapPin,
  Plus,
  Search,
  X,
} from "./icons";
import { IconeDoAtivo } from "./IconeDeLinha";
import FormAtivoDoLocal from "./FormAtivoDoLocal";
import BotaoDuplicar from "./BotaoDuplicar";
import FormLocal from "./FormLocal";
import EtiquetasQR from "./EtiquetasQR";
import HistoricoDoAtivo from "./Historico";

/**
 * A morada inteira, num ecrã só.
 *
 * ⚠ **Um espaço não tem página própria, e é de propósito.** Quem usou isto
 * disse-o assim: "não faz sentido cada sítio e cada espaço ter a sua página".
 * Tinha razão — para meter um extintor na box 12 da garagem eram três cliques
 * e três carregamentos de página, e a meio já ninguém sabia onde estava.
 *
 * Agora abre-se a morada e vê-se tudo, a qualquer profundidade:
 *
 *     ▼ Torre A                        [+ Equipamento] [+ Espaço]
 *         EXT-0001 · Extintor da entrada
 *       ▼ Garagem −1                   [+ Equipamento] [+ Espaço] [editar] [✕]
 *           EXT-0004 · Extintor da rampa
 *         ▸ Box 12
 *       ▸ Piso 3
 *
 * Cada degrau gere-se onde está: acrescentar um equipamento, abrir um espaço
 * lá dentro, mudar o nome, remover. Sem mudar de página, e sem perder de vista
 * onde se está.
 *
 * Duas decisões que vale a pena saber:
 *
 *  - **Remover nunca apaga.** Põe `ativo = false` e o item sai das listas. As
 *    ordens que apontam para ele ficam intactas — um `DELETE` ia em cascata
 *    pelo histórico. Há uma gaveta em baixo para repor.
 *  - **Um espaço com coisas lá dentro não se remove.** O diálogo deixa de ser
 *    um botão vermelho e passa a dizer o que fazer primeiro.
 */

const COR_CRITICIDADE: Record<string, string> = {
  critica: "bg-red-50 text-red-700 ring-red-200",
  alta: "bg-amber-50 text-amber-800 ring-amber-200",
  normal: "bg-slate-100 text-slate-600 ring-slate-200",
  baixa: "bg-slate-50 text-slate-400 ring-slate-200",
};

type APedirConfirmacao =
  | { tipo: "ativo"; id: string; nome: string }
  | { tipo: "espaco"; id: string; nome: string; quantos: number };

/** Um espaço com coisas lá dentro não se remove: ficariam sem casa. */
function naoDaParaRemover(o: APedirConfirmacao): boolean {
  return o.tipo === "espaco" && o.quantos > 0;
}

export default function EstruturaDoLocal({
  raiz,
  daArvore,
  ativos,
  removidos,
  espacosRemovidos,
  categorias,
  centros,
  clientes,
  podeEditar,
  orgId,
  emFoco,
  abertos,
  alternar,
  aoGravar,
}: {
  /** A morada. É a única coisa que tem página. */
  raiz: LocalRow;
  /** A morada e tudo o que pende dela, em lista plana. */
  daArvore: readonly LocalRow[];
  /** Os equipamentos de toda a árvore. */
  ativos: readonly AtivoRow[];
  removidos: readonly AtivoRow[];
  espacosRemovidos: readonly LocalRow[];
  categorias: readonly CategoriaAtivo[];
  centros: readonly CentroCusto[];
  clientes: readonly Cliente[];
  podeEditar: boolean;
  orgId: string;
  /** O espaço a que alguém chegou por link direto, para se destacar. */
  emFoco: string | null;
  abertos: ReadonlySet<string>;
  alternar: (id: string) => void;
  aoGravar: () => void;
}) {
  const [novoEm, setNovoEm] = useState<string | null>(null);
  const [espacoEm, setEspacoEm] = useState<LocalRow | null>(null);
  const [aEditarLocal, setAEditarLocal] = useState<LocalRow | null>(null);
  const [aEditar, setAEditar] = useState<string | null>(null);
  const [comHistorico, setComHistorico] = useState<string | null>(null);
  const [comEtiquetas, setComEtiquetas] = useState(false);
  const [procura, setProcura] = useState("");
  const [aConfirmar, setAConfirmar] = useState<APedirConfirmacao | null>(null);
  const [verRemovidos, setVerRemovidos] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Arrastar: o que vai na mão, e por cima de que degrau está.
  const [aArrastar, setAArrastar] = useState<AtivoRow | null>(null);
  const [porCima, setPorCima] = useState<string | null>(null);
  // O caminho para telemóvel: arrastar não funciona com o dedo, e um
  // equipamento que só se pode mudar de local no computador é um equipamento
  // que fica onde está.
  const [aMover, setAMover] = useState<AtivoRow | null>(null);

  const porCategoria = useMemo(
    () => new Map(categorias.map((c) => [c.id, c.nome])),
    [categorias]
  );

  const arvore = useMemo(
    () => arvoreDe(daArvore, raiz.id, (a, b) => a.nome.localeCompare(b.nome, "pt")),
    [daArvore, raiz.id]
  );

  // A procura corre a árvore toda e abre os degraus onde encontra alguma
  // coisa — procurar e depois ter de abrir sete gavetas à mão não é procurar.
  const q = procura.trim().toLowerCase();
  const filtrados = useMemo(() => {
    if (!q) return ativos;
    return ativos.filter((a) =>
      [a.codigo, a.nome, a.marca, a.modelo, a.num_serie, porCategoria.get(a.categoria_id ?? "")]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(q))
    );
  }, [ativos, q, porCategoria]);

  const daqui = (id: string) => filtrados.filter((a) => a.local_id === id);
  const quantosNo = (id: string) => ativos.filter((a) => a.local_id === id).length;

  /** Quantos equipamentos há aqui e em tudo o que pende daqui. */
  const totalEm = (no: ComFilhos<LocalRow>): number =>
    daqui(no.id).length + no.filhos.reduce((n, f) => n + totalEm(f), 0);

  const remover = async (o: APedirConfirmacao) => {
    setErro(null);
    try {
      if (o.tipo === "ativo") await removerAtivo(o.id, true);
      else await removerLocal(o.id, true);
      setAConfirmar(null);
      aoGravar();
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível remover.");
      setAConfirmar(null);
    }
  };

  /**
   * Largar um equipamento noutro degrau.
   *
   * A mudança fica no histórico do equipamento sozinha — há um gatilho na
   * base que escreve "Mudou de local". É por isso que se muda em vez de se
   * apagar e criar outro: o histórico é metade da razão de ele existir.
   */
  const largar = async (a: AtivoRow, destino: string) => {
    setPorCima(null);
    setAArrastar(null);
    if (a.local_id === destino) return;
    setErro(null);
    try {
      await moverAtivo(a.id, destino);
      aoGravar();
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível mover.");
    }
  };

  const repor = async (tipo: "ativo" | "espaco", id: string) => {
    setErro(null);
    try {
      if (tipo === "ativo") await removerAtivo(id, false);
      else await removerLocal(id, false);
      aoGravar();
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível repor.");
    }
  };

  const linhaDeAtivo = (a: AtivoRow, dono: LocalRow, recuo: number) =>
    aEditar === a.id ? (
      <li key={a.id} className="py-1" style={{ paddingLeft: `${recuo}px` }}>
        <FormAtivoDoLocal
          orgId={orgId}
          localId={dono.id}
          ativo={a}
          categorias={categorias}
          centros={centros}
          aoFechar={() => setAEditar(null)}
          aoGravar={() => {
            setAEditar(null);
            aoGravar();
          }}
        />
      </li>
    ) : (
      <li
        key={a.id}
        // Arrastar para outro degrau muda o equipamento de local. Só para
        // quem pode editar: arrastar e ver a coisa voltar ao lugar seria pior
        // do que não arrastar de todo.
        draggable={podeEditar}
        onDragStart={(e) => {
          setAArrastar(a);
          e.dataTransfer.effectAllowed = "move";
          // Alguns browsers recusam o arrasto sem dados; o id serve também
          // para o caso de o estado se perder pelo caminho.
          e.dataTransfer.setData("text/plain", a.id);
        }}
        onDragEnd={() => {
          setAArrastar(null);
          setPorCima(null);
        }}
        className={cx(
          "flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 py-2 first:border-t-0",
          podeEditar && "cursor-grab active:cursor-grabbing",
          aArrastar?.id === a.id && "opacity-40"
        )}
        style={{ paddingLeft: `${recuo}px` }}
      >
        <IconeDoAtivo criticidade={a.criticidade} />
        <span className="w-24 shrink-0 truncate font-mono text-[11px] text-slate-400">
          {a.codigo}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-slate-800">{a.nome}</p>
          <p className="truncate text-xs text-slate-500">
            {[
              porCategoria.get(a.categoria_id ?? ""),
              [a.marca, a.modelo].filter(Boolean).join(" "),
              a.num_serie ? `nº ${a.num_serie}` : null,
            ]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
        </div>
        {a.criticidade !== "normal" && (
          <span
            className={cx(
              "shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
              COR_CRITICIDADE[a.criticidade] ?? COR_CRITICIDADE.normal
            )}
          >
            {a.criticidade}
          </span>
        )}
        <button
          type="button"
          onClick={() => setComHistorico(comHistorico === a.id ? null : a.id)}
          className="shrink-0 text-xs text-slate-400 underline-offset-2 hover:text-slate-700 hover:underline"
        >
          histórico
        </button>
        {podeEditar && (
          <>
            <button
              type="button"
              onClick={() => {
                setAEditar(a.id);
                setNovoEm(null);
              }}
              className="shrink-0 text-xs text-slate-400 underline-offset-2 hover:text-slate-700 hover:underline"
            >
              editar
            </button>
            <button
              type="button"
              onClick={() => setAMover(a)}
              className="shrink-0 text-xs text-slate-400 underline-offset-2 hover:text-slate-700 hover:underline"
            >
              mover
            </button>
            <button
              type="button"
              onClick={() => setAConfirmar({ tipo: "ativo", id: a.id, nome: a.nome })}
              aria-label={`Remover ${a.nome}`}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-300 transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <X width={13} height={13} />
            </button>
          </>
        )}
        {comHistorico === a.id && (
          <div className="w-full rounded-lg bg-slate-50 p-3">
            <HistoricoDoAtivo entidade="ativo" entidadeId={a.id} />
          </div>
        )}
      </li>
    );

  /** Um degrau da árvore, e por baixo o que ele tem. */
  const degrau = (no: ComFilhos<LocalRow>, nivel: number) => {
    const eRaiz = no.id === raiz.id;
    const seus = daqui(no.id);
    // A procura manda: um degrau com resultados abre-se sozinho.
    const aberto = eRaiz || abertos.has(no.id) || (q !== "" && totalEm(no) > 0);
    const daParaAbrir = no.filhos.length > 0 || seus.length > 0;
    const recuo = nivel * 16;

    // Não se larga em cima de onde já se está: o degrau de origem não se
    // acende, senão toda a árvore parece um destino válido.
    const podeReceber =
      podeEditar && aArrastar !== null && aArrastar.local_id !== no.id;

    return (
      <div key={no.id}>
        <div
          onDragOver={(e) => {
            if (!podeReceber) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setPorCima(no.id);
          }}
          onDragLeave={() => setPorCima((p) => (p === no.id ? null : p))}
          onDrop={(e) => {
            if (!podeReceber || !aArrastar) return;
            e.preventDefault();
            void largar(aArrastar, no.id);
          }}
          className={cx(
            "flex flex-wrap items-center justify-between gap-2 rounded-lg py-1.5 pr-1 transition-colors",
            porCima === no.id && podeReceber
              ? "bg-brand-100 ring-2 ring-brand ring-offset-1"
              : podeReceber
                ? "bg-brand-50/40 ring-1 ring-dashed ring-brand-200"
                : emFoco === no.id
                  ? "bg-brand-50 ring-1 ring-brand-200"
                  : "hover:bg-slate-50"
          )}
          style={{ paddingLeft: `${recuo}px` }}
        >
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            {daParaAbrir && !eRaiz ? (
              <button
                type="button"
                onClick={() => alternar(no.id)}
                aria-label={aberto ? `Fechar ${no.nome}` : `Abrir ${no.nome}`}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-slate-400 hover:text-slate-700"
              >
                {aberto ? (
                  <ChevronDown width={14} height={14} />
                ) : (
                  <ChevronRight width={14} height={14} />
                )}
              </button>
            ) : (
              <span className="h-6 w-6 shrink-0" />
            )}

            {eRaiz ? (
              <MapPin width={14} height={14} className="shrink-0 text-brand" />
            ) : (
              <Building width={14} height={14} className="shrink-0 text-slate-400" />
            )}

            <span
              className={cx(
                "min-w-0 truncate text-sm",
                eRaiz ? "font-semibold text-slate-900" : "font-medium text-slate-800"
              )}
            >
              {no.nome}
            </span>

            <span className="shrink-0 text-xs text-slate-400">
              {contagem(seus.length, totalEm(no))}
            </span>
          </div>

          {podeEditar && (
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setNovoEm(novoEm === no.id ? null : no.id);
                  setAEditar(null);
                }}
                title={`Novo equipamento em ${no.nome}`}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
              >
                <Plus width={12} height={12} /> Equipamento
              </button>
              <button
                type="button"
                onClick={() => setEspacoEm(no)}
                title={`Novo espaço dentro de ${no.nome}`}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
              >
                <Plus width={12} height={12} /> Espaço
              </button>
              {!eRaiz && (
                <>
                  <button
                    type="button"
                    onClick={() => setAEditarLocal(no)}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  >
                    editar
                  </button>
                  {/*
                    Trinta boxes iguais numa garagem eram trinta formulários.
                    A cópia nasce ao lado desta — mesmo pai — e leva o que
                    está cá dentro.
                  */}
                  <BotaoDuplicar
                    discreto
                    rotulo="duplicar"
                    titulo={`Duplicar ${no.nome}`}
                    nomeSugerido={`${no.nome} (cópia)`}
                    exigeNome
                    oQueNaoLeva={[
                      "os números de série dos equipamentos",
                      "as ordens e o histórico",
                    ]}
                    comAtivos={{
                      rotulo: "Levar o que está cá dentro",
                      hint: "Os espaços e os equipamentos, com códigos novos.",
                    }}
                    duplicar={(nome, levar) => duplicarLocal(no.id, nome, levar, levar)}
                    aoAcabar={aoGravar}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setAConfirmar({
                        tipo: "espaco",
                        id: no.id,
                        nome: no.nome,
                        quantos: quantosNo(no.id) + no.filhos.length,
                      })
                    }
                    aria-label={`Remover ${no.nome}`}
                    className="flex h-6 w-6 items-center justify-center rounded text-slate-300 transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    <X width={13} height={13} />
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {novoEm === no.id && (
          <div className="py-1.5" style={{ paddingLeft: `${recuo + 24}px` }}>
            <FormAtivoDoLocal
              orgId={orgId}
              localId={no.id}
              categorias={categorias}
              centros={centros}
              aoFechar={() => setNovoEm(null)}
              aoGravar={() => {
                setNovoEm(null);
                aoGravar();
              }}
            />
          </div>
        )}

        {aberto && (
          <>
            {seus.length > 0 && <ul>{seus.map((a) => linhaDeAtivo(a, no, recuo + 24))}</ul>}
            {seus.length === 0 && novoEm !== no.id && no.filhos.length === 0 && (
              <p
                className="py-1.5 text-xs text-slate-400"
                style={{ paddingLeft: `${recuo + 24}px` }}
              >
                {q ? "Nada com esse nome aqui." : "Sem equipamentos."}
              </p>
            )}
            {no.filhos.map((f) => degrau(f, nivel + 1))}
          </>
        )}
      </div>
    );
  };

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
          <Layers width={15} height={15} className="text-slate-400" />
          O que está aqui dentro
          {daArvore.length > 1 && (
            <span className="font-normal text-slate-400">
              · {daArvore.length - 1} {daArvore.length === 2 ? "espaço" : "espaços"}
            </span>
          )}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {ativos.length > 6 && (
            <div className="relative">
              <Search
                width={14}
                height={14}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <Input
                value={procura}
                onChange={(e) => setProcura(e.target.value)}
                placeholder="Procurar em tudo…"
                className="w-40 pl-8 sm:w-56"
              />
            </div>
          )}
          {ativos.length > 0 && (
            <Button size="sm" variant="secondary" onClick={() => setComEtiquetas(true)}>
              Etiquetas QR
            </Button>
          )}
        </div>
      </div>

      {erro && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>
      )}

      {podeEditar && daArvore.length > 1 && (
        <p className="mt-2 text-xs text-slate-400">
          Arrasta um equipamento para outro degrau para o mudar de local — ou
          carrega em <span className="font-medium">mover</span>, que é o que
          funciona no telemóvel.
        </p>
      )}

      <div className="mt-3">{arvore && degrau(arvore, 0)}</div>

      {/* A gaveta. Fechada, porque o que foi removido não é para estar à
          frente de quem trabalha — mas tem de existir, senão remover é uma
          decisão sem volta tomada com um clique. */}
      {(removidos.length > 0 || espacosRemovidos.length > 0) && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => setVerRemovidos((v) => !v)}
            className="text-xs font-medium text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline"
          >
            {verRemovidos ? "Esconder" : "Ver"} o que foi removido (
            {removidos.length + espacosRemovidos.length})
          </button>

          {verRemovidos && (
            <ul className="mt-2 space-y-1.5">
              {espacosRemovidos.map((l) => (
                <li
                  key={l.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"
                >
                  <Building width={13} height={13} className="shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-500">{l.nome}</span>
                  <span className="shrink-0 text-[11px] text-slate-400">espaço</span>
                  {podeEditar && (
                    <button
                      type="button"
                      onClick={() => void repor("espaco", l.id)}
                      className="shrink-0 text-xs font-medium text-brand hover:underline"
                    >
                      repor
                    </button>
                  )}
                </li>
              ))}
              {removidos.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"
                >
                  <span className="w-24 shrink-0 truncate font-mono text-[11px] text-slate-400">
                    {a.codigo}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-500">{a.nome}</span>
                  {podeEditar && (
                    <button
                      type="button"
                      onClick={() => void repor("ativo", a.id)}
                      className="shrink-0 text-xs font-medium text-brand hover:underline"
                    >
                      repor
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {comEtiquetas && (
        <EtiquetasQR local={raiz} ativos={ativos} aoFechar={() => setComEtiquetas(false)} />
      )}

      {aMover && (
        <Modal title={`Mover ${aMover.nome}`} onClose={() => setAMover(null)} size="sm">
          <p className="text-sm text-slate-500">
            Para onde vai? A mudança fica no histórico do equipamento.
          </p>
          <ul className="mt-3 space-y-1">
            {daArvore.map((l) => {
              const aqui = l.id === aMover.local_id;
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    disabled={aqui}
                    onClick={() => {
                      const oQue = aMover;
                      setAMover(null);
                      void largar(oQue, l.id);
                    }}
                    className={cx(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm",
                      "ring-1 transition-all",
                      aqui
                        ? "cursor-default bg-slate-50 text-slate-400 ring-slate-200"
                        : "bg-white text-slate-700 ring-slate-200 hover:ring-brand/40 active:scale-[0.99]"
                    )}
                  >
                    {l.id === raiz.id ? (
                      <MapPin width={13} height={13} className="shrink-0 text-brand" />
                    ) : (
                      <Building width={13} height={13} className="shrink-0 text-slate-400" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{l.nome}</span>
                    {aqui && <span className="shrink-0 text-xs">está aqui</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </Modal>
      )}

      {espacoEm && (
        <FormLocal
          dentroDe={espacoEm}
          clientes={clientes}
          aoFechar={() => setEspacoEm(null)}
          aoGravar={() => {
            setEspacoEm(null);
            aoGravar();
          }}
        />
      )}

      {aEditarLocal && (
        <FormLocal
          local={aEditarLocal}
          clientes={clientes}
          aoFechar={() => setAEditarLocal(null)}
          aoGravar={() => {
            setAEditarLocal(null);
            aoGravar();
          }}
        />
      )}

      {aConfirmar && (
        <ConfirmDialog
          title={
            aConfirmar.tipo === "ativo"
              ? `Remover ${aConfirmar.nome}?`
              : `Remover o espaço ${aConfirmar.nome}?`
          }
          // Um espaço cheio não se remove. Em vez de um botão vermelho que não
          // faz nada, o diálogo passa a ser um aviso e diz o que fazer.
          tone={naoDaParaRemover(aConfirmar) ? "brand" : "danger"}
          confirmLabel={naoDaParaRemover(aConfirmar) ? "Entendido" : "Remover"}
          message={
            naoDaParaRemover(aConfirmar) ? (
              <>
                Este espaço ainda tem coisas lá dentro. Tira-as primeiro, ou
                muda-as de sítio — assim ficariam sem casa e ninguém as
                encontrava.
              </>
            ) : (
              <>
                Sai das listas, mas <strong>não se apaga</strong>: as ordens que já
                passaram por aqui ficam como estão, e podes repô-lo a qualquer
                momento na gaveta &ldquo;o que foi removido&rdquo;.
              </>
            )
          }
          onCancel={() => setAConfirmar(null)}
          onConfirm={() => {
            if (naoDaParaRemover(aConfirmar)) {
              setAConfirmar(null);
              return;
            }
            void remover(aConfirmar);
          }}
        />
      )}
    </Card>
  );
}

/**
 * &ldquo;3&rdquo; quando é tudo aqui, &ldquo;1 · 12 ao todo&rdquo; quando há
 * mais lá dentro. Um número só, num degrau que esconde doze, mente.
 */
function contagem(proprios: number, tudo: number): string {
  if (tudo === 0) return "vazio";
  if (proprios === tudo) return String(proprios);
  return `${proprios} · ${tudo} ao todo`;
}
