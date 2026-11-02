// «Trocas com a pessoa» (lado do RH) LIGADAS À BASE, com o desenho da lista do exemplo: o que o RH pôs no portal (com o contrato
// assinado por SMS à vista), o que o RH pediu e o que a pessoa enviou (aceitar ou recusar com motivo), e o que a pessoa pediu ao RH
// (preparar, responder com um documento da ficha, recusar com motivo). Cada botão só aparece com a permissão que a base exige:
// `.edit` (pedidos), `.emitir` (responder), `.anular` (retirar do portal). Erros traduzidos, nunca em bruto.
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import type { EstadoPedidoPessoa, EstadoPedidoRh } from "@/components/rh-exemplo/lib/portalDocumentos";
import type { DocumentoPartilhavel, EnvioRh, PedidoDaPessoa, PedidoDoRh, usePortalDocumentosRh } from "@/components/rh-exemplo/hooks/portalDocumentosReal";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { SeloPedidoPessoa, SeloPedidoRh, SeloRecebido } from "./aspeto";
import { MotivoDialogReal, RhResponderPedidoDialogReal } from "./RhDialogosReais";
import { diaMes, diaMesDoDia } from "./textosPortal";

type Rh = ReturnType<typeof usePortalDocumentosRh>;
type Traduzir = ReturnType<typeof useTranslation>["t"];

const BOTAO = cn("min-h-11", FOCO);
const dia = (iso: string | null): string => (iso && !Number.isNaN(Date.parse(iso)) ? diaMes(iso) : "");
const tituloRh = (t: Traduzir, p: PedidoDoRh): string => (p.tipo === "outro" && p.titulo !== "" ? p.titulo : t(`rhPortal.tipoRh.${p.tipo}`));
const tituloPessoa = (t: Traduzir, p: PedidoDaPessoa): string => (p.tipo === "outro" && p.titulo !== "" ? p.titulo : t(`rhPortal.tipoPessoa.${p.tipo}`));

type Recusa = { tipo: "retirar" | "pedidoRh" | "pedidoPessoa"; id: string; titulo: string } | null;

function Linha({ testId, topo, selo, children }: { testId: string; topo: ReactNode; selo: ReactNode; children?: ReactNode }) {
  return (
    <li data-testid={testId} className="space-y-2 rounded-md border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">{topo}</div>
        {selo}
      </div>
      {children}
    </li>
  );
}

function Seccao({ id, titulo, vazio, n, children }: { id: string; titulo: string; vazio: string; n: number; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h4 id={id} className="text-sm font-semibold">{titulo} ({n})</h4>
      {n === 0 ? <p className="text-sm text-muted-foreground">{vazio}</p> : <ul className="space-y-2">{children}</ul>}
    </section>
  );
}

interface Permissoes { podeEditar: boolean; podeEmitir: boolean; podeAnular: boolean }

function Enviados({ envios, permissoes, retirar }: { envios: EnvioRh[]; permissoes: Permissoes; retirar: (r: Recusa) => void }) {
  const { t } = useTranslation();
  return (
    <Seccao id="rh-trocas-enviados" titulo={t("rhPortal.rh.trocas.enviados")} vazio={t("rhPortal.rh.trocas.enviadosVazio")} n={envios.length}>
      {envios.map((e) => {
        const assinado = e.estadoDocumento === "assinado";
        const recusado = e.recusadoEm !== null && !assinado;
        const estado = assinado ? "assinado" : e.vistoEm ? "visto" : "novo";
        return (
          <Linha
            key={e.id} testId={`rh-recebido-${e.id}`} selo={<SeloRecebido estado={estado} recusado={recusado} t={t} />}
            topo={<>
              <p className="font-medium">{e.titulo}</p>
              <p className="text-xs text-muted-foreground">
                {t("rhPortal.recebidos.enviadoEm", { data: dia(e.enviadoEm) })}
                {e.exigeAssinatura && <> · {t("rhPortal.rh.trocas.precisaAssinatura")}</>}
                {e.pedidoId && <> · {t("rhPortal.recebidos.respostaAoPedido")}</>}
              </p>
            </>}
          >
            {assinado && (
              <p role="status" className="text-sm">
                {e.assinaturaOrigem === "portal"
                  ? t("rhPortalReal.rh.assinadoPortal", {
                    data: dia(e.assinadoEm), referencia: e.assinaturaReferencia ?? "", telemovel: e.assinaturaTelemovelMascarado ?? "",
                  })
                  : t("rhPortalReal.rh.assinado", { data: dia(e.assinadoEm) })}
                {" "}{t("rhPortalReal.rh.verNosDocumentos")}
              </p>
            )}
            {recusado && <p role="status" className="text-sm">{t("rhPortal.rh.trocas.recusouAssinar", { motivo: e.recusaMotivo ?? "" })}</p>}
            {permissoes.podeAnular && !assinado && e.estadoDocumento !== "entregue" && (
              <Button
                type="button" size="sm" variant="outline" className={BOTAO} aria-label={t("rhPortalReal.rh.retirarAria", { titulo: e.titulo })}
                onClick={() => retirar({ tipo: "retirar", id: e.id, titulo: e.titulo })}
              >
                {recusado ? t("rhPortalReal.rh.retirarEEnviar") : t("rhPortalReal.rh.retirar")}
              </Button>
            )}
          </Linha>
        );
      })}
    </Seccao>
  );
}

function PedidosAPessoa({ pedidos, rh, permissoes, recusar }: { pedidos: PedidoDoRh[]; rh: Rh; permissoes: Permissoes; recusar: (r: Recusa) => void }) {
  const { t } = useTranslation();
  const [erro, setErro] = useState<string | null>(null);
  const correr = async (acao: Promise<{ ok: boolean; erro: string | null }>) => {
    setErro(null);
    const r = await acao;
    if (!r.ok) setErro(r.erro);
  };
  return (
    <Seccao id="rh-trocas-pedidos" titulo={t("rhPortal.rh.trocas.pedidos")} vazio={t("rhPortal.rh.trocas.pedidosVazio")} n={pedidos.length}>
      {pedidos.map((p) => {
        const titulo = tituloRh(t, p);
        return (
          <Linha
            key={p.id} testId={`rh-pedido-${p.id}`} selo={<SeloPedidoRh estado={p.estado as EstadoPedidoRh} t={t} />}
            topo={<>
              <p className="font-medium">{titulo}</p>
              {p.prazo !== "" && <p className="text-xs text-muted-foreground">{t("rhPortal.pedidosRh.prazo", { data: diaMesDoDia(p.prazo) })}</p>}
            </>}
          >
            {p.ficheiros.length > 0 && (
              <p className="text-xs text-muted-foreground">{t("rhPortal.rh.trocas.ficheiros", { lista: p.ficheiros.map((f) => f.nome).join(", ") })}</p>
            )}
            {p.estado === "recusado" && p.motivoRecusa && <p role="status" className="text-sm">{t("rhPortal.pedidosRh.recusadoMotivo", { motivo: p.motivoRecusa })}</p>}
            {permissoes.podeEditar && p.estado === "enviado" && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" className={BOTAO} disabled={rh.aExecutar} aria-label={t("rhPortal.rh.trocas.aceitarAria", { titulo })} onClick={() => void correr(rh.aceitarPedido(p.id))}>
                  {t("rhPortal.rh.trocas.aceitar")}
                </Button>
                <Button type="button" size="sm" variant="outline" className={cn(BOTAO, "text-destructive")} aria-label={t("rhPortal.rh.trocas.recusarAria", { titulo })} onClick={() => recusar({ tipo: "pedidoRh", id: p.id, titulo })}>
                  {t("rhPortal.rh.trocas.recusar")}
                </Button>
              </div>
            )}
            {permissoes.podeEditar && (p.estado === "por_enviar" || p.estado === "recusado") && (
              <Button type="button" size="sm" variant="outline" className={BOTAO} disabled={rh.aExecutar} aria-label={t("rhPortalReal.rh.cancelarPedidoAria", { titulo })} onClick={() => void correr(rh.cancelarPedido(p.id))}>
                {t("rhPortalReal.rh.cancelarPedido")}
              </Button>
            )}
          </Linha>
        );
      })}
      {erro && <li role="alert" className="text-sm text-destructive">{erro}</li>}
    </Seccao>
  );
}

interface PedidosDaPessoaProps {
  pedidos: PedidoDaPessoa[];
  rh: Rh;
  permissoes: Permissoes;
  responder: (id: string, titulo: string) => void;
  recusar: (r: Recusa) => void;
}

function PedidosDaPessoaLista({ pedidos, rh, permissoes, responder, recusar }: PedidosDaPessoaProps) {
  const { t } = useTranslation();
  const [erro, setErro] = useState<string | null>(null);
  const preparar = async (id: string) => {
    setErro(null);
    const r = await rh.prepararPedidoDaPessoa(id);
    if (!r.ok) setErro(r.erro);
  };
  return (
    <Seccao id="rh-trocas-pessoa" titulo={t("rhPortal.rh.trocas.daPessoa")} vazio={t("rhPortal.rh.trocas.daPessoaVazio")} n={pedidos.length}>
      {pedidos.map((p) => {
        const titulo = tituloPessoa(t, p);
        const porTratar = p.estado === "pedido" || p.estado === "em_preparacao";
        return (
          <Linha
            key={p.id} testId={`rh-pedido-pessoa-${p.id}`} selo={<SeloPedidoPessoa estado={p.estado as EstadoPedidoPessoa} t={t} />}
            topo={<>
              <p className="font-medium">{titulo}</p>
              <p className="text-xs text-muted-foreground">{t("rhPortal.meus.pedidoEm", { data: dia(p.criadoEm) })} · {t(`rhPortal.urgencia.${p.urgencia === "urgente" ? "urgente" : "normal"}`)}</p>
            </>}
          >
            {p.nota && <p className="text-sm text-muted-foreground">{p.nota}</p>}
            {p.estado === "recusado" && p.motivoRecusa && <p role="status" className="text-sm">{t("rhPortal.meus.recusadoMotivo", { motivo: p.motivoRecusa })}</p>}
            {porTratar && (
              <div className="flex flex-wrap gap-2">
                {permissoes.podeEditar && p.estado === "pedido" && (
                  <Button type="button" size="sm" variant="outline" className={BOTAO} disabled={rh.aExecutar} aria-label={t("rhPortal.rh.trocas.prepararAria", { titulo })} onClick={() => void preparar(p.id)}>
                    {t("rhPortal.rh.trocas.preparar")}
                  </Button>
                )}
                {permissoes.podeEmitir && (
                  <Button type="button" size="sm" className={BOTAO} aria-label={t("rhPortal.rh.trocas.responderAria", { titulo })} onClick={() => responder(p.id, titulo)}>
                    {t("rhPortal.rh.trocas.responder")}
                  </Button>
                )}
                {permissoes.podeEditar && (
                  <Button type="button" size="sm" variant="outline" className={cn(BOTAO, "text-destructive")} aria-label={t("rhPortal.rh.trocas.recusarAria", { titulo })} onClick={() => recusar({ tipo: "pedidoPessoa", id: p.id, titulo })}>
                    {t("rhPortal.rh.trocas.recusar")}
                  </Button>
                )}
              </div>
            )}
          </Linha>
        );
      })}
      {erro && <li role="alert" className="text-sm text-destructive">{erro}</li>}
    </Seccao>
  );
}

interface RhTrocasListaRealProps {
  rh: Rh;
  permissoes: Permissoes;
}

export function RhTrocasListaReal({ rh, permissoes }: RhTrocasListaRealProps) {
  const { t } = useTranslation();
  const [recusa, setRecusa] = useState<Recusa>(null);
  const [responder, setResponder] = useState<{ id: string; titulo: string } | null>(null);
  // Um documento que ja esta no portal nao se partilha duas vezes (a base recusa).
  const livres: DocumentoPartilhavel[] = rh.documentos.filter((d) => !d.partilhado);

  const confirmar = (motivo: string) => {
    if (!recusa) return Promise.resolve({ ok: false, erro: null });
    if (recusa.tipo === "retirar") return rh.retirarEnvio(recusa.id, motivo);
    return recusa.tipo === "pedidoRh" ? rh.recusarPedido(recusa.id, motivo) : rh.recusarPedidoDaPessoa(recusa.id, motivo);
  };
  const tituloRecusa = recusa?.tipo === "retirar" ? "rhPortalReal.rh.retirarTitulo" : "rhPortal.rh.trocas.recusarTitulo";
  const subRecusa = recusa?.tipo === "retirar" ? "rhPortalReal.rh.retirarSub" : "rhPortal.rh.trocas.recusarSub";
  const botaoRecusa = recusa?.tipo === "retirar" ? "rhPortalReal.rh.retirar" : "rhPortal.rh.trocas.recusar";

  return (
    <div className="space-y-4" data-testid="rh-trocas">
      <PedidosAPessoa pedidos={rh.pedidosRh} rh={rh} permissoes={permissoes} recusar={setRecusa} />
      <PedidosDaPessoaLista
        pedidos={rh.pedidosPessoa} rh={rh} permissoes={permissoes} recusar={setRecusa}
        responder={(id, titulo) => setResponder({ id, titulo })}
      />
      <Enviados envios={rh.envios} permissoes={permissoes} retirar={setRecusa} />
      <MotivoDialogReal
        aberto={recusa !== null} titulo={t(tituloRecusa, { titulo: recusa?.titulo ?? "" })} descricao={t(subRecusa)}
        confirmar={t(botaoRecusa)} aoConfirmar={confirmar} aoFechar={() => setRecusa(null)}
      />
      <RhResponderPedidoDialogReal
        aberto={responder !== null} titulo={responder?.titulo ?? ""} documentos={livres}
        responder={(documentoId) => rh.responderPedidoDaPessoa(responder?.id ?? "", documentoId)} aoFechar={() => setResponder(null)}
      />
    </div>
  );
}
