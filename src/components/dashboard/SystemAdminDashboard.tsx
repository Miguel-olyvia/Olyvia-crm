import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import DashboardCard from "./DashboardCard";
import DashboardGrid from "./DashboardGrid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Target, DollarSign, Briefcase, Building } from "lucide-react";

interface Stats {
  organizations: number;
  users: number;
  memberships: number;
  deals: number;
  dealsValue: number;
}

const SystemAdminDashboard = () => {
  const { t, language } = useTranslation();
  const [stats, setStats] = useState<Stats>({
    organizations: 0,
    users: 0,
    memberships: 0,
    deals: 0,
    dealsValue: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const [
          { count: orgsCount },
          { count: usersCount },
          { count: membershipsCount },
          { count: dealsCount },
          { data: dealsData },
        ] = await Promise.all([
          supabase.from("anew_organizations").select("*", { count: "exact", head: true }),
          supabase.from("anew_users").select("*", { count: "exact", head: true }),
          supabase.from("anew_memberships").select("*", { count: "exact", head: true }).eq("status", "active"),
          supabase.from("deals").select("*", { count: "exact", head: true }),
          supabase.from("deals").select("value"),
        ]);

        const totalValue = dealsData?.reduce((sum, deal) => sum + (Number(deal.value) || 0), 0) || 0;

        setStats({
          organizations: orgsCount || 0,
          users: usersCount || 0,
          memberships: membershipsCount || 0,
          deals: dealsCount || 0,
          dealsValue: totalValue,
        });
      } catch (error) {
        console.error("Error loading system admin stats:", error);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, []);

  const formatCurrency = (value: number) => {
    const fixed = Math.abs(value).toFixed(2);
    const [int, dec] = fixed.split('.');
    return (value < 0 ? '-' : '') + '€' + int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec;
  };

  const cards = [
    {
      title: t('dashboard.cards.organizations'),
      value: stats.organizations,
      icon: Building,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: t('dashboard.cards.users'),
      value: stats.users,
      icon: Users,
      color: "text-accent",
      bgColor: "bg-accent/10",
    },
    {
      title: t('dashboard.cards.employees'),
      value: stats.memberships,
      icon: Briefcase,
      color: "text-warning",
      bgColor: "bg-warning/10",
    },
    {
      title: t('dashboard.cards.activeDeals'),
      value: stats.deals,
      icon: Target,
      color: "text-success",
      bgColor: "bg-success/10",
    },
    {
      title: t('dashboard.cards.totalRevenue'),
      value: formatCurrency(stats.dealsValue),
      icon: DollarSign,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">{t('dashboard.title.systemAdmin')}</h1>
        <p className="text-muted-foreground">
          {t('dashboard.subtitle.systemAdmin')}
        </p>
      </div>

      <DashboardGrid>
        {cards.map((card) => (
          <DashboardCard
            key={card.title}
            title={card.title}
            value={card.value}
            icon={card.icon}
            color={card.color}
            bgColor={card.bgColor}
            loading={loading}
          />
        ))}
      </DashboardGrid>

      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.section.systemAdmin')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            {t('dashboard.desc.systemAdmin')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default SystemAdminDashboard;
