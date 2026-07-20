import React, { memo } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PermissionGate } from "@/components/PermissionGate";
import {
  Phone, Eye, Pencil, FileText, Mail, MessageCircle,
  MoreHorizontal, Star, Copy, Trash2, User, CalendarIcon, Handshake, ScrollText,
} from "lucide-react";
import { PhoneCallDropdown } from "@/components/shared/PhoneCallDropdown";
import { format, formatDistanceToNow } from "date-fns";
import { pt } from "date-fns/locale";
import { cn } from "@/lib/utils";
import type { ColumnConfig } from "./LeadsTableColumns";

// Deal/Proposal/Quote aggregate for one lead's entity_id, sourced from the
// get_lead_page_pipeline() RPC (20261110430000_lead_page_pipeline_rpc.sql).
// Mirrors the shape AnewContacts.tsx computed client-side for its own
// "Pipeline" column (dealsData/proposalsData/quotesData).
export interface LeadPipelineEntry {
  deal_count: number;
  deal_value: number;
  proposal_count: number;
  proposal_value: number;
  proposal_value_with_iva: number;
  quote_count: number;
  quote_value: number;
  quote_value_with_iva: number;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(value || 0);
}

export interface LeadTableRowProps {
  lead: any;
  isSelected: boolean;
  name: string;
  phone: string | null;
  email: string;
  campaignFilter: string;
  displayColumns: Array<{ field_key?: string; key?: string; [k: string]: any }>;
  // Ordered, already-visible-filtered column config driving which
  // configurable cells render and in what order (checkbox and Ações stay
  // fixed regardless). Falls back to a fixed legacy layout when empty/not
  // yet loaded, so the table never renders blank before the first
  // onColumnsChange callback fires.
  visibleColumns: ColumnConfig[];
  pipelineData?: LeadPipelineEntry;
  // Helper functions
  getStatusColor: (status: string) => React.CSSProperties;
  getStatusLabel: (status: string) => string;
  getEffectiveStatus: (lead: any) => string;
  getContactResultInfo: (result: string | undefined) => { name: string; color: string } | null | undefined;
  resolveFieldValue: (fieldKey: string, value: any) => string;
  // Callbacks
  onSelect: (leadId: string) => void;
  onViewDetails: (lead: any) => void;
  onContact: (lead: any) => void;
  onEdit: (lead: any) => void;
  onCreateDeal: (lead: any) => void;
  onConvertToClient: (lead: any) => void;
  onDuplicate: (lead: any) => void;
  onDelete: (leadId: string) => void;
  onEmail: (lead: any) => void;
  onWhatsApp: (lead: any) => void;
  onReassignVisit: (lead: any) => void;
  // Translation
  t: (key: string) => string;
}

export const LeadTableRow = memo(function LeadTableRow({
  lead,
  isSelected,
  name,
  phone,
  email,
  campaignFilter,
  displayColumns,
  visibleColumns,
  pipelineData,
  getStatusColor,
  getStatusLabel,
  getEffectiveStatus,
  getContactResultInfo,
  resolveFieldValue,
  onSelect,
  onViewDetails,
  onContact,
  onEdit,
  onCreateDeal,
  onConvertToClient,
  onDuplicate,
  onDelete,
  onEmail,
  onWhatsApp,
  onReassignVisit,
  t,
}: LeadTableRowProps) {
  return (
    <TableRow
      className={cn(
        "cursor-pointer hover:bg-muted/50 group transition-all",
        isSelected && "bg-primary/5 ring-1 ring-primary/20 ring-inset"
      )}
      onClick={() => onViewDetails(lead)}
    >
      {/* Checkbox Column */}
      <TableCell className="text-center" onClick={e => e.stopPropagation()}>
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onSelect(lead.id)}
          aria-label={`Selecionar ${name || 'lead'}`}
        />
      </TableCell>

      {/* Configurable columns — rendered in the order/visibility chosen via
          the "Personalizar Colunas" dialog (LeadsTableColumns.tsx). Checkbox
          (above) and Ações (below) are always fixed, matching the Contactos
          listing's UX (src/pages/AnewContacts.tsx). */}
      {visibleColumns.map(column => {
        switch (column.key) {
          case "phone_icon":
            return (
              <TableCell key={column.id} className="text-center" onClick={e => e.stopPropagation()}>
                {phone ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                        onClick={() => onWhatsApp(lead)}
                      >
                        <MessageCircle className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>WhatsApp</TooltipContent>
                  </Tooltip>
                ) : (
                  <span className="text-muted-foreground/30">
                    <MessageCircle className="w-4 h-4 mx-auto" />
                  </span>
                )}
              </TableCell>
            );

          case "last_contact_at":
            return (
              <TableCell key={column.id}>
                {lead.last_contact_at ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex flex-col">
                        <span className="text-xs font-medium">
                          {formatDistanceToNow(new Date(lead.last_contact_at), { addSuffix: true, locale: pt })}
                        </span>
                        {lead.last_contact_result && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1 py-0 mt-0.5 w-fit"
                            style={(() => {
                              const info = getContactResultInfo(lead.last_contact_result);
                              return info ? {
                                backgroundColor: info.color + '15',
                                color: info.color,
                                borderColor: info.color + '40'
                              } : {};
                            })()}
                          >
                            {getContactResultInfo(lead.last_contact_result)?.name || lead.last_contact_result}
                          </Badge>
                        )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      {format(new Date(lead.last_contact_at), "dd/MM/yyyy HH:mm", { locale: pt })}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <span className="text-xs text-muted-foreground">Sem contacto</span>
                )}
              </TableCell>
            );

          case "campaign":
            // When a specific campaign is selected, its custom fields take
            // this column's place instead of the Campanha badge (unchanged
            // behavior from before this column became configurable).
            if (campaignFilter !== "all") {
              return (
                <React.Fragment key={column.id}>
                  {displayColumns.slice(3).map(col => {
                    const fieldKey = col.field_key || col.key || '';
                    const value = lead.field_values?.[fieldKey];
                    return (
                      <TableCell key={fieldKey}>
                        <span className="text-sm">{resolveFieldValue(fieldKey, value)}</span>
                      </TableCell>
                    );
                  })}
                </React.Fragment>
              );
            }
            return (
              <TableCell key={column.id}>
                <Badge variant="outline" className="text-xs">
                  {lead.campaigns?.name || "-"}
                </Badge>
              </TableCell>
            );

          case "name":
            return (
              <TableCell key={column.id}>
                <span className="font-medium">{name || "-"}</span>
              </TableCell>
            );

          case "phone":
            return (
              <TableCell key={column.id}>
                <span className="text-sm">{phone || "-"}</span>
              </TableCell>
            );

          case "pipeline": {
            const hasPipeline = !!(pipelineData && (
              pipelineData.deal_count > 0 || pipelineData.proposal_count > 0 || pipelineData.quote_count > 0
            ));
            return (
              <TableCell key={column.id}>
                {hasPipeline ? (
                  <div className="flex flex-col gap-0.5">
                    {pipelineData!.deal_count > 0 && (
                      <Badge variant="outline" className="text-[10px] whitespace-nowrap w-fit">
                        <Handshake className="h-3 w-3 mr-1" />
                        {pipelineData!.deal_count} pedido{pipelineData!.deal_count > 1 ? 's' : ''} · {formatCurrency(pipelineData!.deal_value)}
                      </Badge>
                    )}
                    {pipelineData!.proposal_count > 0 && (
                      <Badge variant="outline" className="text-[10px] whitespace-nowrap w-fit border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-400">
                        <FileText className="h-3 w-3 mr-1" />
                        {pipelineData!.proposal_count} proposta{pipelineData!.proposal_count > 1 ? 's' : ''} · {formatCurrency(pipelineData!.proposal_value)}
                        {pipelineData!.proposal_value_with_iva > 0 && pipelineData!.proposal_value_with_iva !== pipelineData!.proposal_value ? ` (c/ IVA: ${formatCurrency(pipelineData!.proposal_value_with_iva)})` : ''}
                      </Badge>
                    )}
                    {pipelineData!.quote_count > 0 && (
                      <Badge variant="outline" className="text-[10px] whitespace-nowrap w-fit border-emerald-300 text-emerald-700 dark:border-emerald-700 dark:text-emerald-400">
                        <ScrollText className="h-3 w-3 mr-1" />
                        {pipelineData!.quote_count} orçamento{pipelineData!.quote_count > 1 ? 's' : ''} · {formatCurrency(pipelineData!.quote_value)}
                        {pipelineData!.quote_value_with_iva > 0 && pipelineData!.quote_value_with_iva !== pipelineData!.quote_value ? ` (c/ IVA: ${formatCurrency(pipelineData!.quote_value_with_iva)})` : ''}
                      </Badge>
                    )}
                  </div>
                ) : <span className="text-xs text-muted-foreground">—</span>}
              </TableCell>
            );
          }

          case "email":
            return (
              <TableCell key={column.id}>
                <span className="text-sm text-muted-foreground">{email || "-"}</span>
              </TableCell>
            );

          case "status":
            return (
              <TableCell key={column.id}>
                <Badge style={getStatusColor(getEffectiveStatus(lead))}>
                  {getStatusLabel(getEffectiveStatus(lead))}
                </Badge>
              </TableCell>
            );

          case "created_at":
            return (
              <TableCell key={column.id}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(lead.created_at), { addSuffix: true, locale: pt })}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {format(new Date(lead.created_at), "dd/MM/yyyy HH:mm")}
                  </TooltipContent>
                </Tooltip>
              </TableCell>
            );

          case "source":
            return (
              <TableCell key={column.id}>
                {lead.source ? (
                  <Badge variant="outline" className="text-xs">
                    {lead.source === 'web' ? '🌐 Web' :
                      lead.source === 'api' ? '🔌 API' :
                        lead.source === 'import' ? '📥 Import' :
                          lead.source}
                  </Badge>
                ) : lead.profiles?.name ? (
                  <div className="flex items-center gap-1.5">
                    <User className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground truncate max-w-[80px]">
                      {lead.profiles.name}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
            );

          case "assigned_to":
            return (
              <TableCell key={column.id}>
                <span className="text-xs">
                  {lead.assigned_user?.name || (
                    <span className="text-muted-foreground italic">{t('leads.unassigned')}</span>
                  )}
                </span>
              </TableCell>
            );

          case "days_without_contact":
            return (
              <TableCell key={column.id}>
                {(() => {
                  if (!lead.last_contact_at) {
                    return <span className="text-xs font-medium text-destructive">Sem contacto</span>;
                  }
                  const daysDiff = Math.floor((Date.now() - new Date(lead.last_contact_at).getTime()) / (1000 * 60 * 60 * 24));
                  const isOverdue = daysDiff > 7;
                  return (
                    <span className={cn("text-xs font-medium", isOverdue ? "text-destructive" : "text-muted-foreground")}>
                      {daysDiff} {daysDiff === 1 ? "dia" : "dias"}
                    </span>
                  );
                })()}
              </TableCell>
            );

          default: {
            // Custom campaign field column (isSystem: false), keyed by its
            // own field_key rather than one of the fixed system keys above.
            const value = lead.field_values?.[column.key];
            return (
              <TableCell key={column.id}>
                <span className="text-sm">{resolveFieldValue(column.key, value)}</span>
              </TableCell>
            );
          }
        }
      })}

      {/* Actions - Last column */}
      <TableCell className="text-right sticky right-0 bg-background z-10" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-0.5 flex-nowrap">
          {/* 1. Registar Contacto */}
          <PermissionGate permission="leads.contact">
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <PhoneCallDropdown
                    phoneNumber={phone}
                    onRegisterActivity={() => onContact(lead)}
                    buttonVariant="ghost"
                    buttonSize="icon"
                    buttonClassName="h-7 w-7 rounded-lg bg-purple-100 text-purple-700 hover:bg-purple-200 dark:bg-purple-900/40 dark:text-purple-300 dark:hover:bg-purple-900/60"
                    registerLabel="Registar contacto"
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent>Registar Contacto</TooltipContent>
            </Tooltip>
          </PermissionGate>

          {/* 2. Ver ficha */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onViewDetails(lead)}
              >
                <Eye className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Ver Ficha</TooltipContent>
          </Tooltip>

          {/* 3. Menu "..." */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreHorizontal className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {/* Secção Comercial */}
              <DropdownMenuLabel className="text-xs text-muted-foreground">Comercial</DropdownMenuLabel>
              <PermissionGate permission="leads.edit">
                <DropdownMenuItem onClick={() => onEdit(lead)}>
                  <Pencil className="w-3.5 h-3.5 mr-2" />
                  Editar lead
                </DropdownMenuItem>
              </PermissionGate>
              {lead.status !== "converted" && (
                <PermissionGate permission="deals.create">
                  <DropdownMenuItem onClick={() => onCreateDeal(lead)}>
                    <FileText className="w-3.5 h-3.5 mr-2" />
                    Criar pedido de proposta
                  </DropdownMenuItem>
                </PermissionGate>
              )}
              <DropdownMenuItem onClick={() => onEmail(lead)}>
                <Mail className="w-3.5 h-3.5 mr-2" />
                Enviar email
              </DropdownMenuItem>
              {phone && (
                <DropdownMenuItem onClick={() => onWhatsApp(lead)}>
                  <MessageCircle className="w-3.5 h-3.5 mr-2" />
                  WhatsApp
                </DropdownMenuItem>
              )}

              {/* Secção Conversão */}
              {lead.status !== "converted" && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Conversão</DropdownMenuLabel>
                  <PermissionGate permission="leads.convert">
                    <DropdownMenuItem onClick={() => onConvertToClient(lead)}>
                      <Star className="w-3.5 h-3.5 mr-2" />
                      Converter para cliente
                    </DropdownMenuItem>
                  </PermissionGate>
                </>
              )}

              {/* Reatribuir Visita */}
              {(lead.status === "visit_scheduled" || lead.scheduled_visit_id || lead.last_contact_result === "visit_scheduled") && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Agendamento</DropdownMenuLabel>
                  <PermissionGate permission="scheduling.items.view">
                    <DropdownMenuItem onClick={() => onReassignVisit(lead)}>
                      <CalendarIcon className="w-3.5 h-3.5 mr-2" />
                      Reatribuir Visita
                    </DropdownMenuItem>
                  </PermissionGate>
                </>
              )}

              {/* Secção Outro */}
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">Outro</DropdownMenuLabel>
              <PermissionGate permission="leads.create">
                <DropdownMenuItem onClick={() => onDuplicate(lead)}>
                  <Copy className="w-3.5 h-3.5 mr-2" />
                  Duplicar lead
                </DropdownMenuItem>
              </PermissionGate>
              <PermissionGate permission="leads.delete">
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => onDelete(lead.id)}
                >
                  <Trash2 className="w-3.5 h-3.5 mr-2" />
                  Eliminar
                </DropdownMenuItem>
              </PermissionGate>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
}, (prev, next) => {
  // Custom comparison: only re-render when meaningful data changes
  return (
    prev.lead.id === next.lead.id &&
    prev.lead.status === next.lead.status &&
    prev.lead.last_contact_at === next.lead.last_contact_at &&
    prev.lead.last_contact_result === next.lead.last_contact_result &&
    prev.lead.assigned_user?.name === next.lead.assigned_user?.name &&
    prev.lead.updated_at === next.lead.updated_at &&
    prev.isSelected === next.isSelected &&
    prev.name === next.name &&
    prev.phone === next.phone &&
    prev.email === next.email &&
    prev.campaignFilter === next.campaignFilter &&
    prev.visibleColumns === next.visibleColumns &&
    prev.pipelineData === next.pipelineData
  );
});
