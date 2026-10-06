import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { ErroDeDados } from "../lib/dados";
import { encomendas } from "../lib/encomendas";
import {
  ORDEM_ENCOMENDA,
  ROTULO_ENCOMENDA,
  encomendaUrgente,
  type EstadoEncomenda,
  type LinhaEncomenda,
} from "../domain/encomendas";
import EncomendasLista from "../components/EncomendasLista";
import { EmptyState, ErrorState, Skeleton, cx } from "../components/ui";

type Filtro = "urgentes" | "todas" | EstadoEncomenda;

/**
 * A encomendar — o painel geral: todos os materiais em falta nas obras
 * planeadas e em curso que vejo, com a data-limite para encomendar (início
 * planeado − prazo do fornecedor − 2 dias). Por defeito, só o que precisa
 * de alguém agir esta semana.
 */
export default function Encomendas() {
  const { activeOrgId } = useAuth();
  const [linhas, setLinhas] = useState<LinhaEncomenda[]>([]);
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [filtro, setFiltro] = useState<Filtro>("urgentes");

  const carregar = useCallback(async () => {
    if (!activeOrgId) return;
    setACarregar(true);
    setErro(null);
    try {
      setLinhas(await encomendas(activeOrgId));
    } catch (e) {
      setErro(e instanceof ErroDeDados ? e.message : "Algo correu mal a carregar as encomendas.");
    } finally {
      setACarregar(false);
    }
  }, [activeOrgId, recarga]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const contagem = useMemo(() => {
    const c = new Map<EstadoEncomenda, number>();
    for (const l of linhas) c.set(l.estado, (c.get(l.estado) ?? 0) + 1);
    return c;
  }, [linhas]);
  const urgentes = useMemo(() => linhas.filter(encomendaUrgente), [linhas]);
  const visiveis = useMemo(
    () => (filtro === "urgentes" ? urgentes : filtro === "todas" ? linhas : linhas.filter((l) => l.estado === filtro)),
    [filtro, linhas, urgentes]
  );

  if (aCarregar) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }
  if (erro) return <ErrorState message={erro} onRetry={() => setRecarga((r) => r + 1)} />;

  const separadores: { f: Filtro; rotulo: string; n: number }[] = [
    { f: "urgentes", rotulo: "Urgentes", n: urgentes.length },
    ...ORDEM_ENCOMENDA.filter((e) => (contagem.get(e) ?? 0) > 0).map((e) => ({
      f: e as Filtro,
      rotulo: ROTULO_ENCOMENDA[e],
      n: contagem.get(e) ?? 0,
    })),
    { f: "todas", rotulo: "Todas", n: linhas.length },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">A encomendar</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Os materiais em falta nas obras, com a data-limite para encomendar a tempo: início da tarefa − prazo do
          fornecedor − 2 dias.
        </p>
      </div>

      {linhas.length === 0 ? (
        <EmptyState
          title="Nada a encomendar"
          description="Nenhuma tarefa por fazer tem materiais em falta ligados. Os materiais ligam-se às tarefas ao criar a obra (serviços do contrato)."
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1 text-sm sm:w-fit">
            {separadores.map((s) => (
              <button
                key={s.f}
                type="button"
                onClick={() => setFiltro(s.f)}
                className={cx(
                  "rounded-md px-3 py-1",
                  filtro === s.f ? "bg-white font-medium text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                )}
              >
                {s.rotulo} <span className="tabular-nums text-slate-400">{s.n}</span>
              </button>
            ))}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-3">
            {visiveis.length > 0 ? (
              <EncomendasLista linhas={visiveis} mostrarObra />
            ) : (
              <p className="py-6 text-center text-sm text-slate-500">Nada urgente esta semana.</p>
            )}
          </div>
          {(contagem.get("sem_prazo") ?? 0) > 0 && (
            <p className="text-xs text-slate-500">
              {contagem.get("sem_prazo")} sem prazo do fornecedor: na Olyvia, em Produtos → Fornecedores, preencha o prazo
              de entrega para o sistema saber quando encomendar.
            </p>
          )}
        </>
      )}
    </div>
  );
}
