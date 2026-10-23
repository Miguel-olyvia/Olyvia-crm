// A aba «Recebidos» do portal: os documentos que o RH enviou à pessoa. O contrato (gerado no fluxo de admissão) vem à cabeça,
// por assinar; «Assinar» e «Recusar assinar» usam a lógica de assinatura que já existe. Ver e descarregar são simulados:
// a pré-visualização é um texto de exemplo e a descarga é uma cópia de exemplo, nunca o documento verdadeiro.
import { useState } from "react";
import { Download, Eye, FileText, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PainelAssinatura, type RespostaPainel } from "@/components/rh-exemplo/convite/PainelAssinatura";
import { assinarPeloLink, recusarContratoPeloLink } from "@/components/rh-exemplo/dados/accoesAdmissao";
import {
  assinarDocumentoPeloLink, marcarVistoPeloLink, recusarDocumentoPeloLink,
} from "@/components/rh-exemplo/dados/accoesPortalDocumentos";
import type { Admissao } from "@/components/rh-exemplo/lib/admissaoFluxo";
import { estadoRecebido, recebidoPedeAcao, type DocRecebido } from "@/components/rh-exemplo/lib/portalDocumentos";
import { ID_CONTRATO } from "@/components/rh-exemplo/lib/portalEstado";
import { useTranslation } from "@/hooks/useTranslation";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { cn } from "@/lib/utils";
import { SeloRecebido } from "./aspeto";
import { descarregarSimulado, diaMes } from "./textosPortal";

interface ItemProps {
  token: string | undefined;
  doc: DocRecebido;
  vistos: readonly string[];
  admissao: Admissao;
}

function acoesDoDocumento(token: string | undefined, doc: DocRecebido) {
  if (doc.id === ID_CONTRATO) {
    return {
      assinar: (nome: string, aceite: boolean): RespostaPainel => assinarPeloLink(token, nome, aceite),
      recusar: (motivo: string): RespostaPainel => recusarContratoPeloLink(token, motivo),
    };
  }
  return {
    assinar: (nome: string, aceite: boolean): RespostaPainel => assinarDocumentoPeloLink(token, doc.id, nome, aceite),
    recusar: (motivo: string): RespostaPainel => recusarDocumentoPeloLink(token, doc.id, motivo),
  };
}

function Previa({ doc, linhas }: { doc: DocRecebido; linhas: string[] }) {
  const { t } = useTranslation();
  return (
    <article aria-label={doc.titulo} className="space-y-2 rounded-md border bg-muted/30 p-4 text-sm">
      <h4 className="text-base font-semibold">{doc.titulo}</h4>
      {linhas.length > 0 ? linhas.map((l) => <p key={l}>{l}</p>) : <p>{t("rhPortal.recebidos.previa")}</p>}
      <p className="text-xs text-muted-foreground">{t("rhPortal.recebidos.previaExemplo")}</p>
    </article>
  );
}

function ItemRecebido({ token, doc, vistos, admissao }: ItemProps) {
  const { t } = useTranslation();
  const pedeAcao = recebidoPedeAcao(doc);
  const [aberto, setAberto] = useState(doc.id === ID_CONTRATO && pedeAcao);
  const [mensagem, setMensagem] = useState("");
  const linhas = doc.id === ID_CONTRATO ? (admissao.contrato?.linhas ?? []) : [];

  const ver = () => {
    if (!aberto) marcarVistoPeloLink(token, doc.id);
    setAberto(!aberto);
  };
  const descarregar = () => {
    marcarVistoPeloLink(token, doc.id);
    descarregarSimulado(doc.nomeFicheiro, `${doc.titulo}\n\n${t("rhPortal.recebidos.previaExemplo")}\n${linhas.join("\n")}`);
    setMensagem(t("rhPortal.recebidos.descarregado", { nome: doc.nomeFicheiro }));
  };

  return (
    <li data-testid={`recebido-${doc.id}`} className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-medium"><FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />{doc.titulo}</h3>
          <p className="text-xs text-muted-foreground">
            {t("rhPortal.recebidos.enviadoEm", { data: diaMes(doc.enviadoEm) })} · {doc.nomeFicheiro}
            {doc.origemPedidoId && <> · {t("rhPortal.recebidos.respostaAoPedido")}</>}
          </p>
        </div>
        <SeloRecebido estado={estadoRecebido(doc, vistos)} recusado={doc.recusa !== null} t={t} />
      </div>
      {doc.assinadoEm && doc.assinaturaNome && (
        <p className="text-sm" role="status">{t("rhPortal.recebidos.assinadoPor", { nome: doc.assinaturaNome, data: diaMes(doc.assinadoEm) })}</p>
      )}
      {doc.recusa && (
        <p role="status" className="text-sm">
          {t(doc.id === ID_CONTRATO ? "rhAdm.pub.contrato.recusado" : "rhPortal.recebidos.recusado", { motivo: doc.recusa.motivo })}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className={cn("min-h-11 gap-2", FOCO)} aria-expanded={aberto} onClick={ver}>
          <Eye className="h-4 w-4" aria-hidden="true" />{aberto ? t("rhPortal.recebidos.fechar") : t("rhPortal.recebidos.ver")}
        </Button>
        <Button type="button" variant="outline" className={cn("min-h-11 gap-2", FOCO)} onClick={descarregar}>
          <Download className="h-4 w-4" aria-hidden="true" />{t("rhPortal.recebidos.descarregar")}
        </Button>
      </div>
      {aberto && <Previa doc={doc} linhas={linhas} />}
      {mensagem && <p role="status" className="text-xs text-muted-foreground">{mensagem}</p>}
      {pedeAcao && (
        <div className="space-y-2 rounded-md border-l-4 border-primary bg-primary/5 p-3">
          <p className="text-sm font-medium">{t("rhPortal.recebidos.porAssinar")}</p>
          <PainelAssinatura
            idBase={`portal-assinar-${doc.id}`} {...acoesDoDocumento(token, doc)}
            chaveAceite={doc.id === ID_CONTRATO ? "rhAdm.pub.contrato.aceito" : "rhPortal.recebidos.aceito"}
          />
        </div>
      )}
    </li>
  );
}

export function PortalRecebidos({ token, recebidos, vistos, admissao }: { token: string | undefined; recebidos: DocRecebido[]; vistos: readonly string[]; admissao: Admissao }) {
  const { t } = useTranslation();
  if (recebidos.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center">
        <Inbox className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{t("rhPortal.recebidos.vazio")}</p>
      </div>
    );
  }
  return (
    <ul className="space-y-3" aria-label={t("rhPortal.recebidos.lista")}>
      {recebidos.map((doc) => <ItemRecebido key={doc.id} token={token} doc={doc} vistos={vistos} admissao={admissao} />)}
    </ul>
  );
}
