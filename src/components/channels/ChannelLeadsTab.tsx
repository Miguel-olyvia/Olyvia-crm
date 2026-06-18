import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { AlertCircle, RefreshCw } from "lucide-react";

interface Props {
  channelId: string;
  range: { from: string; to: string };
}

const NONE = "__none__";
const ALL = "__all__";

export function ChannelLeadsTab({ channelId, range }: Props) {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["channel-leads", channelId, range.from, range.to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_channel_lead_facts" as any)
        .select("*")
        .eq("channel_id", channelId)
        .gte("touch_date", `${range.from}T00:00:00`)
        .lte("touch_date", `${range.to}T23:59:59`)
        .order("touch_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      const rows = (data ?? []) as any[];

      // Enrich with lead identity (display_name + email from field_values)
      const leadIds = Array.from(new Set(rows.map((r) => r.anew_lead_id).filter(Boolean)));
      if (leadIds.length === 0) return rows;

      const idMap = new Map<string, { name: string | null; email: string | null }>();
      // Batch (max 200 per query)
      for (let i = 0; i < leadIds.length; i += 200) {
        const batch = leadIds.slice(i, i + 200);
        const { data: leads } = await (supabase as any)
          .from("anew_leads")
          .select("id, field_values, entity:anew_entities!anew_leads_entity_id_fkey(display_name)")
          .in("id", batch);
        for (const l of leads ?? []) {
          const fv = (l.field_values ?? {}) as Record<string, any>;
          const email = fv.email ?? fv.Email ?? null;
          idMap.set(l.id, { name: l.entity?.display_name ?? null, email });
        }
      }
      return rows.map((r) => ({
        ...r,
        lead_name: idMap.get(r.anew_lead_id)?.name ?? null,
        lead_email: idMap.get(r.anew_lead_id)?.email ?? null,
      }));
    },
  });

  const [fStatus, setFStatus] = useState<string>(ALL);
  const [fSource, setFSource] = useState<string>(ALL);
  const [fMedium, setFMedium] = useState<string>(ALL);
  const [fConv, setFConv] = useState<string>(ALL);

  const rows = data ?? [];

  const { statusOptions, sourceOptions, mediumOptions } = useMemo(() => {
    const uniq = (key: string) => {
      const set = new Set<string>();
      for (const r of rows) set.add(r[key] ?? NONE);
      return Array.from(set).sort();
    };
    return {
      statusOptions: uniq("lead_status"),
      sourceOptions: uniq("source"),
      mediumOptions: uniq("medium"),
    };
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (fStatus !== ALL && (r.lead_status ?? NONE) !== fStatus) return false;
      if (fSource !== ALL && (r.source ?? NONE) !== fSource) return false;
      if (fMedium !== ALL && (r.medium ?? NONE) !== fMedium) return false;
      if (fConv === "yes" && !r.is_converted) return false;
      if (fConv === "no" && r.is_converted) return false;
      return true;
    });
  }, [rows, fStatus, fSource, fMedium, fConv]);

  const hasFilters = fStatus !== ALL || fSource !== ALL || fMedium !== ALL || fConv !== ALL;

  if (isLoading) {
    return (
      <Card className="mt-4">
        <CardContent className="py-4 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="mt-4">
        <CardContent className="py-12 text-center space-y-3">
          <AlertCircle className="w-10 h-10 mx-auto text-destructive" />
          <p className="text-muted-foreground">Erro a carregar leads.</p>
          <Button size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-1" /> Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  const labelFor = (v: string, fallback: string) => (v === NONE ? fallback : v);

  return (
    <div className="space-y-4 mt-4">
      <Card>
        <CardContent className="py-4">
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">Estado</Label>
              <Select value={fStatus} onValueChange={setFStatus}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos</SelectItem>
                  {statusOptions.map((v) => <SelectItem key={v} value={v}>{labelFor(v, "Sem estado")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Source</Label>
              <Select value={fSource} onValueChange={setFSource}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos</SelectItem>
                  {sourceOptions.map((v) => <SelectItem key={v} value={v}>{labelFor(v, "Sem source")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Medium</Label>
              <Select value={fMedium} onValueChange={setFMedium}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos</SelectItem>
                  {mediumOptions.map((v) => <SelectItem key={v} value={v}>{labelFor(v, "Sem medium")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Convertido</Label>
              <Select value={fConv} onValueChange={setFConv}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todos</SelectItem>
                  <SelectItem value="yes">Sim</SelectItem>
                  <SelectItem value="no">Não</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {rows.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          Sem leads atribuídos a este canal no intervalo.
        </CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          Nenhum lead corresponde aos filtros.
        </CardContent></Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Lead</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Medium</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Convertido</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((l: any) => (
                <TableRow key={l.lead_key}>
                  <TableCell>{new Date(l.touch_date).toLocaleString("pt-PT")}</TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{l.lead_name ?? "—"}</span>
                      {l.lead_email && (
                        <span className="text-xs text-muted-foreground">{l.lead_email}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{l.source ?? "—"}</TableCell>
                  <TableCell>{l.medium ?? "—"}</TableCell>
                  <TableCell>{l.lead_status ? <Badge variant="outline">{l.lead_status}</Badge> : "—"}</TableCell>
                  <TableCell>
                    {l.is_converted ? (
                      <Badge className="bg-success/10 text-success border-0">Sim</Badge>
                    ) : (
                      <Badge variant="secondary">Não</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="px-4 py-2 text-xs text-muted-foreground flex justify-between items-center border-t">
            <span>{filtered.length} de {rows.length}{hasFilters ? " (filtrado)" : ""}</span>
            {isFetching && <span>A atualizar…</span>}
          </div>
        </Card>
      )}
    </div>
  );
}
