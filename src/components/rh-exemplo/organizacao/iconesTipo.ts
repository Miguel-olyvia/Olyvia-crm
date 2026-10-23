/** O ícone de cada tipo de nó da página «Organização». */
import { Building2, MapPin, Network, Store, type LucideIcon } from "lucide-react";
import type { TipoNo } from "@/components/rh-exemplo/organizacao/tipos";

export const ICONE_TIPO: Record<TipoNo, LucideIcon> = {
  grupo: Network,
  empresa: Building2,
  filial: Store,
  centro: MapPin,
};
