// Os ecrãs da página pública que não são um formulário: ficha submetida (a aguardar o RH), contrato assinado, login expirado,
// link revogado (substituído por outro, ou ficha rejeitada) e acesso já ativo. Todos na mesma moldura, com o prazo quando serve.
import { Card, CardDescription, CardHeader } from "@/components/ui/card";
import { CheckCircle2, Info } from "lucide-react";
import type { Admissao, VistaPublica } from "@/components/rh-exemplo/lib/admissaoFluxo";
import { useTranslation } from "@/hooks/useTranslation";
import { ConviteFaixaPrazo } from "./ConviteFaixaPrazo";

/** Com prazo a mostrar: nos outros o login já não existe ou já não conta. */
const COM_PRAZO: readonly VistaPublica[] = ["submetida", "assinado", "expirada"];
const CONCLUIDAS: readonly VistaPublica[] = ["submetida", "assinado"];

interface ConviteEstadoCartaoProps {
  vista: Exclude<VistaPublica, "invalida" | "preencher" | "contrato">;
  admissao: Admissao | null;
  nome: string | null;
}

export function ConviteEstadoCartao({ vista, admissao, nome }: ConviteEstadoCartaoProps) {
  const { t } = useTranslation();
  const Icone = CONCLUIDAS.includes(vista) ? CheckCircle2 : Info;
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md space-y-3">
        {admissao && COM_PRAZO.includes(vista) && <ConviteFaixaPrazo admissao={admissao} />}
        <Card>
          <CardHeader className="items-center text-center">
            <Icone className="h-10 w-10 text-primary" aria-hidden="true" />
            <h1 className="text-2xl font-semibold leading-none tracking-tight">{t(`rhAdm.pub.${vista}.titulo`)}</h1>
            {nome && vista !== "revogada" && <p className="text-sm text-muted-foreground">{t("hr.convite.saudacao", { nome })}</p>}
            <CardDescription role="status">{t(`rhAdm.pub.${vista}.texto`)}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
