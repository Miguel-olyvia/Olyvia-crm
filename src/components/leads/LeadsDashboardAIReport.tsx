import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sparkles, RefreshCw, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

// Debounce window for auto-regeneration when the underlying KPIs change
// (date range, status filter, assignee drill-down, etc.) — long enough to
// absorb a burst of quick filter clicks without firing a request per click.
const AUTO_GENERATE_DEBOUNCE_MS = 1200;

/**
 * Request/response contract for supabase/functions/leads-dashboard-ai-report
 * (see that file's PayloadSchema) — kept as a local type instead of importing
 * from the Deno function (different runtime/module graph).
 */
export interface AIReportKpis {
  totalLeads: number;
  leadsInPeriod: number;
  leadsToday: number;
  todayInRange?: boolean;
  pendingLeads: number;
  contactedLeads: number;
  qualifiedLeads: number;
  convertedLeads: number;
  cohortConversions: number;
  conversionRate: number | string;
  avgLeadsPerDay: number | string;
  visitsScheduled: number;
  totalGrowth?: number;
}

export interface AIReportTopAssignee {
  name: string;
  count: number;
}

export interface AIReportEvolutionPoint {
  date: string;
  leads: number;
}

export interface AIReportStatusEntry {
  name: string;
  value: number;
}

interface LeadsDashboardAIReportProps {
  organizationId: string | null | undefined;
  periodLabel: string;
  periodMode: "range" | "global";
  assigneeName?: string | null;
  kpis: AIReportKpis;
  topAssignees?: AIReportTopAssignee[];
  evolution?: AIReportEvolutionPoint[];
  statusDistribution?: AIReportStatusEntry[];
}

interface AIReportResponse {
  report?: string;
}

/**
 * Very small Markdown-to-JSX renderer for the report's known shape (##
 * headings, "- " bullets, blank-line-separated paragraphs). The report is
 * always our own AI-generated Markdown (see the edge function's systemPrompt),
 * not arbitrary user input, but this still avoids pulling in a new dependency
 * (no react-markdown in this repo — see package.json) or using
 * dangerouslySetInnerHTML.
 */
function renderReportMarkdown(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: JSX.Element[] = [];
  let listBuffer: string[] = [];

  const flushList = (key: string) => {
    if (listBuffer.length === 0) return;
    blocks.push(
      <ul key={key} className="list-disc ml-5 space-y-1 text-sm text-foreground">
        {listBuffer.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>,
    );
    listBuffer = [];
  };

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    const key = `line-${index}`;

    if (line.startsWith("## ")) {
      flushList(`list-${key}`);
      blocks.push(
        <h3 key={key} className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mt-4 first:mt-0">
          {line.slice(3)}
        </h3>,
      );
      return;
    }

    if (line.startsWith("- ") || line.startsWith("* ")) {
      listBuffer.push(line.slice(2));
      return;
    }

    flushList(`list-${key}`);

    if (line.length === 0) return;

    blocks.push(
      <p key={key} className="text-sm text-foreground leading-relaxed">
        {line}
      </p>,
    );
  });

  flushList("list-final");

  return blocks;
}

/** Extracts the raw backend error message (edge function's `{error}` body when present), without any friendly-language mapping — used only for the collapsed debug details. */
async function extractRawErrorMessage(error: unknown): Promise<string> {
  const e = error as { context?: { json?: () => Promise<unknown>; text?: () => Promise<string> }; message?: string };
  try {
    if (e?.context?.json) {
      const body = (await e.context.json()) as { error?: string; message?: string };
      if (body?.error) return body.error;
      if (body?.message) return body.message;
    } else if (e?.context?.text) {
      const text = await e.context.text();
      if (text) {
        try {
          const parsed = JSON.parse(text) as { error?: string; message?: string };
          if (parsed?.error) return parsed.error;
          if (parsed?.message) return parsed.message;
        } catch {
          return text;
        }
      }
    }
  } catch {
    // fall through to message/string below
  }
  if (e?.message) return e.message;
  return typeof error === "string" ? error : "Erro desconhecido.";
}

export function LeadsDashboardAIReport({
  organizationId,
  periodLabel,
  periodMode,
  assigneeName,
  kpis,
  topAssignees,
  evolution,
  statusDistribution,
}: LeadsDashboardAIReportProps) {
  const [report, setReport] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [rawError, setRawError] = useState<string | null>(null);
  const requestSeqRef = useRef(0);

  // Serialized request body drives both the auto-generate debounce effect and
  // the manual regenerate handler, so the two never build the payload
  // differently.
  const requestBody = useMemo(
    () => ({
      organization_id: organizationId,
      periodLabel,
      periodMode,
      assigneeName: assigneeName ?? null,
      kpis,
      topAssignees: topAssignees ?? [],
      evolution: evolution ?? [],
      statusDistribution: statusDistribution ?? [],
    }),
    [organizationId, periodLabel, periodMode, assigneeName, kpis, topAssignees, evolution, statusDistribution],
  );
  const requestBodyKey = useMemo(() => JSON.stringify(requestBody), [requestBody]);

  const generateReport = useCallback(async () => {
    if (!organizationId) return;

    const seq = ++requestSeqRef.current;
    setLoading(true);
    setErrorMessage(null);
    setRawError(null);

    try {
      const { data, error } = await supabase.functions.invoke<AIReportResponse>("leads-dashboard-ai-report", {
        body: requestBody,
      });

      if (requestSeqRef.current !== seq) return;

      if (error) {
        const raw = await extractRawErrorMessage(error);
        setErrorMessage("Relatório de IA indisponível de momento.");
        setRawError(raw);
        setReport(null);
        return;
      }

      if (!data?.report) {
        setErrorMessage("Relatório de IA indisponível de momento.");
        setRawError("A resposta do gerador de relatórios não incluiu conteúdo.");
        setReport(null);
        return;
      }

      setReport(data.report);
    } catch (err) {
      if (requestSeqRef.current !== seq) return;
      setErrorMessage("Relatório de IA indisponível de momento.");
      setRawError(err instanceof Error ? err.message : "Erro desconhecido.");
      setReport(null);
    } finally {
      if (requestSeqRef.current === seq) setLoading(false);
    }
    // requestBody is intentionally excluded — requestBodyKey (its stable
    // serialization) is the real dependency, used by the debounce effect
    // below so generateReport itself does not need to change identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, requestBodyKey]);

  useEffect(() => {
    if (!organizationId) return;

    const timer = setTimeout(() => {
      generateReport();
    }, AUTO_GENERATE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
    // Debounced auto-generation whenever the underlying KPI payload changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, requestBodyKey]);

  if (!organizationId) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Relatório de IA
            </CardTitle>
            <CardDescription>Leitura executiva gerada automaticamente a partir dos KPIs actuais</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => generateReport()}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            {report || errorMessage ? "Regenerar" : "Gerar relatório"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && (
          <div className="space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        )}

        {!loading && errorMessage && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">{errorMessage}</p>
            {rawError && (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground">
                    <ChevronDown className="h-3 w-3 mr-1" />
                    Detalhes técnicos
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <p className="mt-1 rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground font-mono break-words">
                    {rawError}
                  </p>
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        )}

        {!loading && !errorMessage && report && <div className="space-y-2">{renderReportMarkdown(report)}</div>}

        {!loading && !errorMessage && !report && (
          <p className="text-sm text-muted-foreground">
            Ainda sem relatório. Clique em "Gerar relatório" para obter uma leitura executiva do período actual.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
