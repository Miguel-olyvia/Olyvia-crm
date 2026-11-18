import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SpOrderStatus, SpPublicationStatus } from "@/lib/supplierPortal/spRpc";
import { usePortalT } from "@/portal-i18n";
import { SP_TONE_CLASS, spOrderStatusBadge, spPublicationBadge } from "@/components/supplier-portal/spOrderFormat";

/** Etiquetas de estado de uma encomenda no portal (resposta + estado na empresa). */
export function SpOrderBadges({
  orderStatus,
  publicationStatus,
  className,
}: {
  orderStatus: SpOrderStatus;
  publicationStatus: SpPublicationStatus;
  className?: string;
}) {
  const { t } = usePortalT();
  const pub = spPublicationBadge(publicationStatus);
  const po = spOrderStatusBadge(orderStatus);
  return (
    <span className={cn("inline-flex flex-wrap gap-1", className)}>
      <Badge variant="outline" className={cn("font-medium", SP_TONE_CLASS[pub.tone])}>
        {t(pub.labelKey)}
      </Badge>
      {po && (
        <Badge variant="outline" className={cn("font-medium", SP_TONE_CLASS[po.tone])}>
          {t(po.labelKey)}
        </Badge>
      )}
    </span>
  );
}
