// Um vínculo no formulário de utilizador: organização (sem repetir), role (só as que se podem atribuir), estado do vínculo,
// remover, e o âmbito das permissões sensíveis.
import { Trash2 } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { FOCO } from "@/components/negocio-metas/estilos";
import { AmbitosVinculoForm } from "./AmbitosVinculoForm";
import { RotuloCampo } from "./CampoForm";
import { PERMISSOES } from "./catalogoExemplo";
import { permissoesComAmbito } from "./regrasVinculos";
import type { Organizacao, Role, Vinculo } from "./tipos";

interface CartaoVinculoFormProps {
  id: string;
  indice: number;
  vinculo: Vinculo;
  organizacoes: Organizacao[];
  /** As roles que se podem escolher aqui (mais a que o vínculo já tem, se saiu da lista). */
  roles: Role[];
  todasAsRoles: Role[];
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
  const atual = p.todasAsRoles.find((r) => r.id === v.roleId);
  const opcoes = atual && !p.roles.some((r) => r.id === atual.id) ? [atual, ...p.roles] : p.roles;
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
          valor={v.roleId} opcoes={opcoes} desativado={p.desativado} invalido={p.comErro && !v.roleId}
          aoMudar={(roleId) => p.aoMudar({ roleId })}
        />
      </div>
      <div className="flex min-h-11 items-center justify-between gap-3">
        <RotuloCampo para={`${id}-ativo`} texto={t("usersProfiles.form.links.active")} />
        <Switch id={`${id}-ativo`} checked={v.ativo} disabled={p.desativado} className={FOCO} onCheckedChange={(ativo) => p.aoMudar({ ativo })} />
      </div>
      <AmbitosVinculoForm
        permissoes={permissoesComAmbito(atual, PERMISSOES)} ambitos={v.ambitos} desativado={p.desativado}
        aoMudar={(ambitos) => p.aoMudar({ ambitos })}
      />
    </section>
  );
}
