import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  ErroDeDados,
  listarClientes,
  listarLocais,
  listarOrdens,
  ordensParaContar,
  type Cliente,
  type LinhaOrdem,
  type LocalRow,
  type OrdemParaContar,
} from "../lib/dados";
import { listarPessoas, type Pessoa } from "../lib/config";
import {
  Badge,
  Card,
  Chip,
  Combobox,
  EmptyState,
  ErrorState,
  EstadoOrdem,
  Field,
  Input,
  OrigemOrdem,
  PrioridadeOrdem,
  Select,
  Skeleton,
  cx,
} from "../components/ui";
import { useRotulos } from "../auth/Rotulos";
import {
  ORDENACOES,
  aplicarFiltro,
  ordenar,
  quantosFiltros,
  temFiltro,
  type Filtro,
  type Ordenacao,
} from "../domain/filtros-de-ordens";
import { agruparPorQuando } from "../domain/agrupar-ordens";
import { AlertTriangle, Inbox, Listar, MapPin, Plus, Search, User, X } from "../components/icons";
import { IconeDaOrdem, IconeDoEstado } from "../components/IconeDeLinha";
import { alertasDaOrdem, severidadeMaxima } from "../domain/alertas";
import { estaAtrasada } from "../domain/estados";
import type { Estado } from "../domain/tipos";

/**
 * UMA lista para as três origens.
 *
 * Substitui `/works` + `/scheduled-works` + `/failures` do Infraspeak — três
 * ecrãs para o mesmo objeto, cada um com o seu conjunto de separadores e o seu
 * vocabulário. Aqui as vistas guardadas são filtros da mesma lista, não
 * páginas diferentes.
 *
 * Três decisões de desenho que valem a pena explicar:
 *
 *  · **O estado da lista vive no endereço.** Vista, pesquisa, filtros e
 *    ordenação vão todos para a barra de endereço. Isso resolve três coisas de
 *    uma vez: recarregar não perde nada, o botão "voltar" volta mesmo, e um
 *    link colado no chat abre a mesma lista do outro lado. Antes disto, quem
 *    trabalhava sempre com o mesmo cliente escolhia-o outra vez todos os dias.
 *
 *  · **A pesquisa espera.** Cada letra escrita era uma consulta à base. A
 *    palavra "compressor" mandava dez, e a última a chegar é que ganhava — o
 *    que dava resultados a piscar e, com rede fraca, resultados errados.
 *
 *  · **A lista parte-se por quando é o trabalho.** Setenta linhas com o mesmo
 *    peso obrigam a ler a data de cada uma. Ver `domain/agrupar-ordens.ts`.
 */

interface Vista {
  chave: string;
  rotulo: string;
  estados?: readonly Estado[];
  /** Filtro que não se exprime em SQL simples — aplicado depois. */
  soAtrasadas?: boolean;
  /** O que esta vista responde, para quem passa o rato. */
  explicacao: string;
}

const VISTAS: Vista[] = [
  {
    chave: "abertas",
    rotulo: "Abertas",
    estados: ["por_aprovar", "agendada", "em_curso", "pausada"],
    explicacao: "Tudo o que ainda consome atenção de alguém.",
  },
  {
    chave: "por-aprovar",
    rotulo: "Por aprovar",
    estados: ["por_aprovar"],
    explicacao: "Trabalho novo, à espera de uma decisão de quem coordena.",
  },
  {
    chave: "atrasadas",
    rotulo: "Atrasadas",
    estados: ["agendada", "em_curso"],
    soAtrasadas: true,
    explicacao: "A data marcada já passou e o trabalho continua por fechar.",
  },
  {
    chave: "em-curso",
    rotulo: "Em curso",
    estados: ["em_curso", "pausada"],
    explicacao: "Alguém já lhes pegou — a trabalhar ou em pausa.",
  },
  {
    chave: "por-confirmar",
    rotulo: "Por confirmar",
    estados: ["fechada"],
    explicacao: "O trabalho está feito. Falta confirmar — é aí que o relatório sai.",
  },
  {
    chave: "historico",
    rotulo: "Histórico",
    estados: ["confirmada", "cancelada"],
    explicacao: "O que já acabou, e o que foi cancelado.",
  },
];

function paraData(v: string | null): Date | null {
  return v ? new Date(v) : null;
}

/** "hoje 09h", "amanhã", "30/08", ou "—" quando não há data. */
function quando(iso: string | null, agora: Date): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const dia = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
  const diff = Math.round((dia.getTime() - hoje.getTime()) / 86_400_000);
  const horas = `${String(d.getHours()).padStart(2, "0")}h${
    d.getMinutes() ? String(d.getMinutes()).padStart(2, "0") : ""
  }`;
  if (diff === 0) return `hoje ${horas}`;
  if (diff === 1) return `amanhã ${horas}`;
  if (diff === -1) return `ontem ${horas}`;
  return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" });
}

/* ──────────────────────── O estado, no endereço ────────────────────────── */

/** As chaves que a lista guarda no URL. Uma por pergunta que ela responde. */
const CHAVES = {
  vista: "vista",
  pesquisa: "q",
  responsavel: "quem",
  cliente: "cliente",
  prioridade: "prio",
  origem: "natureza",
  ordenacao: "ord",
} as const;

function filtroDoEndereco(p: URLSearchParams): Filtro {
  return {
    responsavelId: p.get(CHAVES.responsavel) || null,
    clienteId: p.get(CHAVES.cliente) || null,
    prioridade: p.get(CHAVES.prioridade) || null,
    origem: p.get(CHAVES.origem) || null,
  };
}

export default function Ordens() {
  const { activeOrgId, businessUserId } = useAuth();
  const rotulos = useRotulos();
  const [params, setParams] = useSearchParams();
  const vistaAtual = params.get(CHAVES.vista) ?? "abertas";
  const vista = VISTAS.find((v) => v.chave === vistaAtual) ?? VISTAS[0];

  /*
   * A pesquisa tem duas caras: a que se escreve, que muda a cada letra, e a
   * que se procura, que só muda quando se para de escrever. Sem esta separação
   * a caixa de texto ficava presa à velocidade da rede.
   */
  const [pesquisa, setPesquisa] = useState(params.get(CHAVES.pesquisa) ?? "");
  const [termo, setTermo] = useState(pesquisa);

  const [ordens, setOrdens] = useState<LinhaOrdem[] | null>(null);
  const [paraContar, setParaContar] = useState<OrdemParaContar[]>([]);
  const [clientes, setClientes] = useState<Map<string, string>>(new Map());
  const [listaClientes, setListaClientes] = useState<Cliente[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [locais, setLocais] = useState<Map<string, string>>(new Map());
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [comFiltros, setComFiltros] = useState(false);
  const caixaDePesquisa = useRef<HTMLInputElement>(null);

  const filtro = useMemo(() => filtroDoEndereco(params), [params]);
  const como = (params.get(CHAVES.ordenacao) as Ordenacao) || "data";

  const agora = useMemo(() => new Date(), [ordens]);

  /*
   * Todas as escritas ao endereço são funções do endereço anterior, e nunca de
   * uma cópia apanhada no render.
   *
   * A pesquisa escreve 300 ms depois de se parar de escrever. Nesse intervalo
   * cabe perfeitamente um clique num filtro — e com uma cópia velha nas mãos, a
   * escrita atrasada apagava o filtro que tinha acabado de ser ligado. Um bug
   * destes aparece uma vez em cada vinte e é impossível de reproduzir a pedido.
   */
  const mudar = (chave: string, valor: string | null) => {
    setParams(
      (antes) => {
        const p = new URLSearchParams(antes);
        if (valor) p.set(chave, valor);
        else p.delete(chave);
        return p;
      },
      { replace: true }
    );
  };

  const CAMPOS: [keyof Filtro, string][] = [
    ["responsavelId", CHAVES.responsavel],
    ["clienteId", CHAVES.cliente],
    ["prioridade", CHAVES.prioridade],
    ["origem", CHAVES.origem],
  ];

  const mudarFiltro = (parte: Partial<Filtro>) => {
    setParams(
      (antes) => {
        const p = new URLSearchParams(antes);
        for (const [campo, chave] of CAMPOS) {
          if (!(campo in parte)) continue;
          const v = parte[campo];
          if (v) p.set(chave, String(v));
          else p.delete(chave);
        }
        return p;
      },
      { replace: true }
    );
  };

  const limparFiltros = () => {
    setParams(
      (antes) => {
        const p = new URLSearchParams(antes);
        for (const [, chave] of CAMPOS) p.delete(chave);
        return p;
      },
      { replace: true }
    );
  };

  // A pesquisa só chega à base — e ao endereço — quando os dedos param.
  useEffect(() => {
    const t = setTimeout(() => {
      setTermo(pesquisa);
      mudar(CHAVES.pesquisa, pesquisa.trim() || null);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pesquisa]);

  /*
   * `/` põe o cursor na pesquisa, como em toda a parte. Não rouba a tecla a
   * quem está a escrever noutro campo — isso seria pior do que não haver atalho
   * nenhum.
   */
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName)) return;
      if (alvo?.isContentEditable) return;
      e.preventDefault();
      caixaDePesquisa.current?.focus();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, []);

  useEffect(() => {
    if (!activeOrgId) return;
    let vivo = true;
    setOrdens(null);
    setErro(null);

    (async () => {
      try {
        const [linhas, cls, ps, ls, contar] = await Promise.all([
          listarOrdens(activeOrgId, {
            estados: vista.estados,
            pesquisa: termo.trim() || undefined,
          }),
          listarClientes(activeOrgId),
          listarPessoas(activeOrgId).catch(() => [] as Pessoa[]),
          listarLocais(activeOrgId).catch(() => [] as LocalRow[]),
          ordensParaContar(activeOrgId),
        ]);
        if (!vivo) return;
        setOrdens(linhas);
        setClientes(new Map(cls.map((c: Cliente) => [c.id, c.nome])));
        setListaClientes(cls);
        setPessoas(ps.filter((x) => x.em_operacoes));
        setLocais(new Map(ls.map((l) => [l.id, l.nome])));
        setParaContar(contar);
      } catch (e) {
        if (!vivo) return;
        setErro(e instanceof ErroDeDados ? e.message : "Algo correu mal a carregar as ordens.");
        setOrdens([]);
      }
    })();

    return () => {
      vivo = false;
    };
  }, [activeOrgId, vista.chave, vista.estados, termo, tentativa]);

  /**
   * O número que cada separador mostra.
   *
   * É a contagem sem filtros — a pergunta é "quanto trabalho há nesse estado",
   * e não "quanto trabalho há nesse estado depois de eu estreitar a lista".
   * O histórico não leva número: cresce para sempre, e "4318" não ajuda
   * ninguém a decidir nada.
   */
  const contagens = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of VISTAS) {
      if (v.chave === "historico" || !v.estados) continue;
      const n = paraContar.filter((o) => {
        if (!v.estados!.includes(o.estado)) return false;
        if (!v.soAtrasadas) return true;
        return estaAtrasada(o.estado, paraData(o.agendada_para), agora);
      }).length;
      m.set(v.chave, n);
    }
    return m;
  }, [paraContar, agora]);

  // "Atrasada" é um badge derivado, não um estado guardado — por isso este
  // filtro vive aqui e não na consulta.
  const visiveis = useMemo(() => {
    if (!ordens) return null;
    if (!vista.soAtrasadas) return ordens;
    return ordens.filter((o) =>
      estaAtrasada(o.estado, paraData(o.agendada_para), agora)
    );
  }, [ordens, vista.soAtrasadas, agora]);

  const nomeCliente = useMemo(() => (id: string) => clientes.get(id) ?? null, [clientes]);

  const listadas = useMemo(() => {
    if (!visiveis) return null;
    return ordenar(aplicarFiltro(visiveis, filtro, nomeCliente), como);
  }, [visiveis, filtro, nomeCliente, como]);

  /*
   * Só se agrupa por data quando é por data que se está a ordenar. Cabeçalhos
   * de dia por cima de uma lista ordenada por prioridade seriam duas respostas
   * contraditórias no mesmo ecrã.
   */
  const grupos = useMemo(
    () => (listadas && como === "data" ? agruparPorQuando(listadas, agora) : null),
    [listadas, como, agora]
  );

  const souEu = filtro.responsavelId === businessUserId && !!businessUserId;
  const nomeDe = (id: string) => pessoas.find((x) => x.utilizador_id === id)?.nome ?? null;

  const linha = (o: LinhaOrdem) => (
    <LinhaDeOrdem
      key={o.id}
      ordem={o}
      cliente={clientes.get(o.cliente_id) ?? null}
      local={o.local_id ? (locais.get(o.local_id) ?? null) : null}
      quem={o.responsavel_id ? nomeDe(o.responsavel_id) : null}
      agora={agora}
    />
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Ordens</h1>

        <div className="flex w-full items-center gap-2 sm:w-auto">
          <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
            <Search
              width={15}
              height={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <Input
              ref={caixaDePesquisa}
              value={pesquisa}
              onChange={(e) => setPesquisa(e.target.value)}
              placeholder="Código, título ou cliente…"
              aria-label="Pesquisar ordens"
              className="pl-9 pr-8"
            />
            {pesquisa && (
              <button
                type="button"
                onClick={() => {
                  setPesquisa("");
                  caixaDePesquisa.current?.focus();
                }}
                aria-label="Limpar a pesquisa"
                className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              >
                <X width={13} height={13} />
              </button>
            )}
          </div>

          <Link
            to="/ordens/nova"
            className={cx(
              "inline-flex shrink-0 items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-sm",
              "font-medium text-white shadow-sm transition-all hover:bg-brand-dark active:scale-[0.98]"
            )}
          >
            <Plus width={15} height={15} />
            <span className="hidden sm:inline">Nova ordem</span>
            <span className="sm:hidden">Nova</span>
          </Link>
        </div>
      </div>

      {/*
        A barra de comando fica colada ao topo enquanto se percorre a lista.
        Numa lista de setenta linhas, ter de subir ao princípio para trocar de
        vista é o que faz as pessoas deixarem de trocar de vista.

        `top-16` é a altura do cabeçalho da aplicação. `-mx-4 px-4` fá-la
        ocupar a largura toda do canvas, para o fundo não deixar ver as linhas
        a passar por trás nos cantos.
      */}
      <div className="sticky top-16 z-10 -mx-4 space-y-2.5 border-b border-slate-200/70 bg-slate-100/90 px-4 pb-2.5 pt-1 backdrop-blur">
        <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5">
          {VISTAS.map((v) => {
            const n = contagens.get(v.chave);
            const ligada = v.chave === vista.chave;
            return (
              <button
                key={v.chave}
                type="button"
                title={v.explicacao}
                onClick={() => mudar(CHAVES.vista, v.chave)}
                className={cx(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
                  ligada
                    ? "bg-brand-50 font-medium text-brand-800"
                    : "text-slate-500 hover:bg-slate-100"
                )}
              >
                {v.rotulo}
                {n !== undefined && n > 0 && (
                  <span
                    className={cx(
                      "rounded px-1.5 text-[11px] font-medium tabular-nums",
                      ligada
                        ? "bg-brand text-white"
                        : v.chave === "atrasadas"
                          ? "bg-red-100 text-red-700"
                          : "bg-slate-100 text-slate-500"
                    )}
                  >
                    {n}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {/* Um técnico faz esta pergunta dez vezes por dia. Estava a três
                toques de distância dentro de uma gaveta. */}
            {businessUserId && (
              <button
                type="button"
                onClick={() =>
                  mudarFiltro({ responsavelId: souEu ? null : businessUserId })
                }
                className={cx(
                  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 transition-colors",
                  souEu
                    ? "bg-brand text-white ring-brand"
                    : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300"
                )}
              >
                <User width={12} height={12} />
                As minhas
              </button>
            )}

            <button
              type="button"
              onClick={() => setComFiltros((v) => !v)}
              aria-expanded={comFiltros}
              className={cx(
                "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium ring-1 transition-colors",
                quantosFiltros(filtro) > 0
                  ? "bg-brand-50 text-brand-800 ring-brand-200"
                  : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-300"
              )}
            >
              <Listar width={13} height={13} />
              Filtros
              {quantosFiltros(filtro) > 0 && (
                <span className="rounded bg-brand px-1.5 text-[10px] text-white">
                  {quantosFiltros(filtro)}
                </span>
              )}
            </button>

            {/* As condições ligadas, uma a uma, com a porta para as tirar. */}
            {filtro.responsavelId && !souEu && (
              <Chip onRemover={() => mudarFiltro({ responsavelId: null })}>
                {filtro.responsavelId === "ninguem"
                  ? "Sem ninguém"
                  : (nomeDe(filtro.responsavelId) ?? "Pessoa")}
              </Chip>
            )}
            {filtro.clienteId && (
              <Chip onRemover={() => mudarFiltro({ clienteId: null })}>
                {nomeCliente(filtro.clienteId) ?? "Cliente"}
              </Chip>
            )}
            {filtro.prioridade && (
              <Chip onRemover={() => mudarFiltro({ prioridade: null })}>
                {rotulos.nome("prioridade", filtro.prioridade)}
              </Chip>
            )}
            {filtro.origem && (
              <Chip onRemover={() => mudarFiltro({ origem: null })}>
                {rotulos.nome("origem", filtro.origem)}
              </Chip>
            )}
            {temFiltro(filtro) && (
              <button
                type="button"
                onClick={limparFiltros}
                className="text-xs text-slate-400 underline-offset-2 hover:text-slate-700 hover:underline"
              >
                limpar
              </button>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {listadas && (
              <span className="text-xs tabular-nums text-slate-400">
                {listadas.length} {listadas.length === 1 ? "ordem" : "ordens"}
              </span>
            )}
            <Select
              value={como}
              onChange={(e) => mudar(CHAVES.ordenacao, e.target.value)}
              className="w-auto py-1.5 text-xs"
              aria-label="Ordenar por"
              title={ORDENACOES.find((x) => x.valor === como)?.porque}
            >
              {ORDENACOES.map((x) => (
                <option key={x.valor} value={x.valor}>
                  {x.nome}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      {comFiltros && (
        <Card className="p-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Quem">
              <Combobox
                value={filtro.responsavelId ?? ""}
                onChange={(v) => mudarFiltro({ responsavelId: v || null })}
                options={[
                  { value: "ninguem", label: "— sem ninguém —" },
                  ...pessoas.map((x) => ({ value: x.utilizador_id, label: x.nome })),
                ]}
                placeholder="Qualquer pessoa"
                className="w-full"
              />
            </Field>
            <Field label="Cliente">
              <Combobox
                value={filtro.clienteId ?? ""}
                onChange={(v) => mudarFiltro({ clienteId: v || null })}
                options={listaClientes.map((c) => ({ value: c.id, label: c.nome }))}
                placeholder="Qualquer cliente"
                className="w-full"
              />
            </Field>
            <Field label="Prioridade">
              <Select
                value={filtro.prioridade ?? ""}
                onChange={(e) => mudarFiltro({ prioridade: e.target.value || null })}
                className="w-full"
              >
                <option value="">Qualquer</option>
                {rotulos.opcoes("prioridade").map((x) => (
                  <option key={x.valor} value={x.valor}>
                    {x.nome}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Natureza">
              <Select
                value={filtro.origem ?? ""}
                onChange={(e) => mudarFiltro({ origem: e.target.value || null })}
                className="w-full"
              >
                <option value="">Qualquer</option>
                {rotulos.opcoes("origem").map((x) => (
                  <option key={x.valor} value={x.valor}>
                    {x.nome}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Card>
      )}

      {erro && <ErrorState message={erro} onRetry={() => setTentativa((t) => t + 1)} />}

      {listadas === null && !erro && (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[74px] w-full rounded-xl" />
          ))}
        </div>
      )}

      {listadas?.length === 0 && !erro && (
        <Card>
          <EmptyState
            icon={<Inbox width={22} height={22} />}
            title={
              termo.trim() || temFiltro(filtro) ? "Nada corresponde" : "Nada nesta vista"
            }
            description={
              termo.trim()
                ? `Nenhuma ordem com “${termo.trim()}” no código, no título ou no cliente.`
                : temFiltro(filtro)
                  ? "Nenhuma ordem passa nos filtros que estão ligados."
                  : vista.explicacao
            }
            action={
              termo.trim() || temFiltro(filtro) ? (
                <button
                  type="button"
                  onClick={() => {
                    setPesquisa("");
                    limparFiltros();
                  }}
                  className="text-sm font-medium text-brand underline underline-offset-2"
                >
                  Tirar a pesquisa e os filtros
                </button>
              ) : (
                <Link
                  to="/ordens/nova"
                  className="inline-flex items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-dark"
                >
                  <Plus width={15} height={15} /> Nova ordem
                </Link>
              )
            }
          />
        </Card>
      )}

      {/* Agrupada por quando é o trabalho, quando é por data que se ordena. */}
      {grupos && grupos.length > 0 && (
        <div className="space-y-5">
          {grupos.map((g) => (
            <section key={g.chave} className="space-y-2">
              <h2
                title={g.explicacao}
                className="flex items-center gap-2 px-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400"
              >
                <span className={cx(g.chave === "atrasadas" && "text-red-500")}>{g.rotulo}</span>
                <span className="tabular-nums font-normal text-slate-300">{g.ordens.length}</span>
                <span className="h-px flex-1 bg-slate-200/70" />
              </h2>
              <div className="space-y-2">{g.ordens.map(linha)}</div>
            </section>
          ))}
        </div>
      )}

      {!grupos && listadas && listadas.length > 0 && (
        <div className="space-y-2">{listadas.map(linha)}</div>
      )}
    </div>
  );
}

function LinhaDeOrdem({
  ordem,
  cliente,
  local,
  quem,
  agora,
}: {
  ordem: LinhaOrdem;
  cliente: string | null;
  /** Onde é o trabalho. Sem isto, duas ordens do mesmo cliente são iguais. */
  local: string | null;
  /** De quem é. Saber que não é de ninguém é metade da informação. */
  quem: string | null;
  agora: Date;
}) {
  const alertas = alertasDaOrdem(
    {
      estado: ordem.estado,
      agendadaPara: paraData(ordem.agendada_para),
      iniciadaEm: paraData(ordem.iniciada_em),
      ultimaAtividadeEm: paraData(ordem.atualizada_em),
      pausaRetomaPrevista: paraData(ordem.pausa_retoma_prevista),
      criadaEm: paraData(ordem.criada_em),
    },
    agora
  );
  const severidade = severidadeMaxima(alertas);

  return (
    <Link to={`/ordens/${ordem.codigo}`} className="block">
      <Card
        className={cx(
          "px-3 py-2.5 transition-all hover:border-brand-200 hover:bg-brand-50/30 hover:shadow-elevated sm:px-4 sm:py-3",
          severidade === "critico" && "border-l-[3px] border-l-red-400",
          severidade === "aviso" && "border-l-[3px] border-l-amber-400"
        )}
      >
        <div className="flex items-start gap-3">
          {/* Os dois ícones que abrem a linha: que espécie de trabalho é, e em
              que estado está. É o que faz uma lista de setenta linhas ser
              percorrida com os olhos em vez de lida. */}
          <div className="mt-0.5 flex shrink-0 items-center gap-1">
            <IconeDaOrdem origem={ordem.origem} />
            <IconeDoEstado estado={ordem.estado} />
          </div>

          <div className="min-w-0 flex-1">
            {/*
              Linha 1: o código e o título, na mesma altura.

              Antes, o código estava numa linha e o título noutra, com as
              etiquetas pelo meio — e por isso o título, que é a única coisa
              que se lê a sério, aparecia terceiro. Agora abre a linha, e as
              etiquetas descem para a linha do contexto, onde não empurram nada.
            */}
            <div className="flex min-w-0 items-baseline gap-2">
              <span className="shrink-0 font-mono text-[11px] font-medium tabular text-slate-400">
                {ordem.codigo}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                {ordem.titulo}
              </span>
              <span className="shrink-0 font-mono text-xs tabular text-slate-500 sm:hidden">
                {quando(ordem.agendada_para, agora)}
              </span>
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-400">
              <EstadoOrdem estado={ordem.estado} />
              <OrigemOrdem origem={ordem.origem} />
              <PrioridadeOrdem prioridade={ordem.prioridade} />

              {cliente && <span className="truncate text-slate-500">{cliente}</span>}
              {local && (
                <span className="inline-flex min-w-0 items-center gap-1 truncate">
                  <MapPin width={11} height={11} className="shrink-0" />
                  <span className="truncate">{local}</span>
                </span>
              )}
              {/* Sem dono é informação, e não ausência dela: uma ordem marcada
                  para amanhã sem ninguém é um problema de hoje. */}
              {quem ? (
                <span className="inline-flex min-w-0 items-center gap-1 truncate">
                  <User width={11} height={11} className="shrink-0" />
                  <span className="truncate">{quem}</span>
                </span>
              ) : (
                <Badge className="bg-amber-50 text-amber-800 ring-amber-200">sem ninguém</Badge>
              )}
              {alertas.map((a) => (
                <Badge
                  key={a.chave}
                  className={
                    a.severidade === "critico"
                      ? "bg-red-50 text-red-700 ring-red-200"
                      : "bg-amber-50 text-amber-800 ring-amber-200"
                  }
                >
                  <AlertTriangle width={11} height={11} />
                  {a.texto}
                </Badge>
              ))}
            </div>
          </div>

          <span className="hidden shrink-0 font-mono text-xs tabular text-slate-500 sm:block">
            {quando(ordem.agendada_para, agora)}
          </span>
        </div>
      </Card>
    </Link>
  );
}

export { quando };
