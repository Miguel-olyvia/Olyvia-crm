/**
 * A vista do processo EM ANALISE: a pessoa ve so o estado (sem dados sensiveis nem formulario) e e
 * mandada contactar o RH.
 *
 * As outras vistas sem acesso (link invalido, revogado, encerrado, expirado, bloqueado, demasiados
 * pedidos) NAO se desenham aqui: usam o cartao de link invalido que ja existia
 * (`ConviteCartaoLinkInvalido`), com o motivo que ja tinha (`motivoDaVista`). So esta nao tinha
 * equivalente. O nome do ficheiro fica.
 */
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Hourglass } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { estadoAdmissaoDe } from "@/lib/hr/estadoAdmissao";
import { PortalProgresso } from "./PortalProgresso";

export function PortalEmAnalise({ estado }: { estado: string | null }) {
  const { t } = useTranslation();
  return (
    <Card className="w-full">
      <CardHeader className="items-center text-center">
        <Hourglass className="h-10 w-10 text-primary" aria-hidden="true" />
        <h1 id="portal-titulo" tabIndex={-1} className="text-2xl font-semibold leading-none tracking-tight outline-none">
          {t("portal.vista.analise.titulo")}
        </h1>
        <CardDescription>{t("portal.vista.analise.texto")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p role="status" className="text-center text-sm font-medium">
          {t("portal.vista.analise.estado", { estado: t(`hr.convite.estadoAdmissao.${estadoAdmissaoDe(estado)}`) })}
        </p>
        <PortalProgresso estado={estado} />
        <p className="text-center text-sm text-muted-foreground">{t("portal.vista.contactarRh")}</p>
      </CardContent>
    </Card>
  );
}
