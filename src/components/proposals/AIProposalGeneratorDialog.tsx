import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { searchEntityIds } from "@/lib/clientSearch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/contexts/CompanyContext";
import { useTranslation } from "@/hooks/useTranslation";
import {
  Sparkles, Search, User, Package, Loader2, AlertCircle,
  ChevronRight, Plus, Check,
} from "lucide-react";

const formatCurrency = (value: number) => {
  const fixed = Math.abs(value).toFixed(2);
  const [int, dec] = fixed.split('.');
  return '€' + int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + dec;
};

interface AIProposalItem { description: string; quantity: number; unit_price: number; vat_rate: number; reason: string; }
interface AIProposalResult { title: string; description: string; items: AIProposalItem[]; notes: string; analysis: string; }
interface EntitySearchResult { id: string; display_name: string; type: string; email?: string; lead_count?: number; deal_count?: number; }

interface AIProposalGeneratorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (data: { title: string; description: string; items: AIProposalItem[] }) => void;
}

export function AIProposalGeneratorDialog({ open, onOpenChange, onApply }: AIProposalGeneratorDialogProps) {
  const [step, setStep] = useState<"search" | "generating" | "result">("search");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<EntitySearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<EntitySearchResult | null>(null);
  const [extraContext, setExtraContext] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<AIProposalResult | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const { activeCompany } = useCompany();
  const { toast } = useToast();
  const { t } = useTranslation();

  useEffect(() => { if (!open) { setStep("search"); setSearchTerm(""); setSearchResults([]); setSelectedEntity(null); setExtraContext(""); setResult(null); setSelectedItems(new Set()); setError(null); } }, [open]);

  useEffect(() => {
    if (searchTerm.length < 2) { setSearchResults([]); return; }
    const timeout = setTimeout(async () => {
      setSearching(true);
      try {
        const { ids: matchedIds } = await searchEntityIds(searchTerm);
        if (matchedIds.length === 0) { setSearchResults([]); setSearching(false); return; }
        const { data: entities } = await supabase.from("anew_entities").select("id, display_name, type").in("id", matchedIds).eq("status", "active").limit(10);
        if (!entities || entities.length === 0) { setSearchResults([]); setSearching(false); return; }
        const enriched: EntitySearchResult[] = await Promise.all(entities.map(async (e) => {
          const [emailRes, leadRes, dealRes] = await Promise.all([
            supabase.from("anew_entity_emails").select("email").eq("entity_id", e.id).eq("is_primary", true).maybeSingle(),
            (supabase.from("anew_leads") as any).select("id", { count: "exact", head: true }).eq("entity_id", e.id),
            supabase.from("deals").select("id", { count: "exact", head: true }).eq("entity_id", e.id),
          ]);
          return { ...e, email: emailRes.data?.email || undefined, lead_count: leadRes.count || 0, deal_count: dealRes.count || 0 };
        }));
        setSearchResults(enriched);
      } catch (err) { console.error("Search error:", err); } finally { setSearching(false); }
    }, 400);
    return () => clearTimeout(timeout);
  }, [searchTerm]);

  const handleGenerate = async () => {
    if (!selectedEntity || !activeCompany?.id) return;
    setStep("generating"); setGenerating(true); setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("generate-proposal-ai", { body: { entity_id: selectedEntity.id, organization_id: activeCompany.id, extra_context: extraContext || undefined } });
      if (fnError) throw fnError; if (data?.error) throw new Error(data.error);
      setResult(data as AIProposalResult); setSelectedItems(new Set((data.items || []).map((_: any, i: number) => i))); setStep("result");
    } catch (err: any) { setError(err.message || "Erro ao gerar proposta"); setStep("search"); toast({ title: "Erro", description: err.message, variant: "destructive" }); } finally { setGenerating(false); }
  };

  const handleApply = () => { if (!result) return; onApply({ title: result.title, description: result.description, items: result.items.filter((_, i) => selectedItems.has(i)) }); onOpenChange(false); };
  const toggleItem = (index: number) => { setSelectedItems(prev => { const next = new Set(prev); if (next.has(index)) next.delete(index); else next.add(index); return next; }); };
  const totalSelected = result ? result.items.filter((_, i) => selectedItems.has(i)).reduce((sum, item) => sum + item.quantity * item.unit_price * (1 + item.vat_rate / 100), 0) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><Sparkles className="w-5 h-5 text-primary" />Gerar Proposta com IA</DialogTitle></DialogHeader>
        {step === "search" && (
          <div className="space-y-4">
            <div className="space-y-2"><Label>Pesquisar Contacto / Entidade</Label><div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" /><Input placeholder="Pesquisar por nome..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" /></div></div>
            {searching && <div className="flex items-center gap-2 text-sm text-muted-foreground py-2"><Loader2 className="w-4 h-4 animate-spin" />A pesquisar...</div>}
            {searchResults.length > 0 && (<ScrollArea className="max-h-48"><div className="space-y-1">{searchResults.map((entity) => (<button key={entity.id} onClick={() => { setSelectedEntity(entity); setSearchResults([]); setSearchTerm(entity.display_name); }} className={`w-full flex items-center justify-between p-3 rounded-lg text-left transition-colors hover:bg-accent ${selectedEntity?.id === entity.id ? "bg-accent ring-2 ring-primary" : "bg-muted/30"}`}><div className="flex items-center gap-3"><User className="w-4 h-4 text-muted-foreground" /><div><p className="font-medium text-sm">{entity.display_name}</p>{entity.email && <p className="text-xs text-muted-foreground">{entity.email}</p>}</div></div><div className="flex items-center gap-2">{(entity.lead_count || 0) > 0 && <Badge variant="outline" className="text-xs">{entity.lead_count} leads</Badge>}{(entity.deal_count || 0) > 0 && <Badge variant="outline" className="text-xs">{entity.deal_count} pedidos</Badge>}<ChevronRight className="w-4 h-4 text-muted-foreground" /></div></button>))}</div></ScrollArea>)}
            {selectedEntity && (<><Separator /><div className="p-3 rounded-lg bg-primary/5 border border-primary/20"><div className="flex items-center gap-2 mb-1"><Check className="w-4 h-4 text-primary" /><span className="font-medium text-sm">Contacto selecionado</span></div><p className="text-sm font-semibold">{selectedEntity.display_name}</p></div><div className="space-y-2"><Label>Contexto adicional (opcional)</Label><Textarea placeholder="Ex: O cliente precisa de uma proposta para renovação..." value={extraContext} onChange={(e) => setExtraContext(e.target.value)} rows={3} /></div></>)}
            {error && <div className="flex items-center gap-2 text-sm text-destructive p-3 rounded-lg bg-destructive/10"><AlertCircle className="w-4 h-4" />{error}</div>}
            <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button onClick={handleGenerate} disabled={!selectedEntity}><Sparkles className="w-4 h-4 mr-2" />Gerar Proposta</Button></DialogFooter>
          </div>
        )}
        {step === "generating" && (<div className="flex flex-col items-center justify-center py-12 space-y-4"><Sparkles className="w-12 h-12 text-primary animate-pulse" /><p className="font-medium">A analisar histórico do contacto...</p><Progress value={undefined} className="w-64 [&>div]:animate-pulse" /></div>)}
        {step === "result" && result && (<ScrollArea className="flex-1 -mx-6 px-6 max-h-[60vh]"><div className="space-y-4 pb-4">{result.analysis && <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20"><p className="text-xs font-medium mb-1">Análise do Contacto</p><p className="text-sm">{result.analysis}</p></div>}<div className="space-y-2"><Label className="text-xs text-muted-foreground">Título</Label><p className="font-semibold">{result.title}</p></div><Separator /><div className="space-y-2"><Label className="flex items-center gap-2"><Package className="w-4 h-4" />Itens Sugeridos ({result.items.length})</Label>{result.items.map((item, index) => (<button key={index} onClick={() => toggleItem(index)} className={`w-full text-left p-3 rounded-lg border transition-colors ${selectedItems.has(index) ? "bg-primary/5 border-primary/30" : "bg-muted/20 border-transparent opacity-60"}`}><div className="flex items-start justify-between gap-3"><div className="flex-1 min-w-0"><p className="font-medium text-sm">{item.description}</p><p className="text-xs text-muted-foreground mt-1">{item.quantity}x @ {formatCurrency(item.unit_price)}</p></div><p className="font-semibold text-sm">{formatCurrency(item.quantity * item.unit_price * (1 + item.vat_rate / 100))}</p></div></button>))}</div><Separator /><div className="flex justify-between items-center"><span className="font-medium">Total</span><span className="text-xl font-bold">{formatCurrency(totalSelected)}</span></div></div></ScrollArea>)}
        {step === "result" && (<DialogFooter className="pt-4 border-t"><Button variant="outline" onClick={() => { setStep("search"); setResult(null); }}>Voltar</Button><Button onClick={handleApply} disabled={selectedItems.size === 0}><Plus className="w-4 h-4 mr-2" />Aplicar ({selectedItems.size} itens)</Button></DialogFooter>)}
      </DialogContent>
    </Dialog>
  );
}
