import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  ErroDeDados,
  ativosDoLocal,
  caminhoAteLocal,
  listarClientes,
  listarLocais,
  ordensDoLocal,
  type AtivoRow,
  type Cliente,
  type LinhaOrdem,
  type LocalRow,
} from "../lib/dados";
import {
  listarCategorias,
  listarCentrosCusto,
  type CategoriaAtivo,
  type CentroCusto,
} from "../lib/config";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  EstadoOrdem,
  Input,
  Skeleton,
  cx,
} from "../components/ui";
import {
  Building,
  ChevronRight,
  Layers,
  MapPin,
  Plus,
  Search,
} from "../components/icons";
import { linkParaIr, temSitio } from "../domain/mapa";
import FormAtivoDoLocal from "../components/FormAtivoDoLocal";
import BotaoDuplicar from "../components/BotaoDuplicar";
import HistoricoDoAtivo from "../components/Historico";
import { duplicarLocal } from "../lib/config";

/**
 * A ficha de um sítio: o que ele é, o que está lá dentro, e o que já lá se fez.
 *
 * Existe porque a lista de Definições não aguenta a realidade. Na instância
 * observada há **3120 equipamentos**, e só uma torre tem sete pisos, cada um
 * com extintor, carretéis, iluminação. Uma linha por local com um botão
 * &ldquo;+ Equipamento&rdquo; serve para montar a operação; não serve para a
 * consultar.
 *
 * Junta num sítio só o que estava em três: a árvore, os equipamentos, e o
 * histórico de trabalho — que é a pergunta que se faz a olhar para um sítio
 * ("este piso tem dado problemas?").
 */
export default function LocalDetalhe() {
  const { activeOrgId, funcao } = useAuth();
  const { codigo = "" } = useParams();

  const [locais, setLocais] = useState<LocalRow[] | null>(null);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [ativos, setAtivos] = useState<AtivoRow[]>([]);
  const [categorias, setCategorias] = useState<CategoriaAtivo[]>([]);
  const [centros, setCentros] = useState<CentroCusto[]>([]);
  const [ordens, setOrdens] = useState<LinhaOrdem[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  const podeEditar = funcao === "admin" || funcao === "gestor" || funcao === "operador";

  const carregar = useCallback(async () => {
    if (!activeOrgId) return;
    setErro(null);
    try {
      const [ls, cs, cats, ccs] = await Promise.all([
        listarLocais(activeOrgId),
        listarClientes(activeOrgId),
        listarCategorias(activeOrgId).catch(() => [] as CategoriaAtivo[]),
        listarCentrosCusto(activeOrgId).catch(() => [] as CentroCusto[]),
      ]);
      setLocais(ls);
      setClientes(cs);
      setCategorias(cats);
      setCentros(ccs);

      const eu = ls.find((l) => l.codigo === codigo);
      if (eu) {
        const [as, os] = await Promise.all([
          ativosDoLocal(eu.id),
          ordensDoLocal(activeOrgId, eu.id).catch(() => [] as LinhaOrdem[]),
        ]);
        setAtivos(as);
        setOrdens(os);
      }
    } catch (e) {
      setErro(e instanceof ErroDeDados ? e.message : "Não foi possível carregar o local.");
      setLocais([]);
    }
  }, [activeOrgId, codigo]);

  useEffect(() => {
    void carregar();
  }, [carregar, recarga]);

  const local = useMemo(
    () => locais?.find((l) => l.codigo === codigo) ?? null,
    [locais, codigo]
  );
  const caminho = useMemo(
    () => (locais && local ? caminhoAteLocal(locais, local.id) : []),
    [locais, local]
  );
  const filhos = useMemo(
    () => (locais && local ? locais.filter((l) => l.parent_id === local.id) : []),
    [locais, local]
  );
  const cliente = clientes.find((c) => c.id === local?.cliente_id)?.nome ?? null;

  if (erro && locais === null) return <ErrorState message={erro} onRetry={() => void carregar()} />;
  if (locais === null) return <Skeleton className="h-72 w-full" />;

  if (!local) {
    return (
      <EmptyState
        icon={<Building className="h-6 w-6" />}
        title="Esse local não existe aqui"
        description="Ou foi apagado, ou é de outra empresa. Confirma a empresa escolhida no topo."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* O caminho até aqui. Num sítio a cinco níveis de fundo, saber onde se
          está vale mais do que o nome do sítio. */}
      <nav className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
        <Link to="/locais" className="hover:text-slate-800 hover:underline">
          Locais
        </Link>
        {caminho.map((c) => (
          <span key={c.id} className="flex items-center gap-1">
            <ChevronRight width={12} height={12} className="text-slate-300" />
            {c.id === local.id ? (
              <span className="font-medium text-slate-700">{c.nome}</span>
            ) : (
              <Link to={`/locais/${c.codigo}`} className="hover:text-slate-800 hover:underline">
                {c.nome}
              </Link>
            )}
          </span>
        ))}
      </nav>

      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-xs text-slate-400">{local.codigo}</p>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-slate-900">
              {local.nome}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              <Badge>{local.tipo}</Badge>
              {cliente && <span>{cliente}</span>}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
          {podeEditar && (
            <BotaoDuplicar
              titulo="Duplicar o local"
              nomeSugerido={`${local.nome} (cópia)`}
              exigeNome
              oQueNaoLeva={[
                "o ponto no mapa — dois sítios não estão no mesmo lugar",
                "os números de série dos equipamentos",
                "as ordens e o histórico",
              ]}
              comAtivos={{
                rotulo: "Levar os equipamentos",
                hint: "Copia os que estão aqui, com códigos novos. É quase sempre o que se quer.",
              }}
              duplicar={(nome, levar) => duplicarLocal(local.id, nome, levar)}
              paraOnde={(r) => `/locais/${r.codigo}`}
            />
          )}
          {temSitio(local) && (
            <a
              href={linkParaIr(local) ?? "#"}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200"
            >
              <MapPin width={14} height={14} />
              Como lá chegar
            </a>
          )}
          </div>
        </div>

        {(local.morada || local.cidade || local.zona) && (
          <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-600">
            {[local.morada, local.cidade, local.zona].filter(Boolean).join(" · ")}
          </p>
        )}
      </Card>

      {filhos.length > 0 && <Filhos filhos={filhos} />}

      <Equipamentos
        local={local}
        ativos={ativos}
        categorias={categorias}
        centros={centros}
        podeEditar={podeEditar}
        orgId={activeOrgId ?? ""}
        aoGravar={() => setRecarga((r) => r + 1)}
      />

      <HistoricoDeOrdens ordens={ordens} />
    </div>
  );
}

/* ───────────────────────────── Sub-locais ──────────────────────────────── */

function Filhos({ filhos }: { filhos: readonly LocalRow[] }) {
  return (
    <Card className="p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-slate-800">
        {filhos.length === 1 ? "1 sítio lá dentro" : `${filhos.length} sítios lá dentro`}
      </h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {filhos.map((f) => (
          <li key={f.id}>
            <Link
              to={`/locais/${f.codigo}`}
              className="group flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 transition-colors hover:bg-slate-100"
            >
              <Building width={14} height={14} className="shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{f.nome}</span>
              <ChevronRight
                width={13}
                height={13}
                className="shrink-0 text-slate-300 transition-colors group-hover:text-slate-500"
              />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ──────────────────────────── Equipamentos ─────────────────────────────── */

const COR_CRITICIDADE: Record<string, string> = {
  critica: "bg-red-50 text-red-700 ring-red-200",
  alta: "bg-amber-50 text-amber-800 ring-amber-200",
  normal: "bg-slate-100 text-slate-600 ring-slate-200",
  baixa: "bg-slate-50 text-slate-400 ring-slate-200",
};

function Equipamentos({
  local,
  ativos,
  categorias,
  centros,
  podeEditar,
  orgId,
  aoGravar,
}: {
  local: LocalRow;
  ativos: readonly AtivoRow[];
  categorias: readonly CategoriaAtivo[];
  centros: readonly CentroCusto[];
  podeEditar: boolean;
  orgId: string;
  aoGravar: () => void;
}) {
  const [novo, setNovo] = useState(false);
  const [aEditar, setAEditar] = useState<string | null>(null);
  const [comHistorico, setComHistorico] = useState<string | null>(null);
  const [procura, setProcura] = useState("");

  const porCategoria = useMemo(
    () => new Map(categorias.map((c) => [c.id, c.nome])),
    [categorias]
  );

  // Uma torre tem dezenas de equipamentos por piso. A caixa de procura só
  // aparece quando começa a fazer falta.
  const filtrados = useMemo(() => {
    const q = procura.trim().toLowerCase();
    if (!q) return ativos;
    return ativos.filter((a) =>
      [a.codigo, a.nome, a.marca, a.modelo, a.num_serie, porCategoria.get(a.categoria_id ?? "")]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(q))
    );
  }, [ativos, procura, porCategoria]);

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Layers width={15} height={15} className="text-slate-400" />
          {ativos.length === 0
            ? "Equipamentos"
            : ativos.length === 1
              ? "1 equipamento"
              : `${ativos.length} equipamentos`}
        </h2>
        <div className="flex items-center gap-2">
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
                placeholder="Procurar…"
                className="w-40 pl-8 sm:w-52"
              />
            </div>
          )}
          {podeEditar && !novo && (
            <Button size="sm" onClick={() => { setNovo(true); setAEditar(null); }}>
              <Plus width={14} height={14} /> Equipamento
            </Button>
          )}
        </div>
      </div>

      {novo && (
        <FormAtivoDoLocal
          orgId={orgId}
          localId={local.id}
          categorias={categorias}
          centros={centros}
          aoFechar={() => setNovo(false)}
          aoGravar={() => { setNovo(false); aoGravar(); }}
        />
      )}

      {ativos.length === 0 && !novo ? (
        <div className="mt-3">
          <EmptyState
            icon={<Layers className="h-5 w-5" />}
            title="Nada registado aqui"
            description="Um equipamento registado é o que faz o histórico existir: sem ele, a intervenção fica sem dono e ninguém sabe se aquela máquina tem dado problemas."
          />
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {filtrados.map((a) =>
            aEditar === a.id ? (
              <li key={a.id} className="py-1">
                <FormAtivoDoLocal
                  orgId={orgId}
                  localId={local.id}
                  ativo={a}
                  categorias={categorias}
                  centros={centros}
                  aoFechar={() => setAEditar(null)}
                  aoGravar={() => { setAEditar(null); aoGravar(); }}
                />
              </li>
            ) : (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <span className="w-28 shrink-0 truncate font-mono text-[11px] text-slate-400">
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
                  <button
                    type="button"
                    onClick={() => { setAEditar(a.id); setNovo(false); }}
                    className="shrink-0 text-xs text-slate-400 underline-offset-2 hover:text-slate-700 hover:underline"
                  >
                    editar
                  </button>
                )}
                {comHistorico === a.id && (
                  <div className="w-full rounded-lg bg-slate-50 p-3">
                    <HistoricoDoAtivo entidade="ativo" entidadeId={a.id} />
                  </div>
                )}
              </li>
            )
          )}
          {/* Só quando alguém procurou. Sem esta condição, a mensagem aparecia
              debaixo do formulário de criação num sítio vazio — a responder a
              uma pergunta que ninguém tinha feito. */}
          {filtrados.length === 0 && procura.trim() !== "" && (
            <li className="py-3 text-sm text-slate-500">Nada com esse nome aqui.</li>
          )}
        </ul>
      )}
    </Card>
  );
}

/* ───────────────────────────── Histórico ───────────────────────────────── */

function HistoricoDeOrdens({ ordens }: { ordens: readonly LinhaOrdem[] }) {
  if (ordens.length === 0) {
    return (
      <Card className="p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-slate-800">O que já se fez aqui</h2>
        <p className="mt-2 text-sm text-slate-500">Ainda não passou nenhuma ordem por este sítio.</p>
      </Card>
    );
  }

  return (
    <Card className="p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-slate-800">O que já se fez aqui</h2>
      <p className="mt-0.5 text-xs text-slate-500">
        As {ordens.length === 1 ? "última ordem" : `últimas ${ordens.length} ordens`} deste sítio.
      </p>
      <ul className="mt-3 divide-y divide-slate-100">
        {ordens.map((o) => (
          <li key={o.id}>
            <Link
              to={`/ordens/${o.codigo}`}
              className="group flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5"
            >
              <span className="w-32 shrink-0 font-mono text-[11px] text-slate-400">
                {o.codigo}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm text-slate-800 group-hover:text-brand-800">
                {o.titulo}
              </span>
              <EstadoOrdem estado={o.estado} />
              <ChevronRight
                width={13}
                height={13}
                className="shrink-0 text-slate-300 transition-colors group-hover:text-brand-700"
              />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}
