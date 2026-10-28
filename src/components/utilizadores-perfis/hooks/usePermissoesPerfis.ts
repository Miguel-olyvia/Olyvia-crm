// Wrapper fino sobre as permissões reais (usePermissions). É a única ligação da página aos contextos reais: o resto da
// pasta recebe o resultado por props e não importa a base nem os contextos (ver semBase.test.ts).
import { useMemo } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { separadoresPermitidos } from "../separadores";
import type { Separador } from "../tipos";

export interface PermissoesPerfis {
  /** As permissões ainda estão a carregar: não decidir nada (nem recusar) antes disto acabar. */
  carregando: boolean;
  /** Separadores que a pessoa pode ver, pela ordem da página. */
  permitidos: Separador[];
  tem: (permissao: string) => boolean;
}

export function usePermissoesPerfis(): PermissoesPerfis {
  const { loading, hasPermission } = usePermissions();
  const permitidos = useMemo(() => separadoresPermitidos(hasPermission), [hasPermission]);
  return { carregando: loading, permitidos, tem: hasPermission };
}
