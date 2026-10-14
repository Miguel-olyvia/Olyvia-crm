import { Check, Search, X } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { chip, FOCO } from "@/components/negocio-metas/estilos";
import { haFiltros } from "./logica";
import type { EstadoFiltro, FiltrosUtilizadores, Organizacao, Role } from "./tipos";

interface BarraFiltrosProps {
  filtros: FiltrosUtilizadores;
  roles: Role[];
  organizacoes: Organizacao[];
  aoMudar: (f: FiltrosUtilizadores) => void;
  aoLimpar: () => void;
}

const ESTADOS: EstadoFiltro[] = ["ativos", "inativos", "todos"];
const SELECT = cn("h-11 w-full rounded-md border border-input bg-background px-3 text-sm sm:w-auto", FOCO);

interface OpcoesSelect {
  rotulo: string;
  todas: string;
  valor: string;
  opcoes: { id: string; nome: string }[];
  aoMudar: (v: string) => void;
}

function CampoSelect({ rotulo, todas, valor, opcoes, aoMudar }: OpcoesSelect) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:gap-2">
      <span>{rotulo}</span>
      <select value={valor} onChange={(e) => aoMudar(e.target.value)} className={SELECT}>
        <option value="">{todas}</option>
        {opcoes.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
      </select>
    </label>
  );
}

/** Pesquisa, estado (chips), role e organização; "Limpar filtros" só aparece quando há algum. */
export function BarraFiltros({ filtros, roles, organizacoes, aoMudar, aoLimpar }: BarraFiltrosProps) {
  const { t } = useTranslation();
  const mudar = (parte: Partial<FiltrosUtilizadores>) => aoMudar({ ...filtros, ...parte });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-3">
        <div className="relative min-w-52 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            type="search" value={filtros.texto} onChange={(e) => mudar({ texto: e.target.value })}
            aria-label={t("usersProfiles.filters.search")} placeholder={t("usersProfiles.filters.search")}
            className={cn("h-11 pl-9", FOCO)}
          />
        </div>
        <CampoSelect
          rotulo={t("usersProfiles.filters.role")} todas={t("usersProfiles.filters.allRoles")} valor={filtros.roleId}
          opcoes={roles} aoMudar={(roleId) => mudar({ roleId })}
        />
        <CampoSelect
          rotulo={t("usersProfiles.filters.organization")} todas={t("usersProfiles.filters.allOrganizations")}
          valor={filtros.organizacaoId} opcoes={organizacoes} aoMudar={(organizacaoId) => mudar({ organizacaoId })}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label={t("usersProfiles.filters.state")} className="flex flex-wrap gap-2">
          {ESTADOS.map((e) => (
            <button key={e} type="button" aria-pressed={filtros.estado === e} onClick={() => mudar({ estado: e })} className={chip(filtros.estado === e)}>
              {filtros.estado === e && <Check className="h-4 w-4" aria-hidden="true" />}
              {t(`usersProfiles.filters.state.${e}`)}
            </button>
          ))}
        </div>
        {haFiltros(filtros) && (
          <Button type="button" variant="ghost" onClick={aoLimpar} className={cn("min-h-11", FOCO)}>
            <X className="mr-1 h-4 w-4" aria-hidden="true" />
            {t("usersProfiles.filters.clear")}
          </Button>
        )}
      </div>
    </div>
  );
}
