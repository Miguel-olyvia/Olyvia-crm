import { useState, useEffect } from "react";
import { HelpCircle, X, BookOpen, ChevronRight } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface HelpArticle {
  id: string;
  page_key: string;
  title: string;
  description: string | null;
  content: string;
  category: string;
  icon: string;
}

interface HelpArticleSection {
  id: string;
  title: string;
  content: string;
  sort_order: number;
}

interface HelpButtonProps {
  pageKey: string;
  className?: string;
}

// Simple markdown renderer
const renderMarkdown = (content: string) => {
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeContent = '';
  let codeLanguage = '';

  lines.forEach((line, index) => {
    // Code block start/end
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre key={index} className="bg-muted p-3 rounded-lg overflow-x-auto text-sm my-2">
            <code>{codeContent}</code>
          </pre>
        );
        codeContent = '';
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeLanguage = line.slice(3);
      }
      return;
    }

    if (inCodeBlock) {
      codeContent += line + '\n';
      return;
    }

    // Headers
    if (line.startsWith('### ')) {
      elements.push(
        <h4 key={index} className="font-semibold text-base mt-4 mb-2">{line.slice(4)}</h4>
      );
    } else if (line.startsWith('## ')) {
      elements.push(
        <h3 key={index} className="font-semibold text-lg mt-6 mb-3 text-primary">{line.slice(3)}</h3>
      );
    } else if (line.startsWith('# ')) {
      elements.push(
        <h2 key={index} className="font-bold text-xl mb-4">{line.slice(2)}</h2>
      );
    }
    // List items
    else if (line.startsWith('- ')) {
      elements.push(
        <li key={index} className="ml-4 flex items-start gap-2 my-1">
          <ChevronRight className="h-4 w-4 mt-1 text-primary flex-shrink-0" />
          <span>{line.slice(2)}</span>
        </li>
      );
    }
    // Inline code
    else if (line.includes('`') && !line.startsWith('```')) {
      const parts = line.split(/`([^`]+)`/g);
      elements.push(
        <p key={index} className="my-1">
          {parts.map((part, i) =>
            i % 2 === 1 ? (
              <code key={i} className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono">
                {part}
              </code>
            ) : (
              part
            )
          )}
        </p>
      );
    }
    // Empty lines
    else if (line.trim() === '') {
      elements.push(<div key={index} className="h-2" />);
    }
    // Regular paragraphs
    else {
      elements.push(
        <p key={index} className="my-1 text-muted-foreground">{line}</p>
      );
    }
  });

  return elements;
};

export function HelpButton({ pageKey, className }: HelpButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [article, setArticle] = useState<HelpArticle | null>(null);
  const [sections, setSections] = useState<HelpArticleSection[]>([]);

  useEffect(() => {
    if (open && !article) {
      loadArticle();
    }
  }, [open, pageKey]);

  const loadArticle = async () => {
    setLoading(true);
    try {
      const { data: articleData, error: articleError } = await supabase
        .from("help_articles")
        .select("*")
        .eq("page_key", pageKey)
        .eq("is_active", true)
        .single();

      if (articleError) throw articleError;

      setArticle(articleData);

      // Load sections
      const { data: sectionsData } = await supabase
        .from("help_article_sections")
        .select("*")
        .eq("article_id", articleData.id)
        .order("sort_order");

      setSections(sectionsData || []);
    } catch (error) {
      console.error("Error loading help article:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={`h-8 w-8 rounded-full shrink-0 ${className || ''}`}
          title="Ajuda"
        >
          <HelpCircle className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[540px] sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            {loading ? "A carregar..." : article?.title || "Documentação"}
          </SheetTitle>
          {article?.description && (
            <SheetDescription>{article.description}</SheetDescription>
          )}
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-120px)] mt-6 pr-4">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-6 w-1/2 mt-6" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          ) : article ? (
            <div className="prose prose-sm max-w-none">
              <Badge variant="secondary" className="mb-4">
                {article.category}
              </Badge>
              
              {renderMarkdown(article.content)}

              {sections.length > 0 && (
                <div className="mt-8 pt-6 border-t space-y-6">
                  {sections.map((section) => (
                    <div key={section.id}>
                      <h3 className="font-semibold text-lg mb-2">{section.title}</h3>
                      {renderMarkdown(section.content)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <HelpCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Documentação não disponível para esta página.</p>
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
