// 30/10/2026 (20270101340000): o /negocios abre a quem tem pessoas.view pelo perfil da Olyvia OU um papel no Negócio pelo RH (o Financeiro,
// Compras e armazém, o Gestor de obra, o Técnico…). Sem nenhum dos dois, fica o "Sem acesso" de sempre (ProtectedRoute).
import type { ReactNode } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { usePermissions } from "@/hooks/usePermissions";
import { useTemPapelNegocio } from "@/hooks/pessoas/useTemPapelNegocio";

export function RotaNegocios({ children }: { children: ReactNode }) {
  const { hasPermission, loading } = usePermissions();
  const comPermissao = !loading && hasPermission("pessoas.view");
  const papel = useTemPapelNegocio({ habilitado: !loading && !comPermissao });
  if (!loading && !comPermissao && !papel.loading && papel.tem) return <>{children}</>;
  if (!comPermissao && (loading || papel.loading)) return <div className="p-6 text-muted-foreground">A carregar…</div>;
  return <ProtectedRoute permission="pessoas.view">{children}</ProtectedRoute>;
}
