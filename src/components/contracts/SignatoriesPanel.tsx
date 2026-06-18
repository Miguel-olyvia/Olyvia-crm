import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { User, PenTool, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface Signatory {
  userId: string;
  userName: string;
  roleName: string;
  roleId: string;
}

interface SignatoriesPanelProps {
  companyId?: string;
  selectedSignatoryId?: string | null;
  onSelectSignatory?: (signatory: Signatory | null) => void;
  selectable?: boolean;
}

export function SignatoriesPanel({ companyId, selectedSignatoryId, onSelectSignatory, selectable = false }: SignatoriesPanelProps) {
  const { data: signatories = [], isLoading } = useQuery({
    queryKey: ["contract-signatories", companyId],
    queryFn: async (): Promise<Signatory[]> => {
      if (!companyId) return [];

      // 0. Resolve all ancestor org IDs so group/holding signatories are inherited by child companies
      const { data: hierarchy } = await supabase
        .from("anew_hierarchy")
        .select("parent_org_id, child_org_id");

      const orgIdSet = new Set<string>([companyId]);
      const queue = [companyId];

      while (queue.length > 0) {
        const currentOrgId = queue.shift();
        if (!currentOrgId) continue;

        for (const relation of hierarchy || []) {
          if (relation.child_org_id !== currentOrgId || !relation.parent_org_id || orgIdSet.has(relation.parent_org_id)) {
            continue;
          }

          orgIdSet.add(relation.parent_org_id);
          queue.push(relation.parent_org_id);
        }
      }

      const orgIds = Array.from(orgIdSet);

      // 1. Get roles with can_sign_contracts = true
      const { data: roles, error: rolesError } = await (supabase as any)
        .from("anew_roles")
        .select("id, name")
        .eq("can_sign_contracts", true);

      if (rolesError || !roles?.length) return [];

      const roleIds = roles.map((r: any) => r.id);
      const roleMap = new Map(roles.map((r: any) => [r.id, r.name]));

      // 2. Get active memberships with those roles across the full ancestor chain
      const { data: memberships, error: memberError } = await supabase
        .from("anew_memberships")
        .select("user_id, role_id")
        .in("role_id", roleIds)
        .in("organization_id", orgIds)
        .eq("status", "active");

      if (memberError || !memberships?.length) return [];

      const userIds = [...new Set(memberships.map((m: any) => m.user_id))];

      // 3. Get user names
      const { data: users } = await (supabase as any)
        .from("anew_users")
        .select("id, name")
        .in("id", userIds)
        .eq("status", "active");

      if (!users?.length) return [];

      const userMap = new Map(users.map((u: any) => [u.id, u.name]));

      // Build list (one entry per user-role combo, deduplicated by user)
      const seen = new Set<string>();
      const result: Signatory[] = [];
      for (const m of memberships) {
        if (seen.has(m.user_id)) continue;
        seen.add(m.user_id);
        const userName = userMap.get(m.user_id) as string | undefined;
        if (!userName) continue;
        result.push({
          userId: m.user_id,
          userName,
          roleName: (roleMap.get(m.role_id) as string) || "",
          roleId: m.role_id,
        });
      }
      return result.sort((a, b) => a.userName.localeCompare(b.userName));
    },
    enabled: !!companyId,
  });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground p-4">A carregar signatários...</div>;
  }

  if (signatories.length === 0) {
    return (
      <div className="border rounded-lg p-6 bg-muted/10 text-center space-y-2">
        <PenTool className="h-8 w-8 mx-auto text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">
          Nenhum signatário disponível.
        </p>
        <p className="text-xs text-muted-foreground">
          Para adicionar signatários, ative a opção "Pode assinar contratos pela empresa" na configuração de Roles.
        </p>
      </div>
    );
  }

  const handleClick = (s: Signatory) => {
    if (!selectable || !onSelectSignatory) return;
    if (selectedSignatoryId === s.userId) {
      onSelectSignatory(null);
    } else {
      onSelectSignatory(s);
    }
  };

  return (
    <div className="space-y-4">
      <div className="border rounded-lg p-4 bg-muted/10 space-y-3">
        <div className="flex items-center gap-2 mb-2">
          <PenTool className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">
            {selectable ? "Selecionar signatário pela empresa" : "Signatários autorizados"}
          </p>
          <Badge variant="secondary" className="text-xs">{signatories.length}</Badge>
        </div>
        {selectable && (
          <p className="text-xs text-muted-foreground mb-3">
            Selecione quem assina pela empresa nesta minuta. O nome e cargo aparecem automaticamente no bloco de assinatura do contrato gerado.
          </p>
        )}

        {!selectable && (
          <p className="text-xs text-muted-foreground mb-3">
            Utilizadores com roles que permitem assinar contratos pela empresa. Configure em Roles &gt; "Pode assinar contratos pela empresa".
          </p>
        )}
        <div className="space-y-2">
          {signatories.map((s) => {
            const isSelected = selectedSignatoryId === s.userId;
            return (
              <div
                key={s.userId}
                className={cn(
                  "flex items-center gap-3 p-2.5 rounded-md border bg-background transition-colors",
                  selectable && "cursor-pointer hover:bg-muted/50",
                  isSelected && "border-primary bg-primary/5 ring-1 ring-primary"
                )}
                onClick={() => handleClick(s)}
              >
                <div className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center",
                  isSelected ? "bg-primary text-primary-foreground" : "bg-primary/10"
                )}>
                  {isSelected ? <Check className="h-4 w-4" /> : <User className="h-4 w-4 text-primary" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {s.userName} <span className="text-muted-foreground font-normal">— {s.roleName}</span>
                  </p>
                </div>
                {isSelected && (
                  <Badge variant="default" className="text-xs">Selecionado</Badge>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {selectable && selectedSignatoryId && (
        <div className="border rounded-lg p-3 bg-primary/5 border-primary/20">
          <p className="text-xs text-muted-foreground">
            <strong>Confirmado:</strong> o signatário selecionado será automaticamente referenciado no bloco de assinatura ao gerar o contrato.
          </p>
        </div>
      )}

    </div>
  );
}
