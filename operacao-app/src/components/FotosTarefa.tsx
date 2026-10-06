import { useCallback, useEffect, useRef, useState } from "react";
import { ErroDeEscrita, urlsDosAnexos } from "../lib/dados";
import { enviarFotoTarefa, fotosDasTarefas, removerFotoTarefa, type FotoTarefa } from "../lib/obrasFotos";
import { Button, Spinner } from "./ui";
import { Plus, X } from "./icons";
import { dataHora } from "../lib/formatar";

/**
 * As fotos de uma tarefa de obra: o executor tira-as no sítio, o supervisor
 * vê-as antes de validar. Os URLs são assinados (1 h), como nas ordens.
 *
 * `podeEnviar` decide só se aparece o botão — a base verifica na mesma
 * (rpc_ops_obra_registar_foto).
 */
export default function FotosTarefa({
  tarefa,
  podeEnviar,
  euId,
  podeApagarTodas = false,
  nomes,
  aoMudarContagem,
}: {
  tarefa: { id: string; obra_id: string; organization_id: string; estado: string };
  podeEnviar: boolean;
  euId: string | null;
  podeApagarTodas?: boolean;
  nomes?: ReadonlyMap<string, string>;
  aoMudarContagem?: (n: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fotos, setFotos] = useState<FotoTarefa[] | null>(null);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [aSubir, setASubir] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aVer, setAVer] = useState<FotoTarefa | null>(null);

  const carregar = useCallback(async () => {
    try {
      const fs = await fotosDasTarefas([tarefa.id]);
      setFotos(fs);
      aoMudarContagem?.(fs.length);
      setUrls(await urlsDosAnexos(fs.map((f) => f.caminho)));
    } catch {
      setFotos([]);
      setErro("Não foi possível carregar as fotos.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarefa.id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const validada = tarefa.estado === "validada";
  const ativo = podeEnviar && !validada;

  const enviar = async (ficheiros: FileList | null) => {
    if (!ficheiros?.length) return;
    setASubir(true);
    setErro(null);
    try {
      for (const f of Array.from(ficheiros)) {
        await enviarFotoTarefa({
          organizationId: tarefa.organization_id,
          obraId: tarefa.obra_id,
          tarefaId: tarefa.id,
          ficheiro: f,
        });
      }
      await carregar();
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível enviar a foto. Tenta outra vez.");
    } finally {
      setASubir(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const apagar = async (f: FotoTarefa) => {
    setErro(null);
    try {
      await removerFotoTarefa(f.id);
      setAVer(null);
      await carregar();
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível apagar a foto.");
    }
  };

  if (fotos === null) return <Spinner label="A carregar as fotos" />;
  if (fotos.length === 0 && !ativo) {
    return <p className="text-xs text-slate-400">Sem fotos.</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Fotos {fotos.length > 0 && <span className="font-mono tabular">({fotos.length})</span>}
        </p>
        {ativo && (
          <Button size="sm" variant="secondary" disabled={aSubir} onClick={() => inputRef.current?.click()}>
            <Plus width={14} height={14} /> {aSubir ? "A enviar…" : "Tirar foto"}
          </Button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        capture="environment"
        accept="image/*"
        className="hidden"
        onChange={(e) => void enviar(e.target.files)}
      />
      {erro && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{erro}</p>}

      {fotos.length === 0 ? (
        <p className="mt-1 text-xs text-slate-400">Tira uma foto do trabalho feito — o supervisor vê-a antes de validar.</p>
      ) : (
        <ul className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
          {fotos.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => setAVer(f)}
                className="block aspect-square w-full overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200 hover:ring-brand/40"
              >
                {urls.get(f.caminho) ? (
                  <img src={urls.get(f.caminho)} alt={f.legenda ?? f.nome} loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full items-center justify-center text-[10px] text-slate-400">a carregar…</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {aVer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setAVer(null)}
        >
          <div className="max-h-full w-full max-w-3xl overflow-auto rounded-xl bg-white p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs text-slate-500">
                {dataHora(aVer.carregado_em)}
                {aVer.carregado_por && nomes?.get(aVer.carregado_por) && ` · ${nomes.get(aVer.carregado_por)}`}
              </p>
              <button
                type="button"
                onClick={() => setAVer(null)}
                aria-label="Fechar"
                className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X width={18} height={18} />
              </button>
            </div>
            {urls.get(aVer.caminho) && (
              <img src={urls.get(aVer.caminho)} alt={aVer.legenda ?? aVer.nome} className="mt-3 w-full rounded-lg" />
            )}
            {!validada && (podeApagarTodas || (euId && aVer.carregado_por === euId)) && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <Button size="sm" variant="danger" onClick={() => void apagar(aVer)}>
                  Apagar foto
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
