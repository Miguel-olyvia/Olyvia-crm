import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import Layout from "@/components/Layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Globe, Copy, Check, Filter, Loader2 } from "lucide-react";
import { translations } from "@/translations/index";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Language = 'en' | 'pt' | 'es' | 'fr' | 'de';

const LANGUAGE_LABELS: Record<Language, string> = {
  en: 'English',
  pt: 'Português',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
};

const LANGUAGE_FLAGS: Record<Language, string> = {
  en: '🇬🇧',
  pt: '🇵🇹',
  es: '🇪🇸',
  fr: '🇫🇷',
  de: '🇩🇪',
};

const PAGE_SIZE = 10;

export default function DocsTranslations() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [showMissingOnly, setShowMissingOnly] = useState(false);
  const [missingLanguageFilter, setMissingLanguageFilter] = useState<Language | "all">("all");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [displayedCount, setDisplayedCount] = useState(PAGE_SIZE);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Get all translation keys from English (base language)
  const allKeys = useMemo(() => {
    return Object.keys(translations.en);
  }, []);

  // Extract categories from keys (e.g., "nav.features" -> "nav")
  const categories = useMemo(() => {
    const cats = new Set<string>();
    allKeys.forEach(key => {
      const category = key.split('.')[0];
      cats.add(category);
    });
    return Array.from(cats).sort();
  }, [allKeys]);

  // Check if a translation is missing
  const isMissing = (key: string, lang: Language): boolean => {
    return !(translations[lang] as Record<string, string>)[key];
  };

  // Check if a key is missing for any or specific language
  const isKeyMissingForFilter = (key: string): boolean => {
    if (!showMissingOnly) return true;
    if (missingLanguageFilter === "all") {
      return (['en', 'pt', 'es', 'fr', 'de'] as Language[]).some(lang => isMissing(key, lang));
    }
    return isMissing(key, missingLanguageFilter);
  };

  // Filter keys based on search, category, and missing filter
  const filteredKeys = useMemo(() => {
    return allKeys.filter(key => {
      const matchesSearch = searchQuery === "" || 
        key.toLowerCase().includes(searchQuery.toLowerCase()) ||
        Object.values(translations).some(lang => 
          (lang as Record<string, string>)[key]?.toLowerCase().includes(searchQuery.toLowerCase())
        );
      
      const matchesCategory = selectedCategory === "all" || 
        key.startsWith(selectedCategory + ".");

      const matchesMissingFilter = isKeyMissingForFilter(key);
      
      return matchesSearch && matchesCategory && matchesMissingFilter;
    });
  }, [allKeys, searchQuery, selectedCategory, showMissingOnly, missingLanguageFilter]);

  // Reset displayed count when filters change
  useEffect(() => {
    setDisplayedCount(PAGE_SIZE);
  }, [searchQuery, selectedCategory, showMissingOnly, missingLanguageFilter]);

  // Paginated keys for display
  const paginatedKeys = useMemo(() => {
    return filteredKeys.slice(0, displayedCount);
  }, [filteredKeys, displayedCount]);

  const hasMore = displayedCount < filteredKeys.length;

  // Load more function (simulates server-side loading)
  const loadMore = useCallback(async () => {
    if (isLoading || !hasMore) return;
    
    setIsLoading(true);
    // Simulate server delay
    await new Promise(resolve => setTimeout(resolve, 300));
    setDisplayedCount(prev => Math.min(prev + PAGE_SIZE, filteredKeys.length));
    setIsLoading(false);
  }, [isLoading, hasMore, filteredKeys.length]);

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [hasMore, isLoading, loadMore]);

  // Group keys by category for display (paginated)
  const groupedKeys = useMemo(() => {
    const groups: Record<string, string[]> = {};
    paginatedKeys.forEach(key => {
      const category = key.split('.')[0];
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(key);
    });
    return groups;
  }, [paginatedKeys]);

  // Count missing translations per language
  const missingCounts = useMemo(() => {
    const counts: Record<Language, number> = { en: 0, pt: 0, es: 0, fr: 0, de: 0 };
    allKeys.forEach(key => {
      (['en', 'pt', 'es', 'fr', 'de'] as Language[]).forEach(lang => {
        if (isMissing(key, lang)) {
          counts[lang]++;
        }
      });
    });
    return counts;
  }, [allKeys]);

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(`t('${key}')`);
    setCopiedKey(key);
    toast({
      title: "Copiado!",
      description: `t('${key}') copiado para a área de transferência`,
    });
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <>
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Globe className="h-8 w-8" />
              Gestão de Traduções
            </h1>
            <p className="text-muted-foreground mt-1">
              Visualize e gerencie todas as variáveis de tradução do sistema
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{allKeys.length}</div>
              <p className="text-sm text-muted-foreground">Total de Chaves</p>
            </CardContent>
          </Card>
          {(['en', 'pt', 'es', 'fr', 'de'] as Language[]).map(lang => (
            <Card key={lang}>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{LANGUAGE_FLAGS[lang]}</span>
                  <div>
                    <div className="text-lg font-bold">
                      {allKeys.length - missingCounts[lang]}
                      <span className="text-sm font-normal text-muted-foreground">
                        /{allKeys.length}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{LANGUAGE_LABELS[lang]}</p>
                  </div>
                </div>
                {missingCounts[lang] > 0 && (
                  <Badge variant="destructive" className="mt-2 text-xs">
                    {missingCounts[lang]} em falta
                  </Badge>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Pesquisar por chave ou valor..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-full md:w-[200px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as Categorias</SelectItem>
                  {categories.map(cat => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="showMissingOnly"
                  checked={showMissingOnly}
                  onChange={(e) => setShowMissingOnly(e.target.checked)}
                  className="h-4 w-4"
                />
                <label htmlFor="showMissingOnly" className="text-sm whitespace-nowrap">
                  Apenas em falta
                </label>
              </div>
              {showMissingOnly && (
                <Select value={missingLanguageFilter} onValueChange={(v) => setMissingLanguageFilter(v as Language | "all")}>
                  <SelectTrigger className="w-full md:w-[150px]">
                    <SelectValue placeholder="Idioma" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os idiomas</SelectItem>
                    {(['en', 'pt', 'es', 'fr', 'de'] as Language[]).map(lang => (
                      <SelectItem key={lang} value={lang}>
                        {LANGUAGE_FLAGS[lang]} {LANGUAGE_LABELS[lang]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Translations Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Variáveis de Tradução ({paginatedKeys.length} de {filteredKeys.length} resultados)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="table" className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="table">Tabela</TabsTrigger>
                <TabsTrigger value="grouped">Por Categoria</TabsTrigger>
              </TabsList>

              <TabsContent value="table">
                <div className="border rounded-lg overflow-hidden" ref={scrollContainerRef}>
                  <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[250px] sticky left-0 top-0 bg-background z-10">Chave</TableHead>
                          <TableHead className="min-w-[200px] sticky top-0 bg-background">
                            {LANGUAGE_FLAGS.en} English
                          </TableHead>
                          <TableHead className="min-w-[200px] sticky top-0 bg-background">
                            {LANGUAGE_FLAGS.pt} Português
                          </TableHead>
                          <TableHead className="min-w-[200px] sticky top-0 bg-background">
                            {LANGUAGE_FLAGS.es} Español
                          </TableHead>
                          <TableHead className="min-w-[200px] sticky top-0 bg-background">
                            {LANGUAGE_FLAGS.fr} Français
                          </TableHead>
                          <TableHead className="min-w-[200px] sticky top-0 bg-background">
                            {LANGUAGE_FLAGS.de} Deutsch
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paginatedKeys.map((key) => (
                          <TableRow key={key}>
                            <TableCell className="font-mono text-sm sticky left-0 bg-background">
                              <div className="flex items-center gap-2">
                                <code className="bg-muted px-2 py-1 rounded text-xs">
                                  {key}
                                </code>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => handleCopyKey(key)}
                                >
                                  {copiedKey === key ? (
                                    <Check className="h-3 w-3 text-green-500" />
                                  ) : (
                                    <Copy className="h-3 w-3" />
                                  )}
                                </Button>
                              </div>
                            </TableCell>
                            {(['en', 'pt', 'es', 'fr', 'de'] as Language[]).map(lang => (
                              <TableCell key={lang} className="text-sm">
                                {isMissing(key, lang) ? (
                                  <Badge variant="outline" className="text-amber-500 border-amber-500">
                                    Em falta
                                  </Badge>
                                ) : (
                                  <span className="line-clamp-2">
                                    {(translations[lang] as Record<string, string>)[key]}
                                  </span>
                                )}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    
                    {/* Load More Trigger for infinite scroll */}
                    <div ref={loadMoreRef} className="h-4" />
                  </div>
                  
                  {/* Load More Button and Status */}
                  <div className="p-4 border-t flex flex-col items-center gap-2">
                    <p className="text-sm text-muted-foreground">
                      A mostrar {paginatedKeys.length} de {filteredKeys.length} resultados
                    </p>
                    {hasMore && (
                      <Button
                        variant="outline"
                        onClick={loadMore}
                        disabled={isLoading}
                        className="min-w-[150px]"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            A carregar...
                          </>
                        ) : (
                          `Carregar mais (${Math.min(PAGE_SIZE, filteredKeys.length - displayedCount)})`
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="grouped">
                <div className="space-y-6">
                  {Object.entries(groupedKeys).map(([category, keys]) => (
                    <Card key={category}>
                      <CardHeader className="py-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Badge variant="secondary">{category}</Badge>
                          <span className="text-muted-foreground font-normal">
                            {keys.length} chaves
                          </span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-2">
                          {keys.map((key) => (
                            <div
                              key={key}
                              className="p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                            >
                              <div className="flex items-center justify-between mb-2">
                                <code className="bg-muted px-2 py-1 rounded text-xs font-mono">
                                  {key}
                                </code>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleCopyKey(key)}
                                >
                                  {copiedKey === key ? (
                                    <Check className="h-3 w-3 mr-1 text-green-500" />
                                  ) : (
                                    <Copy className="h-3 w-3 mr-1" />
                                  )}
                                  Copiar
                                </Button>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
                                {(['en', 'pt', 'es', 'fr', 'de'] as Language[]).map(lang => (
                                  <div key={lang} className="space-y-1">
                                    <span className="text-xs text-muted-foreground">
                                      {LANGUAGE_FLAGS[lang]} {LANGUAGE_LABELS[lang]}
                                    </span>
                                    <p className="text-xs line-clamp-2">
                                      {isMissing(key, lang) ? (
                                        <span className="text-amber-500">Em falta</span>
                                      ) : (
                                        (translations[lang] as Record<string, string>)[key]
                                      )}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>

        {/* Usage Guide */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Como Usar</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">1. Importar o hook de tradução</h3>
              <code className="bg-muted px-3 py-2 rounded block text-sm">
                {`import { useTranslation } from "@/hooks/useTranslation";`}
              </code>
            </div>
            <div>
              <h3 className="font-semibold mb-2">2. Usar no componente</h3>
              <code className="bg-muted px-3 py-2 rounded block text-sm whitespace-pre">
{`const { t } = useTranslation();

return <h1>{t('common.welcome')}</h1>;`}
              </code>
            </div>
            <div>
              <h3 className="font-semibold mb-2">3. Adicionar nova tradução</h3>
              <p className="text-sm text-muted-foreground">
                Edite o ficheiro <code className="bg-muted px-1 rounded">src/translations/index.ts</code> e adicione a nova chave em todos os idiomas (en, pt, es, fr, de).
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}