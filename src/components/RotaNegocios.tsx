// 30/10/2026 (20270101340000): o /negocios abre a quem tem pessoas.view pelo perfil da Olyvia OU um papel no Negócio pelo RH (o Financeiro,
// Compras e armazém, o Gestor de obra, o Técnico…). Sem nenhum dos dois, fica o "Sem acesso" de sempre (ProtectedRoute).
import type { ReactNode } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { usePermissions } from "@/hooks/usePermissions";
import { useTemPapelNegocio } from "@/hooks/pessoas/useTemPapelNegocio";

/** As permissões do perfil com que se trabalha nas obras (as Operações e a app do técnico). */
const PERMS_OBRA = ["negocios.obra.executar", "negocios.obra.planear", "negocios.obra.tecnico"] as const;

export function RotaNegocios({ children }: { children: ReactNode }) {
  const { hasPermission, hasAnyPermission, loading } = usePermissions();
  // 10/11: também quem trabalha nas obras pelo perfil (executar, planear ou ser técnico), sem pessoas.view: entra no Hoje e nas Operações
  const comPermissao = !loading && (hasPermission("pessoas.view") || hasAnyPermission([...PERMS_OBRA]));
  const papel = useTemPapelNegocio({ habilitado: !loading && !comPermissao });
  if (!loading && !comPermissao && !papel.loading && papel.tem) return <>{children}</>;
  if (!comPermissao && (loading || papel.loading)) return <div className="p-6 text-muted-foreground">A carregar…</div>;
  return <ProtectedRoute permissions={["pessoas.view", ...PERMS_OBRA]}>{children}</ProtectedRoute>;
}
