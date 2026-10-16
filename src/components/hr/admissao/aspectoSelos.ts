/**
 * O aspeto dos selos de uma admissao: a variante do selo da admissao e do portal, e a frase da validade do link. Puro (sem
 * JSX): vive aqui para `SelosAdmissao.tsx` exportar so o componente.
 */
import { formatarDataHora } from "@/lib/hr/conviteAdmissaoEcra";
import type { useTranslation } from "@/hooks/useTranslation";
import type { EstadoAdmissao, EstadoPortalConvite } from "@/types/hr";

export type VarianteSelo = "default" | "secondary" | "outline" | "destructive";
export type Traduzir = ReturnType<typeof useTranslation>["t"];

export function varianteDaAdmissao(estado: EstadoAdmissao): VarianteSelo {
  if (estado === "concluida") return "default";
  if (estado === "rejeitada" || estado === "cancelada" || estado === "terminado") return "secondary";
  return "outline";
}

export function varianteDoPortal(portal: EstadoPortalConvite): VarianteSelo {
  if (portal === "ativo") return "default";
  if (portal === "expirado") return "destructive";
  return "secondary";
}

/** A frase da validade do link, ou `null` quando nao ha nada a dizer. */
export function fraseDoPortal(t: Traduzir, portal: EstadoPortalConvite, validUntil: string | null): string | null {
  switch (portal) {
    case "ativo":
      return validUntil ? t("hr.convite.validade.ativo", { data: formatarDataHora(validUntil) }) : null;
    case "expirado":
      return validUntil ? t("hr.convite.validade.expirado", { data: formatarDataHora(validUntil) }) : null;
    case "revogado":
      return t("hr.convite.validade.revogado");
    case "encerrado":
      return t("hr.convite.validade.encerrado");
    default:
      return null;
  }
}
