import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import DashboardCard from "./DashboardCard";
import DashboardGrid from "./DashboardGrid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Target, DollarSign, Briefcase, Building, Contact, UserPlus, FileText, Receipt, FileSignature } from "lucide-react";

interface Stats {
  organizations: number;
  users: number;
  memberships: number;
  deals: number;
  dealsValue: number;
  leads: number;
  contacts: number;
  clients: number;
  proposals: number;
  quotes: number;
  contracts: number;
}

const SystemAdminDashboard = () => {
  const { t } = useTranslation();
  const [stats, setStats] = useState<Stats>({
    organizations: 0,
    users: 0,
    memberships: 0,
    deals: 0,
    dealsValue: 0,
    leads: 0,
    contacts: 0,
    clients: 0,
    proposals: 0,
    quotes: 0,
    contracts: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const { data, error } = await (supabase as any).rpc(
          "get_system_admin_dashboard_stats",
        );
        if (error) throw error;
        const result = data && typeof data === "object" ? data : {};

        setStats({
          organizations: Number(result.organizations) || 0,
          users: Number(result.users) || 0,
          memberships: Number(result.memberships) || 0,
          deals: Number(result.deals) || 0,
          dealsValue: Number(result.deals_value) || 0,
          leads: Number(result.leads) || 0,
          contacts: Number(result.contacts) || 0,
          clients: Number(result.clients) || 0,
          proposals: Number(result.proposals) || 0,
          quotes: Number(result.quotes) || 0,
          contracts: Number(result.contracts) || 0,
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
    {
      title: t('dashboard.cards.leads'),
      value: stats.leads,
      icon: UserPlus,
      color: "text-accent",
      bgColor: "bg-accent/10",
    },
    {
      title: t('dashboard.cards.contacts'),
      value: stats.contacts,
      icon: Contact,
      color: "text-warning",
      bgColor: "bg-warning/10",
    },
    {
      title: t('dashboard.cards.clients'),
      value: stats.clients,
      icon: Users,
      color: "text-success",
      bgColor: "bg-success/10",
    },
    {
      title: t('dashboard.cards.proposals'),
      value: stats.proposals,
      icon: FileText,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: t('dashboard.cards.quotes'),
      value: stats.quotes,
      icon: Receipt,
      color: "text-accent",
      bgColor: "bg-accent/10",
    },
    {
      title: t('dashboard.cards.contracts'),
      value: stats.contracts,
      icon: FileSignature,
      color: "text-warning",
      bgColor: "bg-warning/10",
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
