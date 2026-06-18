import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import { useCompany } from "@/contexts/CompanyContext";
import DashboardCard from "./DashboardCard";
import DashboardGrid from "./DashboardGrid";
import DashboardFilters from "./DashboardFilters";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, Target, DollarSign, FileText, Calendar, Briefcase, UserCheck } from "lucide-react";

interface Stats {
  companies: number;
  employees: number;
  contacts: number;
  clients: number;
  deals: number;
  dealsValue: number;
  quotes: number;
  activities: number;
}

const CompanyAdminDashboard = () => {
  const { t, language } = useTranslation();
  const { companies: allCompanies } = useCompany();
  const companies = allCompanies.map(c => ({ id: c.id, name: c.name }));
  const [selectedCompany, setSelectedCompany] = useState<string>("all");
  const [stats, setStats] = useState<Stats>({
    companies: 0,
    employees: 0,
    contacts: 0,
    clients: 0,
    deals: 0,
    dealsValue: 0,
    quotes: 0,
    activities: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      if (companies.length === 0) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const companyIds = selectedCompany === "all"
          ? companies.map(c => c.id)
          : [selectedCompany];

        const client = supabase as any;

        const [
          membershipsResult,
          contactsResult,
          clientsResult,
          dealsResult,
          quotesResult,
          activitiesResult,
        ] = await Promise.all([
          client.from("anew_memberships").select("id").in("organization_id", companyIds).eq("status", "active"),
          client.from("anew_contacts").select("id").in("organization_id", companyIds),
          client.from("anew_clients").select("id").in("organization_id", companyIds).is("deleted_at", null),
          client.from("deals").select("id, value").in("organization_id", companyIds),
          client.from("quotes").select("id").in("organization_id", companyIds),
          client.from("activities").select("id").in("organization_id", companyIds),
        ]);

        const totalValue = dealsResult.data?.reduce((sum: number, deal: any) => sum + (Number(deal.value) || 0), 0) || 0;

        setStats({
          companies: companyIds.length,
          employees: membershipsResult.data?.length ?? 0,
          contacts: contactsResult.data?.length ?? 0,
          clients: clientsResult.data?.length ?? 0,
          deals: dealsResult.data?.length ?? 0,
          dealsValue: totalValue,
          quotes: quotesResult.data?.length ?? 0,
          activities: activitiesResult.data?.length ?? 0,
        });
      } catch (error) {
        console.error("Error loading company admin stats:", error);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, [companies.length, selectedCompany]);

  const formatCurrency = (value: number) => {
    const fixed = Math.abs(value).toFixed(2);
    const [int, dec] = fixed.split('.');
    return (value < 0 ? '-' : '') + '€' + int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec;
  };

  const cards = [
    {
      title: t('dashboard.cards.companies'),
      value: stats.companies,
      icon: Building2,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: t('dashboard.cards.employees'),
      value: stats.employees,
      icon: Briefcase,
      color: "text-info",
      bgColor: "bg-info/10",
    },
    {
      title: t('dashboard.cards.contacts'),
      value: stats.contacts,
      icon: Users,
      color: "text-accent",
      bgColor: "bg-accent/10",
    },
    {
      title: t('dashboard.cards.clients'),
      value: stats.clients,
      icon: UserCheck,
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
      title: t('dashboard.cards.quotes'),
      value: stats.quotes,
      icon: FileText,
      color: "text-info",
      bgColor: "bg-info/10",
    },
    {
      title: t('dashboard.cards.activities'),
      value: stats.activities,
      icon: Calendar,
      color: "text-accent",
      bgColor: "bg-accent/10",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2">{t('dashboard.title.companyAdmin')}</h1>
          <p className="text-muted-foreground">
            {t('dashboard.subtitle.companyAdmin')}
          </p>
        </div>
        <DashboardFilters
          label={t('dashboard.filter.company')}
          options={companies}
          value={selectedCompany}
          onChange={setSelectedCompany}
          allLabel={t('dashboard.filter.allCompanies')}
        />
      </div>

      <DashboardGrid columns={4}>
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
          <CardTitle>{t('dashboard.section.companyManagement')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            {t('dashboard.desc.companyAdmin', { count: companies.length })}
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default CompanyAdminDashboard;
