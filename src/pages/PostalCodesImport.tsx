import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Play, Pause, CheckCircle2, AlertCircle, Database, MapPin, Building2 } from "lucide-react";
import { toast } from "sonner";

interface ImportStats {
  postalCodesCount: number;
  streetsCount: number;
  ranges: number;
}

interface ImportRange {
  start: number;
  end: number;
  district: string;
}

export default function PostalCodesImport() {
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [ranges, setRanges] = useState<ImportRange[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentRange, setCurrentRange] = useState(0);
  const [currentPrefix, setCurrentPrefix] = useState(0);
  const [totalImported, setTotalImported] = useState(0);
  const [errors, setErrors] = useState(0);
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    fetchStats();
    fetchRanges();
  }, []);

  const fetchStats = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('import-postal-codes', {
        body: { action: 'stats' }
      });
      
      if (error) throw error;
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const fetchRanges = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('import-postal-codes', {
        body: { action: 'get-ranges' }
      });
      
      if (error) throw error;
      setRanges(data.ranges || []);
    } catch (error) {
      console.error('Error fetching ranges:', error);
    }
  };

  const addLog = (message: string) => {
    setLog(prev => [...prev.slice(-50), `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const importBatch = async (startPrefix: number, endPrefix: number): Promise<number> => {
    try {
      const { data, error } = await supabase.functions.invoke('import-postal-codes', {
        body: { 
          action: 'import-batch', 
          startPrefix, 
          endPrefix,
          batchSize: 10
        }
      });
      
      if (error) throw error;
      
      if (data.imported > 0) {
        addLog(`✅ ${startPrefix}-${endPrefix}: ${data.imported} códigos importados`);
        if (data.sampleResults?.length > 0) {
          addLog(`   📍 ${data.sampleResults[0].locality} - ${data.sampleResults[0].postalCode}`);
        }
      }
      
      return data.imported || 0;
    } catch (error) {
      addLog(`❌ Erro ao importar ${startPrefix}-${endPrefix}`);
      setErrors(prev => prev + 1);
      return 0;
    }
  };

  const startImport = async () => {
    setIsImporting(true);
    setIsPaused(false);
    addLog('🚀 Iniciando importação de códigos postais...');
    
    for (let rangeIndex = currentRange; rangeIndex < ranges.length; rangeIndex++) {
      if (isPaused) {
        addLog('⏸️ Importação pausada');
        break;
      }
      
      const range = ranges[rangeIndex];
      setCurrentRange(rangeIndex);
      addLog(`📂 A processar ${range.district} (${range.start}-${range.end})`);
      
      for (let prefix = range.start; prefix <= range.end; prefix += 10) {
        if (isPaused) break;
        
        setCurrentPrefix(prefix);
        const imported = await importBatch(prefix, Math.min(prefix + 9, range.end));
        setTotalImported(prev => prev + imported);
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    if (!isPaused) {
      addLog('🎉 Importação concluída!');
      toast.success('Importação de códigos postais concluída!');
      fetchStats();
    }
    
    setIsImporting(false);
  };

  const pauseImport = () => {
    setIsPaused(true);
  };

  const calculateProgress = () => {
    if (ranges.length === 0) return 0;
    const totalPrefixes = ranges.reduce((sum, r) => sum + (r.end - r.start), 0);
    const processedPrefixes = ranges
      .slice(0, currentRange)
      .reduce((sum, r) => sum + (r.end - r.start), 0) + 
      (currentPrefix - (ranges[currentRange]?.start || 0));
    return Math.round((processedPrefixes / totalPrefixes) * 100);
  };

  return (
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Importação de Códigos Postais</h1>
          <p className="text-muted-foreground">Importar todos os códigos postais e ruas de Portugal</p>
        </div>
        
        {!isImporting ? (
          <Button onClick={startImport} size="lg" className="gap-2">
            <Play className="h-5 w-5" />
            Iniciar Importação
          </Button>
        ) : (
          <Button onClick={pauseImport} variant="outline" size="lg" className="gap-2">
            <Pause className="h-5 w-5" />
            Pausar
          </Button>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Códigos Postais
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.postalCodesCount?.toLocaleString() || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Ruas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.streetsCount?.toLocaleString() || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              Importados (sessão)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{totalImported.toLocaleString()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              Erros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{errors}</div>
          </CardContent>
        </Card>
      </div>

      {/* Progress */}
      {isImporting && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              A importar...
            </CardTitle>
            <CardDescription>
              {ranges[currentRange]?.district} - Prefixo {currentPrefix}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={calculateProgress()} className="h-3" />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Range {currentRange + 1} de {ranges.length}</span>
              <span>{calculateProgress()}% completo</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Ranges Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Intervalos de Códigos Postais
          </CardTitle>
          <CardDescription>
            Portugal tem ~350.000 códigos postais distribuídos por distrito
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {ranges.map((range, index) => (
              <Badge 
                key={index} 
                variant={index < currentRange ? "default" : index === currentRange && isImporting ? "secondary" : "outline"}
                className="gap-1"
              >
                {range.district}
                <span className="text-xs opacity-70">({range.start}-{range.end})</span>
                {index < currentRange && <CheckCircle2 className="h-3 w-3" />}
                {index === currentRange && isImporting && <Loader2 className="h-3 w-3 animate-spin" />}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Log */}
      <Card>
        <CardHeader>
          <CardTitle>Log de Importação</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-muted rounded-lg p-4 h-64 overflow-y-auto font-mono text-sm space-y-1">
            {log.length === 0 ? (
              <p className="text-muted-foreground">Clica em "Iniciar Importação" para começar...</p>
            ) : (
              log.map((entry, index) => (
                <div key={index} className="text-muted-foreground">{entry}</div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
