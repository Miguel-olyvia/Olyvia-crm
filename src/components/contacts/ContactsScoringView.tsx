import { useMemo, useState } from "react";
import { calculateHealthScore, type HealthLevel } from "@/hooks/useContactHealthScore";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Phone, Mail, Handshake, AlertTriangle } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { differenceInDays } from "date-fns";

interface ScoringContact {
  id: string;
  entity_id: string;
  status: string;
  assigned_to: string | null;
  last_interaction_at: string | null;
}

interface ContactsScoringViewProps {
  contacts: ScoringContact[];
  interactionCounts: Record<string, number>;
  lastInteractions: Record<string, string>;
  dealsData: Record<string, { count: number; value: number }>;
  assignedUserMap: Map<string, string>;
  getIdentity: (entityId: string) => { display_name?: string; email?: string; phone?: string; vat?: string } | undefined;
  onContactClick: (contact: ScoringContact) => void;
}

const LEVEL_CONFIG: Record<HealthLevel, { label: string; emoji: string; bgColor: string; textColor: string; progressColor: string }> = {
  excellent: { label: "Excelentes", emoji: "🟢", bgColor: "bg-green-50 dark:bg-green-950/20", textColor: "text-green-700 dark:text-green-400", progressColor: "bg-green-500" },
  good: { label: "Bons", emoji: "🔵", bgColor: "bg-blue-50 dark:bg-blue-950/20", textColor: "text-blue-700 dark:text-blue-400", progressColor: "bg-blue-500" },
  attention: { label: "Atenção", emoji: "🟡", bgColor: "bg-yellow-50 dark:bg-yellow-950/20", textColor: "text-yellow-700 dark:text-yellow-400", progressColor: "bg-yellow-500" },
  at_risk: { label: "Em Risco", emoji: "🟠", bgColor: "bg-orange-50 dark:bg-orange-950/20", textColor: "text-orange-700 dark:text-orange-400", progressColor: "bg-orange-500" },
  critical: { label: "Críticos", emoji: "🔴", bgColor: "bg-red-50 dark:bg-red-950/20", textColor: "text-red-700 dark:text-red-400", progressColor: "bg-red-500" },
};

const LEVEL_ORDER: HealthLevel[] = ["critical", "at_risk", "attention", "good", "excellent"];

export function ContactsScoringView({
  contacts, interactionCounts, lastInteractions, dealsData, assignedUserMap, getIdentity, onContactClick
}: ContactsScoringViewProps) {
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["critical", "at_risk", "attention"]));

  const grouped = useMemo(() => {
    const groups: Record<HealthLevel, { contact: ScoringContact; score: ReturnType<typeof calculateHealthScore>; identity: any }[]> = {
      excellent: [], good: [], attention: [], at_risk: [], critical: [],
    };

    contacts.forEach(c => {
      const identity = getIdentity(c.entity_id);
      const hs = calculateHealthScore({
        lastInteractionAt: lastInteractions[c.entity_id] || c.last_interaction_at,
        hasActiveDeal: !!dealsData[c.entity_id]?.count,
        hasEmail: !!identity?.email,
        hasPhone: !!identity?.phone,
        hasVat: !!identity?.vat,
        interactionCount30d: interactionCounts[c.entity_id] || 0,
      });
      groups[hs.level].push({ contact: c, score: hs, identity });
    });

    // Sort each group by score ascending (worst first within critical, etc.)
    Object.keys(groups).forEach(level => {
      groups[level as HealthLevel].sort((a, b) => a.score.score - b.score.score);
    });

    return groups;
  }, [contacts, interactionCounts, lastInteractions, dealsData, getIdentity]);

  const toggleSection = (level: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      next.has(level) ? next.delete(level) : next.add(level);
      return next;
    });
  };

  const getSuggestion = (item: { contact: ScoringContact; score: ReturnType<typeof calculateHealthScore>; identity: any }) => {
    const lastDate = lastInteractions[item.contact.entity_id] || item.contact.last_interaction_at;
    const daysSince = lastDate ? differenceInDays(new Date(), new Date(lastDate)) : 999;
    const hasDeal = !!dealsData[item.contact.entity_id]?.count;

    if (daysSince > 14) return `Sem contacto há ${daysSince} dias — ligar urgentemente`;
    if (!hasDeal && item.score.score >= 40) return "Sem deal associado — criar negócio";
    if (daysSince > 7) return "Agendar follow-up";
    if (!item.identity?.email) return "Adicionar email para melhorar score";
    return null;
  };

  return (
    <div className="space-y-3">
      {LEVEL_ORDER.map(level => {
        const items = grouped[level];
        const config = LEVEL_CONFIG[level];
        if (items.length === 0) return null;

        return (
          <Collapsible key={level} open={openSections.has(level)} onOpenChange={() => toggleSection(level)}>
            <CollapsibleTrigger asChild>
              <button className={`w-full flex items-center justify-between rounded-lg px-4 py-3 text-left transition-colors ${config.bgColor} hover:opacity-90`}>
                <div className="flex items-center gap-2">
                  <span>{config.emoji}</span>
                  <span className={`font-semibold text-sm ${config.textColor}`}>{config.label}</span>
                  <Badge variant="outline" className="text-xs">{items.length}</Badge>
                </div>
                {openSections.has(level) ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="space-y-2 mt-2">
                {items.map(item => {
                  const suggestion = getSuggestion(item);
                  return (
                    <Card key={item.contact.id} className={`cursor-pointer hover:shadow-md transition-shadow ${level === "critical" ? "border-destructive/30" : ""}`}
                      onClick={() => onContactClick(item.contact)}>
                      <CardContent className="p-3">
                        <div className="flex items-center gap-3">
                          {/* Score circle */}
                          <div className={`h-12 w-12 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 ${config.progressColor}`}>
                            {item.score.score}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm truncate">{item.identity?.display_name || "—"}</span>
                              {item.contact.assigned_to && (
                                <span className="text-xs text-muted-foreground">· {assignedUserMap.get(item.contact.assigned_to) || ""}</span>
                              )}
                            </div>
                            {/* Factor bars */}
                            <div className="grid grid-cols-4 gap-1 mt-1.5">
                              <div className="space-y-0.5">
                                <p className="text-[9px] text-muted-foreground">Contacto</p>
                                <Progress value={(item.score.breakdown.lastContact / 25) * 100} className="h-1" />
                              </div>
                              <div className="space-y-0.5">
                                <p className="text-[9px] text-muted-foreground">Deal</p>
                                <Progress value={(item.score.breakdown.dealActivity / 15) * 100} className="h-1" />
                              </div>
                              <div className="space-y-0.5">
                                <p className="text-[9px] text-muted-foreground">Dados</p>
                                <Progress value={(item.score.breakdown.dataCompleteness / 10) * 100} className="h-1" />
                              </div>
                              <div className="space-y-0.5">
                                <p className="text-[9px] text-muted-foreground">Freq.</p>
                                <Progress value={(item.score.breakdown.interactionFrequency / 10) * 100} className="h-1" />
                              </div>
                            </div>
                            {suggestion && (
                              <p className="text-xs text-warning mt-1.5 flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3 shrink-0" />{suggestion}
                              </p>
                            )}
                          </div>
                          {/* Quick icons */}
                          <div className="flex gap-1 shrink-0">
                            {item.identity?.phone && <Phone className="h-3.5 w-3.5 text-muted-foreground" />}
                            {item.identity?.email && <Mail className="h-3.5 w-3.5 text-muted-foreground" />}
                            {dealsData[item.contact.entity_id]?.count > 0 && <Handshake className="h-3.5 w-3.5 text-muted-foreground" />}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
}
