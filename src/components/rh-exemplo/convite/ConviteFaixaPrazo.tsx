// A faixa do login temporário na página pública: o estado, o prazo que resta («O teu acesso temporário termina a dd/mm às
// hh:mm») e, se a pessoa já guardou rascunho, a hora a que ficou guardado. É a mesma moldura em todos os estados do link.
import { Clock3 } from "lucide-react";
import { EstadoAdmissaoChip } from "@/components/rh-exemplo/admissao/aspeto";
import { dataEHora, textoPrazo } from "@/components/rh-exemplo/admissao/auxiliares";
import { estadoVisivel, prazoDoLogin, type Admissao } from "@/components/rh-exemplo/lib/admissaoFluxo";
import { formatarDataHora } from "@/components/rh-exemplo/lib/conviteAdmissaoEcra";
import { useTranslation } from "@/hooks/useTranslation";

export function ConviteFaixaPrazo({ admissao, comRascunho = false }: { admissao: Admissao; comRascunho?: boolean }) {
  const { t } = useTranslation();
  const agora = new Date();
  const visivel = estadoVisivel(admissao, agora);
  const termina = dataEHora(admissao.login.expiraEm);
  return (
    <div className="space-y-1 rounded-lg border bg-muted/30 px-4 py-3 text-sm" data-testid="convite-faixa-prazo">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-medium">
          <Clock3 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t(visivel === "expirado" ? "rhAdm.pub.terminou" : "rhAdm.pub.termina", { data: termina.data, hora: termina.hora })}
        </p>
        <EstadoAdmissaoChip estado={visivel} />
      </div>
      <p className="text-xs text-muted-foreground">{textoPrazo(t, prazoDoLogin(admissao, agora))}</p>
      {comRascunho && (
        <p role="status" className="text-xs text-muted-foreground">
          {admissao.rascunhoEm
            ? t("rhAdm.pub.rascunhoGuardado", { hora: formatarDataHora(admissao.rascunhoEm).split(" ")[1] ?? "" })
            : t("rhAdm.pub.rascunhoInfo")}
        </p>
      )}
    </div>
  );
}
