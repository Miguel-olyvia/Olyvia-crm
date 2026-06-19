import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, Search, HelpCircle, Sparkles, BookOpen, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTranslation } from "@/hooks/useTranslation";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

interface FAQ {
  id: string;
  question: string;
  answer: string;
  tags: string[];
  is_featured: boolean;
  category_id: string;
  language_code: string;
  sort_order: number;
}

interface FAQCategory {
  id: string;
  name: string;
  slug: string;
  icon: string;
}

const iconMap: Record<string, string> = {
  building: "🏢",
  users: "👥",
  network: "🔗",
  "map-pin": "📍",
  "help-circle": "❓",
  "user": "👤",
  "key": "🔑",
  "shield": "🛡️",
};

interface UsersFAQDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UsersFAQDialog({ open, onOpenChange }: UsersFAQDialogProps) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFaqs, setExpandedFaqs] = useState<Set<string>>(new Set());

  // Fetch categories
  const { data: categories = [] } = useQuery({
    queryKey: ["faq-categories"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("faq_categories")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data as FAQCategory[];
    },
  });

  // Fetch FAQs for users page
  const { data: faqs = [], isLoading } = useQuery({
    queryKey: ["faqs-users", language],
    queryFn: async () => {
      const { data: localizedFaqs, error: localizedError } = await (supabase as any)
        .from("faqs")
        .select("*")
        .eq("is_active", true)
        .eq("page_key", "users")
        .eq("language_code", language)
        .order("sort_order");
      
      if (localizedError) throw localizedError;
      
      if (localizedFaqs && localizedFaqs.length > 0) {
        return localizedFaqs as FAQ[];
      }
      
      const { data: englishFaqs, error: englishError } = await (supabase as any)
        .from("faqs")
        .select("*")
        .eq("is_active", true)
        .eq("page_key", "users")
        .eq("language_code", "en")
        .order("sort_order");
      
      if (englishError) throw englishError;
      
      return (englishFaqs || []) as FAQ[];
    },
  });

  const toggleFaq = (faqId: string) => {
    setExpandedFaqs((prev) => {
      const next = new Set(prev);
      if (next.has(faqId)) {
        next.delete(faqId);
      } else {
        next.add(faqId);
      }
      return next;
    });
  };

  const filteredFaqs = faqs.filter((faq) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      faq.question.toLowerCase().includes(query) ||
      faq.answer.toLowerCase().includes(query) ||
      faq.tags?.some((tag) => tag.toLowerCase().includes(query))
    );
  });

  const getCategoryIcon = (categoryId: string) => {
    const category = categories.find(c => c.id === categoryId);
    return iconMap[category?.icon || "help-circle"] || "❓";
  };

  const featuredFaqs = filteredFaqs.filter((faq) => faq.is_featured);
  const otherFaqs = filteredFaqs.filter((faq) => !faq.is_featured);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
        <SheetHeader className="px-6 py-4 border-b shrink-0">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              {t("faq.title")}
            </SheetTitle>
          </div>
          
          {/* Search */}
          <div className="relative mt-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("faq.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </SheetHeader>
        
        <ScrollArea className="flex-1 px-6 py-4">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : filteredFaqs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <HelpCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>{t("faq.noResults")}</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Featured FAQs */}
              {featuredFaqs.length > 0 && !searchQuery && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <Sparkles className="h-4 w-4 text-amber-500" />
                    {t("faq.featured")}
                  </div>
                  <div className="grid gap-2">
                    {featuredFaqs.map((faq) => (
                      <FAQItem
                        key={faq.id}
                        faq={faq}
                        isExpanded={expandedFaqs.has(faq.id)}
                        onToggle={() => toggleFaq(faq.id)}
                        categoryIcon={getCategoryIcon(faq.category_id)}
                        featured
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Other FAQs */}
              {(searchQuery ? filteredFaqs : otherFaqs).length > 0 && (
                <div className="space-y-3">
                  {!searchQuery && featuredFaqs.length > 0 && (
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                      <HelpCircle className="h-4 w-4" />
                      {t("faq.allQuestions")}
                    </div>
                  )}
                  <div className="grid gap-2">
                    {(searchQuery ? filteredFaqs : otherFaqs).map((faq) => (
                      <FAQItem
                        key={faq.id}
                        faq={faq}
                        isExpanded={expandedFaqs.has(faq.id)}
                        onToggle={() => toggleFaq(faq.id)}
                        categoryIcon={getCategoryIcon(faq.category_id)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function FAQItem({
  faq,
  isExpanded,
  onToggle,
  categoryIcon,
  featured = false,
}: {
  faq: FAQ;
  isExpanded: boolean;
  onToggle: () => void;
  categoryIcon: string;
  featured?: boolean;
}) {
  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <CollapsibleTrigger className="w-full">
        <div
          className={cn(
            "flex items-start gap-3 p-3 rounded-lg text-left transition-colors hover:bg-muted/50",
            isExpanded && "bg-muted/50",
            featured && "border border-amber-200/50 bg-amber-50/30 hover:bg-amber-50/50 dark:bg-amber-950/20 dark:hover:bg-amber-950/30 dark:border-amber-800/30"
          )}
        >
          <span className="text-lg shrink-0 mt-0.5">{categoryIcon}</span>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">{faq.question}</p>
            {!isExpanded && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {faq.answer.substring(0, 80)}...
              </p>
            )}
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform mt-1",
              isExpanded && "rotate-180"
            )}
          />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-3 pb-3 pt-1 ml-9">
          <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
            {faq.answer}
          </p>
          {faq.tags && faq.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {faq.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

