import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/hooks/useTranslation";
import DashboardCard from "./DashboardCard";
import DashboardGrid from "./DashboardGrid";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckSquare, Target, FileText } from "lucide-react";

interface Stats {
  pendingTasks: number;
  assignedDeals: number;
  createdQuotes: number;
}

const WorkerDashboard = () => {
  const { t } = useTranslation();
  const [stats, setStats] = useState<Stats>({
    pendingTasks: 0,
    assignedDeals: 0,
    createdQuotes: 0,
  });
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const loadStats = async () => {
      const authResult = await supabase.auth.getUser();
      const user = authResult.data.user;
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const userResult = await supabase
          .from("anew_users")
          .select("id, name")
          .eq("auth_user_id", user.id)
          .maybeSingle();

        const businessUserId = userResult.data?.id;
        if (userResult.data) {
          setUserName(userResult.data.name || "");
        }

        const client = supabase as any;
        const filterId = businessUserId || user.id;

        const tasksResult = await client.from("activities").select("id").eq("assigned_to", filterId);
        const dealsResult = await client.from("deals").select("id").eq("assigned_to", filterId);
        const quotesResult = await client.from("quotes").select("id").eq("created_by", filterId);

        setStats({
          pendingTasks: tasksResult.data?.length ?? 0,
          assignedDeals: dealsResult.data?.length ?? 0,
          createdQuotes: quotesResult.data?.length ?? 0,
        });
      } catch (error) {
        console.error("Error loading worker stats:", error);
      } finally {
        setLoading(false);
      }
    };
    loadStats();
  }, []);

  const firstName = userName.split(" ")[0];

  const cards = [
    { title: t('dashboard.cards.pendingTasks'), value: stats.pendingTasks, icon: CheckSquare, color: "text-warning", bgColor: "bg-warning/10" },
    { title: t('dashboard.cards.myDeals'), value: stats.assignedDeals, icon: Target, color: "text-primary", bgColor: "bg-primary/10" },
    { title: t('dashboard.cards.createdQuotes'), value: stats.createdQuotes, icon: FileText, color: "text-info", bgColor: "bg-info/10" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">
          {firstName ? t('dashboard.greeting', { name: firstName }) : t('dashboard.title')}
        </h1>
        <p className="text-muted-foreground">{t('dashboard.yourTasksAndActivities')}</p>
      </div>
      <DashboardGrid>
        {cards.map((card) => (
          <DashboardCard key={card.title} title={card.title} value={card.value} icon={card.icon} color={card.color} bgColor={card.bgColor} loading={loading} />
        ))}
      </DashboardGrid>
      <Card>
        <CardHeader><CardTitle>{t('dashboard.section.daySummary')}</CardTitle></CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            {t('dashboard.desc.daySummary', { tasks: stats.pendingTasks, events: 0 })}
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default WorkerDashboard;
