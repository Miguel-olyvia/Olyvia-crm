// A secção «Documentos» do portal REAL: as mesmas três abas sublinhadas do exemplo («Recebidos», «Pedidos do RH», «Os meus pedidos»,
// a ativa no endereço em `?aba=`), ligadas à Edge `convite-admissao` (`doc_*`) em vez da loja em memória. «Recebidos» mostra o que o RH
// pôs no portal (o contrato à cabeça, por assinar): ver (HTML sanitizado) ou abrir o ficheiro (URL assinado de 60 s) e assinar com o
// código por SMS (`PortalAssinaturaSms`) ou recusar com motivo. Estados: a carregar, erro traduzido com «tentar de novo», vazio.
import { useEffect, useState } from "react";
import DOMPurify from "dompurify";
import { Download, Eye, FileText, Inbox, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ABA, FOCO, LISTA_ABAS } from "@/components/ficha-comum/estilosAbas";
import { ABAS_DOCUMENTOS, type AbaDocumentos } from "@/components/rh-exemplo/lib/portalEstado";
import { mensagemErroPortal } from "@/components/rh-exemplo/hooks/portalAdmissaoReal";
import {
  envioPedeAssinatura, pedidoRhPedeAcaoReal, type EnvioPortal, type usePortalDocumentosPublico,
} from "@/components/rh-exemplo/hooks/portalDocumentosReal";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { SeloRecebido } from "./aspeto";
import { PortalAssinaturaSms } from "./PortalAssinaturaSms";
import { PortalMeusPedidosReal, PortalPedidosRhReal } from "./PortalPedidosReais";
import { diaMes } from "./textosPortal";

export type DocumentosPortalHook = ReturnType<typeof usePortalDocumentosPublico>;

const dia = (iso: string | null): string => (iso && !Number.isNaN(Date.parse(iso)) ? diaMes(iso) : "");

function Contador({ n, rotulo }: { n: number; rotulo: string }) {
  if (n === 0) return null;
  return (
    <span className="rounded-full bg-primary/10 px-1.5 text-xs font-semibold text-primary dark:text-violet-300">
      {n}
      <span className="sr-only"> {rotulo}</span>
    </span>
  );
}

function ItemRecebido({ envio, docs, telemovel }: { envio: EnvioPortal; docs: DocumentosPortalHook; telemovel: string | null }) {
  const { t } = useTranslation();
  const pedeAcao = envioPedeAssinatura(envio);
  const [aberto, setAberto] = useState(pedeAcao && envio.temConteudo);
  const [html, setHtml] = useState("");
  const [aCarregar, setACarregar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // O conteudo so vive enquanto esta aberto: ao fechar apaga-se. Abre sozinho quando falta assinar (o contrato).
  const carregarConteudo = async () => {
    setACarregar(true);
    setErro(null);
    const r = await docs.conteudo(envio.id);
    setACarregar(false);
    if (!r.ok) return setErro(mensagemErroPortal(t, r.codigo));
    setHtml(DOMPurify.sanitize(r.html));
  };
  const alternar = () => {
    if (aberto) {
      setHtml("");
      return setAberto(false);
    }
    setAberto(true);
    void carregarConteudo();
  };
  // Primeira abertura automatica do que pede assinatura (so ao montar).
  useEffect(() => {
    if (aberto) void carregarConteudo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const abrirFicheiro = async () => {
    setErro(null);
    const r = await docs.urlDoFicheiro(envio.id);
    if (!r.ok || !r.url) return setErro(mensagemErroPortal(t, r.codigo));
    window.open(r.url, "_blank", "noopener,noreferrer");
  };

  const estado = envio.situacao === "assinado" ? "assinado" : envio.vistoEm ? "visto" : "novo";
  return (
    <li data-testid={`recebido-${envio.id}`} className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-medium">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />{envio.titulo}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t("rhPortal.recebidos.enviadoEm", { data: dia(envio.enviadoEm) })}
            {envio.pedidoId && <> · {t("rhPortal.recebidos.respostaAoPedido")}</>}
          </p>
        </div>
        <SeloRecebido estado={estado} recusado={envio.situacao === "recusado"} t={t} />
      </div>
      {envio.situacao === "assinado" && (
        <p className="text-sm" role="status">
          {envio.assinaturaReferencia
            ? t("rhPortalReal.recebidos.assinadoSms", { data: dia(envio.assinadoEm), referencia: envio.assinaturaReferencia })
            : t("rhPortalReal.recebidos.assinadoEm", { data: dia(envio.assinadoEm) })}
        </p>
      )}
      {envio.situacao === "recusado" && (
        <p role="status" className="text-sm">{t("rhPortal.recebidos.recusado", { motivo: envio.recusaMotivo ?? "" })}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {envio.temConteudo && (
          <Button type="button" variant="outline" className={cn("min-h-11 gap-2", FOCO)} aria-expanded={aberto} onClick={alternar}>
            <Eye className="h-4 w-4" aria-hidden="true" />{aberto ? t("rhPortal.recebidos.fechar") : t("rhPortal.recebidos.ver")}
          </Button>
        )}
        {envio.temFicheiro && (
          <Button type="button" variant="outline" className={cn("min-h-11 gap-2", FOCO)} onClick={() => void abrirFicheiro()}>
            <Download className="h-4 w-4" aria-hidden="true" />{t("rhPortalReal.recebidos.abrirFicheiro")}
          </Button>
        )}
      </div>
      {aberto && aCarregar && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{t("rhPortalReal.recebidos.aCarregar")}
        </p>
      )}
      {aberto && html !== "" && (
        <article
          aria-label={envio.titulo} className="max-h-96 overflow-y-auto rounded-md border bg-background p-4 text-sm"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
      {pedeAcao && (
        <div className="space-y-2 rounded-md border-l-4 border-primary bg-primary/5 p-3">
          <p className="text-sm font-medium">{t("rhPortal.recebidos.porAssinar")}</p>
          <PortalAssinaturaSms
            idBase={`portal-assinar-${envio.id}`} telemovelMascarado={telemovel}
            pedirCodigo={() => docs.pedirCodigoSms(envio.id)}
            assinar={(codigo, aceite) => docs.assinar(envio.id, codigo, aceite)}
            recusar={(motivo) => docs.recusar(envio.id, motivo)}
          />
        </div>
      )}
    </li>
  );
}

function Recebidos({ envios, docs, telemovel }: { envios: EnvioPortal[]; docs: DocumentosPortalHook; telemovel: string | null }) {
  const { t } = useTranslation();
  if (envios.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center">
        <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{t("rhPortal.recebidos.vazio")}</p>
      </div>
    );
  }
  return (
    <ul className="space-y-3" aria-label={t("rhPortal.recebidos.lista")}>
      {envios.map((e) => <ItemRecebido key={e.id} envio={e} docs={docs} telemovel={telemovel} />)}
    </ul>
  );
}

interface PortalDocumentosRealProps {
  docs: DocumentosPortalHook;
  aba: AbaDocumentos;
  aoMudarAba: (aba: AbaDocumentos) => void;
}

export function PortalDocumentosReal({ docs, aba, aoMudarAba }: PortalDocumentosRealProps) {
  const { t } = useTranslation();
  const { dados, erroLeitura } = docs;
  if (!dados) {
    if (erroLeitura) {
      return (
        <div role="alert" className="space-y-2 rounded-lg border border-destructive/50 px-4 py-3 text-sm">
          <p>{mensagemErroPortal(t, erroLeitura)}</p>
          <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={() => void docs.recarregar()}>
            {t("portal.ligado.tentarDeNovo")}
          </Button>
        </div>
      );
    }
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{t("portal.carregando")}
      </p>
    );
  }
  // Um documento anulado pelo RH ja nao conta para a pessoa.
  const envios = dados.envios.filter((e) => e.situacao !== "anulado");
  const contagens: Record<AbaDocumentos, number> = {
    recebidos: envios.filter(envioPedeAssinatura).length,
    pedidos: dados.pedidosRh.filter(pedidoRhPedeAcaoReal).length,
    meus: 0,
  };
  return (
    <section aria-labelledby="portal-docs-titulo" className="space-y-4">
      <div className="space-y-1">
        <h1 id="portal-docs-titulo" className="text-2xl font-bold">{t("rhPortal.docs.titulo")}</h1>
        <p className="text-sm text-muted-foreground">{t("rhPortal.docs.sub")}</p>
      </div>
      {erroLeitura && <p role="alert" className="text-sm text-destructive">{mensagemErroPortal(t, erroLeitura)}</p>}
      <Tabs value={aba} onValueChange={(v) => aoMudarAba(v as AbaDocumentos)}>
        <TabsList className={LISTA_ABAS} aria-label={t("rhPortal.docs.abas")}>
          {ABAS_DOCUMENTOS.map((a) => (
            <TabsTrigger key={a} value={a} className={ABA}>
              {t(`rhPortal.docs.aba.${a}`)}
              <Contador n={contagens[a]} rotulo={t("rhPortal.docs.porTratar")} />
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="recebidos" className="mt-4">
          <h2 className="sr-only">{t("rhPortal.docs.aba.recebidos")}</h2>
          <Recebidos envios={envios} docs={docs} telemovel={dados.telemovelMascarado} />
        </TabsContent>
        <TabsContent value="pedidos" className="mt-4">
          <h2 className="sr-only">{t("rhPortal.docs.aba.pedidos")}</h2>
          <PortalPedidosRhReal pedidos={dados.pedidosRh.filter((p) => p.estado !== "cancelado")} docs={docs} />
        </TabsContent>
        <TabsContent value="meus" className="mt-4">
          <h2 className="sr-only">{t("rhPortal.docs.aba.meus")}</h2>
          <PortalMeusPedidosReal pedidos={dados.pedidosPessoa.filter((p) => p.estado !== "cancelado")} envios={envios} docs={docs} />
        </TabsContent>
      </Tabs>
    </section>
  );
}
