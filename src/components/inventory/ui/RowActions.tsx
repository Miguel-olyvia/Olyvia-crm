// Ações por linha (td.act/.row-act do mockup): botão principal pequeno + menu ⋯.
//
// API:
//   <RowActions
//     primary={{ label: "Receber", onClick, permission: "inventory.receive" }}
//     items={[
//       { label: "Abrir detalhe", icon: Eye, onSelect },
//       { label: "Editar", icon: Pencil, onSelect, disabled: !editavel, disabledReason: "Só pendentes/encomendadas" },
//       "separator",
//       { label: "Eliminar", icon: Trash2, onSelect, destructive: true, permission: "purchase_orders.manage" },
//     ]}
//     menuLabel="Mais ações para PO-0042"
//   />
// primary: { label, onClick, icon?, variant?: "default" | "primary" | "destructive",
//            disabled?, disabledReason?, permission?, requireAllPermissions?, hidden? }
//   Desativado = aria-disabled + tooltip com o motivo (focável, ao contrário de disabled).
// items: RowActionItem | "separator"
//   RowActionItem: { label, onSelect, icon?, destructive?, disabled?, disabledReason?,
//                    permission?, requireAllPermissions?, hideWithoutPermission?, hidden? }
//   Item desativado mostra o motivo por baixo (<small> do .menu do mockup).
//   Sem permissão → desativado com "Sem permissão: requer X…" (ou escondido com
//   hideWithoutPermission). Separadores nas pontas/repetidos são removidos.
// modal: DropdownMenu modal (por omissão true). DENTRO DE UM DIALOG/SHEET usar
//   modal={false}, senão o focus trap do diálogo fecha o menu.
// Os cliques não chegam à linha (stopPropagation), por isso funciona em tr clicáveis.
import { useId, type ReactNode } from "react";
import { MoreHorizontal, type LucideIcon } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type PermissionReq = string | readonly string[];

interface PermissionFields {
  /** Permissão(ões) necessária(s); por omissão basta uma (OR). */
  permission?: PermissionReq;
  requireAllPermissions?: boolean;
}

export interface RowPrimaryAction extends PermissionFields {
  label: ReactNode;
  onClick: () => void;
  icon?: LucideIcon;
  /** default = .btn.btn-sm · primary = .btn-p · destructive = .btn-danger */
  variant?: "default" | "primary" | "destructive";
  disabled?: boolean;
  disabledReason?: string;
  hidden?: boolean;
}

export interface RowActionItem extends PermissionFields {
  label: string;
  onSelect: () => void;
  icon?: LucideIcon;
  destructive?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  /** Sem permissão, esconde em vez de mostrar desativado. */
  hideWithoutPermission?: boolean;
  hidden?: boolean;
}

export type RowActionEntry = RowActionItem | "separator";

interface RowActionsProps {
  primary?: RowPrimaryAction | null;
  items?: readonly RowActionEntry[];
  /** aria-label do botão ⋯ (ex.: "Mais ações para PO-0042"). */
  menuLabel?: string;
  modal?: boolean;
  className?: string;
}

/** O porquê de faltar permissão (PERMWHY do mockup). */
export const permissionReason = (perms: readonly string[]): string =>
  `Sem permissão: requer ${perms.join(" ou ")}. Peça acesso a um administrador.`;

/** Avalia uma exigência de permissão com as permissões reais; devolve o motivo se falhar. */
export function usePermissionGate() {
  const { hasPermission, hasAnyPermission, loading } = usePermissions();
  return (req?: PermissionReq, requireAll?: boolean): { allowed: boolean; reason?: string } => {
    if (!req || (Array.isArray(req) && req.length === 0)) return { allowed: true };
    if (loading) return { allowed: false, reason: "A carregar permissões…" };
    const list = typeof req === "string" ? [req] : [...req];
    const ok = requireAll ? list.every((p) => hasPermission(p)) : hasAnyPermission(list);
    return ok ? { allowed: true } : { allowed: false, reason: permissionReason(list) };
  };
}

const BTN =
  "inline-flex min-h-[30px] items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1 text-[13px] font-[550] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
const BTN_VARIANT = {
  default: "border-border bg-card text-foreground hover:bg-muted",
  primary: "border-primary bg-primary text-primary-foreground hover:bg-primary/90",
  destructive: "border-destructive bg-destructive text-destructive-foreground hover:brightness-95",
} as const;

function PrimaryButton({ action }: { action: RowPrimaryAction }) {
  const gate = usePermissionGate();
  const reasonId = useId();
  const perm = gate(action.permission, action.requireAllPermissions);
  const blocked = !!action.disabled || !perm.allowed;
  const reason = action.disabled ? action.disabledReason : perm.reason;
  const Icon = action.icon;
  const button = (
    <button
      type="button"
      aria-disabled={blocked || undefined}
      aria-describedby={blocked && reason ? reasonId : undefined}
      onClick={(e) => {
        e.stopPropagation();
        if (!blocked) action.onClick();
      }}
      className={cn(BTN, BTN_VARIANT[action.variant ?? "default"], blocked && "cursor-not-allowed opacity-50")}
    >
      {Icon ? <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" /> : null}
      {action.label}
      {blocked && reason ? (
        <span id={reasonId} className="sr-only">
          {reason}
        </span>
      ) : null}
    </button>
  );
  if (!blocked || !reason) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent className="max-w-xs">{reason}</TooltipContent>
    </Tooltip>
  );
}

/** Remove separadores nas pontas e repetidos. */
function tidy(entries: RowActionEntry[]): RowActionEntry[] {
  const out: RowActionEntry[] = [];
  for (const e of entries) {
    if (e === "separator" && (out.length === 0 || out[out.length - 1] === "separator")) continue;
    out.push(e);
  }
  while (out[out.length - 1] === "separator") out.pop();
  return out;
}

export function RowActions({ primary, items, menuLabel = "Mais ações", modal = true, className }: RowActionsProps) {
  const gate = usePermissionGate();
  const resolved = tidy(
    (items ?? []).flatMap<RowActionEntry>((it) => {
      if (it === "separator") return [it];
      if (it.hidden) return [];
      const perm = gate(it.permission, it.requireAllPermissions);
      if (!perm.allowed && it.hideWithoutPermission) return [];
      if (!perm.allowed) return [{ ...it, disabled: true, disabledReason: perm.reason }];
      return [it];
    }),
  );

  return (
    <div
      className={cn("inline-flex items-center gap-1", className)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") e.stopPropagation();
      }}
    >
      {primary && !primary.hidden ? <PrimaryButton action={primary} /> : null}
      {resolved.length > 0 ? (
        <DropdownMenu modal={modal}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={menuLabel}
              className="inline-flex min-h-[30px] min-w-[30px] items-center justify-center rounded-lg border border-transparent bg-transparent p-1 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=open]:bg-muted"
            >
              <MoreHorizontal className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-[250px] max-w-[calc(100vw-16px)] rounded-xl p-[5px] shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            {resolved.map((it, i) => {
              if (it === "separator") return <DropdownMenuSeparator key={`sep-${i}`} className="mx-0 my-1 bg-border" />;
              const Icon = it.icon;
              return (
                <DropdownMenuItem
                  key={`${it.label}-${i}`}
                  disabled={it.disabled}
                  onSelect={() => it.onSelect()}
                  className={cn(
                    "min-h-[34px] flex-wrap gap-[9px] rounded-lg px-2.5 py-2 text-sm focus:bg-muted focus:text-foreground",
                    "data-[disabled]:opacity-45",
                    it.destructive && "text-destructive focus:text-destructive",
                  )}
                >
                  {Icon ? <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" /> : null}
                  <span>{it.label}</span>
                  {it.disabled && it.disabledReason ? (
                    <small className="-mt-0.5 w-full pl-[27px] text-xs text-muted-foreground">{it.disabledReason}</small>
                  ) : null}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
