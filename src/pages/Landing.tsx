import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useNavigate } from "react-router-dom";
import { Check, ArrowRight, Zap, Users, TrendingUp, Bot, Phone, Mail, BarChart3, DollarSign, Sparkles, Rocket, Building2, BadgeDollarSign, Award, CloudMoon, FileText, Calendar, Wrench, ClipboardList, Shield, HandshakeIcon, Package, Truck, ChevronDown } from "lucide-react";
import { Header } from "@/components/Header";
import sleepingSheep from "@/assets/sleeping-sheep.jpg";
import olyviaLogo from "@/assets/olyvia-logo.png";
import olyviaIcon from "@/assets/olyvia-icon.png";
import { useLanguage } from "@/contexts/LanguageContext";
import { translations } from "@/translations";

const Landing = () => {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const t = translations[language];
  const [expandedProduct, setExpandedProduct] = useState<string | null>(null);

  const features = [
    { icon: Users, text: "Unlimited users – no extra cost per seat" },
    { icon: TrendingUp, text: "Transparent AI-usage pricing" },
    { icon: BarChart3, text: "Predictable monthly plans" },
    { icon: Zap, text: "Scalable automation for all team sizes" },
    { icon: Bot, text: "100% free CRM core forever" },
  ];

  const plans = [
    {
      name: "Starter",
      price: "€59",
      description: "For small teams testing AI automation",
      ideal: "Ideal for small founders or early sales teams testing AI workflows.",
      icon: Sparkles,
      features: [
        "Up to 5,000 contacts",
        "Unlimited users",
        "200 AI call minutes/month (~50–80 calls)",
        "1,000 AI emails/month",
        "1,000 AI conversation analyses/month",
        "Smart contact management + 1 sales pipeline",
        "Email support",
      ],
      color: "from-green-500/10 to-green-600/10",
      border: "border-green-500/20",
    },
    {
      name: "Pro",
      price: "€119",
      description: "For growth-stage teams scaling outreach",
      ideal: "Your best balance of automation power and predictable cost.",
      icon: TrendingUp,
      features: [
        "Up to 25,000 contacts",
        "Unlimited users",
        "1,000 AI call minutes/month",
        "5,000 AI emails/month",
        "5,000 AI conversation analyses/month",
        "Multi-pipeline + smart lead scoring",
        "Automated follow-ups & reminders",
        "Gmail, LinkedIn & WhatsApp integrations",
        "Performance reports & insights",
        "Priority email support",
      ],
      color: "from-primary/20 to-primary/10",
      border: "border-primary/20",
    },
    {
      name: "Scale",
      price: "€249",
      description: "For companies running full AI-driven sales",
      ideal: "For teams ready to replace manual sales with full AI operations.",
      popular: true,
      icon: Rocket,
      features: [
        "Unlimited contacts",
        "Unlimited users",
        "5,000 AI call minutes/month",
        "25,000 AI emails/month",
        "Unlimited analyses",
        "Advanced workflow automations",
        "API & CRM integrations",
        "AI forecasting + conversation coaching",
        "Dedicated success manager",
      ],
      color: "from-purple-500/20 to-purple-600/10",
      border: "border-purple-500",
    },
    {
      name: "Enterprise",
      price: "Custom",
      description: "For large enterprises with custom needs",
      ideal: "Tailored solutions for organizations requiring maximum flexibility and control.",
      enterprise: true,
      icon: Building2,
      features: [
        "Unlimited everything",
        "Unlimited users",
        "Custom AI call minutes",
        "Custom AI emails",
        "Unlimited analyses",
        "White-label options",
        "Custom integrations & APIs",
        "On-premise deployment available",
        "24/7 dedicated support",
        "Custom SLAs",
        "Security audits & compliance",
      ],
      color: "from-accent/20 to-accent/10",
      border: "border-accent/50",
    },
  ];

  const profitabilityData = [
    {
      resource: "AI Call (per min)",
      cost: "€0.05",
      value: "€0.10–0.25",
      margin: "~70%",
    },
    {
      resource: "AI Email",
      cost: "€0.005",
      value: "€0.02",
      margin: "~75%",
    },
    {
      resource: "AI Analysis",
      cost: "€0.001",
      value: "€0.005",
      margin: "~80%",
    },
  ];

  const summaryData = [
    {
      plan: "Starter",
      price: "€59/mo",
      contacts: "5,000",
      callMinutes: "200",
      emails: "1,000",
      analyses: "1,000",
      users: "Unlimited",
    },
    {
      plan: "Pro",
      price: "€119/mo",
      contacts: "25,000",
      callMinutes: "1,000",
      emails: "5,000",
      analyses: "5,000",
      users: "Unlimited",
    },
    {
      plan: "Scale ⭐",
      price: "€249/mo",
      contacts: "Unlimited",
      callMinutes: "5,000",
      emails: "25,000",
      analyses: "Unlimited",
      users: "Unlimited",
    },
    {
      plan: "Enterprise",
      price: "Custom",
      contacts: "Unlimited",
      callMinutes: "Custom",
      emails: "Custom",
      analyses: "Unlimited",
      users: "Unlimited",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-accent/5">
      <Header />
      
      {/* Hero Section - Full Width with Background Image */}
      <div className="relative min-h-[90vh] mt-16 flex items-center">
        {/* Background Image */}
        <div className="absolute inset-0 z-0">
          <img 
            src={sleepingSheep} 
            alt="Peaceful sleeping sheep representing automated AI work" 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/80 to-background/30" />
        </div>

        {/* Content */}
        <div className="container mx-auto px-4 py-20 relative z-10">
          <div className="max-w-3xl">
            {/* Elegant Tagline */}
            <div className="mb-8 animate-fade-in">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-black leading-tight">
                <span className="bg-gradient-to-r from-primary via-purple-500 to-accent bg-clip-text text-transparent">
                  {t['hero.title1']}
                </span>
                <br />
                <span className="bg-gradient-to-r from-accent via-purple-500 to-primary bg-clip-text text-transparent">
                  {t['hero.title2']}
                </span>
              </h1>
            </div>

            <div className="space-y-6 animate-fade-in" style={{ animationDelay: '0.1s' }}>
              <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold">
                {t['hero.subtitle1']}
              </h2>
              
              <p className="text-xl md:text-2xl text-muted-foreground">
                {t['hero.subtitle2']}{" "}
                <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  {t['hero.sells']}
                </span>
                ,{" "}
                <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                  <Phone className="w-4 h-4 text-primary" />
                  {t['hero.calls']}
                </span>
                , or{" "}
                <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  {t['hero.analyzes']}
                </span>
                .
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 pt-8 animate-fade-in" style={{ animationDelay: '0.2s' }}>
              <Button 
                size="lg" 
                onClick={() => navigate("/auth")} 
                className="text-lg px-10 py-6 transition-colors group"
              >
                <span className="flex items-center gap-2">
                  {t['hero.cta']}
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </span>
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                onClick={() => navigate("/auth")} 
                className="text-lg px-10 py-6 transition-colors"
              >
                {t['hero.signin']}
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground pt-8 animate-fade-in" style={{ animationDelay: '0.3s' }}>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                <span>{t['hero.trusted']}</span>
              </div>
              <div className="flex items-center gap-2">
                <Bot className="w-4 h-4 text-primary" />
                <span>{t['hero.automation']}</span>
              </div>
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-primary" />
                <span>{t['hero.noFees']}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Feature Cards Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-6">
          <Card className="p-6 bg-card border border-border/30 transition-colors">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-primary/10">
                <Zap className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-bold text-lg mb-2">{t['features.firstAI.title']}</h3>
                <p className="text-muted-foreground">
                  {t['features.firstAI.desc']}
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6 bg-card border border-border/30 transition-colors">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-primary/10">
                <DollarSign className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h3 className="font-bold text-lg mb-2">{t['features.smart.title']}</h3>
                <p className="text-muted-foreground">
                  {t['features.smart.desc']}
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* How It Works */}
      <div id="features" className="relative py-32 overflow-hidden">
        {/* Background Image with Gradient Overlay */}
        <div className="absolute inset-0 z-0">
          <img 
            src={sleepingSheep} 
            alt="AI automation working while you sleep" 
            className="w-full h-full object-cover opacity-[0.15]"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/90 via-primary/5 to-background/95" />
        </div>

        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-6xl mx-auto">
            {/* Enhanced Header */}
            <div className="text-center mb-20 animate-fade-in">
              <div className="inline-flex items-center gap-4 mb-6 px-6 py-3 bg-primary/10 backdrop-blur border border-primary/20 rounded-full">
                <CloudMoon className="w-6 h-6 text-primary" />
                <span className="text-sm font-semibold text-primary">{t['howItWorks.badge']}</span>
              </div>
              <h2 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-primary via-purple-500 to-accent bg-clip-text text-transparent">
                {t['howItWorks.title']}
              </h2>
              <p className="text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
                {t['howItWorks.subtitle']}
              </p>
            </div>

            {/* Enhanced Feature Grid */}
            <div className="grid md:grid-cols-2 gap-8 mb-16">
              <Card className="relative bg-gradient-to-br from-white/90 to-white/70 dark:from-card/90 dark:to-card/70 backdrop-blur-xl border-2 border-border/50 hover:border-primary/50 hover:shadow-2xl hover:scale-[1.02] transition-all duration-500 group overflow-hidden">
                {/* Subtle sheep background in card */}
                <div className="absolute top-0 right-0 w-32 h-32 opacity-5 group-hover:opacity-10 transition-opacity">
                  <img src={sleepingSheep} alt="" className="w-full h-full object-cover" />
                </div>
                <CardHeader className="pb-6 relative z-10">
                  <div className="p-5 bg-gradient-to-br from-primary/20 to-primary/10 w-fit mb-6 rounded-2xl group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
                    <Users className="w-10 h-10 text-primary" />
                  </div>
                  <CardTitle className="text-2xl md:text-3xl mb-3 font-bold">{t['howItWorks.manage.title']}</CardTitle>
                  <CardDescription className="text-lg text-muted-foreground">
                    {t['howItWorks.manage.desc']}
                  </CardDescription>
                </CardHeader>
                <CardContent className="relative z-10">
                  <div className="flex flex-wrap gap-2 mb-4">
                    <span className="px-3 py-1 bg-primary/10 rounded-full text-sm font-medium">{t['howItWorks.manage.tag1']}</span>
                    <span className="px-3 py-1 bg-primary/10 rounded-full text-sm font-medium">{t['howItWorks.manage.tag2']}</span>
                    <span className="px-3 py-1 bg-primary/10 rounded-full text-sm font-medium">{t['howItWorks.manage.tag3']}</span>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {t['howItWorks.manage.text']}
                  </p>
                </CardContent>
              </Card>

              <Card className="relative bg-gradient-to-br from-white/90 to-white/70 dark:from-card/90 dark:to-card/70 backdrop-blur-xl border-2 border-border/50 hover:border-primary/50 hover:shadow-2xl hover:scale-[1.02] transition-all duration-500 group overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 opacity-5 group-hover:opacity-10 transition-opacity">
                  <img src={sleepingSheep} alt="" className="w-full h-full object-cover" />
                </div>
                <CardHeader className="pb-6 relative z-10">
                  <div className="p-5 bg-gradient-to-br from-accent/20 to-accent/10 w-fit mb-6 rounded-2xl group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
                    <Phone className="w-10 h-10 text-accent" />
                  </div>
                  <CardTitle className="text-2xl md:text-3xl mb-3 font-bold">{t['howItWorks.calls.title']}</CardTitle>
                  <CardDescription className="text-lg text-muted-foreground">
                    {t['howItWorks.calls.desc']}
                  </CardDescription>
                </CardHeader>
                <CardContent className="relative z-10">
                  <div className="flex flex-wrap gap-2 mb-4">
                    <span className="px-3 py-1 bg-accent/10 rounded-full text-sm font-medium">{t['howItWorks.calls.tag1']}</span>
                    <span className="px-3 py-1 bg-accent/10 rounded-full text-sm font-medium">{t['howItWorks.calls.tag2']}</span>
                    <span className="px-3 py-1 bg-accent/10 rounded-full text-sm font-medium">{t['howItWorks.calls.tag3']}</span>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {t['howItWorks.calls.text']}
                  </p>
                </CardContent>
              </Card>

              <Card className="relative bg-gradient-to-br from-white/90 to-white/70 dark:from-card/90 dark:to-card/70 backdrop-blur-xl border-2 border-border/50 hover:border-primary/50 hover:shadow-2xl hover:scale-[1.02] transition-all duration-500 group overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 opacity-5 group-hover:opacity-10 transition-opacity">
                  <img src={sleepingSheep} alt="" className="w-full h-full object-cover" />
                </div>
                <CardHeader className="pb-6 relative z-10">
                  <div className="p-5 bg-gradient-to-br from-purple-500/20 to-purple-500/10 w-fit mb-6 rounded-2xl group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
                    <BarChart3 className="w-10 h-10 text-purple-500" />
                  </div>
                  <CardTitle className="text-2xl md:text-3xl mb-3 font-bold">{t['howItWorks.analyze.title']}</CardTitle>
                  <CardDescription className="text-lg text-muted-foreground">
                    {t['howItWorks.analyze.desc']}
                  </CardDescription>
                </CardHeader>
                <CardContent className="relative z-10">
                  <div className="flex flex-wrap gap-2 mb-4">
                    <span className="px-3 py-1 bg-purple-500/10 rounded-full text-sm font-medium">{t['howItWorks.analyze.tag1']}</span>
                    <span className="px-3 py-1 bg-purple-500/10 rounded-full text-sm font-medium">{t['howItWorks.analyze.tag2']}</span>
                    <span className="px-3 py-1 bg-purple-500/10 rounded-full text-sm font-medium">{t['howItWorks.analyze.tag3']}</span>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {t['howItWorks.analyze.text']}
                  </p>
                </CardContent>
              </Card>

              <Card className="relative bg-gradient-to-br from-white/90 to-white/70 dark:from-card/90 dark:to-card/70 backdrop-blur-xl border-2 border-border/50 hover:border-primary/50 hover:shadow-2xl hover:scale-[1.02] transition-all duration-500 group overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 opacity-5 group-hover:opacity-10 transition-opacity">
                  <img src={sleepingSheep} alt="" className="w-full h-full object-cover" />
                </div>
                <CardHeader className="pb-6 relative z-10">
                  <div className="p-5 bg-gradient-to-br from-primary/20 to-primary/10 w-fit mb-6 rounded-2xl group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
                    <Bot className="w-10 h-10 text-primary" />
                  </div>
                  <CardTitle className="text-2xl md:text-3xl mb-3 font-bold">{t['howItWorks.agents.title']}</CardTitle>
                  <CardDescription className="text-lg text-muted-foreground">
                    {t['howItWorks.agents.desc']}
                  </CardDescription>
                </CardHeader>
                <CardContent className="relative z-10">
                  <div className="flex flex-wrap gap-2 mb-4">
                    <span className="px-3 py-1 bg-primary/10 rounded-full text-sm font-medium">{t['howItWorks.agents.tag1']}</span>
                    <span className="px-3 py-1 bg-primary/10 rounded-full text-sm font-medium">{t['howItWorks.agents.tag2']}</span>
                    <span className="px-3 py-1 bg-primary/10 rounded-full text-sm font-medium">{t['howItWorks.agents.tag3']}</span>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {t['howItWorks.agents.text']}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Enhanced CTA Card */}
            <div className="text-center animate-fade-in" style={{ animationDelay: '0.3s' }}>
              <Card className="relative bg-gradient-to-br from-primary/10 via-purple-500/5 to-accent/10 backdrop-blur-xl border-3 border-primary/30 shadow-2xl overflow-hidden">
                {/* Sheep background in CTA */}
                <div className="absolute inset-0 opacity-5">
                  <img src={sleepingSheep} alt="" className="w-full h-full object-cover" />
                </div>
                <CardContent className="px-8 py-10 relative z-10">
                  <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="flex-1 text-left">
                      <p className="text-2xl md:text-3xl font-bold mb-3 bg-gradient-to-r from-primary via-purple-500 to-accent bg-clip-text text-transparent">
                        {t['howItWorks.cta.main']}
                      </p>
                      <p className="text-lg text-muted-foreground">
                        {t['howItWorks.cta.sub']}
                      </p>
                    </div>
                    <Button 
                      size="lg" 
                      onClick={() => navigate("/auth")} 
                      className="text-lg px-10 py-7 whitespace-nowrap group shadow-xl hover:shadow-2xl transition-all"
                    >
                      {t['howItWorks.cta.button']}
                      <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-2 transition-transform" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Complete Product Features Section */}
      <div id="products" className="relative py-32 overflow-hidden">
        {/* Animated Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-purple-500/5 to-accent/5" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_var(--tw-gradient-stops))] from-accent/10 via-transparent to-transparent" />
        
        <div className="container mx-auto px-4 relative z-10">
          <div className="max-w-7xl mx-auto">
            {/* Section Header */}
            <div className="text-center mb-20 animate-fade-in">
              <div className="inline-flex items-center gap-3 mb-6 px-8 py-4 bg-gradient-to-r from-primary/20 via-purple-500/20 to-accent/20 backdrop-blur-xl border-2 border-primary/30 rounded-full shadow-2xl hover:scale-105 transition-transform duration-300">
                <Sparkles className="w-6 h-6 text-primary animate-pulse" />
                <span className="text-sm font-bold bg-gradient-to-r from-primary via-purple-500 to-accent bg-clip-text text-transparent">Complete CRM Platform</span>
              </div>
              <h2 className="text-5xl md:text-6xl font-extrabold mb-6 leading-tight">
                Everything You Need to<br />
                <span className="bg-gradient-to-r from-primary via-purple-500 to-accent bg-clip-text text-transparent animate-gradient">
                  Automate Sales
                </span>
              </h2>
              <p className="text-xl md:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
                From first contact to customer retention. One platform, unlimited possibilities.
              </p>
            </div>

            {/* Products Grid with Staggered Animation */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Contact Management */}
              <Card 
                className="group relative overflow-hidden hover:shadow-2xl transition-all duration-500 bg-gradient-to-br from-card/95 to-card/60 backdrop-blur-xl border-2 border-border/50 hover:border-blue-500/50 animate-fade-in cursor-pointer" 
                style={{ animationDelay: '0.1s' }}
                onClick={() => setExpandedProduct(expandedProduct === 'contacts' ? null : 'contacts')}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/0 to-blue-500/0 group-hover:from-blue-500/5 group-hover:to-blue-500/10 transition-all duration-500" />
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700" />
                <CardHeader className="relative z-10 pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-4 bg-gradient-to-br from-blue-500/30 to-blue-600/20 rounded-2xl group-hover:scale-110 transition-all duration-300 shadow-lg">
                        <Users className="w-8 h-8 text-blue-600 dark:text-blue-300" />
                      </div>
                      <CardTitle className="text-xl font-bold group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">Contact Management</CardTitle>
                    </div>
                    <ChevronDown className={`w-5 h-5 transition-transform duration-300 ${expandedProduct === 'contacts' ? 'rotate-180' : ''}`} />
                  </div>
                </CardHeader>
                {expandedProduct === 'contacts' && (
                  <CardContent className="relative z-10 animate-fade-in pt-0">
                    <CardDescription className="text-base leading-relaxed mb-4">
                      Complete contact database with unlimited storage, custom fields, and smart segmentation
                    </CardDescription>
                    <ul className="space-y-2">
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-sm">Unlimited contacts</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-sm">Custom fields & tags</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-sm">Import/export tools</span>
                      </li>
                    </ul>
                  </CardContent>
                )}
              </Card>

              {/* Proposals Management */}
              <Card 
                className="group relative overflow-hidden hover:shadow-2xl transition-all duration-500 bg-gradient-to-br from-card/95 to-card/60 backdrop-blur-xl border-2 border-border/50 hover:border-green-500/50 animate-fade-in cursor-pointer" 
                style={{ animationDelay: '0.2s' }}
                onClick={() => setExpandedProduct(expandedProduct === 'proposals' ? null : 'proposals')}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-green-500/0 to-green-500/0 group-hover:from-green-500/5 group-hover:to-green-500/10 transition-all duration-500" />
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-green-500/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700" />
                <CardHeader className="relative z-10 pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-4 bg-gradient-to-br from-green-500/30 to-green-600/20 rounded-2xl group-hover:scale-110 transition-all duration-300 shadow-lg">
                        <FileText className="w-8 h-8 text-green-600 dark:text-green-300" />
                      </div>
                      <CardTitle className="text-xl font-bold group-hover:text-green-600 dark:group-hover:text-green-400 transition-colors">Proposal Management</CardTitle>
                    </div>
                    <ChevronDown className={`w-5 h-5 transition-transform duration-300 ${expandedProduct === 'proposals' ? 'rotate-180' : ''}`} />
                  </div>
                </CardHeader>
                {expandedProduct === 'proposals' && (
                  <CardContent className="relative z-10 animate-fade-in pt-0">
                    <CardDescription className="text-base leading-relaxed mb-4">
                      Create, send and track proposals with templates, e-signatures, and automatic follow-ups
                    </CardDescription>
                    <ul className="space-y-2">
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-sm">Professional templates</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-sm">Digital signatures</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-sm">Tracking & analytics</span>
                      </li>
                    </ul>
                  </CardContent>
                )}
              </Card>

              {/* Contract Management */}
              <Card 
                className="group relative overflow-hidden hover:shadow-2xl transition-all duration-500 bg-gradient-to-br from-card/95 to-card/60 backdrop-blur-xl border-2 border-border/50 hover:border-purple-500/50 animate-fade-in cursor-pointer" 
                style={{ animationDelay: '0.3s' }}
                onClick={() => setExpandedProduct(expandedProduct === 'contracts' ? null : 'contracts')}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/0 to-purple-500/0 group-hover:from-purple-500/5 group-hover:to-purple-500/10 transition-all duration-500" />
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700" />
                <CardHeader className="relative z-10 pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-4 bg-gradient-to-br from-purple-500/30 to-purple-600/20 rounded-2xl group-hover:scale-110 transition-all duration-300 shadow-lg">
                        <HandshakeIcon className="w-8 h-8 text-purple-600 dark:text-purple-300" />
                      </div>
                      <CardTitle className="text-xl font-bold group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">Contract Management</CardTitle>
                    </div>
                    <ChevronDown className={`w-5 h-5 transition-transform duration-300 ${expandedProduct === 'contracts' ? 'rotate-180' : ''}`} />
                  </div>
                </CardHeader>
                {expandedProduct === 'contracts' && (
                  <CardContent className="relative z-10 animate-fade-in pt-0">
                    <CardDescription className="text-base leading-relaxed mb-4">
                      Manage contracts lifecycle from creation to renewal with automated alerts and compliance tracking
                    </CardDescription>
                    <ul className="space-y-2">
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-sm">Contract templates</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-sm">Renewal alerts</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-sm">Version control</span>
                      </li>
                    </ul>
                  </CardContent>
                )}
              </Card>

              {/* Technical Visits */}
              <Card 
                className="group relative overflow-hidden hover:shadow-2xl transition-all duration-500 bg-gradient-to-br from-card/95 to-card/60 backdrop-blur-xl border-2 border-border/50 hover:border-orange-500/50 animate-fade-in cursor-pointer" 
                style={{ animationDelay: '0.4s' }}
                onClick={() => setExpandedProduct(expandedProduct === 'visits' ? null : 'visits')}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-orange-500/0 to-orange-500/0 group-hover:from-orange-500/5 group-hover:to-orange-500/10 transition-all duration-500" />
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-orange-500/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700" />
                <CardHeader className="relative z-10 pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-4 bg-gradient-to-br from-orange-500/30 to-orange-600/20 rounded-2xl group-hover:scale-110 transition-all duration-300 shadow-lg">
                        <Calendar className="w-8 h-8 text-orange-600 dark:text-orange-300" />
                      </div>
                      <CardTitle className="text-xl font-bold group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">Technical Visits</CardTitle>
                    </div>
                    <ChevronDown className={`w-5 h-5 transition-transform duration-300 ${expandedProduct === 'visits' ? 'rotate-180' : ''}`} />
                  </div>
                </CardHeader>
                {expandedProduct === 'visits' && (
                  <CardContent className="relative z-10 animate-fade-in pt-0">
                    <CardDescription className="text-base leading-relaxed mb-4">
                      Schedule, assign and manage technical visits with route optimization and mobile app
                    </CardDescription>
                    <ul className="space-y-2">
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-sm">Smart scheduling</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-sm">Route optimization</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-sm">Mobile access</span>
                      </li>
                    </ul>
                  </CardContent>
                )}
              </Card>

              {/* Customer Maintenance */}
              <Card 
                className="group relative overflow-hidden hover:shadow-2xl transition-all duration-500 bg-gradient-to-br from-card/95 to-card/60 backdrop-blur-xl border-2 border-border/50 hover:border-red-500/50 animate-fade-in cursor-pointer" 
                style={{ animationDelay: '0.5s' }}
                onClick={() => setExpandedProduct(expandedProduct === 'maintenance' ? null : 'maintenance')}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-red-500/0 to-red-500/0 group-hover:from-red-500/5 group-hover:to-red-500/10 transition-all duration-500" />
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-red-500/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700" />
                <CardHeader className="relative z-10 pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-4 bg-gradient-to-br from-red-500/30 to-red-600/20 rounded-2xl group-hover:scale-110 transition-all duration-300 shadow-lg">
                        <Wrench className="w-8 h-8 text-red-600 dark:text-red-300" />
                      </div>
                      <CardTitle className="text-xl font-bold group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">Customer Maintenance</CardTitle>
                    </div>
                    <ChevronDown className={`w-5 h-5 transition-transform duration-300 ${expandedProduct === 'maintenance' ? 'rotate-180' : ''}`} />
                  </div>
                </CardHeader>
                {expandedProduct === 'maintenance' && (
                  <CardContent className="relative z-10 animate-fade-in pt-0">
                    <CardDescription className="text-base leading-relaxed mb-4">
                      Track maintenance schedules, service history, and equipment warranties in one place
                    </CardDescription>
                    <ul className="space-y-2">
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-sm">Service schedules</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-sm">Equipment tracking</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-sm">Warranty management</span>
                      </li>
                    </ul>
                  </CardContent>
                )}
              </Card>

              {/* Pipeline & Deals */}
              <Card 
                className="group relative overflow-hidden hover:shadow-2xl transition-all duration-500 bg-gradient-to-br from-card/95 to-card/60 backdrop-blur-xl border-2 border-border/50 hover:border-cyan-500/50 animate-fade-in cursor-pointer" 
                style={{ animationDelay: '0.6s' }}
                onClick={() => setExpandedProduct(expandedProduct === 'pipeline' ? null : 'pipeline')}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/0 to-cyan-500/0 group-hover:from-cyan-500/5 group-hover:to-cyan-500/10 transition-all duration-500" />
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700" />
                <CardHeader className="relative z-10 pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-4 bg-gradient-to-br from-cyan-500/30 to-cyan-600/20 rounded-2xl group-hover:scale-110 transition-all duration-300 shadow-lg">
                        <TrendingUp className="w-8 h-8 text-cyan-600 dark:text-cyan-300" />
                      </div>
                      <CardTitle className="text-xl font-bold group-hover:text-cyan-600 dark:group-hover:text-cyan-400 transition-colors">Sales Pipeline</CardTitle>
                    </div>
                    <ChevronDown className={`w-5 h-5 transition-transform duration-300 ${expandedProduct === 'pipeline' ? 'rotate-180' : ''}`} />
                  </div>
                </CardHeader>
                {expandedProduct === 'pipeline' && (
                  <CardContent className="relative z-10 animate-fade-in pt-0">
                    <CardDescription className="text-base leading-relaxed mb-4">
                      Visual pipeline management with drag-and-drop, forecasting, and win/loss analysis
                    </CardDescription>
                    <ul className="space-y-2">
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-sm">Visual kanban boards</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-sm">Sales forecasting</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-sm">Performance metrics</span>
                      </li>
                    </ul>
                  </CardContent>
                )}
              </Card>

              {/* Activity Tracking */}
              <Card 
                className="group relative overflow-hidden hover:shadow-2xl transition-all duration-500 bg-gradient-to-br from-card/95 to-card/60 backdrop-blur-xl border-2 border-border/50 hover:border-indigo-500/50 animate-fade-in cursor-pointer" 
                style={{ animationDelay: '0.7s' }}
                onClick={() => setExpandedProduct(expandedProduct === 'activity' ? null : 'activity')}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/0 to-indigo-500/0 group-hover:from-indigo-500/5 group-hover:to-indigo-500/10 transition-all duration-500" />
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700" />
                <CardHeader className="relative z-10 pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-4 bg-gradient-to-br from-indigo-500/30 to-indigo-600/20 rounded-2xl group-hover:scale-110 transition-all duration-300 shadow-lg">
                        <ClipboardList className="w-8 h-8 text-indigo-600 dark:text-indigo-300" />
                      </div>
                      <CardTitle className="text-xl font-bold group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">Activity Tracking</CardTitle>
                    </div>
                    <ChevronDown className={`w-5 h-5 transition-transform duration-300 ${expandedProduct === 'activity' ? 'rotate-180' : ''}`} />
                  </div>
                </CardHeader>
                {expandedProduct === 'activity' && (
                  <CardContent className="relative z-10 animate-fade-in pt-0">
                    <CardDescription className="text-base leading-relaxed mb-4">
                      Log calls, emails, meetings and tasks automatically with AI-powered insights
                    </CardDescription>
                    <ul className="space-y-2">
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-sm">Automatic logging</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-sm">Task management</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-sm">Email integration</span>
                      </li>
                    </ul>
                  </CardContent>
                )}
              </Card>

              {/* Analytics & Reports */}
              <Card 
                className="group relative overflow-hidden hover:shadow-2xl transition-all duration-500 bg-gradient-to-br from-card/95 to-card/60 backdrop-blur-xl border-2 border-border/50 hover:border-pink-500/50 animate-fade-in cursor-pointer" 
                style={{ animationDelay: '0.8s' }}
                onClick={() => setExpandedProduct(expandedProduct === 'analytics' ? null : 'analytics')}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-pink-500/0 to-pink-500/0 group-hover:from-pink-500/5 group-hover:to-pink-500/10 transition-all duration-500" />
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-pink-500/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700" />
                <CardHeader className="relative z-10 pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-4 bg-gradient-to-br from-pink-500/30 to-pink-600/20 rounded-2xl group-hover:scale-110 transition-all duration-300 shadow-lg">
                        <BarChart3 className="w-8 h-8 text-pink-600 dark:text-pink-300" />
                      </div>
                      <CardTitle className="text-xl font-bold group-hover:text-pink-600 dark:group-hover:text-pink-400 transition-colors">Analytics & Reports</CardTitle>
                    </div>
                    <ChevronDown className={`w-5 h-5 transition-transform duration-300 ${expandedProduct === 'analytics' ? 'rotate-180' : ''}`} />
                  </div>
                </CardHeader>
                {expandedProduct === 'analytics' && (
                  <CardContent className="relative z-10 animate-fade-in pt-0">
                    <CardDescription className="text-base leading-relaxed mb-4">
                      Real-time dashboards, custom reports, and AI-powered insights for data-driven decisions
                    </CardDescription>
                    <ul className="space-y-2">
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-sm">Real-time dashboards</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-sm">Custom reports</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-sm">AI-powered insights</span>
                      </li>
                    </ul>
                  </CardContent>
                )}
              </Card>

              {/* Security & Compliance */}
              <Card 
                className="group relative overflow-hidden hover:shadow-2xl transition-all duration-500 bg-gradient-to-br from-card/95 to-card/60 backdrop-blur-xl border-2 border-border/50 hover:border-emerald-500/50 animate-fade-in cursor-pointer" 
                style={{ animationDelay: '0.9s' }}
                onClick={() => setExpandedProduct(expandedProduct === 'security' ? null : 'security')}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/0 to-emerald-500/0 group-hover:from-emerald-500/5 group-hover:to-emerald-500/10 transition-all duration-500" />
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700" />
                <CardHeader className="relative z-10 pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-4 bg-gradient-to-br from-emerald-500/30 to-emerald-600/20 rounded-2xl group-hover:scale-110 transition-all duration-300 shadow-lg">
                        <Shield className="w-8 h-8 text-emerald-600 dark:text-emerald-300" />
                      </div>
                      <CardTitle className="text-xl font-bold group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">Security & Compliance</CardTitle>
                    </div>
                    <ChevronDown className={`w-5 h-5 transition-transform duration-300 ${expandedProduct === 'security' ? 'rotate-180' : ''}`} />
                  </div>
                </CardHeader>
                {expandedProduct === 'security' && (
                  <CardContent className="relative z-10 animate-fade-in pt-0">
                    <CardDescription className="text-base leading-relaxed mb-4">
                      Enterprise-grade security, GDPR compliance, role-based access, and audit trails
                    </CardDescription>
                    <ul className="space-y-2">
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-sm">GDPR compliant</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-sm">Role-based access</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-sm">Audit trails</span>
                      </li>
                    </ul>
                  </CardContent>
                )}
              </Card>

              {/* Inventory Management */}
              <Card 
                className="group relative overflow-hidden hover:shadow-2xl transition-all duration-500 bg-gradient-to-br from-card/95 to-card/60 backdrop-blur-xl border-2 border-border/50 hover:border-amber-500/50 animate-fade-in cursor-pointer" 
                style={{ animationDelay: '1s' }}
                onClick={() => setExpandedProduct(expandedProduct === 'inventory' ? null : 'inventory')}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-amber-500/0 to-amber-500/0 group-hover:from-amber-500/5 group-hover:to-amber-500/10 transition-all duration-500" />
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700" />
                <CardHeader className="relative z-10 pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-4 bg-gradient-to-br from-amber-500/30 to-amber-600/20 rounded-2xl group-hover:scale-110 transition-all duration-300 shadow-lg">
                        <Package className="w-8 h-8 text-amber-600 dark:text-amber-300" />
                      </div>
                      <CardTitle className="text-xl font-bold group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">Inventory Management</CardTitle>
                    </div>
                    <ChevronDown className={`w-5 h-5 transition-transform duration-300 ${expandedProduct === 'inventory' ? 'rotate-180' : ''}`} />
                  </div>
                </CardHeader>
                {expandedProduct === 'inventory' && (
                  <CardContent className="relative z-10 animate-fade-in pt-0">
                    <CardDescription className="text-base leading-relaxed mb-4">
                      Complete stock control with real-time tracking, automated reordering, and multi-warehouse support
                    </CardDescription>
                    <ul className="space-y-2">
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-sm">Real-time stock tracking</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-sm">Automated reordering</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-sm">Multi-warehouse</span>
                      </li>
                    </ul>
                  </CardContent>
                )}
              </Card>

              {/* Fleet Management */}
              <Card 
                className="group relative overflow-hidden hover:shadow-2xl transition-all duration-500 bg-gradient-to-br from-card/95 to-card/60 backdrop-blur-xl border-2 border-border/50 hover:border-slate-500/50 animate-fade-in cursor-pointer" 
                style={{ animationDelay: '1.1s' }}
                onClick={() => setExpandedProduct(expandedProduct === 'fleet' ? null : 'fleet')}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-slate-500/0 to-slate-500/0 group-hover:from-slate-500/5 group-hover:to-slate-500/10 transition-all duration-500" />
                <div className="absolute -top-24 -right-24 w-48 h-48 bg-slate-500/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700" />
                <CardHeader className="relative z-10 pb-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="p-4 bg-gradient-to-br from-slate-500/30 to-slate-600/20 rounded-2xl group-hover:scale-110 transition-all duration-300 shadow-lg">
                        <Truck className="w-8 h-8 text-slate-600 dark:text-slate-300" />
                      </div>
                      <CardTitle className="text-xl font-bold group-hover:text-slate-600 dark:group-hover:text-slate-400 transition-colors">Fleet Management</CardTitle>
                    </div>
                    <ChevronDown className={`w-5 h-5 transition-transform duration-300 ${expandedProduct === 'fleet' ? 'rotate-180' : ''}`} />
                  </div>
                </CardHeader>
                {expandedProduct === 'fleet' && (
                  <CardContent className="relative z-10 animate-fade-in pt-0">
                    <CardDescription className="text-base leading-relaxed mb-4">
                      Track vehicles, maintenance schedules, fuel costs, and driver performance in real-time
                    </CardDescription>
                    <ul className="space-y-2">
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-sm">Vehicle tracking</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-sm">Maintenance scheduling</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="w-4 h-4 text-primary flex-shrink-0" />
                        <span className="text-sm">Fuel monitoring</span>
                      </li>
                    </ul>
                  </CardContent>
                )}
              </Card>
            </div>

            {/* Bottom CTA */}
            <div className="text-center mt-16">
              <Card className="bg-gradient-to-r from-primary/10 via-purple-500/10 to-accent/10 border-2 border-primary/30 p-8">
                <h3 className="text-2xl font-bold mb-4">Ready to Transform Your Sales Process?</h3>
                <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
                  Join thousands of teams already using Olyvia to automate their sales and grow their business faster.
                </p>
                <Button size="lg" onClick={() => navigate("/auth")} className="text-lg px-10 py-6 group">
                  Start Free Trial Today
                  <ArrowRight className="ml-2 w-5 h-5 group-hover:translate-x-2 transition-transform" />
                </Button>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Pricing Section */}
      <div id="pricing" className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-3 mb-4">
            <BadgeDollarSign className="w-10 h-10 text-primary" />
            <h2 className="text-4xl font-bold">Pricing</h2>
          </div>
          
          <div className="max-w-3xl mx-auto mt-8">
            <Card className="bg-card/50 border border-border/30 p-6">
              <h3 className="text-xl font-semibold mb-4">All plans include:</h3>
              <div className="grid md:grid-cols-2 gap-4 text-left">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-muted-foreground">Unlimited users (no per-seat pricing)</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10">
                    <BarChart3 className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-muted-foreground">Full contact and deal management</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10">
                    <Bot className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-muted-foreground">AI reminders and automation tools</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10">
                    <Zap className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-muted-foreground">Free setup & onboarding</span>
                </div>
              </div>
              <div className="mt-6 pt-6 border-t border-border/30">
                <p className="text-base font-semibold text-center">
                  Only pay for what the AI does: calls, emails, and analysis.
                </p>
              </div>
            </Card>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 max-w-7xl mx-auto">
          {plans.map((plan) => (
            <Card
              key={plan.name}
              className={`relative bg-gradient-to-br ${plan.color} backdrop-blur border-2 ${plan.border} ${
                plan.popular ? "scale-105 shadow-2xl" : ""
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-primary text-primary-foreground rounded-full text-sm font-semibold">
                  ⭐ Most Popular
                </div>
              )}
              <CardHeader className="pb-8">
                <div className="flex items-baseline gap-2 mb-2">
                  <plan.icon className="w-6 h-6 text-primary" />
                  <CardTitle className="text-2xl">{plan.name}</CardTitle>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className={`${plan.enterprise ? "text-4xl" : "text-5xl"} font-bold`}>{plan.price}</span>
                  {!plan.enterprise && <span className="text-muted-foreground">/month</span>}
                </div>
                <CardDescription className="text-base">{plan.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {plan.features.map((feature, i) => (
                  <div key={i} className="flex gap-3">
                    <Check className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-sm">{feature}</span>
                  </div>
                ))}
                <div className="pt-4 mt-4 border-t border-border/50">
                  <p className="text-sm text-muted-foreground italic">💬 {plan.ideal}</p>
                </div>
                <Button
                  className="w-full mt-6"
                  variant={plan.popular ? "default" : "outline"}
                  size="lg"
                  onClick={() => navigate("/auth")}
                >
                  {plan.enterprise ? "Contact Sales" : "Get Started"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Comparison Table */}
        <div className="max-w-6xl mx-auto mt-16">
          <h3 className="text-2xl font-bold text-center mb-8">Plan Comparison</h3>
          <Card className="bg-card/50 backdrop-blur overflow-hidden border border-border/30">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="font-bold">Plan</TableHead>
                      <TableHead className="font-bold">Price</TableHead>
                      <TableHead className="font-bold">Contacts</TableHead>
                      <TableHead className="font-bold">AI Call Minutes</TableHead>
                      <TableHead className="font-bold">AI Emails</TableHead>
                      <TableHead className="font-bold">AI Analyses</TableHead>
                      <TableHead className="font-bold">Users</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summaryData.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-semibold">{row.plan}</TableCell>
                        <TableCell>{row.price}</TableCell>
                        <TableCell>{row.contacts}</TableCell>
                        <TableCell>{row.callMinutes}</TableCell>
                        <TableCell>{row.emails}</TableCell>
                        <TableCell>{row.analyses}</TableCell>
                        <TableCell>{row.users}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Add-ons */}
        <div className="max-w-3xl mx-auto mt-16">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-3 mb-4">
              <CloudMoon className="w-8 h-8 text-primary" />
              <h3 className="text-2xl font-bold">Add-Ons</h3>
            </div>
            <p className="text-muted-foreground">Need more volume? Scale on demand.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <Card className="bg-card border border-border/30 hover:border-primary/30 transition-colors">
              <CardHeader className="text-center">
                <div className="mx-auto p-3 bg-primary/10 w-fit mb-4">
                  <Phone className="w-8 h-8 text-primary" />
                </div>
                <CardTitle className="text-lg">AI Call Minutes</CardTitle>
                <div className="text-3xl font-bold py-2">€0.10</div>
                <CardDescription>per minute</CardDescription>
              </CardHeader>
            </Card>
            <Card className="bg-card border border-border/30 hover:border-primary/30 transition-colors">
              <CardHeader className="text-center">
                <div className="mx-auto p-3 bg-primary/10 w-fit mb-4">
                  <Mail className="w-8 h-8 text-primary" />
                </div>
                <CardTitle className="text-lg">AI Emails</CardTitle>
                <div className="text-3xl font-bold py-2">€0.02</div>
                <CardDescription>per email</CardDescription>
              </CardHeader>
            </Card>
            <Card className="bg-card border border-border/30 hover:border-primary/30 transition-colors">
              <CardHeader className="text-center">
                <div className="mx-auto p-3 bg-primary/10 w-fit mb-4">
                  <BarChart3 className="w-8 h-8 text-primary" />
                </div>
                <CardTitle className="text-lg">AI Analyses</CardTitle>
                <div className="text-3xl font-bold py-2">€0.005</div>
                <CardDescription>per analysis</CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </div>

      {/* Why Teams Choose Olyvia */}
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-3">
              <Award className="w-8 h-8 text-primary" />
              <h2 className="text-3xl font-bold">Why Teams Choose Olyvia</h2>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {features.map((feature, i) => (
              <div key={i} className="flex items-center gap-4 p-4 bg-card border border-border/30">
                <feature.icon className="w-8 h-8 text-primary flex-shrink-0" />
                <span className="text-lg">{feature.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>


      {/* CTA Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="max-w-4xl mx-auto">
          <Card className="bg-card border border-border/30 p-12">
            <div className="text-center space-y-8">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-3 mb-4">
                  <Zap className="w-8 h-8 text-primary" />
                  <h2 className="text-3xl md:text-4xl font-bold">The Future of Sales Automation</h2>
                </div>
                <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                  Olyvia isn't just another CRM — it's your AI Sales Team.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-4 max-w-2xl mx-auto text-left">
                <div className="flex items-start gap-3 p-4 bg-muted/30 border border-border/30">
                  <Bot className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span>Your agents call, email, analyze, and learn — 24/7</span>
                </div>
                <div className="flex items-start gap-3 p-4 bg-muted/30 border border-border/30">
                  <Users className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                  <span>Your team manages relationships — not repetitive tasks</span>
                </div>
              </div>

              <div className="space-y-4 pt-4">
                <p className="text-2xl font-bold">
                  Unlimited users. Free CRM. Pay only when your AI works.
                </p>
                <div className="inline-flex items-center gap-2 px-6 py-3 bg-muted/30 border border-border/30">
                  <DollarSign className="w-5 h-5 text-primary" />
                  <span className="text-muted-foreground">"Stop paying per user — start scaling per result."</span>
                </div>
              </div>

              <Button size="lg" onClick={() => navigate("/auth")} className="text-lg px-12 mt-6">
                Start Your AI Journey <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-border/30 bg-white dark:bg-card/50">
        <div className="container mx-auto px-4 py-12">
          <div className="grid md:grid-cols-3 gap-8 mb-8">
            {/* Logo and Description */}
            <div className="space-y-4">
              <img src={olyviaIcon} alt="Olyvia" className="h-16 w-auto" />
              <p className="text-muted-foreground text-sm">
                {t['footer.description']}
              </p>
            </div>

            {/* Navigation Links */}
            <div>
              <h4 className="font-semibold mb-4">{t['footer.navigation']}</h4>
              <nav className="space-y-2">
                <button
                  onClick={() => {
                    const element = document.querySelector('#features');
                    element?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="block text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t['nav.features']}
                </button>
                <button
                  onClick={() => {
                    const element = document.querySelector('#products');
                    element?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="block text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t['nav.products']}
                </button>
                <button
                  onClick={() => {
                    const element = document.querySelector('#pricing');
                    element?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="block text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t['nav.pricing']}
                </button>
                <button
                  onClick={() => navigate("/auth")}
                  className="block text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t['nav.signin']}
                </button>
              </nav>
            </div>

            {/* Contact/CTA */}
            <div>
              <h4 className="font-semibold mb-4">{t['footer.getStarted']}</h4>
              <Button onClick={() => navigate("/auth")} className="w-full md:w-auto">
                {t['hero.cta']}
              </Button>
            </div>
          </div>

          {/* Copyright */}
          <div className="pt-8 border-t border-border/30 text-center text-sm text-muted-foreground">
            <p>{t['footer.copyright']}</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
