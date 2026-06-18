import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useTranslation } from "@/hooks/useTranslation";
import { 
  Search, HelpCircle, ChevronRight, BookOpen,
  Building, Users, Network, Folder, Star, MessageCircle
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FAQ {
  id: string;
  question: string;
  answer: string;
  category: string;
  page_key: string;
  icon: string | null;
  is_active: boolean;
  sort_order: number;
  language_code: string | null;
}

const categoryIcons: Record<string, React.ElementType> = {
  organizations: Building,
  users: Users,
  hierarchy: Network,
  templates: Folder,
  general: HelpCircle,
};

export default function OrgHelp() {
  const { t, language } = useTranslation();
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedFaqs, setExpandedFaqs] = useState<Set<string>>(new Set());
  
  const { data: faqs = [], isLoading: faqsLoading } = useQuery({
    queryKey: ['org-help-faqs', language],
    queryFn: async () => {
      // Try user's language first, fallback to pt
      const { data: localizedFaqs, error } = await supabase
        .from('help_faqs')
        .select('*')
        .eq('is_active', true)
        .eq('page_key', 'organizations')
        .eq('language_code', language)
        .order('sort_order', { ascending: true });
      
      if (error) throw error;
      
      if ((!localizedFaqs || localizedFaqs.length === 0) && language !== 'pt') {
        const { data: ptFaqs, error: ptError } = await supabase
          .from('help_faqs')
          .select('*')
          .eq('is_active', true)
          .eq('page_key', 'organizations')
          .eq('language_code', 'pt')
          .order('sort_order', { ascending: true });
        
        if (ptError) throw ptError;
        return (ptFaqs || []) as FAQ[];
      }
      
      return (localizedFaqs || []) as FAQ[];
    }
  });
  
  const filteredFaqs = faqs.filter(faq => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return faq.question.toLowerCase().includes(term) || faq.answer.toLowerCase().includes(term);
  });
  
  // Group FAQs by category
  const faqsByCategory = filteredFaqs.reduce((acc, faq) => {
    const cat = faq.category || 'general';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(faq);
    return acc;
  }, {} as Record<string, FAQ[]>);
  
  const toggleFaq = (id: string) => {
    setExpandedFaqs(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  
  const FAQItem = ({ faq }: { faq: FAQ }) => {
    const isOpen = expandedFaqs.has(faq.id);
    return (
      <Collapsible open={isOpen} onOpenChange={() => toggleFaq(faq.id)}>
        <CollapsibleTrigger className="w-full">
          <div className="flex items-start gap-3 p-4 rounded-lg hover:bg-muted/50 transition-colors text-left">
            <ChevronRight className={cn("h-5 w-5 text-muted-foreground mt-0.5 transition-transform flex-shrink-0", isOpen && "rotate-90")} />
            <h4 className="font-medium text-sm flex-1">{faq.question}</h4>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="ml-8 mr-4 mb-4 p-4 bg-muted/30 rounded-lg border border-dashed">
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{faq.answer}</p>
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  };
  
  return (
    <>
      <div className="container mx-auto py-6 space-y-8">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-gradient-to-br from-primary/10 to-primary/5">
              <BookOpen className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{t('orgHelp.title')}</h1>
              <p className="text-muted-foreground mt-1">{t('orgHelp.description')}</p>
            </div>
          </div>
          
          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('orgHelp.searchPlaceholder')}
              className="pl-10 h-12 text-base"
            />
          </div>
        </div>
        
        {faqsLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="h-5 bg-muted rounded w-3/4 mb-3" />
                  <div className="h-4 bg-muted rounded w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(faqsByCategory).map(([category, categoryFaqs]) => {
              const Icon = categoryIcons[category] || HelpCircle;
              return (
                <Card key={category}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Icon className="h-5 w-5 text-primary" />
                      {t(`orgHelp.categories.${category}`) || category}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="divide-y">
                      {categoryFaqs.map(faq => <FAQItem key={faq.id} faq={faq} />)}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            
            {filteredFaqs.length === 0 && (
              <Card>
                <CardContent className="p-12 text-center">
                  <MessageCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="font-medium mb-2">{t('orgHelp.noResults')}</h3>
                  <p className="text-sm text-muted-foreground">{t('orgHelp.noResultsHint')}</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </>
  );
}
