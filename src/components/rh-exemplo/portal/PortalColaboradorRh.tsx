// «Portal do colaborador», visto pelo RH, na ficha de quem está em admissão: o link da pessoa (o endereço de exemplo e o
// prazo), os botões para enviar ou pedir um documento e a lista «Trocas com a pessoa». Na Visão geral aparece em resumo
// (`compacto`), com a ligação a Documentos, onde está tudo. Só memória: nada se envia de verdade.
import { useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink, FilePlus2, Send, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { dataEHora } from "@/components/rh-exemplo/admissao/auxiliares";
import { CAMINHO_PORTAL } from "@/components/rh-exemplo/convite/estadosConvite";
import { agoraExemplo } from "@/components/rh-exemplo/dados/hojeExemplo";
import { useAdmissao } from "@/components/rh-exemplo/dados/lojaAdmissao";
import { usePortalDocumentos } from "@/components/rh-exemplo/dados/lojaPortalDocumentos";
import { loginServe, prazoDoLogin, type Admissao } from "@/components/rh-exemplo/lib/admissaoFluxo";
import { pendentesDoRh } from "@/components/rh-exemplo/lib/portalDocumentos";
import { recebidosVisiveis } from "@/components/rh-exemplo/lib/portalEstado";
import { useTranslation } from "@/hooks/useTranslation";
import { FOCO } from "@/components/ficha-comum/estilosAbas";
import { cn } from "@/lib/utils";
import { restaDoAcesso } from "./textosPortal";
import { RhEnviarDocumentoDialog } from "./RhEnviarDocumentoDialog";
import { RhPedirDocumentoDialog } from "./RhPedirDocumentoDialog";
import { RhTrocasLista } from "./RhTrocasLista";

function Prazo({ admissao }: { admissao: Admissao }) {
  const { t } = useTranslation();
  const agora = agoraExemplo();
  if (!loginServe(admissao, agora)) return <p>{t("rhPortal.rh.semAcesso")}</p>;
  const termina = dataEHora(admissao.login.expiraEm);
  return <p>{t("rhPortal.rh.prazo", { data: termina.data, hora: termina.hora, resta: restaDoAcesso(t, prazoDoLogin(admissao, agora)) })}</p>;
}

interface PortalColaboradorRhProps {
  pessoaId: string;
  /** Em resumo (sem a lista de trocas), com a ligação para onde se gere. */
  compacto?: boolean;
  aoGerir?: () => void;
}

export function PortalColaboradorRh({ pessoaId, compacto = false, aoGerir }: PortalColaboradorRhProps) {
  const { t } = useTranslation();
  const admissao = useAdmissao(pessoaId);
  const portal = usePortalDocumentos(pessoaId);
  const [dialogo, setDialogo] = useState<"enviar" | "pedir" | null>(null);
  if (!admissao) return null;
  const caminho = `${CAMINHO_PORTAL}/${admissao.login.token}`;
  const aEsperaDoRh = pendentesDoRh(portal);

  return (
    <Card aria-labelledby="rh-portal-titulo" data-testid="rh-portal-colaborador">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle id="rh-portal-titulo" className="flex items-center gap-2 text-base">
          <UserRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t("rhPortal.rh.titulo")}
        </CardTitle>
        <Link to={caminho} target="_blank" rel="noreferrer" className={cn("inline-flex min-h-11 items-center gap-1 text-sm font-medium underline-offset-4 hover:underline", FOCO)}>
          {t("rhPortal.rh.abrir")}
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </Link>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1 text-sm">
          <p className="text-muted-foreground">{t("rhPortal.rh.link")}</p>
          <code data-testid="rh-portal-endereco" className="block break-all rounded-md border bg-muted/40 px-3 py-2 text-xs">{`${window.location.origin}${caminho}`}</code>
          <Prazo admissao={admissao} />
        </div>
        {compacto ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p>{aEsperaDoRh > 0 ? t("rhPortal.rh.aEsperaDoRh", { n: aEsperaDoRh }) : t("rhPortal.rh.emDia")}</p>
            {aoGerir && <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} onClick={aoGerir}>{t("rhPortal.rh.gerir")}</Button>}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Button type="button" className={cn("min-h-11 gap-2", FOCO)} onClick={() => setDialogo("enviar")}>
                <Send className="h-4 w-4" aria-hidden="true" />{t("rhPortal.rh.enviarBotao")}
              </Button>
              <Button type="button" variant="outline" className={cn("min-h-11 gap-2", FOCO)} onClick={() => setDialogo("pedir")}>
                <FilePlus2 className="h-4 w-4" aria-hidden="true" />{t("rhPortal.rh.pedirBotao")}
              </Button>
            </div>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{t("rhPortal.rh.trocas.titulo")}</h3>
              <RhTrocasLista pessoaId={pessoaId} portal={portal} recebidos={recebidosVisiveis(portal.recebidos, admissao)} />
            </div>
          </>
        )}
        <p className="text-xs text-muted-foreground">{t("rhPortal.rh.simulacao")}</p>
      </CardContent>
      <RhEnviarDocumentoDialog aberto={dialogo === "enviar"} pessoaId={pessoaId} aoFechar={() => setDialogo(null)} />
      <RhPedirDocumentoDialog aberto={dialogo === "pedir"} pessoaId={pessoaId} aoFechar={() => setDialogo(null)} />
    </Card>
  );
}
