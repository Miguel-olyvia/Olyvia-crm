import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  ErroDeDados,
  ativosDeLocais,
  ativosRemovidosDe,
  caminhoAteLocal,
  locaisRemovidosDe,
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
  Card,
  EmptyState,
  ErrorState,
  EstadoOrdem,
  Skeleton,
} from "../components/ui";
import { Building, ChevronRight, MapPin } from "../components/icons";
import { linkParaIr, temSitio } from "../domain/mapa";
import EstruturaDoLocal from "../components/EstruturaDoLocal";
import BotaoDuplicar from "../components/BotaoDuplicar";
import { IconeDaOrdem } from "../components/IconeDeLinha";
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
  // O que foi tirado de vista. Só se mostra a quem o for procurar, mas tem de
  // estar carregado — senão remover é uma porta sem maçaneta do outro lado.
  const [removidos, setRemovidos] = useState<AtivoRow[]>([]);
  const [espacosRemovidos, setEspacosRemovidos] = useState<LocalRow[]>([]);
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
        // Os equipamentos deste sítio **e** os de cada espaço lá dentro, numa
        // ida só. É o que faz a lista ter degraus em vez de ser plana.
        const meus = [eu.id, ...ls.filter((l) => l.parent_id === eu.id).map((l) => l.id)];
        const [as, os, rem, esp] = await Promise.all([
          ativosDeLocais(meus),
          ordensDoLocal(activeOrgId, eu.id).catch(() => [] as LinhaOrdem[]),
          ativosRemovidosDe(meus).catch(() => [] as AtivoRow[]),
          locaisRemovidosDe(eu.id).catch(() => [] as LocalRow[]),
        ]);
        setAtivos(as);
        setOrdens(os);
        setRemovidos(rem);
        setEspacosRemovidos(esp);
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

      <EstruturaDoLocal
        local={local}
        filhos={filhos}
        ativos={ativos}
        removidos={removidos}
        espacosRemovidos={espacosRemovidos}
        categorias={categorias}
        centros={centros}
        podeEditar={podeEditar}
        orgId={activeOrgId ?? ""}
        clientes={clientes}
        aoGravar={() => setRecarga((r) => r + 1)}
      />

      <HistoricoDeOrdens ordens={ordens} />
    </div>
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
              <IconeDaOrdem origem={o.origem} />
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
