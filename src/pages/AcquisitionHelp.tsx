import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout";
import { useTranslation } from "@/hooks/useTranslation";
import { useHelpData } from "@/hooks/useHelpData";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Search, Target, FileText, Receipt, Users, Workflow, CheckCircle, HelpCircle, 
  ArrowRight, Zap, Clock, BarChart3, TrendingUp, UserPlus, RefreshCw, Link, 
  Layers, Package, Calculator, FileCheck, Send, Eye, FileSignature, Bell,
  Route, BookOpen, ExternalLink
} from "lucide-react";

const iconMap: Record<string, any> = {
  Target, Users, UserPlus, FileText, Receipt, Workflow, CheckCircle, HelpCircle,
  Zap, Clock, BarChart3, TrendingUp, RefreshCw, Link, Layers, Package,
  Calculator, FileCheck, Send, Eye, FileSignature, Bell, Route,
};

const categoryLabels: Record<string, { en: string; pt: string }> = {
  overview: { en: "Overview", pt: "Visão Geral" },
  leads: { en: "Leads", pt: "Leads" },
  deals: { en: "Proposal Requests", pt: "Pedidos de Proposta" },
  quotes: { en: "Quotes", pt: "Orçamentos" },
  proposals: { en: "Proposals", pt: "Propostas" },
  contracts: { en: "Contracts", pt: "Contratos" },
  workflows: { en: "Workflows & Automation", pt: "Workflows e Automação" },
};

const categoryDescriptions: Record<string, { en: string; pt: string }> = {
  overview: { en: "General questions about the Acquisition module", pt: "Questões gerais sobre o módulo de Aquisição" },
  leads: { en: "Managing leads and potential customers", pt: "Gestão de leads e potenciais clientes" },
  deals: { en: "Proposal requests and business opportunities", pt: "Pedidos de proposta e oportunidades de negócio" },
  quotes: { en: "Creating and managing quotes", pt: "Criação e gestão de orçamentos" },
  proposals: { en: "Commercial proposals for clients", pt: "Propostas comerciais para clientes" },
  contracts: { en: "Contract management and signatures", pt: "Gestão de contratos e assinaturas" },
  workflows: { en: "Automation and sales processes", pt: "Automação e processos de vendas" },
};

const categoryIcons: Record<string, any> = {
  overview: Target, leads: Users, deals: FileText, quotes: Receipt,
  proposals: FileCheck, contracts: CheckCircle, workflows: Workflow,
};

const tipColorMap: Record<string, string> = {
  blue: "bg-blue-500/10 text-blue-500",
  green: "bg-green-500/10 text-green-500",
  purple: "bg-purple-500/10 text-purple-500",
  orange: "bg-orange-500/10 text-orange-500",
  red: "bg-red-500/10 text-red-500",
  yellow: "bg-yellow-500/10 text-yellow-500",
};

const AcquisitionHelp = () => {
  const { t, language } = useTranslation();
  const navigate = useNavigate();
  const { isSystemAdmin } = usePermissions();
  const [searchTerm, setSearchTerm] = useState("");
  const { workflowSteps, quickTips, faqs, article, loading, hasData } = useHelpData("acquisition");

  const isSearching = searchTerm.trim().length > 0;

  const groupedFaqs = useMemo(() => {
    if (!hasData || faqs.length === 0) return null;
    const grouped: Record<string, typeof faqs> = {};
    faqs.forEach(faq => {
      if (!grouped[faq.category]) grouped[faq.category] = [];
      grouped[faq.category].push(faq);
    });
    return grouped;
  }, [faqs, hasData]);

  const filteredSections = useMemo(() => {
    if (!groupedFaqs) return [];
    const categoryOrder = ['overview', 'leads', 'deals', 'quotes', 'proposals', 'contracts', 'workflows'];
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
            !isSearching ||
            faq.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
            faq.answer.toLowerCase().includes(searchTerm.toLowerCase())
          ),
      }))
      .filter(section => section.faqs.length > 0 || !isSearching);
  }, [groupedFaqs, searchTerm, language, isSearching]);

  const scrollToSection = (id: string) => {
    document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: 'smooth' });
  };

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
                {t("acquisitionHelp.title")}
              </h1>
              <p className="text-muted-foreground">
                {t("acquisitionHelp.subtitle")}
              </p>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("acquisitionHelp.searchPlaceholder")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Workflow Overview — hidden during search */}
        {!isSearching && workflowSteps.length > 0 && (
          <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Workflow className="w-5 h-5 text-primary" />
                {t("acquisitionHelp.workflowTitle")}
              </CardTitle>
              <CardDescription>
                {t("acquisitionHelp.workflowDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Desktop: horizontal */}
              <div className="hidden md:flex items-start gap-4 overflow-x-auto pb-4">
                {workflowSteps.map((step, index) => {
                  const IconComponent = iconMap[step.icon] || Users;
                  return (
                    <div key={step.step_number} className="flex items-center gap-3 min-w-fit">
                      <div className="flex flex-col items-center text-center">
                        <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mb-2">
                          <IconComponent className="w-6 h-6 text-primary" />
                        </div>
                        <Badge variant="outline" className="mb-1">
                          {t("acquisitionHelp.step")} {step.step_number}
                        </Badge>
                        <span className="text-sm font-medium">{step.title}</span>
                        <span className="text-xs text-muted-foreground max-w-[120px]">
                          {step.description}
                        </span>
                      </div>
                      {index < workflowSteps.length - 1 && (
                        <ArrowRight className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                  );
                })}
              </div>
              {/* Mobile: vertical with connector line */}
              <div className="flex md:hidden">
                <div className="flex flex-col items-center mr-4">
                  {workflowSteps.map((_, index) => (
                    <div key={index} className="flex flex-col items-center">
                      <div className="w-3 h-3 rounded-full bg-primary" />
                      {index < workflowSteps.length - 1 && (
                        <div className="w-0.5 h-16 bg-primary/30" />
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-4">
                  {workflowSteps.map((step) => {
                    const IconComponent = iconMap[step.icon] || Users;
                    return (
                      <div key={step.step_number} className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                          <IconComponent className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                          <Badge variant="outline" className="mb-1">
                            {t("acquisitionHelp.step")} {step.step_number}
                          </Badge>
                          <p className="text-sm font-medium">{step.title}</p>
                          <p className="text-xs text-muted-foreground">{step.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Tips — hidden during search */}
        {!isSearching && quickTips.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {quickTips.map((tip, index) => {
              const IconComponent = iconMap[tip.icon] || Zap;
              const colorClass = tipColorMap[tip.color] || tipColorMap.blue;
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

        {/* Article — "Guia Completo" */}
        {!isSearching && article && (
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" />
                {article.title}
              </CardTitle>
              {article.description && (
                <CardDescription>{article.description}</CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground whitespace-pre-line">
                {article.content}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Category Navigation Badges */}
        {filteredSections.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {filteredSections.map((section) => (
              <Badge
                key={section.id}
                variant="outline"
                className="cursor-pointer hover:bg-primary/10 transition-colors"
                onClick={() => scrollToSection(section.id)}
              >
                <section.icon className="w-3 h-3 mr-1" />
                {section.title}
              </Badge>
            ))}
          </div>
        )}

        {/* FAQ Sections */}
        <div className="space-y-6">
          {filteredSections.map((section) => (
            <Card key={section.id} id={`section-${section.id}`}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <section.icon className="w-5 h-5 text-primary" />
                  {section.title}
                </CardTitle>
                {section.desc && <CardDescription>{section.desc}</CardDescription>}
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  {section.faqs.map((faq, index) => {
                    const faqAny = faq as any;
                    return (
                      <AccordionItem key={index} value={`${section.id}-${index}`}>
                        <AccordionTrigger className="text-left">
                          {faq.question}
                        </AccordionTrigger>
                        <AccordionContent className="text-muted-foreground whitespace-pre-line">
                          {faq.answer}
                          {faqAny.action_url && (
                            <div className="mt-3">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => navigate(faqAny.action_url)}
                              >
                                <ExternalLink className="w-3 h-3 mr-1" />
                                {faqAny.action_label || t("common.goTo")}
                              </Button>
                            </div>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </CardContent>
            </Card>
          ))}

          {filteredSections.length === 0 && isSearching && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Search className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">{t("acquisitionHelp.noResults")}</p>
                <p className="text-muted-foreground">{t("acquisitionHelp.tryDifferentSearch")}</p>
              </CardContent>
            </Card>
          )}

          {!hasData && !loading && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <BookOpen className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium">
                  {language === "pt"
                    ? "O conteúdo de ajuda ainda não foi configurado para este módulo."
                    : "Help content has not been configured for this module yet."}
                </p>
                {isSystemAdmin && (
                  <Button
                    variant="outline"
                    className="mt-4"
                    onClick={() => navigate("/settings")}
                  >
                    {language === "pt" ? "Configurar Conteúdo" : "Configure Content"}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
};

export default AcquisitionHelp;
