import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FOCO } from "@/components/negocio-metas/estilos";
import { PERMISSOES } from "./catalogoExemplo";
import { rolesAtribuiveis } from "./logica";
import { TagEstado } from "./pecas";
import { textoAmbito } from "./textos";
import type { Organizacao, Role, Utilizador, Vinculo } from "./tipos";

interface SeparadorVinculosProps {
  utilizador: Utilizador;
  roles: Role[];
  organizacoes: Organizacao[];
  protegido: boolean;
  /** Muda a role escolhida para uma organização (só no ecrã; é um exemplo). */
  aoEscolher: (organizacaoId: string, roleId: string) => void;
}

function AmbitosDoVinculo({ v, role }: { v: Vinculo; role: Role | undefined }) {
  const { t } = useTranslation();
  const sensiveis = PERMISSOES.filter((p) => p.comAmbito && role?.permissoes.includes(p.codigo));
  if (sensiveis.length === 0) return <p className="text-sm text-muted-foreground">{t("usersProfiles.links.noScope")}</p>;
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
      {sensiveis.map((p) => (
        <div key={p.codigo} className="flex justify-between gap-3 border-b border-border/60 py-1">
          <dt className="text-muted-foreground">{p.nome}</dt>
          <dd className="font-medium text-foreground">{textoAmbito(t, v.ambitos[p.codigo] ?? "OWNED")}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Um bloco por organização: a role (Select), o estado do vínculo e o âmbito das permissões sensíveis. */
export function SeparadorVinculos({ utilizador: u, roles, organizacoes, protegido, aoEscolher }: SeparadorVinculosProps) {
  const { t } = useTranslation();
  const opcoes = rolesAtribuiveis(roles);
  return (
    <div className="space-y-4">
      {protegido && <p className="text-sm text-muted-foreground">{t("usersProfiles.links.protectedNote")}</p>}
      {u.vinculos.map((v) => {
        const org = organizacoes.find((o) => o.id === v.organizacaoId)?.nome ?? v.organizacaoId;
        const role = roles.find((r) => r.id === v.roleId);
        const idSelect = `role-${u.id}-${v.organizacaoId}`;
        return (
          <section key={v.organizacaoId} aria-labelledby={`${idSelect}-org`} className="space-y-3 rounded-md border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id={`${idSelect}-org`} className="text-base font-semibold text-foreground">{org}</h3>
              <TagEstado ativo={v.ativo} />
            </div>
            <div className="space-y-1">
              <label htmlFor={idSelect} className="text-sm text-muted-foreground">{t("usersProfiles.links.role")}</label>
              <Select
                value={v.roleId} disabled={protegido}
                onValueChange={(roleId) => {
                  aoEscolher(v.organizacaoId, roleId);
                  toast.info(t("usersProfiles.example.changeRole", { name: u.nome, role: roles.find((r) => r.id === roleId)?.nome ?? "", org }));
                }}
              >
                <SelectTrigger id={idSelect} className={cn("h-11 sm:max-w-xs", FOCO)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(protegido && role ? [role] : opcoes).map((r) => <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-medium text-foreground">{t("usersProfiles.links.scopeTitle")}</h4>
              <AmbitosDoVinculo v={v} role={role} />
            </div>
          </section>
        );
      })}
    </div>
  );
}
