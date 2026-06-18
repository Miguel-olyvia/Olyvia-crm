import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building, ArrowRight, LayoutDashboard, Users, Target } from "lucide-react";
import olyviaIcon from "@/assets/olyvia-icon.png";

const WelcomeDashboard = () => {
  const navigate = useNavigate();
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const loadName = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("anew_users")
        .select("name")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (data?.name) setUserName(data.name.split(" ")[0]);
    };
    loadName();
  }, []);

  return (
    <div className="space-y-8 max-w-2xl mx-auto py-12">
      <div className="text-center space-y-4">
        <img src={olyviaIcon} alt="Olyvia" className="h-16 w-16 mx-auto" />
        <h1 className="text-3xl font-bold">
          {userName ? `Olá, ${userName}! 👋` : "Bem-vindo à Olyvia! 👋"}
        </h1>
        <p className="text-muted-foreground text-lg">
          A sua conta está criada. Comece por registar a sua empresa para desbloquear todas as funcionalidades.
        </p>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-6 flex flex-col items-center gap-4 text-center">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <Building className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Registar a Minha Empresa</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Crie a sua organização para começar a gerir clientes, leads, equipa e muito mais.
            </p>
          </div>
          <Button onClick={() => navigate("/organizations")} size="lg" className="gap-2">
            Criar Organização
            <ArrowRight className="w-4 h-4" />
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="text-center p-4 opacity-60">
          <LayoutDashboard className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm font-medium">Dashboard</p>
          <p className="text-xs text-muted-foreground">Métricas e resumos</p>
        </Card>
        <Card className="text-center p-4 opacity-60">
          <Users className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm font-medium">Clientes</p>
          <p className="text-xs text-muted-foreground">Gestão de clientes</p>
        </Card>
        <Card className="text-center p-4 opacity-60">
          <Target className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm font-medium">Leads</p>
          <p className="text-xs text-muted-foreground">Pipeline de vendas</p>
        </Card>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Pode explorar a aplicação livremente. Os dados aparecerão após criar a sua organização.
      </p>
    </div>
  );
};

export default WelcomeDashboard;
