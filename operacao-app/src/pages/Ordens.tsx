import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  ErroDeDados,
  listarClientes,
  listarLocais,
  listarOrdens,
  type Cliente,
  type LinhaOrdem,
  type LocalRow,
} from "../lib/dados";
import { listarPessoas, type Pessoa } from "../lib/config";
import {
  Badge,
  Barra,
  Card,
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
  FILTRO_VAZIO,
  ORDENACOES,
  aplicarFiltro,
  ordenar,
  quantosFiltros,
  temFiltro,
  type Filtro,
  type Ordenacao,
} from "../domain/filtros-de-ordens";
import { AlertTriangle, Inbox, Listar, MapPin, Plus, Search } from "../components/icons";
import { IconeDaOrdem, IconeDoEstado } from "../components/IconeDeLinha";
import { alertasDaOrdem, severidadeMaxima } from "../domain/alertas";
import type { Estado } from "../domain/tipos";

/**
 * UMA lista para as três origens.
 *
 * Substitui `/works` + `/scheduled-works` + `/failures` do Infraspeak — três
 * ecrãs para o mesmo objeto, cada um com o seu conjunto de separadores e o seu
 * vocabulário. Aqui as vistas guardadas são filtros da mesma lista, não
 * páginas diferentes.
 */

interface Vista {
  chave: string;
  rotulo: string;
  estados?: readonly Estado[];
  /** Filtro que não se exprime em SQL simples — aplicado depois. */
  soAtrasadas?: boolean;
}

const VISTAS: Vista[] = [
  { chave: "abertas", rotulo: "Abertas", estados: ["por_aprovar", "agendada", "em_curso", "pausada"] },
  { chave: "por-aprovar", rotulo: "Por aprovar", estados: ["por_aprovar"] },
  { chave: "atrasadas", rotulo: "Atrasadas", estados: ["agendada", "em_curso"], soAtrasadas: true },
  { chave: "em-curso", rotulo: "Em curso", estados: ["em_curso", "pausada"] },
  { chave: "por-confirmar", rotulo: "Por confirmar", estados: ["fechada"] },
  { chave: "historico", rotulo: "Histórico", estados: ["confirmada", "cancelada"] },
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

export default function Ordens() {
  const { activeOrgId } = useAuth();
  const rotulos = useRotulos();
  const [params, setParams] = useSearchParams();
  const vistaAtual = params.get("vista") ?? "abertas";
  const vista = VISTAS.find((v) => v.chave === vistaAtual) ?? VISTAS[0];

  const [pesquisa, setPesquisa] = useState(params.get("q") ?? "");
  const [ordens, setOrdens] = useState<LinhaOrdem[] | null>(null);
  const [clientes, setClientes] = useState<Map<string, string>>(new Map());
  const [listaClientes, setListaClientes] = useState<Cliente[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [locais, setLocais] = useState<Map<string, string>>(new Map());
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  /**
   * As quatro perguntas que se fazem em frente a esta lista.
   *
   * A agenda já tinha filtros; a lista, que é onde se passa mais tempo, não
   * tinha nenhum. Com setenta ordens abertas as vistas guardadas chegam; com
   * setecentas, "Abertas" é o mesmo que não ter filtro.
   */
  const [filtro, setFiltro] = useState<Filtro>(FILTRO_VAZIO);
  const [comFiltros, setComFiltros] = useState(false);
  const [como, setComo] = useState<Ordenacao>("data");

  const agora = useMemo(() => new Date(), [ordens]);

  useEffect(() => {
    if (!activeOrgId) return;
    let vivo = true;
    setOrdens(null);
    setErro(null);

    (async () => {
      try {
        const [linhas, cls, ps, ls] = await Promise.all([
          listarOrdens(activeOrgId, {
            estados: vista.estados,
            pesquisa: pesquisa.trim() || undefined,
          }),
          listarClientes(activeOrgId),
          listarPessoas(activeOrgId).catch(() => [] as Pessoa[]),
          listarLocais(activeOrgId).catch(() => [] as LocalRow[]),
        ]);
        if (!vivo) return;
        setOrdens(linhas);
        setClientes(new Map(cls.map((c: Cliente) => [c.id, c.nome])));
        setListaClientes(cls);
        setPessoas(ps.filter((x) => x.em_operacoes));
        setLocais(new Map(ls.map((l) => [l.id, l.nome])));
      } catch (e) {
        if (!vivo) return;
        setErro(e instanceof ErroDeDados ? e.message : "Algo correu mal a carregar as ordens.");
        setOrdens([]);
      }
    })();

    return () => {
      vivo = false;
    };
  }, [activeOrgId, vista.chave, vista.estados, pesquisa, tentativa]);

  // "Atrasada" é um badge derivado, não um estado guardado — por isso este
  // filtro vive aqui e não na consulta.
  const visiveis = useMemo(() => {
    if (!ordens) return null;
    if (!vista.soAtrasadas) return ordens;
    return ordens.filter((o) => {
      const alertas = alertasDaOrdem(
        {
          estado: o.estado,
          agendadaPara: paraData(o.agendada_para),
          iniciadaEm: paraData(o.iniciada_em),
          ultimaAtividadeEm: paraData(o.atualizada_em),
          pausaRetomaPrevista: paraData(o.pausa_retoma_prevista),
          criadaEm: paraData(o.criada_em),
        },
        agora
      );
      return alertas.some((a) => a.chave === "atrasada");
    });
  }, [ordens, vista.soAtrasadas, agora]);

  const nomeCliente = useMemo(
    () => (id: string) => clientes.get(id) ?? null,
    [clientes]
  );

  const listadas = useMemo(() => {
    if (!visiveis) return null;
    return ordenar(aplicarFiltro(visiveis, filtro, nomeCliente), como);
  }, [visiveis, filtro, nomeCliente, como]);


  const mudarVista = (chave: string) => {
    const p = new URLSearchParams(params);
    p.set("vista", chave);
    setParams(p, { replace: true });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Ordens</h1>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Link
            to="/ordens/nova"
            className={cx(
              "inline-flex shrink-0 items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-sm",
              "font-medium text-white shadow-sm transition-all hover:bg-brand-dark active:scale-[0.98]"
            )}
          >
            <Plus width={15} height={15} /> Nova ordem
          </Link>
        <div className="relative w-full sm:w-72">
          <Search
            width={15}
            height={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <Input
            value={pesquisa}
            onChange={(e) => setPesquisa(e.target.value)}
            placeholder="Código ou título…"
            className="pl-9"
          />
        </div>
        </div>
      </div>

      {/* Vistas guardadas — filtros da mesma lista, não ecrãs diferentes */}
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
        {VISTAS.map((v) => (
          <button
            key={v.chave}
            type="button"
            onClick={() => mudarVista(v.chave)}
            className={cx(
              "shrink-0 rounded-lg px-3 py-1.5 text-sm transition-colors",
              v.chave === vista.chave
                ? "bg-brand-50 font-medium text-brand-800"
                : "text-slate-500 hover:bg-slate-100"
            )}
          >
            {v.rotulo}
          </button>
        ))}
      </div>

      {/*
        Os filtros vivem numa gaveta, fechada por omissão.

        Uma barra de quatro caixas sempre aberta ocupa meio ecrã de telemóvel
        antes de se ver uma única ordem. O botão diz quantas condições estão
        ligadas, para ninguém ficar a olhar para uma lista curta sem perceber
        que ela está estreitada.
      */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setComFiltros((v) => !v)}
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

          {temFiltro(filtro) && (
            <button
              type="button"
              onClick={() => setFiltro(FILTRO_VAZIO)}
              className="text-xs text-slate-400 underline-offset-2 hover:text-slate-700 hover:underline"
            >
              limpar
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {listadas && (
            <span className="text-xs tabular-nums text-slate-400">
              {listadas.length} {listadas.length === 1 ? "ordem" : "ordens"}
            </span>
          )}
          <Select
            value={como}
            onChange={(e) => setComo(e.target.value as Ordenacao)}
            className="w-auto text-xs"
            aria-label="Ordenar por"
          >
            {ORDENACOES.map((x) => (
              <option key={x.valor} value={x.valor}>
                {x.nome}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {comFiltros && (
        <Card className="p-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Quem">
              <Combobox
                value={filtro.responsavelId ?? ""}
                onChange={(v) => setFiltro((f) => ({ ...f, responsavelId: v || null }))}
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
                onChange={(v) => setFiltro((f) => ({ ...f, clienteId: v || null }))}
                options={listaClientes.map((c) => ({ value: c.id, label: c.nome }))}
                placeholder="Qualquer cliente"
                className="w-full"
              />
            </Field>
            <Field label="Prioridade">
              <Select
                value={filtro.prioridade ?? ""}
                onChange={(e) =>
                  setFiltro((f) => ({ ...f, prioridade: e.target.value || null }))
                }
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
                onChange={(e) => setFiltro((f) => ({ ...f, origem: e.target.value || null }))}
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
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[68px] w-full rounded-xl" />
          ))}
        </div>
      )}

      {listadas?.length === 0 && !erro && (
        <Card>
          <EmptyState
            icon={<Inbox width={22} height={22} />}
            title="Nada nesta vista"
            description={
              pesquisa.trim()
                ? "Nenhuma ordem corresponde à pesquisa."
                : temFiltro(filtro)
                  ? "Nenhuma ordem passa nos filtros que estão ligados."
                  : "Quando houver trabalho aqui, aparece nesta lista."
            }
          />
        </Card>
      )}

      {listadas && listadas.length > 0 && (
        <div className="space-y-2">
          {listadas.map((o) => (
            <LinhaDeOrdem
              key={o.id}
              ordem={o}
              cliente={clientes.get(o.cliente_id) ?? null}
              local={o.local_id ? locais.get(o.local_id) ?? null : null}
              quem={
                o.responsavel_id
                  ? pessoas.find((x) => x.utilizador_id === o.responsavel_id)?.nome ?? null
                  : null
              }
              agora={agora}
            />
          ))}
        </div>
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
          "px-4 py-3 transition-colors hover:border-brand-200 hover:bg-brand-50/30",
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
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-mono text-xs font-medium tabular text-slate-500">
                {ordem.codigo}
              </span>
              <OrigemOrdem origem={ordem.origem} />
              <EstadoOrdem estado={ordem.estado} />
              <PrioridadeOrdem prioridade={ordem.prioridade} />
            </div>

            <p className="mt-1 truncate text-sm font-medium text-slate-800">{ordem.titulo}</p>

            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400">
              {cliente && <span className="truncate">{cliente}</span>}
              {local && (
                <span className="inline-flex items-center gap-1 truncate">
                  <MapPin width={11} height={11} />
                  {local}
                </span>
              )}
              {/* Sem dono é informação, e não ausência dela: uma ordem marcada
                  para amanhã sem ninguém é um problema de hoje. */}
              {quem ? (
                <span className="truncate">{quem}</span>
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

          <span className="shrink-0 font-mono text-xs tabular text-slate-500">
            {quando(ordem.agendada_para, agora)}
          </span>
        </div>
      </Card>
    </Link>
  );
}

export { quando };
