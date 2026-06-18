import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Calendar, Clock, MapPin, Loader2, Search, Users, Car, CheckCircle2, XCircle } from "lucide-react";

interface ScheduleTestFormProps {
  tokens: Array<{
    id: string;
    token_key: string;
    token_name: string;
    is_active: boolean;
  }>;
}

interface ScheduleBoard {
  id: string;
  name: string;
}

interface AutoScheduleRule {
  id: string;
  name: string;
  strategy: string;
  duration_minutes: number | null;
  earliest_time: string | null;
  latest_time: string | null;
  allowed_days: number[] | null;
}

interface AvailableResource {
  resource_id: string;
  resource_name: string;
  resource_type: string;
  distance_km: number;
  travel_time_minutes: number;
  available_slots: { start: string; end: string }[];
  priority: number;
}

interface AvailabilityResult {
  resources: AvailableResource[];
}

export function ScheduleTestForm({ tokens }: ScheduleTestFormProps) {
  const { toast } = useToast();

  // Token selection
  const [selectedApiToken, setSelectedApiToken] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AvailabilityResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Boards and rules
  const [boards, setBoards] = useState<ScheduleBoard[]>([]);
  const [rules, setRules] = useState<AutoScheduleRule[]>([]);
  const [selectedBoardId, setSelectedBoardId] = useState<string>("");
  const [selectedRuleId, setSelectedRuleId] = useState<string>("");

  // Query parameters
  const [postalCode, setPostalCode] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [duration, setDuration] = useState(60);

  useEffect(() => {
    loadBoardsAndRules();
  }, []);

  const loadBoardsAndRules = async () => {
    const [boardsRes, rulesRes] = await Promise.all([
      supabase.from("schedule_boards").select("id, name").eq("is_active", true).order("name"),
      supabase.from("auto_schedule_rules").select("id, name, strategy, duration_minutes, earliest_time, latest_time, allowed_days").eq("is_active", true).order("priority", { ascending: false }),
    ]);

    if (boardsRes.data) {
      setBoards(boardsRes.data);
      if (boardsRes.data.length > 0 && !selectedBoardId) {
        setSelectedBoardId(boardsRes.data[0].id);
      }
    }
    if (rulesRes.data) setRules(rulesRes.data);
  };

  const handleTestAvailability = async () => {
    if (!selectedApiToken) {
      toast({ title: "Erro", description: "Selecione um token de API", variant: "destructive" });
      return;
    }

    if (!postalCode) {
      toast({ title: "Erro", description: "Insira um código postal", variant: "destructive" });
      return;
    }

    if (!selectedBoardId) {
      toast({ title: "Erro", description: "Selecione um quadro de agendamento", variant: "destructive" });
      return;
    }

    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const token = tokens.find(t => t.id === selectedApiToken);
      if (!token) throw new Error("Token não encontrado");

      const queryParams = new URLSearchParams({
        action: "nearest_resources",
        postal_code: postalCode,
        board_id: selectedBoardId,
        date: date,
        duration: duration.toString(),
      });

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/auto-schedule?${queryParams}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": token.token_key,
          },
        }
      );

      const data = await response.json();

      if (response.ok) {
        setResult(data);
        toast({ 
          title: "Sucesso", 
          description: `Encontrados ${data.resources?.length || 0} recursos disponíveis` 
        });
      } else {
        setError(data.error || "Erro desconhecido");
        toast({ title: "Erro", description: data.error || "Falha na consulta", variant: "destructive" });
      }
    } catch (err: any) {
      setError(err.message);
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString("pt-PT", { 
      hour: "2-digit", 
      minute: "2-digit" 
    });
  };

  const selectedRule = rules.find(r => r.id === selectedRuleId);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Testar Auto-Agendamento
          </CardTitle>
          <CardDescription>
            Consulte disponibilidades por código postal e parâmetros de agendamento
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Token Selection */}
          <div className="space-y-2">
            <Label>Token de API *</Label>
            <Select value={selectedApiToken} onValueChange={setSelectedApiToken}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um token..." />
              </SelectTrigger>
              <SelectContent>
                {tokens.filter(t => t.is_active).map((token) => (
                  <SelectItem key={token.id} value={token.id}>
                    {token.token_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Board Selection */}
          <div className="space-y-2">
            <Label>Quadro de Agendamento *</Label>
            <Select value={selectedBoardId} onValueChange={setSelectedBoardId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um quadro..." />
              </SelectTrigger>
              <SelectContent>
                {boards.map((board) => (
                  <SelectItem key={board.id} value={board.id}>
                    {board.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Rule Selection (optional) */}
          <div className="space-y-2">
            <Label>Regra de Auto-Agendamento (opcional)</Label>
            <Select value={selectedRuleId || "__none__"} onValueChange={(v) => setSelectedRuleId(v === "__none__" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Ver configuração de regra..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nenhuma</SelectItem>
                {rules.map((rule) => (
                  <SelectItem key={rule.id} value={rule.id}>
                    {rule.name} ({rule.strategy})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedRule && (
              <div className="mt-2 p-3 bg-muted rounded-md text-sm space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{selectedRule.strategy}</Badge>
                  {selectedRule.duration_minutes && (
                    <span className="text-muted-foreground">
                      {selectedRule.duration_minutes} min
                    </span>
                  )}
                </div>
                {selectedRule.earliest_time && selectedRule.latest_time && (
                  <p className="text-muted-foreground">
                    Horário: {selectedRule.earliest_time} - {selectedRule.latest_time}
                  </p>
                )}
                {selectedRule.allowed_days && (
                  <p className="text-muted-foreground">
                    Dias: {selectedRule.allowed_days.map(d => ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][d]).join(", ")}
                  </p>
                )}
              </div>
            )}
          </div>

          <Separator />

          {/* Query Parameters */}
          <div className="space-y-4">
            <Label className="text-sm font-semibold">Parâmetros de Consulta</Label>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Código Postal *
              </Label>
              <Input
                placeholder="Ex: 1000-001"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                O sistema irá encontrar recursos próximos a este código postal
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Data
                </Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Duração (min)
                </Label>
                <Input
                  type="number"
                  min={15}
                  max={480}
                  step={15}
                  value={duration}
                  onChange={(e) => setDuration(parseInt(e.target.value) || 60)}
                />
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              onClick={handleTestAvailability}
              disabled={loading || !selectedApiToken || !postalCode || !selectedBoardId}
              className="flex-1"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              Consultar Disponibilidade
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Recursos Disponíveis
          </CardTitle>
          <CardDescription>
            Resultado da consulta de disponibilidade
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {error && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
              <div className="flex items-center gap-2 text-destructive">
                <XCircle className="h-5 w-5" />
                <span className="font-medium">Erro</span>
              </div>
              <p className="mt-1 text-sm text-destructive">{error}</p>
            </div>
          )}

          {result && !loading && (
            <div className="space-y-4">
              {result.resources && result.resources.length > 0 ? (
                <>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    {result.resources.length} recurso(s) encontrado(s)
                  </div>

                  <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                    {result.resources.map((resource, idx) => (
                      <div
                        key={resource.resource_id}
                        className="p-4 border rounded-lg space-y-3 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-medium flex items-center gap-2">
                              {idx === 0 && <Badge className="bg-green-500">Mais próximo</Badge>}
                              {resource.resource_name}
                            </h4>
                            <p className="text-sm text-muted-foreground capitalize">
                              {resource.resource_type}
                            </p>
                          </div>
                          <div className="text-right">
                            <div className="flex items-center gap-1 text-sm">
                              <Car className="h-4 w-4" />
                              <span>{resource.distance_km.toFixed(1)} km</span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              ~{resource.travel_time_minutes} min
                            </p>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">
                            Slots disponíveis ({resource.available_slots.length})
                          </Label>
                          <div className="flex flex-wrap gap-2">
                            {resource.available_slots.slice(0, 6).map((slot, slotIdx) => (
                              <Badge key={slotIdx} variant="outline" className="text-xs">
                                {formatTime(slot.start)} - {formatTime(slot.end)}
                              </Badge>
                            ))}
                            {resource.available_slots.length > 6 && (
                              <Badge variant="secondary" className="text-xs">
                                +{resource.available_slots.length - 6} mais
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Nenhum recurso disponível encontrado</p>
                  <p className="text-sm mt-1">
                    Tente outro código postal, data ou duração
                  </p>
                </div>
              )}
            </div>
          )}

          {!result && !loading && !error && (
            <div className="text-center py-12 text-muted-foreground">
              <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Execute uma consulta para ver os resultados</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
