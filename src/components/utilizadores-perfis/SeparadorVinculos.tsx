import { useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FOCO } from "@/components/negocio-metas/estilos";
import type { Editor } from "./logica";
import { TagEstado } from "./pecas";
import { permissoesComAmbito, rolesDoVinculo } from "./regrasVinculos";
import { textoAmbito } from "./textos";
import type { Organizacao, Permissao, Role, Utilizador, Vinculo } from "./tipos";

interface SeparadorVinculosProps {
  utilizador: Utilizador;
  roles: Role[];
  organizacoes: Organizacao[];
  catalogo: Permissao[];
  editor: Editor;
  /** Não se pode mudar a role (utilizador protegido, ou sem permissão para gerir roles). */
  somenteLeitura: boolean;
  /** Muda a role de um vínculo já existente (rpc_update_user). O resultado trata-o a página. */
  aoEscolher: (membershipId: string, roleId: string) => Promise<void>;
}

function AmbitosDoVinculo({ v, role, catalogo }: { v: Vinculo; role: Role | undefined; catalogo: Permissao[] }) {
  const { t } = useTranslation();
  const sensiveis = permissoesComAmbito(role, catalogo);
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

/** Um bloco por vínculo: a role (Select, só nos vínculos ativos e com permissão), o estado do vínculo e o âmbito das permissões sensíveis. */
export function SeparadorVinculos({ utilizador: u, roles, organizacoes, catalogo, editor, somenteLeitura, aoEscolher }: SeparadorVinculosProps) {
  const { t } = useTranslation();
  const [aGravar, setAGravar] = useState(false);
  const escolher = async (membershipId: string, roleId: string) => {
    setAGravar(true);
    try { await aoEscolher(membershipId, roleId); } finally { setAGravar(false); }
  };
  return (
    <div className="space-y-4">
      {somenteLeitura && <p className="text-sm text-muted-foreground">{t("usersProfiles.links.protectedNote")}</p>}
      {u.vinculos.map((v) => {
        const org = organizacoes.find((o) => o.id === v.organizacaoId)?.nome ?? v.organizacaoId;
        const role = roles.find((r) => r.id === v.roleId);
        const chave = v.membershipId ?? v.organizacaoId;
        const idSelect = `role-${u.id}-${chave}`;
        const opcoes = rolesDoVinculo(roles, v, organizacoes, editor);
        const bloqueado = somenteLeitura || aGravar || !v.ativo || !v.membershipId;
        return (
          <section key={chave} aria-labelledby={`${idSelect}-org`} className="space-y-3 rounded-md border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id={`${idSelect}-org`} className="text-base font-semibold text-foreground">{org}</h3>
              <TagEstado ativo={v.ativo} />
            </div>
            <div className="space-y-1">
              <label htmlFor={idSelect} className="text-sm text-muted-foreground">{t("usersProfiles.links.role")}</label>
              <Select value={v.roleId} disabled={bloqueado} onValueChange={(roleId) => { if (v.membershipId && roleId !== v.roleId) void escolher(v.membershipId, roleId); }}>
                <SelectTrigger id={idSelect} className={cn("h-11 sm:max-w-xs", FOCO)}>
                  <SelectValue placeholder={role?.nome ?? v.roleCodigo} />
                </SelectTrigger>
                <SelectContent>
                  {opcoes.map((r) => <SelectItem key={r.id} value={r.id}>{r.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-medium text-foreground">{t("usersProfiles.links.scopeTitle")}</h4>
              <AmbitosDoVinculo v={v} role={role} catalogo={catalogo} />
            </div>
          </section>
        );
      })}
    </div>
  );
}
