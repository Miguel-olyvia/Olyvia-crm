import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BookOpen, ChevronDown, Search, Sparkles, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";

interface FAQ {
  id: string;
  question: string;
  answer: string;
  tags: string[];
  is_featured: boolean;
  category_id: string;
  subcategory_id: string | null;
}

interface FAQCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string;
}

interface FAQSubcategory {
  id: string;
  category_id: string;
  name: string;
  slug: string;
}

const iconMap: Record<string, string> = {
  building: "🏢",
  users: "👥",
  network: "🔗",
  "map-pin": "📍",
  "layout-template": "📋",
  "git-branch": "📊",
  "help-circle": "❓",
};

interface OrganizationsFAQDialogProps {
  className?: string;
}

export function OrganizationsFAQDialog({ className }: OrganizationsFAQDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedFaqs, setExpandedFaqs] = useState<Set<string>>(new Set());

  // Fetch categories
  const { data: categories = [], isLoading: categoriesLoading } = useQuery({
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
    enabled: open,
  });

  // Fetch subcategories
  const { data: subcategories = [] } = useQuery({
    queryKey: ["faq-subcategories"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("faq_subcategories")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data as FAQSubcategory[];
    },
    enabled: open,
  });

  // Fetch FAQs
  const { data: faqs = [], isLoading: faqsLoading } = useQuery({
    queryKey: ["faqs"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("faqs")
        .select("*")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data as FAQ[];
    },
    enabled: open,
  });

  const toggleCategory = (categoryId: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

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

  // Filter FAQs by search
  const filteredFaqs = faqs.filter((faq) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      faq.question.toLowerCase().includes(query) ||
      faq.answer.toLowerCase().includes(query) ||
      faq.tags?.some((tag) => tag.toLowerCase().includes(query))
    );
  });

  // Get FAQs for a category
  const getFaqsForCategory = (categoryId: string) => {
    return filteredFaqs.filter((faq) => faq.category_id === categoryId);
  };

  // Get featured FAQs
  const featuredFaqs = filteredFaqs.filter((faq) => faq.is_featured);

  const isLoading = categoriesLoading || faqsLoading;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("h-9 w-9 rounded-full shrink-0", className)}
          title={t("common.help")}
        >
          <BookOpen className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[540px] sm:max-w-xl p-0">
        <div className="p-6 pb-4 border-b bg-gradient-to-br from-primary/5 to-transparent">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-primary" />
              {t("faq.title")}
            </SheetTitle>
            <SheetDescription>{t("faq.description")}</SheetDescription>
          </SheetHeader>

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
        </div>

        <ScrollArea className="h-[calc(100vh-180px)]">
          <div className="p-6 space-y-6">
            {isLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-6 w-40" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ))}
              </div>
            ) : (
              <>
                {/* Featured FAQs */}
                {featuredFaqs.length > 0 && !searchQuery && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-amber-500" />
                      <h3 className="font-semibold text-sm">{t("faq.featured")}</h3>
                    </div>
                    <div className="space-y-2">
                      {featuredFaqs.slice(0, 3).map((faq) => (
                        <FAQItem
                          key={faq.id}
                          faq={faq}
                          isExpanded={expandedFaqs.has(faq.id)}
                          onToggle={() => toggleFaq(faq.id)}
                          featured
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Categories */}
                {categories.map((category) => {
                  const categoryFaqs = getFaqsForCategory(category.id);
                  if (categoryFaqs.length === 0 && searchQuery) return null;

                  return (
                    <Collapsible
                      key={category.id}
                      open={expandedCategories.has(category.id) || !!searchQuery}
                      onOpenChange={() => toggleCategory(category.id)}
                    >
                      <CollapsibleTrigger asChild>
                        <button className="flex items-center justify-between w-full p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group">
                          <div className="flex items-center gap-3">
                            <span className="text-xl">{iconMap[category.icon] || "📁"}</span>
                            <div className="text-left">
                              <h3 className="font-semibold">{category.name}</h3>
                              {category.description && (
                                <p className="text-xs text-muted-foreground">{category.description}</p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="text-xs">
                              {categoryFaqs.length}
                            </Badge>
                            <ChevronDown
                              className={cn(
                                "h-4 w-4 text-muted-foreground transition-transform",
                                (expandedCategories.has(category.id) || searchQuery) && "rotate-180"
                              )}
                            />
                          </div>
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="pt-3 pl-4 space-y-2">
                          {categoryFaqs.map((faq) => (
                            <FAQItem
                              key={faq.id}
                              faq={faq}
                              isExpanded={expandedFaqs.has(faq.id)}
                              onToggle={() => toggleFaq(faq.id)}
                            />
                          ))}
                          {categoryFaqs.length === 0 && (
                            <p className="text-sm text-muted-foreground py-2">
                              {t("faq.noFaqsInCategory")}
                            </p>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}

                {/* No results */}
                {searchQuery && filteredFaqs.length === 0 && (
                  <div className="text-center py-8">
                    <HelpCircle className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
                    <p className="text-muted-foreground">{t("faq.noResults")}</p>
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

interface FAQItemProps {
  faq: FAQ;
  isExpanded: boolean;
  onToggle: () => void;
  featured?: boolean;
}

function FAQItem({ faq, isExpanded, onToggle, featured }: FAQItemProps) {
  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <CollapsibleTrigger asChild>
        <button
          className={cn(
            "flex items-start justify-between w-full p-3 rounded-lg text-left transition-colors",
            featured
              ? "bg-amber-50 hover:bg-amber-100 border border-amber-200"
              : "bg-background hover:bg-muted/50 border"
          )}
        >
          <span className="font-medium text-sm pr-4">{faq.question}</span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground shrink-0 mt-0.5 transition-transform",
              isExpanded && "rotate-180"
            )}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-3 pb-3 pt-2">
          <p className="text-sm text-muted-foreground leading-relaxed">{faq.answer}</p>
          {faq.tags && faq.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-3">
              {faq.tags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-xs">
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
