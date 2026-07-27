import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronDown, Search, HelpCircle, BookOpen, MessageSquareText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "@/hooks/useTranslation";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";

interface FAQ {
  id: string;
  question: string;
  answer: string;
  category: string;
  icon: string;
  language_code: string;
  sort_order: number;
}

const iconMap: Record<string, string> = {
  building: "🏢",
  users: "👥",
  network: "🔗",
  "map-pin": "📍",
  "help-circle": "❓",
  "file-search": "🔍",
  "file-text": "📄",
  calculator: "🧮",
};

interface PageFAQSheetProps {
  pageKey: string;
}

export function PageFAQSheet({ pageKey }: PageFAQSheetProps) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFaqs, setExpandedFaqs] = useState<Set<string>>(new Set());

  const { data: faqs = [], isLoading } = useQuery({
    queryKey: ["faqs-page", pageKey, language],
    queryFn: async () => {
      const { data: localizedFaqs, error } = await supabase
        .from("help_faqs")
        .select("id, question, answer, category, icon, language_code, sort_order")
        .eq("is_active", true)
        .eq("page_key", pageKey)
        .eq("language_code", language)
        .order("sort_order");

      if (error) throw error;

      if (localizedFaqs && localizedFaqs.length > 0) {
        return localizedFaqs as FAQ[];
      }

      // Fallback: try Portuguese first, then English
      const fallbackLangs = language === "pt" ? ["en"] : ["pt", "en"];
      for (const fallbackLang of fallbackLangs) {
        const { data: fallbackFaqs, error: fbError } = await supabase
          .from("help_faqs")
          .select("id, question, answer, category, icon, language_code, sort_order")
          .eq("is_active", true)
          .eq("page_key", pageKey)
          .eq("language_code", fallbackLang)
          .order("sort_order");
        if (fbError) throw fbError;
        if (fallbackFaqs && fallbackFaqs.length > 0) {
          return fallbackFaqs as FAQ[];
        }
      }
      return [] as FAQ[];
    },
    enabled: open,
  });

  const toggleFaq = (faqId: string) => {
    setExpandedFaqs((prev) => {
      const next = new Set(prev);
      if (next.has(faqId)) next.delete(faqId);
      else next.add(faqId);
      return next;
    });
  };

  const filteredFaqs = faqs.filter((faq) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      faq.question.toLowerCase().includes(query) ||
      faq.answer.toLowerCase().includes(query)
    );
  });

  const getCategoryIcon = (faq: FAQ) => iconMap[faq.icon] || iconMap[faq.category] || "❓";

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        title={t("faq.title")}
      >
        <MessageSquareText className="h-4 w-4 mr-2" />
        FAQ
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-[70vw] min-w-[500px] max-w-[900px] overflow-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              {t("faq.title")}
            </SheetTitle>
          </SheetHeader>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("faq.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : filteredFaqs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <HelpCircle className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>{t("faq.noResults")}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-2">
                {filteredFaqs.map((faq) => (
                  <FAQItem
                    key={faq.id}
                    faq={faq}
                    isExpanded={expandedFaqs.has(faq.id)}
                    onToggle={() => toggleFaq(faq.id)}
                    categoryIcon={getCategoryIcon(faq)}
                  />
                ))}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function FAQItem({
  faq,
  isExpanded,
  onToggle,
  categoryIcon,
}: {
  faq: FAQ;
  isExpanded: boolean;
  onToggle: () => void;
  categoryIcon: string;
}) {
  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <CollapsibleTrigger className="w-full">
        <div
          className={cn(
            "flex items-start gap-3 p-3 rounded-lg text-left transition-colors hover:bg-muted/50",
            isExpanded && "bg-muted/50"
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
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
