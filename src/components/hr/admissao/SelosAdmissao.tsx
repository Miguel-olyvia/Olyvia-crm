/**
 * Os DOIS selos de uma admissao, lado a lado: o estado da ADMISSAO (os 11 estados, ou `terminado` mascarado) e o do PORTAL
 * (ativo, expirado, revogado, encerrado). Sao coisas diferentes: um portal expirado nao muda o estado da admissao.
 *
 * E o mesmo bloco que o cartao da ficha (`PessoaConviteAdmissaoEstado`, E2) e o pipeline usam: o texto vive uma vez so, e
 * cada estado leva sempre texto (nunca so cor).
 */
import { Badge } from "@/components/ui/badge";
import { varianteDaAdmissao, varianteDoPortal } from "@/components/hr/admissao/aspectoSelos";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import type { EstadoAdmissao, EstadoPortalConvite } from "@/types/hr";

interface SelosAdmissaoProps {
  estado: EstadoAdmissao;
  estadoPortal: EstadoPortalConvite;
  className?: string;
}

export function SelosAdmissao({ estado, estadoPortal, className }: SelosAdmissaoProps) {
  const { t } = useTranslation();
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-6 gap-y-2", className)}>
      <li className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t("hr.convite.selo.admissao")}</span>
        <Badge variant={varianteDaAdmissao(estado)}>{t(`hr.convite.estadoAdmissao.${estado}`)}</Badge>
      </li>
      <li className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">{t("hr.convite.selo.portal")}</span>
        <Badge variant={varianteDoPortal(estadoPortal)}>{t(`hr.convite.estadoPortal.${estadoPortal}`)}</Badge>
      </li>
    </ul>
  );
}
