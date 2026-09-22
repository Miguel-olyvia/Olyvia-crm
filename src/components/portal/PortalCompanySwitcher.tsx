import { Check, ChevronsUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePortalCompany, type PortalOrg } from "@/contexts/PortalCompanyContext";
import { cn } from "@/lib/utils";

// Seletor de empresa do portal do cliente.
//
// Só aparece a quem tem acesso a mais do que uma empresa do grupo
// (`hasMultiple`); com uma só empresa devolve null e o cabeçalho mantém o
// bloco estático de branding do ClientPortalLayout.
//
// O portal é usado sobretudo no telemóvel: o nome da empresa ativa é sempre
// visível (é ele que diz ao cliente o que está a ver) e as áreas de toque
// ficam acima dos 24px mínimos.

function OrgAvatar({ org, size }: { org: PortalOrg; size: "sm" | "md" }) {
  const dimension = size === "sm" ? "h-7 w-7" : "h-9 w-9";
  if (org.logoUrl) {
    return (
      <img
        src={org.logoUrl}
        alt={org.name}
        width={size === "sm" ? 28 : 36}
        height={size === "sm" ? 28 : 36}
        className={cn(dimension, "rounded-lg object-contain bg-white shrink-0")}
      />
    );
  }
  return (
    <div
      className={cn(dimension, "rounded-lg flex items-center justify-center text-white font-bold text-xs shrink-0")}
      style={{ backgroundColor: "#7C3AED" }}
      aria-hidden="true"
    >
      {org.name?.charAt(0) || "O"}
    </div>
  );
}

export function PortalCompanySwitcher() {
  const { portalOrgs, activeOrg, setActiveOrg, hasMultiple } = usePortalCompany();

  if (!hasMultiple || !activeOrg) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Empresa ativa: ${activeOrg.name}. Trocar de empresa`}
          className="flex items-center gap-1.5 min-w-0 min-h-[36px] rounded-lg px-2 py-1 -ml-2 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED] focus-visible:ring-offset-1"
        >
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-foreground leading-tight truncate max-w-[10rem] sm:max-w-[18rem]">
              {activeOrg.name}
            </span>
            <span className="block text-[11px] font-medium leading-tight" style={{ color: "#7C3AED" }}>
              Portal do Cliente
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 text-muted-foreground shrink-0" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-[min(18rem,calc(100vw-2rem))]">
        <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
          As suas empresas
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {portalOrgs.map((org) => {
          const isActive = org.organizationId === activeOrg.organizationId;
          return (
            <DropdownMenuItem
              key={org.organizationId}
              onSelect={() => setActiveOrg(org.organizationId)}
              className={cn("gap-2.5 py-2.5 cursor-pointer", isActive && "bg-muted/60")}
            >
              <OrgAvatar org={org} size="sm" />
              <span className="flex-1 min-w-0 text-sm font-medium truncate">{org.name}</span>
              {isActive && <Check className="h-4 w-4 shrink-0" style={{ color: "#7C3AED" }} />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
