// O ecrã de acesso terminado do Portal do colaborador, SEM navegação: login temporário expirado, link revogado (substituído por
// outro, ou ficha rejeitada), acesso já ativo na plataforma, link desconhecido, ou a pessoa que acabou de sair. Diz o que
// aconteceu e o que fazer a seguir.
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Info, LogOut } from "lucide-react";
import type { VistaTerminada } from "@/components/rh-exemplo/lib/portalEstado";
import { useTranslation } from "@/hooks/useTranslation";
import { PortalMolduraSimples } from "./PortalMoldura";

function Passos({ vista }: { vista: VistaTerminada }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2 text-left">
      <p className="text-sm font-medium">{t("rhPortal.terminado.oQueFazer")}</p>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>{t(`rhPortal.terminado.${vista}.p1`)}</li>
        <li>{t(`rhPortal.terminado.${vista}.p2`)}</li>
      </ol>
    </div>
  );
}

export function PortalAcessoTerminado({ vista, nome }: { vista: VistaTerminada; nome: string | null }) {
  const { t } = useTranslation();
  const invalida = vista === "invalida";
  return (
    <PortalMolduraSimples>
      <Card className="w-full">
        <CardHeader className="items-center text-center">
          <Info className="h-10 w-10 text-primary" aria-hidden="true" />
          <h1 className="text-2xl font-semibold leading-none tracking-tight">
            {invalida ? t("hr.convite.tokenInvalidoTitulo") : t(`rhAdm.pub.${vista}.titulo`)}
          </h1>
          {nome && vista !== "revogada" && <p className="text-sm text-muted-foreground">{t("hr.convite.saudacao", { nome })}</p>}
          <CardDescription role="status">{invalida ? t("hr.convite.motivo.inexistente") : t(`rhAdm.pub.${vista}.texto`)}</CardDescription>
        </CardHeader>
        <CardContent>
          <Passos vista={vista} />
        </CardContent>
      </Card>
    </PortalMolduraSimples>
  );
}

/** Depois de «Sair»: a sessão do acesso temporário acaba, e o mesmo link serve para voltar a entrar. */
export function PortalSaiu({ aoEntrar }: { aoEntrar: () => void }) {
  const { t } = useTranslation();
  return (
    <PortalMolduraSimples>
      <Card className="w-full">
        <CardHeader className="items-center text-center">
          <LogOut className="h-10 w-10 text-primary" aria-hidden="true" />
          <h1 className="text-2xl font-semibold leading-none tracking-tight">{t("rhPortal.saiu.titulo")}</h1>
          <CardDescription role="status">{t("rhPortal.saiu.texto")}</CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button type="button" className="min-h-11" onClick={aoEntrar}>{t("rhPortal.saiu.entrar")}</Button>
        </CardContent>
      </Card>
    </PortalMolduraSimples>
  );
}
