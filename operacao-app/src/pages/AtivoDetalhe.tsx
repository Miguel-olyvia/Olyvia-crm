import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import {
  ErroDeDados,
  ativoPorCodigo,
  listarLocais,
  ordensDoAtivo,
  type AtivoRow,
  type LinhaOrdem,
  type LocalRow,
} from "../lib/dados";
import { listarCategorias, type CategoriaAtivo } from "../lib/config";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  EstadoOrdem,
  Skeleton,
  cx,
} from "../components/ui";
import { ChevronRight, Layers, MapPin, Plus } from "../components/icons";
import { IconeDaOrdem } from "../components/IconeDeLinha";
import Historico from "../components/Historico";
import { linkParaIr, temSitio } from "../domain/mapa";

/**
 * A ficha de um equipamento — o sítio onde a etiqueta QR aterra.
 *
 * O técnico aponta a câmara ao extintor e chega aqui. A pergunta que traz é
 * sempre uma de três: *o que é isto*, *o que já lhe fizeram*, e *como abro uma
 * ordem para ele agora*. Estão as três, por essa ordem.
 *
 * O endereço leva o **código** e não o id: é o que se diz ao telefone, e é o
 * que alguém consegue escrever à mão se a etiqueta se rasgar.
 */

const COR_CRITICIDADE: Record<string, string> = {
  critica: "bg-red-50 text-red-700 ring-red-200",
  alta: "bg-amber-50 text-amber-800 ring-amber-200",
  normal: "bg-slate-100 text-slate-600 ring-slate-200",
  baixa: "bg-slate-50 text-slate-400 ring-slate-200",
};

export default function AtivoDetalhe() {
  const { activeOrgId } = useAuth();
  const { codigo = "" } = useParams();

  const [ativo, setAtivo] = useState<AtivoRow | null | undefined>(undefined);
  const [local, setLocal] = useState<LocalRow | null>(null);
  const [caminho, setCaminho] = useState<LocalRow[]>([]);
  const [categorias, setCategorias] = useState<CategoriaAtivo[]>([]);
  const [ordens, setOrdens] = useState<LinhaOrdem[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    if (!activeOrgId) return;
    setErro(null);
    try {
      const a = await ativoPorCodigo(activeOrgId, codigo);
      setAtivo(a);
      if (!a) return;

      const [ls, cats, os] = await Promise.all([
        listarLocais(activeOrgId),
        listarCategorias(activeOrgId).catch(() => [] as CategoriaAtivo[]),
        ordensDoAtivo(activeOrgId, a.id),
      ]);
      setCategorias(cats);
      setOrdens(os);

      const porId = new Map(ls.map((l) => [l.id, l]));
      setLocal(porId.get(a.local_id) ?? null);

      // O caminho até ao sítio. Quem chegou aqui por uma etiqueta não sabe
      // onde está — sabe o que tem à frente.
      const acima: LocalRow[] = [];
      const vistos = new Set<string>();
      let atual = porId.get(a.local_id);
      while (atual && !vistos.has(atual.id)) {
        vistos.add(atual.id);
        acima.unshift(atual);
        atual = atual.parent_id ? porId.get(atual.parent_id) : undefined;
      }
      setCaminho(acima);
    } catch (e) {
      setErro(e instanceof ErroDeDados ? e.message : "Não foi possível carregar o equipamento.");
      setAtivo(null);
    }
  }, [activeOrgId, codigo]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (erro) return <ErrorState message={erro} onRetry={() => void carregar()} />;
  if (ativo === undefined) return <Skeleton className="h-72 w-full" />;

  if (!ativo) {
    return (
      <EmptyState
        icon={<Layers className="h-6 w-6" />}
        title={`Não há nenhum equipamento com o código ${codigo}`}
        description="Ou é de outra empresa — confirma a que está escolhida no topo — ou a etiqueta é de um equipamento que já não existe."
      />
    );
  }

  const categoria = categorias.find((c) => c.id === ativo.categoria_id)?.nome ?? null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {caminho.length > 0 && (
        <nav className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
          <Link to="/locais" className="hover:text-slate-800 hover:underline">
            Locais
          </Link>
          {caminho.map((c) => (
            <span key={c.id} className="flex items-center gap-1">
              <ChevronRight width={12} height={12} className="text-slate-300" />
              <Link to={`/locais/${c.codigo}`} className="hover:text-slate-800 hover:underline">
                {c.nome}
              </Link>
            </span>
          ))}
        </nav>
      )}

      <Card className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-xs text-slate-400">{ativo.codigo}</p>
            <h1 className="mt-0.5 text-xl font-semibold tracking-tight text-slate-900">
              {ativo.nome}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-slate-500">
              {categoria && <Badge>{categoria}</Badge>}
              <span
                className={cx(
                  "rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                  COR_CRITICIDADE[ativo.criticidade] ?? COR_CRITICIDADE.normal
                )}
              >
                criticidade {ativo.criticidade}
              </span>
            </div>
          </div>

          {local && temSitio(local) && (
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

        <dl className="mt-4 grid gap-x-6 gap-y-2 border-t border-slate-100 pt-4 sm:grid-cols-2">
          <Linha rotulo="Onde está" valor={local?.nome ?? "—"} />
          <Linha rotulo="Marca e modelo" valor={[ativo.marca, ativo.modelo].filter(Boolean).join(" ") || "—"} />
          <Linha rotulo="Número de série" valor={ativo.num_serie ?? "—"} />
          <Linha rotulo="Instalado em" valor={data(ativo.data_instalacao)} />
          <Linha rotulo="Garantia até" valor={data(ativo.garantia_ate)} />
        </dl>

        {/* A terceira pergunta de quem apontou a câmara: e agora, como abro uma
            ordem para isto? */}
        <div className="mt-4 border-t border-slate-100 pt-4">
          <Link to={`/ordens/nova?ativo=${encodeURIComponent(ativo.codigo)}`}>
            <Button size="sm">
              <Plus width={14} height={14} />
              Abrir ordem para este equipamento
            </Button>
          </Link>
        </div>
      </Card>

      <Card className="p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-slate-800">O que já se fez a este equipamento</h2>
        {ordens.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            Nenhuma ordem ainda. A partir da primeira, esta lista responde a &ldquo;isto tem dado
            problemas?&rdquo;.
          </p>
        ) : (
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
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-slate-800">A ficha, ao longo do tempo</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Mudanças de local, de categoria, de criticidade.
        </p>
        <div className="mt-3">
          <Historico entidade="ativo" entidadeId={ativo.id} />
        </div>
      </Card>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-32 shrink-0 text-xs uppercase tracking-wide text-slate-400">{rotulo}</dt>
      <dd className="min-w-0 flex-1 text-sm text-slate-700">{valor}</dd>
    </div>
  );
}

function data(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-PT");
}
