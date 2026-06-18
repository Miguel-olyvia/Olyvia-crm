import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useTranslation } from '@/hooks/useTranslation';

interface Member {
  id: string;
  name: string;
  email: string;
  position: string | null;
  roleName: string;
}

interface PeopleOrgChartDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string;
  entityName: string;
}

export function PeopleOrgChartDialog({
  open,
  onOpenChange,
  entityId,
  entityName,
}: PeopleOrgChartDialogProps) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
    if (open) {
      loadMembers();
    }
  }, [open, entityId]);

  const loadMembers = async () => {
    setLoading(true);
    try {
      // Get memberships for this org
      const { data: memberships } = await supabase
        .from("anew_memberships")
        .select("user_id, role_id")
        .eq("organization_id", entityId)
        .eq("status", "active");

      if (!memberships?.length) {
        setMembers([]);
        setLoading(false);
        return;
      }

      // Get user details
      const userIds = memberships.map(m => m.user_id);
      const roleIds = [...new Set(memberships.map(m => m.role_id))];

      const [usersRes, rolesRes] = await Promise.all([
        (supabase as any).from("anew_users").select("id, name, email, position").in("id", userIds),
        supabase.from("anew_roles").select("id, name").in("id", roleIds),
      ]);

      const roleMap = new Map((rolesRes.data || []).map((r: any) => [r.id, r.name]));
      const userMap = new Map((usersRes.data || []).map((u: any) => [u.id, u]));

      const result: Member[] = memberships.map(m => {
        const user = userMap.get(m.user_id) as any;
        return {
          id: m.user_id,
          name: user?.name || 'Unknown',
          email: user?.email || '',
          position: user?.position || null,
          roleName: roleMap.get(m.role_id) || 'Member',
        };
      }).sort((a, b) => a.name.localeCompare(b.name));

      setMembers(result);
    } catch (error) {
      console.error('Error loading members:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {t('orgChart.peopleIn')} {entityName}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : members.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <User className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="font-medium text-lg mb-2">{t('orgChart.noPeopleYet')}</h3>
              <p className="text-muted-foreground text-sm">{t('orgChart.noPeopleDescription')}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {members.map(member => {
                const initials = member.name
                  .split(' ')
                  .map(w => w.charAt(0))
                  .slice(0, 2)
                  .join('')
                  .toUpperCase();

                return (
                  <Card key={member.id} className="transition-all hover:shadow-md">
                    <CardContent className="p-3 flex items-center gap-3">
                      <Avatar className="h-10 w-10 flex-shrink-0">
                        <AvatarFallback className="bg-primary/10 text-primary text-sm">
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{member.name}</div>
                        <div className="text-sm text-muted-foreground truncate">
                          {member.position || member.email}
                        </div>
                      </div>
                      <Badge variant="outline" className="flex-shrink-0 text-xs">
                        {member.roleName}
                      </Badge>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {!loading && members.length > 0 && (
          <div className="pt-4 border-t text-sm text-muted-foreground">
            {t('orgChart.totalPeople')}: {members.length}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
