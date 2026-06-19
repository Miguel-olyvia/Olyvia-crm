import { useState, useMemo } from "react";
import Layout from "@/components/Layout";
import { useTranslation } from "@/hooks/useTranslation";
import { useHelpData } from "@/hooks/useHelpData";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Search, Target, Users, Megaphone, BarChart3, Mail, Workflow, HelpCircle, 
  ArrowRight, Zap, Clock, Share2, Globe, MousePointer, FileText, Settings,
  Plus, Calendar, Link, FileInput, Palette, Code, Route, Download, Plug,
  UserPlus, FlaskConical
} from "lucide-react";

const iconMap: Record<string, any> = {
  Target,
  Users,
  UserPlus,
  Megaphone,
  BarChart3,
  Mail,
  Workflow,
  HelpCircle,
  Zap,
  Clock,
  Share2,
  Globe,
  MousePointer,
  FileText,
  Settings,
  Plus,
  Calendar,
  Link,
  FileInput,
  Palette,
  Code,
  Route,
  Download,
  Plug,
  FlaskConical,
  BarChart: BarChart3,
};

// Category labels for display
const categoryLabels: Record<string, { en: string; pt: string }> = {
  overview: { en: "Overview", pt: "Visão Geral" },
  campaigns: { en: "Campaigns", pt: "Campanhas" },
  channels: { en: "Channels", pt: "Canais" },
  forms: { en: "Forms", pt: "Formulários" },
  routing: { en: "Lead Routing", pt: "Encaminhamento de Leads" },
  analytics: { en: "Analytics", pt: "Analytics" },
  integration: { en: "Integrations", pt: "Integrações" },
};

const categoryDescriptions: Record<string, { en: string; pt: string }> = {
  overview: { en: "General questions about the Marketing module", pt: "Questões gerais sobre o módulo de Marketing" },
  campaigns: { en: "Creating and managing campaigns", pt: "Criação e gestão de campanhas" },
  channels: { en: "Lead capture channels", pt: "Canais de captação de leads" },
  forms: { en: "Lead capture forms", pt: "Formulários de captação" },
  routing: { en: "Lead distribution and routing", pt: "Distribuição e encaminhamento de leads" },
  analytics: { en: "Metrics and reporting", pt: "Métricas e relatórios" },
  integration: { en: "API and external integrations", pt: "API e integrações externas" },
};

const categoryIcons: Record<string, any> = {
  overview: Target,
  campaigns: Megaphone,
  channels: Share2,
  forms: FileInput,
  routing: Route,
  analytics: BarChart3,
  integration: Plug,
};

const MarketingHelp = () => {
  const { t, language } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const { workflowSteps, quickTips, faqs, loading, hasData } = useHelpData("marketing");

  // Group FAQs by category
  const groupedFaqs = useMemo(() => {
    if (!hasData || faqs.length === 0) return null;
    
    const grouped: Record<string, typeof faqs> = {};
    faqs.forEach(faq => {
      if (!grouped[faq.category]) grouped[faq.category] = [];
      grouped[faq.category].push(faq);
    });
    return grouped;
  }, [faqs, hasData]);

  // Filter FAQs based on search
  const filteredSections = useMemo(() => {
    if (groupedFaqs) {
      // Database data
      const categoryOrder = ['overview', 'campaigns', 'channels', 'forms', 'routing', 'analytics', 'integration'];
      return Object.entries(groupedFaqs)
        .sort((a, b) => categoryOrder.indexOf(a[0]) - categoryOrder.indexOf(b[0]))
        .map(([category, items]) => ({
          id: category,
          icon: categoryIcons[category] || Target,
          title: categoryLabels[category]?.[language as 'en' | 'pt'] || category,
          desc: categoryDescriptions[category]?.[language as 'en' | 'pt'] || "",
          faqs: items
            .sort((a, b) => a.sort_order - b.sort_order)
            .filter(faq => 
              faq.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
              faq.answer.toLowerCase().includes(searchTerm.toLowerCase())
            ),
        }))
        .filter(section => section.faqs.length > 0 || searchTerm === "");
    }
    
    return [];
  }, [groupedFaqs, searchTerm, language]);

  if (loading) {
    return (
      <>
        <div className="p-6 space-y-8 max-w-6xl mx-auto">
          <Skeleton className="h-16 w-1/2" />
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-48 w-full" />
          <div className="grid grid-cols-3 gap-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="p-6 space-y-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <HelpCircle className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                {t("marketingHelp.title")}
              </h1>
              <p className="text-muted-foreground">
                {t("marketingHelp.subtitle")}
              </p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("marketingHelp.searchPlaceholder")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Workflow Overview */}
        {workflowSteps.length > 0 && (
          <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Workflow className="w-5 h-5 text-primary" />
                {t("marketingHelp.workflowTitle")}
              </CardTitle>
              <CardDescription>
                {t("marketingHelp.workflowDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row items-start md:items-center gap-4 overflow-x-auto pb-4">
                {workflowSteps.map((step, index) => {
                  const IconComponent = iconMap[step.icon] || Megaphone;
                  
                  return (
                    <div key={step.step_number} className="flex items-center gap-3 min-w-fit">
                      <div className="flex flex-col items-center text-center">
                        <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mb-2">
                          <IconComponent className="w-6 h-6 text-primary" />
                        </div>
                        <Badge variant="outline" className="mb-1">
                          {t("marketingHelp.step")} {step.step_number}
                        </Badge>
                        <span className="text-sm font-medium">{step.title}</span>
                        <span className="text-xs text-muted-foreground max-w-[120px]">
                          {step.description}
                        </span>
                      </div>
                      {index < workflowSteps.length - 1 && (
                        <ArrowRight className="w-5 h-5 text-muted-foreground hidden md:block" />
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Tips */}
        {quickTips.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {quickTips.map((tip, index) => {
              const IconComponent = iconMap[tip.icon] || Zap;
              const colorClass = tip.color === "blue" ? "bg-blue-500/10 text-blue-500" 
                : tip.color === "green" ? "bg-green-500/10 text-green-500" 
                : "bg-purple-500/10 text-purple-500";
              
              return (
                <Card key={index}>
                  <CardContent className="flex items-center gap-4 p-4">
                    <div className={`p-3 rounded-lg ${colorClass}`}>
                      <IconComponent className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">{tip.label}</p>
                      <p className="font-medium">{tip.title}</p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* FAQ Sections */}
        <div className="space-y-6">
          {filteredSections.map((section) => (
            <Card key={section.id}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <section.icon className="w-5 h-5 text-primary" />
                  {section.title}
                </CardTitle>
                {section.desc && <CardDescription>{section.desc}</CardDescription>}
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  {section.faqs.map((faq, index) => (
                    <AccordionItem key={index} value={`${section.id}-${index}`}>
                      <AccordionTrigger className="text-left">
                        {faq.question}
                      </AccordionTrigger>
                      <AccordionContent className="text-muted-foreground whitespace-pre-line">
                        {faq.answer}
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </CardContent>
            </Card>
          ))}

          {filteredSections.length === 0 && searchTerm && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Search className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">{t("marketingHelp.noResults")}</p>
                <p className="text-muted-foreground">{t("marketingHelp.tryDifferentSearch")}</p>
              </CardContent>
            </Card>
          )}

          {!hasData && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <HelpCircle className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">{t("common.noData")}</p>
                <p className="text-muted-foreground">{t("common.loading")}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
};

export default MarketingHelp;
