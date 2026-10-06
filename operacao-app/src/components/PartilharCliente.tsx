import { useCallback, useEffect, useState } from "react";
import {
  criarPartilha,
  estadoPartilha,
  linkDeAcompanhamento,
  previaAcompanhamento,
  revogarPartilha,
  urlsDasFotos,
  type Acompanhamento,
  type EstadoPartilha,
} from "../lib/acompanhamento";
import { ErroDeDados, ErroDeEscrita } from "../lib/dados";
import { data as formatarData, dataHora } from "../lib/formatar";
import AcompanhamentoVista from "./AcompanhamentoVista";
import { Button, ConfirmDialog, Field, Input, Modal, Select, Spinner } from "./ui";
import { Eye, ExternalLink, X } from "./icons";

/**
 * "Partilhar com o cliente" na ficha da obra: gerar/revogar o link privado
 * de acompanhamento, copiá-lo/enviá-lo, e ver exatamente o que o cliente vê.
 *
 * Quem vê a obra pré-visualiza; só o supervisor da obra ou o gestor gerem o
 * link (a base decide — `pode_gerir` só esconde os botões).
 * Sem o acompanhamento-cliente.sql aplicado, o botão não aparece.
 */
export default function PartilharCliente({ obraId, codigo }: { obraId: string; codigo: string }) {
  const [estado, setEstado] = useState<EstadoPartilha | null>(null);
  const [aberto, setAberto] = useState(false);
  const [previa, setPrevia] = useState<{ dados: Acompanhamento; urls: Map<string, string> } | null>(null);
  const [aCarregarPrevia, setACarregarPrevia] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [dias, setDias] = useState("90");
  const [aGravar, setAGravar] = useState(false);
  const [confirmarRevogar, setConfirmarRevogar] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setEstado(await estadoPartilha(obraId));
  }, [obraId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!estado) return null;

  const gerar = async () => {
    setAGravar(true);
    setErro(null);
    try {
      const r = await criarPartilha(obraId, Number(dias));
      setLink(linkDeAcompanhamento(r.token));
      setCopiado(false);
      await carregar();
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível gerar o link.");
    } finally {
      setAGravar(false);
    }
  };

  const revogar = async () => {
    setConfirmarRevogar(false);
    setAGravar(true);
    setErro(null);
    try {
      await revogarPartilha(obraId);
      setLink(null);
      await carregar();
    } catch (e) {
      setErro(e instanceof ErroDeEscrita ? e.message : "Não foi possível desativar o link.");
    } finally {
      setAGravar(false);
    }
  };

  const copiar = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  };

  const verPrevia = async () => {
    setACarregarPrevia(true);
    setErro(null);
    try {
      const d = await previaAcompanhamento(obraId);
      setPrevia({ dados: d, urls: await urlsDasFotos(d.fotos) });
    } catch (e) {
      setErro(e instanceof ErroDeDados ? e.message : "Não foi possível montar a pré-visualização.");
    } finally {
      setACarregarPrevia(false);
    }
  };

  const mensagem = link
    ? `Olá! Pode acompanhar a sua obra (${codigo}) aqui, com as etapas, as datas e as fotos do trabalho: ${link}`
    : "";

  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        <Button size="sm" variant="secondary" onClick={() => setAberto(true)}>
          <ExternalLink width={14} height={14} /> {estado.ativa ? "Partilhado com o cliente" : "Partilhar com o cliente"}
        </Button>
        {estado.ativa && (
          <span className="text-xs text-slate-500">
            {estado.acessos === 0 ? "o cliente ainda não abriu" : `aberto ${estado.acessos}×`}
          </span>
        )}
      </div>

      {aberto && (
        <Modal
          title="Partilhar com o cliente"
          onClose={() => {
            setAberto(false);
            setLink(null);
          }}
          footer={
            <Button variant="secondary" onClick={() => void verPrevia()} disabled={aCarregarPrevia}>
              <Eye width={14} height={14} /> {aCarregarPrevia ? "A preparar…" : "Ver o que o cliente vê"}
            </Button>
          }
        >
          <div className="space-y-4 text-sm">
            <p className="text-slate-600">
              Um link privado onde o cliente acompanha a obra: o progresso, as etapas com datas, as fotos que
              escolher e os atrasos já comunicados. Nunca vê custos, tempos, a equipa ou notas internas.
            </p>

            {link ? (
              <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs font-medium text-emerald-800">
                  Link gerado. Envie-o agora — por segurança, o link completo só aparece desta vez.
                </p>
                <div className="flex gap-2">
                  <Input readOnly value={link} className="w-full font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                  <Button size="sm" onClick={() => void copiar()}>
                    {copiado ? "Copiado" : "Copiar"}
                  </Button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a
                    className="rounded-lg bg-[#25D366] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                    href={`https://wa.me/?text=${encodeURIComponent(mensagem)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Enviar por WhatsApp
                  </a>
                  <a
                    className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
                    href={`mailto:?subject=${encodeURIComponent(`Acompanhe a sua obra ${codigo}`)}&body=${encodeURIComponent(mensagem)}`}
                  >
                    Enviar por email
                  </a>
                  <a
                    className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200"
                    href={link}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Abrir
                  </a>
                </div>
              </div>
            ) : estado.ativa ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="font-medium text-slate-800">Link ativo</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Criado a {formatarData(estado.criada_em)}
                  {estado.criada_por && ` por ${estado.criada_por}`} · válido até {formatarData(estado.expira_em)}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {estado.acessos === 0
                    ? "O cliente ainda não o abriu."
                    : `Aberto ${estado.acessos} ${estado.acessos === 1 ? "vez" : "vezes"} · última a ${dataHora(estado.ultimo_acesso_em)}`}
                </p>
              </div>
            ) : (
              <p className="rounded-xl border border-dashed border-slate-300 p-3 text-slate-500">
                Esta obra ainda não está partilhada.
              </p>
            )}

            <p className="text-xs text-slate-500">
              Fotos visíveis ao cliente: <span className="font-medium text-slate-700">{estado.fotos_visiveis}</span>. Escolhe-as nas
              fotos de cada tarefa, com "Mostrar ao cliente".
            </p>

            {estado.pode_gerir && (
              <div className="space-y-3 border-t border-slate-100 pt-3">
                <div className="flex flex-wrap items-end gap-2">
                  <Field label="Válido durante">
                    <Select value={dias} onChange={(e) => setDias(e.target.value)}>
                      <option value="30">30 dias</option>
                      <option value="90">90 dias</option>
                      <option value="180">6 meses</option>
                      <option value="365">1 ano</option>
                    </Select>
                  </Field>
                  <Button onClick={() => void gerar()} disabled={aGravar}>
                    {aGravar ? "A gerar…" : estado.ativa ? "Gerar novo link" : "Gerar link"}
                  </Button>
                  {estado.ativa && (
                    <Button variant="ghost" onClick={() => setConfirmarRevogar(true)} disabled={aGravar}>
                      <X width={14} height={14} /> Desativar
                    </Button>
                  )}
                </div>
                {estado.ativa && !link && (
                  <p className="text-xs text-slate-400">Gerar um novo link desativa o anterior.</p>
                )}
              </div>
            )}

            {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-700">{erro}</p>}
          </div>
        </Modal>
      )}

      {confirmarRevogar && (
        <ConfirmDialog
          title="Desativar o link?"
          message="O cliente deixa de conseguir abrir o acompanhamento. Pode gerar outro quando quiser."
          confirmLabel="Desativar"
          tone="danger"
          onConfirm={() => void revogar()}
          onCancel={() => setConfirmarRevogar(false)}
        />
      )}

      {(previa || aCarregarPrevia) && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-slate-900/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Pré-visualização">
          <div className="flex items-center justify-between bg-white px-4 py-2.5 shadow-sm">
            <p className="text-sm font-medium text-slate-700">O que o cliente vê</p>
            <Button size="sm" variant="ghost" onClick={() => setPrevia(null)}>
              <X width={14} height={14} /> Fechar
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto h-full max-w-md overflow-y-auto bg-slate-50 shadow-2xl sm:my-4 sm:h-[calc(100%-2rem)] sm:rounded-3xl sm:ring-8 sm:ring-slate-900">
              {previa ? <AcompanhamentoVista dados={previa.dados} urls={previa.urls} previa /> : <Spinner label="A preparar…" />}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
