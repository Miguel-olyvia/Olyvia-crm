import { useEffect, useState } from "react";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, Eye, RefreshCw, Plus, Share2, Building2, ShieldAlert } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";
import { computeStrictShouldBlock } from "@/lib/duplicateBlockingRule";

export interface DuplicateMatch {
  id: string;
  entityId: string;
  displayName: string;
  email?: string | null;
  phone?: string | null;
  status: string;
  type: "lead" | "contact" | "client";
  createdAt: string;
  campaignName?: string | null;
  assignedToName?: string | null;
  // Which identifier triggered the match (when known)
  matchField?: "email" | "phone" | "nif";
  // All simultaneous strong-field coincidences for this entity (optional —
  // when present, takes precedence over the singular matchField for the
  // strict blocking rule). Existing callers that only set matchField keep
  // working unchanged.
  matchFields?: ("email" | "phone" | "nif")[];
  // Cross-org (group) extension — only set when scope='group'.
  scope?: "same_org" | "group";
  primaryOrgId?: string | null;
  primaryOrgName?: string | null;
  ownerOrgAccessible?: boolean;
  rolesInMyOrg?: string[];
  rolesInOwnerOrg?: string[];
}


interface DuplicateEntityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matches: DuplicateMatch[];
  entityType: "lead" | "contact" | "client";
  onOpenExisting: (match: DuplicateMatch) => void;
  onUpdateExisting: (match: DuplicateMatch) => void;
  onCreateAnyway: () => void;
  onShareWithOrg?: (match: DuplicateMatch) => void | Promise<void>;
  createActionLabel?: string;
  loading?: boolean;
  /**
   * Opt-in strict-blocking mode. When `true`, hides the "Criar mesmo assim"
   * button (and the NIF confirmation checkbox) whenever the strict rule says
   * the duplicates are dangerous enough that creating a new record would be
   * almost certainly wrong (e.g. same-org email match, multiple strong-field
   * coincidences, any cross-org strong match, or only cross-org matches).
   *
   * Default `false`: existing consumers (including public-facing flows that
   * rely on this dialog elsewhere) keep their current behaviour unchanged.
   */
  strictBlocking?: boolean;
}

const STATUS_LABELS: Record<string, string> = {
  new: "Novo",
  contacted: "Contactado",
  qualified: "Qualificado",
  converted: "Convertido",
  active: "Ativo",
  inactive: "Inativo",
  lost: "Perdido",
  visit_scheduled: "Visita Agendada",
  callback_scheduled: "Callback Agendado",
  proposal_sent: "Proposta Enviada",
  negotiation: "Negociação",
};

const TYPE_LABELS: Record<string, string> = {
  lead: "Lead",
  contact: "Contacto",
  client: "Cliente",
};

const TYPE_COLORS: Record<string, string> = {
  lead: "bg-blue-100 text-blue-700 border-blue-200",
  contact: "bg-green-100 text-green-700 border-green-200",
  client: "bg-purple-100 text-purple-700 border-purple-200",
};

export function DuplicateEntityDialog({
  open,
  onOpenChange,
  matches,
  entityType,
  onOpenExisting,
  onUpdateExisting,
  onCreateAnyway,
  onShareWithOrg,
  createActionLabel,
  loading,
  strictBlocking = false,
}: DuplicateEntityDialogProps) {
  const typeLabel = entityType === "lead" ? "lead" : entityType === "contact" ? "contacto" : "cliente";

  // Strong NIF same-org alert: same NIF in same org is almost certainly a duplicate
  const hasNifSameOrgMatch = matches.some(
    (m) => m.matchField === "nif" && m.scope !== "group"
  );
  const hasGroupShareable = matches.some((m) => m.scope === "group");

  // Strict-blocking rule (opt-in). When OFF, behaviour is identical to the
  // legacy dialog: the button is shown, the NIF checkbox may gate it, etc.
  const strict = strictBlocking ? computeStrictShouldBlock(matches) : null;
  const shouldBlock = strict?.shouldBlock === true;

  const [nifConfirmed, setNifConfirmed] = useState(false);
  useEffect(() => {
    if (!open) setNifConfirmed(false);
  }, [open]);

  const createDisabled = !!loading || (hasNifSameOrgMatch && !nifConfirmed);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <div className={`h-8 w-8 rounded-full flex items-center justify-center ${hasNifSameOrgMatch ? "bg-red-100" : "bg-amber-100"}`}>
              {hasNifSameOrgMatch
                ? <ShieldAlert className="h-4 w-4 text-red-600" />
                : <AlertTriangle className="h-4 w-4 text-amber-600" />}
            </div>
            {hasNifSameOrgMatch
              ? "NIF já registado — provável duplicado"
              : "Possível duplicado encontrado"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {hasNifSameOrgMatch
              ? `Já existe ${matches.length === 1 ? "um registo" : `${matches.length} registos`} com este NIF nesta organização. Criar mesmo assim só é recomendado em casos excecionais.`
              : `Esta entidade já existe nesta organização com ${matches.length} ${matches.length === 1 ? "registo associado" : "registos associados"}. O que deseja fazer?`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 my-2 max-h-60 overflow-y-auto">
          {matches.map((match) => {
            const isGroup = match.scope === "group";
            if (isGroup) {
              // Reduced-privacy view: name + owner org only.
              const canShare = !!onShareWithOrg && match.ownerOrgAccessible === true;
              return (
                <div
                  key={`group-${match.entityId}`}
                  className="border rounded-lg p-3 space-y-2 bg-muted/30"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge className="text-xs bg-amber-100 text-amber-800 border-amber-200 gap-1">
                        <Building2 className="h-3 w-3" />
                        Outra empresa do grupo
                      </Badge>
                      <span className="font-medium text-sm">{match.displayName}</span>
                    </div>
                  </div>
                  {match.primaryOrgName && (
                    <div className="text-xs text-muted-foreground">
                      Org dona: <span className="font-medium">{match.primaryOrgName}</span>
                    </div>
                  )}
                  <div className="flex gap-2 pt-1 items-center flex-wrap">
                    {canShare ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-xs h-7"
                        onClick={() => onShareWithOrg!(match)}
                        disabled={loading}
                      >
                        <Share2 className="h-3 w-3" />
                        Partilhar com esta org
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Sem acesso à org de origem para partilhar
                      </span>
                    )}
                    {match.ownerOrgAccessible && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-xs h-7"
                        onClick={() => onOpenExisting(match)}
                      >
                        <Eye className="h-3 w-3" />
                        Abrir na org dona
                      </Button>
                    )}
                  </div>
                </div>
              );
            }
            const isNif = match.matchField === "nif";
            return (
              <div
                key={`${match.type}-${match.id}`}
                className={`border rounded-lg p-3 space-y-2 ${isNif ? "bg-red-50 border-red-200" : "bg-muted/30"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge className={`text-xs ${TYPE_COLORS[match.type] || ""}`}>
                      {TYPE_LABELS[match.type] || match.type}
                    </Badge>
                    <span className="font-medium text-sm">{match.displayName}</span>
                    {isNif && (
                      <Badge variant="outline" className="text-[10px] border-red-300 text-red-700 bg-red-100">
                        NIF idêntico
                      </Badge>
                    )}
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {STATUS_LABELS[match.status] || match.status}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {match.email && <span>📧 {match.email}</span>}
                  {match.phone && <span>📞 {match.phone}</span>}
                  {match.campaignName && <span>📋 {match.campaignName}</span>}
                  {match.assignedToName && <span>👤 {match.assignedToName}</span>}
                  <span>Criado {formatDistanceToNow(new Date(match.createdAt), { addSuffix: true, locale: pt })}</span>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1 text-xs h-7"
                    onClick={() => onOpenExisting(match)}
                  >
                    <Eye className="h-3 w-3" />
                    Abrir existente
                  </Button>
                  {match.type === entityType && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-xs h-7"
                      onClick={() => onUpdateExisting(match)}
                      disabled={loading}
                    >
                      <RefreshCw className="h-3 w-3" />
                      Atualizar dados
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {hasNifSameOrgMatch && !shouldBlock && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3">
            <Checkbox
              id="confirm-nif-duplicate"
              checked={nifConfirmed}
              onCheckedChange={(v) => setNifConfirmed(v === true)}
              className="mt-0.5"
            />
            <label htmlFor="confirm-nif-duplicate" className="text-xs text-red-800 leading-snug cursor-pointer">
              Confirmo que pretendo criar mesmo havendo NIF idêntico nesta organização.
            </label>
          </div>
        )}

        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
          {!shouldBlock && (
            <Button
              variant={hasNifSameOrgMatch ? "destructive" : "secondary"}
              onClick={onCreateAnyway}
              disabled={createDisabled}
              className="gap-1"
            >
              <Plus className="h-3.5 w-3.5" />
              {createActionLabel || `Criar ${typeLabel} mesmo assim`}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
