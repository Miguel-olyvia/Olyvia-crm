// Um vínculo no formulário de utilizador: organização (sem repetir), role (só as que a organização oferece e se podem
// atribuir), remover, e o âmbito das permissões sensíveis. Não há «vínculo inativo» aqui: como em /users, tirar o vínculo
// da lista é o que o desativa. Os âmbitos só se gravam num vínculo que já existe (rpc_update_user).
import { Trash2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FOCO } from "@/components/negocio-metas/estilos";
import { AmbitosVinculoForm } from "./AmbitosVinculoForm";
import { AJUDA_CAMPO, RotuloCampo } from "./CampoForm";
import { permissoesComAmbito } from "./regrasVinculos";
import type { Organizacao, Permissao, Role, Vinculo } from "./tipos";

interface CartaoVinculoFormProps {
  id: string;
  indice: number;
  vinculo: Vinculo;
  organizacoes: Organizacao[];
  /** As roles que se podem escolher aqui (já com a que o vínculo tem, se saiu da lista). */
  roles: Role[];
  /** As permissões do catálogo real, para mostrar as que têm âmbito. */
  catalogo: Permissao[];
  /** Sem users.manage_roles os âmbitos só se veem. */
  podeEditarAmbitos: boolean;
  desativado: boolean;
  podeRemover: boolean;
  comErro: boolean;
  aoMudar: (parcial: Partial<Vinculo>) => void;
  aoRemover: () => void;
}

const CAMPO = cn("min-h-11", FOCO);

interface SeletorProps {
  id: string;
  texto: string;
  placeholder: string;
  valor: string;
  opcoes: { id: string; nome: string }[];
  desativado: boolean;
  invalido: boolean;
  aoMudar: (v: string) => void;
}

/** Um Select obrigatório com rótulo visível (a organização e a role do vínculo). */
function Seletor({ id, texto, placeholder, valor, opcoes, desativado, invalido, aoMudar }: SeletorProps) {
  return (
    <div className="space-y-1.5">
      <RotuloCampo para={id} texto={texto} obrigatorio />
      <Select value={valor} disabled={desativado} onValueChange={aoMudar}>
        <SelectTrigger id={id} aria-required="true" aria-invalid={invalido ? true : undefined} className={CAMPO}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {opcoes.map((o) => <SelectItem key={o.id} value={o.id} className="min-h-11">{o.nome}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

export function CartaoVinculoForm(p: CartaoVinculoFormProps) {
  const { t } = useTranslation();
  const { id, indice, vinculo: v } = p;
  const n = indice + 1;
  const atual = p.roles.find((r) => r.id === v.roleId);
  const existe = !!v.membershipId;
  return (
    <section aria-labelledby={`${id}-titulo`} className="space-y-4 rounded-md border p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 id={`${id}-titulo`} className="text-base font-semibold text-foreground">{t("usersProfiles.form.links.card", { n })}</h3>
        <Button
          type="button" variant="ghost" size="icon" className={cn("h-11 w-11 shrink-0", FOCO)} disabled={p.desativado || !p.podeRemover}
          aria-label={t("usersProfiles.form.links.remove", { n })} title={p.podeRemover ? undefined : t("usersProfiles.form.links.removeLast")}
          onClick={p.aoRemover}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Seletor
          id={`${id}-org`} texto={t("usersProfiles.form.links.organization")} placeholder={t("usersProfiles.form.links.organization.placeholder")}
          valor={v.organizacaoId} opcoes={p.organizacoes} desativado={p.desativado} invalido={p.comErro && !v.organizacaoId}
          aoMudar={(organizacaoId) => p.aoMudar({ organizacaoId })}
        />
        <Seletor
          id={`${id}-role`} texto={t("usersProfiles.form.links.role")} placeholder={t("usersProfiles.form.links.role.placeholder")}
          valor={v.roleId} opcoes={p.roles} desativado={p.desativado} invalido={p.comErro && !v.roleId}
          aoMudar={(roleId) => p.aoMudar({ roleId })}
        />
      </div>
      <AmbitosVinculoForm
        permissoes={permissoesComAmbito(atual, p.catalogo)} ambitos={v.ambitos} desativado={p.desativado || !p.podeEditarAmbitos || !existe}
        aoMudar={(ambitos) => p.aoMudar({ ambitos })}
      />
      {!existe && <p className={AJUDA_CAMPO}>{t("usersProfiles.form.links.scopeAfterCreate")}</p>}
    </section>
  );
}
