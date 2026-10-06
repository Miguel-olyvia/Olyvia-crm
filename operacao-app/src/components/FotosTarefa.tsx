import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErroDeEscrita, urlsDosAnexos } from "../lib/dados";
import { caminhoDaFoto, fotosDasTarefas, removerFotoTarefa, type FotoTarefa } from "../lib/obrasFotos";
import { marcarFotoCliente } from "../lib/acompanhamento";
import { filaOffline, semRede, useImagemLocal, useOffline, type AcaoOffline } from "../lib/offline";
import { Button, Spinner, Toggle } from "./ui";
import { Eye, Plus, X } from "./icons";
import { dataHora } from "../lib/formatar";

/**
 * As fotos de uma tarefa de obra: o executor tira-as no sítio, o supervisor
 * vê-as antes de validar. Os URLs são assinados (1 h), como nas ordens.
 *
 * `podeEnviar` decide só se aparece o botão — a base verifica na mesma
 * (rpc_ops_obra_registar_foto). `podeMarcarCliente` mostra "Mostrar ao
 * cliente" (o supervisor da obra ou o gestor — rpc_ops_obra_foto_cliente).
 */
export default function FotosTarefa({
  tarefa,
  podeEnviar,
  euId,
  podeApagarTodas = false,
  nomes,
  aoMudarContagem,
  podeMarcarCliente = false,
  legendaPendente,
  aoUsarLegenda,
}: {
  tarefa: { id: string; obra_id: string; organization_id: string; estado: string };
  podeEnviar: boolean;
  euId: string | null;
  podeApagarTodas?: boolean;
  nomes?: ReadonlyMap<string, string>;
  aoMudarContagem?: (n: number) => void;
  podeMarcarCliente?: boolean;
  /** Uma nota ditada à espera de foto: vai como legenda da próxima. */
  legendaPendente?: string | null;
  /** A legenda foi usada (ou posta de lado). */
  aoUsarLegenda?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fotos, setFotos] = useState<FotoTarefa[] | null>(null);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [aSubir, setASubir] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aVer, setAVer] = useState<FotoTarefa | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const offline = useOffline();
  // As fotos tiradas sem rede, guardadas no telemóvel à espera de ligação.
  const porEnviar = useMemo(
    () =>
      offline.acoes.filter(
        (a) => a.tipo === "obra_foto" && (a.args as { tarefaId?: string }).tarefaId === tarefa.id
      ),
    [offline.acoes, tarefa.id]
  );

  const carregar = useCallback(async () => {
    try {
      const fs = await fotosDasTarefas([tarefa.id]);
      setFotos(fs);
      setErro(null);
      aoMudarContagem?.(fs.length);
      setUrls(await urlsDosAnexos(fs.map((f) => f.caminho)));
    } catch (e) {
      setFotos([]);
      setErro(semRede(e) ? null : "Não foi possível carregar as fotos.");
      if (semRede(e)) setAviso("Sem rede: as fotos já enviadas aparecem quando houver ligação.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tarefa.id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Uma foto da fila chegou à base: mostra-se a lista verdadeira.
  const nPorEnviar = porEnviar.length;
  const antes = useRef(nPorEnviar);
  useEffect(() => {
    if (nPorEnviar < antes.current) {
      setAviso(null);
      void carregar();
    }
    antes.current = nPorEnviar;
  }, [nPorEnviar, carregar]);

  const validada = tarefa.estado === "validada";
  const ativo = podeEnviar && !validada;

  const enviar = async (ficheiros: FileList | null) => {
    if (!ficheiros?.length) return;
    setASubir(true);
    setErro(null);
    try {
      let guardadas = 0;
      for (const f of Array.from(ficheiros)) {
        // O caminho decide-se já: se a rede cair a meio, o reenvio usa o mesmo.
        const caminho = caminhoDaFoto({
          organizationId: tarefa.organization_id,
          obraId: tarefa.obra_id,
          tarefaId: tarefa.id,
          nome: f.name,
        });
        const r = await filaOffline().executarOuGuardar({
          tipo: "obra_foto",
          chave: `foto:${caminho}`,
          args: { tarefaId: tarefa.id, caminho, nome: f.name, mime: f.type || null, legenda: legendaPendente ?? null },
          rotulo: `Foto em «${tarefa.id.slice(0, 8)}»`,
          ficheiro: f,
        });
        if (r.guardada) guardadas++;
      }
      if (guardadas > 0) {
        setAviso(
          `Sem rede — ${guardadas === 1 ? "a foto ficou guardada" : `${guardadas} fotos ficaram guardadas`} no telemóvel e ${guardadas === 1 ? "vai" : "vão"} quando houver ligação.`
        );
      }
      if (legendaPendente) aoUsarLegenda?.();
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

  const mudarCliente = async (f: FotoTarefa, visivel: boolean) => {
    setErro(null);
    try {
      await marcarFotoCliente(f.id, visivel);
      setFotos((fs) => (fs ?? []).map((x) => (x.id === f.id ? { ...x, visivel_cliente: visivel } : x)));
      setAVer((v) => (v && v.id === f.id ? { ...v, visivel_cliente: visivel } : v));
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível mudar a foto.");
    }
  };
  // Só com o acompanhamento-cliente.sql a coluna existe.
  const marcaCliente = podeMarcarCliente && (fotos ?? []).some((f) => typeof f.visivel_cliente === "boolean");

  if (fotos === null) return <Spinner label="A carregar as fotos" />;
  if (fotos.length === 0 && porEnviar.length === 0 && !ativo) {
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
      {ativo && legendaPendente && (
        <div className="mt-2 rounded-lg bg-brand-50/60 px-3 py-2 text-xs text-slate-700" data-testid="legenda-pendente">
          A próxima foto leva a legenda: <b>«{legendaPendente}»</b>{" "}
          <button type="button" className="ml-1 text-slate-500 underline" onClick={() => aoUsarLegenda?.()}>
            não usar
          </button>
        </div>
      )}
      {erro && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{erro}</p>}
      {aviso && <p className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-900">{aviso}</p>}

      {porEnviar.length > 0 && (
        <ul className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-4" aria-label="Fotos por enviar">
          {porEnviar.map((a) => (
            <FotoPorEnviar key={a.id} acao={a} />
          ))}
        </ul>
      )}

      {fotos.length === 0 && porEnviar.length > 0 ? null : fotos.length === 0 ? (
        <p className="mt-1 text-xs text-slate-400">Tira uma foto do trabalho feito — o supervisor vê-a antes de validar.</p>
      ) : (
        <ul className="mt-2 grid grid-cols-3 gap-1.5 sm:grid-cols-4">
          {fotos.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => setAVer(f)}
                className="relative block aspect-square w-full overflow-hidden rounded-lg bg-slate-100 ring-1 ring-slate-200 hover:ring-brand/40"
              >
                {f.visivel_cliente && (
                  <span
                    className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded-full bg-brand px-1.5 py-0.5 text-[9px] font-medium text-white shadow"
                    title="O cliente vê esta foto"
                  >
                    <Eye width={9} height={9} /> cliente
                  </span>
                )}
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
            {marcaCliente && (
              <div className="mt-3 border-t border-slate-100 pt-3">
                <Toggle
                  checked={!!aVer.visivel_cliente}
                  onChange={(v) => void mudarCliente(aVer, v)}
                  label="Mostrar ao cliente"
                  hint="Aparece no link de acompanhamento da obra."
                />
              </div>
            )}
            {aVer.legenda && <p className="mt-2 text-sm text-slate-700">{aVer.legenda}</p>}
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

/** Uma foto tirada sem rede: miniatura local e o estado do envio. */
function FotoPorEnviar({ acao }: { acao: AcaoOffline }) {
  const url = useImagemLocal(acao.ficheiro);
  const recusada = acao.estado === "conflito";
  return (
    <li className="relative aspect-square overflow-hidden rounded-lg bg-slate-100 ring-1 ring-sky-300">
      {url ? (
        <img src={url} alt="Foto por enviar" className="h-full w-full object-cover opacity-80" />
      ) : (
        <span className="flex h-full items-center justify-center text-[10px] text-slate-400">a preparar…</span>
      )}
      <span
        className={
          "absolute inset-x-0 bottom-0 px-1 py-0.5 text-center text-[10px] font-medium text-white " +
          (recusada ? "bg-red-600/90" : "bg-sky-700/80")
        }
        title={acao.erro}
      >
        {recusada ? "não aceite" : "por enviar"}
      </span>
    </li>
  );
}
