/**
 * TemplateVersionsPanel — Fase 4 (Lab).
 *
 * Lista todas as versões do template, permite selecionar/duplicar
 * e correr template_check sobre a versão selecionada.
 *
 * Sem publish, sem delete nesta fase.
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, AlertTriangle, CheckCircle2, Copy, Loader2 } from "lucide-react";
import { validateConfiguration, type ValidationIssue } from "@/lib/configurator-runtime";
import type { CTemplate } from "./hooks/useConfigTemplate";

interface Props {
  versions: CTemplate[];
  activeTemplate: CTemplate | null;
  selectedTemplate: CTemplate | null;
  selectedVersionId: string | null;
  onSelectVersion: (id: string) => void;
  onCreateFirst: (name: string) => Promise<void>;
  onDuplicate: (sourceId: string) => Promise<void>;
  productId: string | null;
  organizationId: string | null;
}

export function TemplateVersionsPanel({
  versions,
  activeTemplate,
  selectedTemplate,
  selectedVersionId,
  onSelectVersion,
  onCreateFirst,
  onDuplicate,
  productId,
  organizationId,
}: Props) {
  const [name, setName] = useState("Configuração v1");
  const [busyCreate, setBusyCreate] = useState(false);
  const [busyDup, setBusyDup] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [structErrors, setStructErrors] = useState<ValidationIssue[]>([]);
  const [structWarnings, setStructWarnings] = useState<ValidationIssue[]>([]);
  const [checked, setChecked] = useState(false);
  const [checkErr, setCheckErr] = useState<string | null>(null);
  const [lastCheckedVersion, setLastCheckedVersion] = useState<string | null>(null);

  // Estado vazio — criar primeira versão
  if (versions.length === 0) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-base">Ainda sem configuração</CardTitle>
          <CardDescription>
            Crie a primeira versão da configuração deste produto para começar a definir secções, escolhas e valores.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="tpl-name" className="text-xs">Nome da configuração</Label>
            <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button
            disabled={!name.trim() || busyCreate}
            onClick={async () => {
              setBusyCreate(true);
              try {
                await onCreateFirst(name.trim());
              } finally {
                setBusyCreate(false);
              }
            }}
          >
            {busyCreate ? "A criar..." : "Criar primeira versão"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isInactiveSelected =
    !!selectedTemplate && (!activeTemplate || selectedTemplate.id !== activeTemplate.id);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base">Versões de teste</CardTitle>
            <CardDescription>
              Edite, duplique e teste versões em isolamento. Nada do que faz aqui afeta o produto à venda.
            </CardDescription>
          </div>
          {selectedTemplate && productId && organizationId && (
            <Button
              variant="outline"
              size="sm"
              disabled={checking}
              onClick={async () => {
                setChecking(true);
                setCheckErr(null);
                setChecked(false);
                setLastCheckedVersion(selectedTemplate.id);
                const r = await validateConfiguration({
                  productId,
                  organizationId,
                  selection: {},
                  mode: "template_check",
                  templateId: selectedTemplate.id,
                });
                setChecking(false);
                if ("error" in r) {
                  setCheckErr(r.error);
                  return;
                }
                setStructErrors(r.structural_errors ?? []);
                setStructWarnings(r.structural_warnings ?? []);
                setChecked(true);
              }}
            >
              {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Verificar erros
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isInactiveSelected && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>A testar uma versão inativa</AlertTitle>
            <AlertDescription className="text-xs">
              Esta versão não é a que está em uso. As alterações ficam isoladas e não afetam o produto à venda.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          {versions.map((v) => {
            const isSelected = v.id === selectedVersionId;
            return (
              <div
                key={v.id}
                className={`flex items-center justify-between gap-3 border rounded-md p-3 transition ${
                  isSelected ? "border-primary bg-accent/40" : "hover:bg-accent/20"
                }`}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Badge variant="default" className="shrink-0">v{v.version}</Badge>
                  {v.is_active ? (
                    <Badge variant="secondary" className="shrink-0">ativo</Badge>
                  ) : (
                    <Badge variant="outline" className="shrink-0">inativo</Badge>
                  )}
                  <span className="text-sm truncate">{v.name}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant={isSelected ? "default" : "outline"}
                    onClick={() => onSelectVersion(v.id)}
                    disabled={isSelected}
                  >
                    {isSelected ? "Selecionada" : "Selecionar"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyDup === v.id}
                    onClick={async () => {
                      setBusyDup(v.id);
                      try {
                        await onDuplicate(v.id);
                      } finally {
                        setBusyDup(null);
                      }
                    }}
                  >
                    {busyDup === v.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Copy className="h-3.5 w-3.5 mr-1" />
                    )}
                    Duplicar
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {(checked || checkErr) && lastCheckedVersion === selectedTemplate?.id && (
          <div className="space-y-2 pt-2 border-t">
            {checkErr && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">{checkErr}</AlertDescription>
              </Alert>
            )}
            {checked && structErrors.length === 0 && structWarnings.length === 0 && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Tudo certo</AlertTitle>
                <AlertDescription className="text-xs">
                  Não foram encontrados problemas nesta versão.
                </AlertDescription>
              </Alert>
            )}
            {structErrors.map((e, i) => (
              <Alert key={`se-${i}`} variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">{e.message}</AlertDescription>
              </Alert>
            ))}
            {structWarnings.map((w, i) => (
              <Alert key={`sw-${i}`}>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">{w.message}</AlertDescription>
              </Alert>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
