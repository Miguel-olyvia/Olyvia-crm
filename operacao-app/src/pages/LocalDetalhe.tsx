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
  ordensDeLocais,
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
  Skeleton,
} from "../components/ui";
import { Building, ChevronRight, MapPin } from "../components/icons";
import { coordenadasValidas, linkParaIr, temSitio } from "../domain/mapa";
import { comTudoLaDentro, ondeFoi, raizDe, ramoAte } from "../domain/arvore-de-locais";
import EstruturaDoLocal from "../components/EstruturaDoLocal";
import MapaPequeno from "../components/MapaPequeno";
import FormLocal from "../components/FormLocal";
import BotaoDuplicar from "../components/BotaoDuplicar";
import { IconeDaOrdem } from "../components/IconeDeLinha";
import { duplicarLocal } from "../lib/config";

/**
 * A ficha de uma morada: o que ela é, tudo o que está lá dentro, e o que já
 * lá se fez.
 *
 * ⚠ **Uma morada, uma página. Um espaço não tem página.** Foi a correção
 * mais importante que este ecrã levou, e veio de quem o usou: cada sítio e
 * cada espaço com página própria dava três carregamentos para meter um
 * extintor numa box de garagem, e a meio ninguém sabia onde estava.
 *
 * Por isso o endereço de um espaço (`/locais/LOC-0042`) abre a página da
 * **morada dele**, com a árvore aberta até lá e o espaço destacado. Os links
 * antigos continuam a funcionar e ninguém fica sem saber onde aterrou.
 *
 * Junta num sítio só o que estava em três: a árvore, os equipamentos, e o
 * histórico de trabalho — que é a pergunta que se faz a olhar para uma
 * morada ("esta torre tem dado problemas?"), e que por isso conta as ordens
 * de todos os espaços, não só as do nó de cima.
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
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  // Editar a própria morada. Os espaços já se editavam na árvore; a raiz não
  // tinha por onde — e é ela que tem a morada e o ponto no mapa.
  const [aEditar, setAEditar] = useState(false);

  const alternar = (id: string) =>
    setAbertos((s) => {
      const novo = new Set(s);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });

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
      // A página é sempre a da morada, mesmo quando se chega por um link a um
      // espaço lá no fundo. É a decisão toda desta página: um espaço não tem
      // página, tem um degrau.
      const aRaiz = eu ? raizDe(ls, eu.id) : null;
      if (aRaiz) {
        // A morada e tudo o que pende dela, numa ida só. Sete idas à base para
        // uma torre de sete pisos montavam o ecrã aos bocados.
        const meus = comTudoLaDentro(ls, aRaiz.id).map((l) => l.id);
        const [as, os, rem, esp] = await Promise.all([
          ativosDeLocais(meus),
          ordensDeLocais(activeOrgId, meus).catch(() => [] as LinhaOrdem[]),
          ativosRemovidosDe(meus).catch(() => [] as AtivoRow[]),
          locaisRemovidosDe(meus).catch(() => [] as LocalRow[]),
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

  /** O que veio no endereço — pode ser a morada ou um espaço dela. */
  const pedido = useMemo(
    () => locais?.find((l) => l.codigo === codigo) ?? null,
    [locais, codigo]
  );
  /** A morada. É esta que a página mostra. */
  const local = useMemo(
    () => (locais && pedido ? raizDe(locais, pedido.id) : null),
    [locais, pedido]
  );
  const daArvore = useMemo(
    () => (locais && local ? comTudoLaDentro(locais, local.id) : []),
    [locais, local]
  );
  /** O caminho até ao espaço pedido, quando não é a própria morada. */
  const caminho = useMemo(
    () => (locais && pedido ? caminhoAteLocal(locais, pedido.id) : []),
    [locais, pedido]
  );
  const cliente = clientes.find((c) => c.id === local?.cliente_id)?.nome ?? null;

  // Chegar por um link a um espaço lá no fundo abre a árvore até lá, e
  // destaca-o. Senão o link levava a uma página onde o sítio pedido estava
  // escondido dentro de uma gaveta fechada.
  useEffect(() => {
    if (!locais || !pedido) return;
    setAbertos(new Set([...ramoAte(locais, pedido.id), pedido.id]));
  }, [locais, pedido]);

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
      {/*
        O caminho é só até à morada, porque a página é a morada. Quando se
        chega por um link a um espaço lá no fundo, o resto do caminho aparece
        a seguir como aviso — e o espaço vem destacado na árvore. Um caminho
        que promete uma página que não existe é pior do que caminho nenhum.
      */}
      <nav className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
        <Link to="/locais" className="hover:text-slate-800 hover:underline">
          Locais
        </Link>
        <ChevronRight width={12} height={12} className="text-slate-300" />
        <span className="font-medium text-slate-700">{local.nome}</span>
        {caminho.length > 1 &&
          caminho.slice(1).map((c) => (
            <span key={c.id} className="flex items-center gap-1 text-slate-400">
              <ChevronRight width={12} height={12} className="text-slate-300" />
              {c.nome}
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
            <Button variant="secondary" size="sm" onClick={() => setAEditar(true)}>
              Editar
            </Button>
          )}
          {podeEditar && (
            <BotaoDuplicar
              titulo="Duplicar o local"
              nomeSugerido={`${local.nome} (cópia)`}
              exigeNome
              oQueNaoLeva={[
                "o ponto no mapa — dois locais não estão no mesmo lugar",
                "os números de série dos equipamentos",
                "as ordens e o histórico",
              ]}
              comAtivos={{
                rotulo: "Levar os espaços e os equipamentos",
                hint: "A cópia leva a árvore toda — pisos, espaços e o que está em cada um, com códigos novos. É quase sempre o que se quer.",
              }}
              // O mesmo interruptor decide as duas coisas: “leva o que está cá
              // dentro” é uma pergunta só para quem está a copiar.
              duplicar={(nome, levar) => duplicarLocal(local.id, nome, levar, levar)}
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

        {(local.morada || local.cidade || local.zona || temSitio(local)) && (
          <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-[1fr_260px]">
            <p className="text-sm text-slate-600">
              {[local.morada, local.cidade, local.zona].filter(Boolean).join(" · ") ||
                "Sem morada escrita."}
            </p>
            {/* Uma morada é uma coisa que se lê; um mapa é uma coisa que se
                reconhece. Antes de sair para um sítio, reconhecer vale mais.

                Sem coordenadas não há mapa para desenhar — e o ecrã ficava
                simplesmente vazio, sem dizer que faltava marcar o ponto. */}
            {coordenadasValidas(local.latitude, local.longitude) ? (
              <MapaPequeno sitio={local} nome={local.nome} altura={140} />
            ) : (
              <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500 ring-1 ring-slate-200">
                <p className="flex items-center gap-1.5 font-medium text-slate-700">
                  <MapPin width={13} height={13} /> Sem ponto no mapa
                </p>
                <p className="mt-1 leading-relaxed">
                  A morada acerta quase sempre — mas um ponto não tem gralhas nem
                  ruas com o mesmo nome noutra cidade.
                </p>
                {podeEditar && (
                  <button
                    type="button"
                    onClick={() => setAEditar(true)}
                    className="mt-1.5 font-medium text-brand hover:underline"
                  >
                    Marcar agora
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      <EstruturaDoLocal
        raiz={local}
        daArvore={daArvore}
        emFoco={pedido && pedido.id !== local.id ? pedido.id : null}
        abertos={abertos}
        alternar={alternar}
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

      <HistoricoDeOrdens ordens={ordens} daArvore={daArvore} raizId={local.id} />

      {aEditar && (
        <FormLocal
          local={local}
          clientes={clientes}
          aoFechar={() => setAEditar(false)}
          aoGravar={() => {
            setAEditar(false);
            setRecarga((r) => r + 1);
          }}
        />
      )}
    </div>
  );
}

/* ───────────────────────────── Histórico ───────────────────────────────── */

function HistoricoDeOrdens({
  ordens,
  daArvore,
  raizId,
}: {
  ordens: readonly LinhaOrdem[];
  daArvore: readonly LocalRow[];
  raizId: string;
}) {
  if (ordens.length === 0) {
    return (
      <Card className="p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-slate-800">O que já se fez aqui</h2>
        <p className="mt-2 text-sm text-slate-500">
          Ainda não passou nenhuma ordem por aqui, nem por nenhum espaço lá dentro.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-4 sm:p-5">
      <h2 className="text-sm font-semibold text-slate-800">O que já se fez aqui</h2>
      <p className="mt-0.5 text-xs text-slate-500">
        As {ordens.length === 1 ? "última ordem" : `últimas ${ordens.length} ordens`} deste
        local e dos espaços dele.
      </p>
      <ul className="mt-3 divide-y divide-slate-100">
        {ordens.map((o) => {
          const onde = ondeFoi(daArvore, raizId, o.local_id);
          return (
          <li key={o.id}>
            <Link
              to={`/ordens/${o.codigo}`}
              className="group flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5"
            >
              <IconeDaOrdem origem={o.origem} />
              <span className="w-32 shrink-0 font-mono text-[11px] text-slate-400">
                {o.codigo}
              </span>
              {/*
                Onde foi, antes do que foi. Doze ordens seguidas sem isto
                parecem todas do mesmo lugar — e três foram na garagem.
              */}
              <span className="min-w-0 flex-1 truncate text-sm text-slate-800 group-hover:text-brand-800">
                {onde && (
                  <span className="mr-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-500">
                    {onde}
                  </span>
                )}
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
          );
        })}
      </ul>
    </Card>
  );
}
