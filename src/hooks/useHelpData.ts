import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";

export interface HelpWorkflowStep {
  id: string;
  step_number: number;
  icon: string;
  title: string;
  description: string;
}

export interface HelpQuickTip {
  id: string;
  icon: string;
  color: string;
  label: string;
  title: string;
  sort_order: number;
}

export interface HelpFaq {
  id: string;
  category: string;
  question: string;
  answer: string;
  icon: string;
  sort_order: number;
}

export interface HelpArticle {
  id: string;
  page_key: string;
  title: string;
  description: string;
  content: string;
  category: string;
  icon: string;
}

export const useHelpData = (pageKey: string) => {
  const { language } = useLanguage();
  const [workflowSteps, setWorkflowSteps] = useState<HelpWorkflowStep[]>([]);
  const [quickTips, setQuickTips] = useState<HelpQuickTip[]>([]);
  const [faqs, setFaqs] = useState<HelpFaq[]>([]);
  const [article, setArticle] = useState<HelpArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHelpData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch workflow steps - try current language, fallback to English
        const { data: stepsData, error: stepsError } = await supabase
          .from("help_workflow_steps")
          .select("id, step_number, icon, title, description, language_code")
          .eq("page_key", pageKey)
          .eq("is_active", true)
          .or(`language_code.eq.${language},language_code.eq.en`)
          .order("step_number", { ascending: true });

        if (stepsError) throw stepsError;

        // Group by step_number and prefer current language
        const stepsMap = new Map<number, HelpWorkflowStep>();
        stepsData?.forEach((step: any) => {
          const existing = stepsMap.get(step.step_number);
          if (!existing || step.language_code === language) {
            stepsMap.set(step.step_number, step);
          }
        });
        setWorkflowSteps(Array.from(stepsMap.values()).sort((a, b) => a.step_number - b.step_number));

        // Fetch quick tips
        const { data: tipsData, error: tipsError } = await supabase
          .from("help_quick_tips")
          .select("id, icon, color, label, title, sort_order, language_code")
          .eq("page_key", pageKey)
          .eq("is_active", true)
          .or(`language_code.eq.${language},language_code.eq.en`)
          .order("sort_order", { ascending: true });

        if (tipsError) throw tipsError;

        // Group by sort_order and prefer current language
        const tipsMap = new Map<number, HelpQuickTip>();
        tipsData?.forEach((tip: any) => {
          const existing = tipsMap.get(tip.sort_order);
          if (!existing || tip.language_code === language) {
            tipsMap.set(tip.sort_order, tip);
          }
        });
        setQuickTips(Array.from(tipsMap.values()).sort((a, b) => a.sort_order - b.sort_order));

        // Fetch FAQs
        const { data: faqsData, error: faqsError } = await supabase
          .from("help_faqs")
          .select("id, category, question, answer, icon, sort_order, language_code")
          .eq("page_key", pageKey)
          .eq("is_active", true)
          .or(`language_code.eq.${language},language_code.eq.en`)
          .order("category", { ascending: true })
          .order("sort_order", { ascending: true });

        if (faqsError) throw faqsError;

        // Group by category+sort_order and prefer current language
        const faqsMap = new Map<string, HelpFaq>();
        faqsData?.forEach((faq: any) => {
          const key = `${faq.category}-${faq.sort_order}`;
          const existing = faqsMap.get(key);
          if (!existing || faq.language_code === language) {
            faqsMap.set(key, faq);
          }
        });
        setFaqs(Array.from(faqsMap.values()));

        // Fetch article
        const { data: articleData, error: articleError } = await supabase
          .from("help_articles")
          .select("id, page_key, title, description, content, category, icon, language_code")
          .eq("page_key", pageKey)
          .eq("is_active", true)
          .or(`language_code.eq.${language},language_code.eq.en`)
          .order("language_code", { ascending: false }) // Prefer non-English first if available
          .limit(1)
          .maybeSingle();

        if (articleError) throw articleError;
        setArticle(articleData);

      } catch (err: any) {
        console.error("Error fetching help data:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchHelpData();
  }, [pageKey, language]);

  return {
    workflowSteps,
    quickTips,
    faqs,
    article,
    loading,
    error,
    hasData: workflowSteps.length > 0 || quickTips.length > 0 || faqs.length > 0 || article !== null,
  };
};
