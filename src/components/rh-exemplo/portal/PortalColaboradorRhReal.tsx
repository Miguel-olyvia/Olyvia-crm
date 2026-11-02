// «Portal do colaborador», visto pelo RH, na ficha: a versão REAL do cartão do exemplo, ligada à base. Botões «Enviar contrato»
// (admissão aprovada, escolhe o modelo e avisa por e-mail), «Enviar documento» e «Pedir documento», e a lista «Trocas com a pessoa»
// (aceitar ou recusar o que a pessoa enviou, responder ao que ela pediu, ver o contrato assinado por SMS). Na Visão geral aparece em
// resumo (`compacto`), com a ligação a Documentos. O que cada botão exige vem da base: `.emitir` (enviar), `.edit` (pedir/decidir),
// `.anular` (retirar). Estados: a carregar, erro traduzido com «tentar de novo»; sem acesso, o cartão não aparece.
import { useState } from "react";
import { FilePlus2, FileSignature, Loader2, Send, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { useConviteAdmissaoResumo } from "@/components/rh-exemplo/hooks/useConviteAdmissaoResumo";
import { usePermissions } from "@/components/rh-exemplo/hooks/usePermissions";
import { EnviarContratoDialog, usePortalDocumentosRh } from "@/components/rh-exemplo/hooks/portalDocumentosReal";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { RhEnviarDocumentoDialogReal, RhPedirDocumentoDialogReal } from "./RhDialogosReais";
import { RhTrocasListaReal } from "./RhTrocasListaReal";

interface PortalColaboradorRhRealProps {
  pessoaId: string;
  /** O nome da pessoa, para o titulo do envio do contrato. */
  nome?: string;
  /** Em resumo (sem a lista de trocas), com a ligação para onde se gere. */
  compacto?: boolean;
  aoGerir?: () => void;
}

/** O contrato envia-se com a admissão aprovada (ou já a aguardar assinaturas, para um segundo documento). */
const ESTADOS_QUE_ENVIAM_CONTRATO: readonly string[] = ["aprovada", "a_aguardar_assinaturas"];

export function PortalColaboradorRhReal({ pessoaId, nome = "", compacto = false, aoGerir }: PortalColaboradorRhRealProps) {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const rh = usePortalDocumentosRh(pessoaId);
  const convite = useConviteAdmissaoResumo(pessoaId);
  const [dialogo, setDialogo] = useState<"contrato" | "enviar" | "pedir" | null>(null);

  const podeVer = hasPermission("hr.pessoas.documentos.view");
  const permissoes = {
    podeEditar: hasPermission("hr.pessoas.documentos.edit"),
    podeEmitir: hasPermission("hr.pessoas.documentos.emitir"),
    podeAnular: hasPermission("hr.pessoas.documentos.anular"),
  };
  if (!podeVer || rh.semAcesso) return null;

  const conviteId = convite.resumo?.conviteId ?? null;
  const podeEnviarContrato = permissoes.podeEmitir && conviteId !== null && ESTADOS_QUE_ENVIAM_CONTRATO.includes(convite.resumo?.estado ?? "");
  const aEsperaDoRh =
    rh.pedidosRh.filter((p) => p.estado === "enviado").length +
    rh.pedidosPessoa.filter((p) => p.estado === "pedido" || p.estado === "em_preparacao").length;
  const aEsperaDaPessoa = rh.envios.filter((e) => e.exigeAssinatura && e.estadoDocumento === "a_aguardar_assinatura").length;
  const recarregarTudo = () => {
    rh.recarregar();
    convite.recarregar();
  };

  return (
    <Card aria-labelledby="rh-portal-titulo" data-testid="rh-portal-colaborador">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle id="rh-portal-titulo" className="flex items-center gap-2 text-base">
          <UserRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t("rhPortal.rh.titulo")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {rh.carregando && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{t("rhPortalReal.rh.carregando")}
          </p>
        )}
        {rh.erro && !rh.carregando && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 p-3">
            <p className="text-sm text-destructive">{t("rhPortalReal.rh.erroLer")}</p>
            <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={rh.recarregar}>{t("common.retry")}</Button>
          </div>
        )}
        {!rh.carregando && !rh.erro && (
          compacto ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <p>{aEsperaDoRh > 0 ? t("rhPortal.rh.aEsperaDoRh", { n: aEsperaDoRh }) : aEsperaDaPessoa > 0 ? t("rhPortalReal.rh.aEsperaDaPessoa", { n: aEsperaDaPessoa }) : t("rhPortal.rh.emDia")}</p>
              {aoGerir && <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={aoGerir}>{t("rhPortal.rh.gerir")}</Button>}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {podeEnviarContrato && (
                  <Button type="button" className={cn("min-h-11 gap-2", FOCO)} onClick={() => setDialogo("contrato")}>
                    <FileSignature className="h-4 w-4" aria-hidden="true" />{t("rhPortalReal.decisao.enviarContrato")}
                  </Button>
                )}
                {permissoes.podeEmitir && (
                  <Button type="button" variant={podeEnviarContrato ? "outline" : "default"} className={cn("min-h-11 gap-2", FOCO)} onClick={() => setDialogo("enviar")}>
                    <Send className="h-4 w-4" aria-hidden="true" />{t("rhPortal.rh.enviarBotao")}
                  </Button>
                )}
                {permissoes.podeEditar && (
                  <Button type="button" variant="outline" className={cn("min-h-11 gap-2", FOCO)} onClick={() => setDialogo("pedir")}>
                    <FilePlus2 className="h-4 w-4" aria-hidden="true" />{t("rhPortal.rh.pedirBotao")}
                  </Button>
                )}
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">{t("rhPortal.rh.trocas.titulo")}</h3>
                <RhTrocasListaReal rh={rh} permissoes={permissoes} />
              </div>
            </>
          )
        )}
      </CardContent>
      <EnviarContratoDialog aberto={dialogo === "contrato"} conviteId={conviteId} nome={nome} aoFechar={() => setDialogo(null)} aoEnviado={recarregarTudo} />
      <RhEnviarDocumentoDialogReal
        aberto={dialogo === "enviar"} documentos={rh.documentos.filter((d) => !d.partilhado)} conviteId={conviteId}
        enviar={rh.enviarDocumento} aoFechar={() => setDialogo(null)}
      />
      <RhPedirDocumentoDialogReal aberto={dialogo === "pedir"} pedir={rh.pedirDocumento} conviteId={conviteId} aoFechar={() => setDialogo(null)} />
    </Card>
  );
}
