import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/hooks/useTranslation";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { 
  LayoutDashboard,
  Building,
  Users,
  Megaphone,
  Target,
  UserCog,
  Settings2,
  ArrowRight,
  Sparkles,
  Rocket,
  Zap,
  Shield,
  Network,
  FileText,
  Calendar,
  Headphones,
  Code,
  Key,
  Brain,
  Trash2,
  Link2,
  CheckCircle2,
  ChevronDown,
  Building2,
  Globe,
  UsersRound,
  ShoppingCart,
  Wrench,
  Share2,
  Image,
  HelpCircle,
  Receipt,
  CircleDot
} from "lucide-react";
import olyviaLogo from "@/assets/olyvia-logo-final.png";
import olyviaIcon from "@/assets/olyvia-icon.png";

interface ModuleItem {
  icon: React.ReactNode;
  label: string;
  path: string;
}

interface WelcomeModule {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
  gradient: string;
  items: ModuleItem[];
}

const WelcomeGuide = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(true);
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const [animationPhase, setAnimationPhase] = useState(0);

  const modules: WelcomeModule[] = [
    {
      id: "dashboard",
      icon: <LayoutDashboard className="w-7 h-7" />,
      title: "Dashboard",
      description: "Métricas e KPIs em tempo real",
      color: "from-blue-500 to-indigo-600",
      gradient: "bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-950/50 dark:to-indigo-950/50",
      items: [
        { icon: <Zap className="w-4 h-4" />, label: "Visão Geral", path: "/dashboard" },
      ],
    },
    {
      id: "organization",
      icon: <Building className="w-7 h-7" />,
      title: "Organização",
      description: "Estrutura empresarial completa",
      color: "from-violet-500 to-purple-600",
      gradient: "bg-gradient-to-br from-violet-50 to-purple-100 dark:from-violet-950/50 dark:to-purple-950/50",
      items: [
        { icon: <Building className="w-4 h-4" />, label: "Organizações", path: "/organizations" },
        { icon: <UsersRound className="w-4 h-4" />, label: "Utilizadores", path: "/users" },
        { icon: <ShoppingCart className="w-4 h-4" />, label: "Produtos", path: "/products" },
        { icon: <Wrench className="w-4 h-4" />, label: "Serviços", path: "/services" },
      ],
    },
    {
      id: "customers",
      icon: <Users className="w-7 h-7" />,
      title: "Clientes",
      description: "Gestão de relacionamentos",
      color: "from-cyan-500 to-teal-600",
      gradient: "bg-gradient-to-br from-cyan-50 to-teal-100 dark:from-cyan-950/50 dark:to-teal-950/50",
      items: [
        { icon: <Users className="w-4 h-4" />, label: "Clientes", path: "/clients" },
        { icon: <Users className="w-4 h-4" />, label: "Contactos", path: "/contacts" },
        { icon: <Calendar className="w-4 h-4" />, label: "Calendário", path: "/calendar" },
        
        { icon: <Headphones className="w-4 h-4" />, label: "Call Center", path: "/call-center" },
      ],
    },
    {
      id: "marketing",
      icon: <Megaphone className="w-7 h-7" />,
      title: "Marketing",
      description: "Campanhas e captação de leads",
      color: "from-pink-500 to-rose-600",
      gradient: "bg-gradient-to-br from-pink-50 to-rose-100 dark:from-pink-950/50 dark:to-rose-950/50",
      items: [
        { icon: <FileText className="w-4 h-4" />, label: "Formulários", path: "/forms" },
        { icon: <Megaphone className="w-4 h-4" />, label: "Campanhas", path: "/campaigns" },
        { icon: <Share2 className="w-4 h-4" />, label: "Fontes", path: "/lead-sources" },
        { icon: <Image className="w-4 h-4" />, label: "Galeria", path: "/gallery" },
        { icon: <Code className="w-4 h-4" />, label: "API", path: "/marketing-api" },
      ],
    },
    {
      id: "sales",
      icon: <Target className="w-7 h-7" />,
      title: "Aquisição",
      description: "Pipeline de vendas",
      color: "from-emerald-500 to-green-600",
      gradient: "bg-gradient-to-br from-emerald-50 to-green-100 dark:from-emerald-950/50 dark:to-green-950/50",
      items: [
        { icon: <Target className="w-4 h-4" />, label: "Leads", path: "/leads" },
        { icon: <FileText className="w-4 h-4" />, label: "Pedidos Proposta", path: "/deals" },
        { icon: <FileText className="w-4 h-4" />, label: "Propostas", path: "/proposals" },
        { icon: <Receipt className="w-4 h-4" />, label: "Orçamentos", path: "/quotes" },
        { icon: <FileText className="w-4 h-4" />, label: "Contratos", path: "/client-contracts" },
      ],
    },
    {
      id: "admin",
      icon: <UserCog className="w-7 h-7" />,
      title: "Administração",
      description: "Gestão de acessos e permissões",
      color: "from-amber-500 to-orange-600",
      gradient: "bg-gradient-to-br from-amber-50 to-orange-100 dark:from-amber-950/50 dark:to-orange-950/50",
      items: [
        { icon: <Users className="w-4 h-4" />, label: "Utilizadores", path: "/users" },
        { icon: <Shield className="w-4 h-4" />, label: "Funções", path: "/roles" },
        { icon: <Trash2 className="w-4 h-4" />, label: "Reciclagem", path: "/trash" },
        { icon: <Brain className="w-4 h-4" />, label: "IA Learning", path: "/ai-learning" },
        { icon: <Brain className="w-4 h-4" />, label: "IA Learning", path: "/ai-learning" },
      ],
    },
    {
      id: "tech",
      icon: <Settings2 className="w-7 h-7" />,
      title: "Tecnologia",
      description: "Configurações avançadas",
      color: "from-slate-500 to-gray-600",
      gradient: "bg-gradient-to-br from-slate-50 to-gray-100 dark:from-slate-950/50 dark:to-gray-950/50",
      items: [
        { icon: <Settings2 className="w-4 h-4" />, label: "Configurações", path: "/settings" },
        { icon: <Settings2 className="w-4 h-4" />, label: "Técnicas", path: "/technical-settings" },
        { icon: <Key className="w-4 h-4" />, label: "API Keys", path: "/api-keys" },
        { icon: <Globe className="w-4 h-4" />, label: "Traduções", path: "/docs/translations" },
        { icon: <HelpCircle className="w-4 h-4" />, label: "Documentação", path: "/docs/guides" },
      ],
    },
  ];

  useEffect(() => {
    checkWelcomeStatus();
  }, []);

  useEffect(() => {
    // Stagger animation phases
    const timers = [
      setTimeout(() => setAnimationPhase(1), 300),
      setTimeout(() => setAnimationPhase(2), 600),
      setTimeout(() => setAnimationPhase(3), 900),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const checkWelcomeStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data: profile } = await supabase
        .from("anew_users")
        .select("has_completed_welcome")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (profile?.has_completed_welcome) {
        navigate("/dashboard");
        return;
      }
    } catch (error) {
      console.error("Error checking welcome status:", error);
    } finally {
      setCheckingAccess(false);
    }
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("anew_users")
        .update({ has_completed_welcome: true } as any)
        .eq("auth_user_id", user.id);

      if (error) throw error;

      toast({
        title: "🎉 Bem-vindo ao Olyvia!",
        description: "Tudo pronto para começar.",
      });

      navigate("/dashboard");
    } catch (error: any) {
      console.error("Error completing welcome:", error);
      toast({
        title: t("common.error"),
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (checkingAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center gap-6"
        >
          <motion.img 
            src={olyviaIcon} 
            alt="Olyvia" 
            className="h-20 w-20"
            animate={{ 
              rotate: [0, 10, -10, 0],
              scale: [1, 1.05, 1]
            }}
            transition={{ 
              duration: 2, 
              repeat: Infinity,
              ease: "easeInOut"
            }}
          />
          <div className="flex items-center gap-2">
            <motion.div
              className="w-2 h-2 rounded-full bg-primary"
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ duration: 0.6, repeat: Infinity, delay: 0 }}
            />
            <motion.div
              className="w-2 h-2 rounded-full bg-primary"
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ duration: 0.6, repeat: Infinity, delay: 0.2 }}
            />
            <motion.div
              className="w-2 h-2 rounded-full bg-primary"
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ duration: 0.6, repeat: Infinity, delay: 0.4 }}
            />
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 overflow-hidden">
      {/* Animated background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl"
          animate={{ 
            scale: [1, 1.2, 1],
            x: [0, 30, 0],
            y: [0, -20, 0]
          }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -bottom-40 -left-40 w-96 h-96 bg-violet-500/10 rounded-full blur-3xl"
          animate={{ 
            scale: [1, 1.3, 1],
            x: [0, -20, 0],
            y: [0, 30, 0]
          }}
          transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-conic from-primary/5 via-transparent to-primary/5 rounded-full blur-2xl"
          animate={{ rotate: 360 }}
          transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
        />
      </div>

      {/* Header */}
      <header className="relative z-10 p-6 flex items-center justify-between">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-3"
        >
          <img src={olyviaIcon} alt="Olyvia" className="h-10 w-10" />
          <span className="text-xl font-bold bg-gradient-to-r from-primary to-violet-600 bg-clip-text text-transparent">
            Olyvia
          </span>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
        >
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleComplete} 
            disabled={loading}
            className="text-muted-foreground hover:text-foreground"
          >
            Saltar introdução
          </Button>
        </motion.div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 px-4 sm:px-6 lg:px-8 pb-8">
        <div className="max-w-6xl mx-auto">
          {/* Hero Section */}
          <motion.div 
            className="text-center mb-10"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: animationPhase >= 1 ? 1 : 0, y: animationPhase >= 1 ? 0 : 30 }}
            transition={{ duration: 0.6 }}
          >
            <motion.div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
            >
              <Sparkles className="w-4 h-4" />
              Bem-vindo à sua nova plataforma
            </motion.div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold mb-4">
              <span className="bg-gradient-to-r from-foreground via-foreground to-muted-foreground bg-clip-text text-transparent">
                Conheça o{" "}
              </span>
              <span className="bg-gradient-to-r from-primary via-violet-500 to-primary bg-clip-text text-transparent">
                Olyvia
              </span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Explore os módulos disponíveis. Clique em cada cartão para descobrir as funcionalidades.
            </p>
          </motion.div>

          {/* Modules Grid */}
          <motion.div 
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: animationPhase >= 2 ? 1 : 0 }}
            transition={{ duration: 0.6 }}
          >
            {modules.map((module, index) => (
              <motion.div
                key={module.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.08 + 0.5 }}
              >
                <motion.div
                  className={`relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 ${module.gradient} border border-transparent hover:border-primary/20`}
                  onClick={() => setActiveModule(activeModule === module.id ? null : module.id)}
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  layout
                >
                  {/* Gradient overlay on hover */}
                  <div className={`absolute inset-0 bg-gradient-to-br ${module.color} opacity-0 hover:opacity-5 transition-opacity duration-300`} />
                  
                  {/* Card Content */}
                  <div className="relative p-5">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className={`p-3 rounded-xl bg-gradient-to-br ${module.color} text-white shadow-lg`}>
                        {module.icon}
                      </div>
                      <motion.div
                        animate={{ rotate: activeModule === module.id ? 180 : 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <ChevronDown className="w-5 h-5 text-muted-foreground" />
                      </motion.div>
                    </div>

                    <h3 className="text-lg font-semibold text-foreground mb-1">
                      {module.title}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {module.description}
                    </p>

                    {/* Expanded Items */}
                    <AnimatePresence>
                      {activeModule === module.id && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.3 }}
                          className="mt-4 pt-4 border-t border-border/50"
                        >
                          <div className="grid grid-cols-2 gap-2">
                            {module.items.map((item, itemIndex) => (
                              <motion.button
                                key={item.path}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: itemIndex * 0.05 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(item.path);
                                }}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-background/60 hover:bg-background text-sm text-left transition-colors hover:shadow-sm"
                              >
                                <span className="text-muted-foreground">{item.icon}</span>
                                <span className="truncate">{item.label}</span>
                              </motion.button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              </motion.div>
            ))}
          </motion.div>

          {/* CTA Section */}
          <motion.div 
            className="mt-12 text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: animationPhase >= 3 ? 1 : 0, y: animationPhase >= 3 ? 0 : 20 }}
            transition={{ duration: 0.6 }}
          >
            <motion.div
              className="inline-flex flex-col sm:flex-row items-center gap-4"
            >
              <Button
                size="lg"
                onClick={handleComplete}
                disabled={loading}
                className="group bg-gradient-to-r from-primary to-violet-600 hover:from-primary/90 hover:to-violet-600/90 text-white shadow-lg shadow-primary/25 px-8"
              >
                <Rocket className="w-5 h-5 mr-2 group-hover:animate-bounce" />
                {loading ? "A preparar..." : "Começar a usar"}
                <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
              <p className="text-sm text-muted-foreground">
                Pode explorar os módulos a qualquer momento
              </p>
            </motion.div>
          </motion.div>
        </div>
      </main>

      {/* Footer decoration */}
      <div className="fixed bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent pointer-events-none" />
    </div>
  );
};

export default WelcomeGuide;
