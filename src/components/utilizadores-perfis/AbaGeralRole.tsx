// A aba "Geral" do formulário de role: nome, código, descrição, "pode assinar contratos" e (ao criar) o modelo de partida.
import { Lock } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FOCO } from "@/components/negocio-metas/estilos";
import { AJUDA_CAMPO, ErroCampo, RotuloCampo } from "./CampoForm";
import type { ModeloRole, ValoresFormRole } from "./modelosRole";
import type { Role } from "./tipos";
import type { ErrosRole } from "./validacoes";

export const MODELO_EM_BRANCO = "blank";
export const MODELO_DUPLICAR = "duplicate";

export interface AcoesGeralRole {
  nome: (v: string) => void;
  codigo: (v: string) => void;
  descricao: (v: string) => void;
  podeAssinar: (v: boolean) => void;
  modelo: (v: string) => void;
  fonte: (roleId: string) => void;
}

interface AbaGeralRoleProps {
  /** A base dos ids dos campos (`<id>-nome`, `<id>-codigo`...). */
  id: string;
  valores: ValoresFormRole;
  erros: ErrosRole;
  /** Role de sistema: tudo só de leitura. */
  bloqueado: boolean;
  /** O seletor de modelo só aparece ao criar. */
  comModelo: boolean;
  modelo: string;
  fonteId: string;
  roles: Role[];
  /** Os modelos da base (role_templates). */
  modelos: ModeloRole[];
  /** A mensagem da falha ao ler os modelos, ou `null`. */
  erroModelos: string | null;
  /** Aviso a mostrar no topo (por exemplo, sem permissão para editar), além do de role de sistema. */
  aviso?: string | null;
  acoes: AcoesGeralRole;
}

const CAMPO = (invalido: boolean) => cn("min-h-11", FOCO, invalido && "border-destructive");

function SeletorModelo({ id, modelo, fonteId, roles, modelos, erroModelos, acoes }: Pick<AbaGeralRoleProps, "id" | "modelo" | "fonteId" | "roles" | "modelos" | "erroModelos" | "acoes">) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1.5">
      <RotuloCampo para={`${id}-modelo`} texto={t("usersProfiles.form.role.template")} />
      <Select value={modelo} onValueChange={acoes.modelo}>
        <SelectTrigger id={`${id}-modelo`} aria-describedby={`${id}-modelo-ajuda`} className={CAMPO(false)}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={MODELO_EM_BRANCO} className="min-h-11">{t("usersProfiles.form.role.template.blank")}</SelectItem>
          <SelectItem value={MODELO_DUPLICAR} className="min-h-11">{t("usersProfiles.form.role.template.duplicate")}</SelectItem>
          {modelos.map((m) => <SelectItem key={m.id} value={m.id} className="min-h-11">{m.nome}</SelectItem>)}
        </SelectContent>
      </Select>
      <p id={`${id}-modelo-ajuda`} className={AJUDA_CAMPO}>{t("usersProfiles.form.role.template.hint")}</p>
      {erroModelos && <p role="alert" className="text-sm text-destructive">{t("usersProfiles.form.role.template.error", { message: erroModelos })}</p>}
      {modelo === MODELO_DUPLICAR && (
        <div className="space-y-1.5 pt-1">
          <RotuloCampo para={`${id}-fonte`} texto={t("usersProfiles.form.role.template.source")} />
          <Select value={fonteId} onValueChange={acoes.fonte}>
            <SelectTrigger id={`${id}-fonte`} className={CAMPO(false)}>
              <SelectValue placeholder={t("usersProfiles.form.role.template.sourcePlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => <SelectItem key={r.id} value={r.id} className="min-h-11">{r.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

function CampoAssina({ id, ligado, bloqueado, aoMudar }: { id: string; ligado: boolean; bloqueado: boolean; aoMudar: (v: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border p-3">
      <div className="space-y-0.5">
        <RotuloCampo para={`${id}-assina`} texto={t("usersProfiles.form.role.signs")} />
        <p id={`${id}-assina-ajuda`} className={AJUDA_CAMPO}>{t("usersProfiles.form.role.signs.hint")}</p>
      </div>
      <Switch id={`${id}-assina`} checked={ligado} disabled={bloqueado} aria-describedby={`${id}-assina-ajuda`} className={FOCO} onCheckedChange={aoMudar} />
    </div>
  );
}

export function AbaGeralRole(p: AbaGeralRoleProps) {
  const { t } = useTranslation();
  const { id, valores, erros, bloqueado, acoes } = p;
  return (
    <div className="space-y-5">
      {bloqueado && (
        <p className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 text-sm text-foreground">
          <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
          {p.aviso ?? t("usersProfiles.form.role.systemNote")}
        </p>
      )}
      {p.comModelo && <SeletorModelo id={id} modelo={p.modelo} fonteId={p.fonteId} roles={p.roles} modelos={p.modelos} erroModelos={p.erroModelos} acoes={acoes} />}
      <div className="space-y-1.5">
        <RotuloCampo para={`${id}-nome`} texto={t("usersProfiles.form.role.name")} obrigatorio />
        <Input
          id={`${id}-nome`} data-foco-inicial value={valores.nome} readOnly={bloqueado} aria-required="true"
          aria-invalid={erros.nome ? true : undefined} aria-describedby={erros.nome ? `${id}-nome-erro` : undefined}
          placeholder={t("usersProfiles.form.role.name.placeholder")} className={CAMPO(!!erros.nome)}
          onChange={(e) => acoes.nome(e.target.value)}
        />
        <ErroCampo id={`${id}-nome-erro`} campo="name" codigo={erros.nome} />
      </div>
      <div className="space-y-1.5">
        <RotuloCampo para={`${id}-codigo`} texto={t("usersProfiles.form.role.code")} obrigatorio />
        <Input
          id={`${id}-codigo`} value={valores.codigo} readOnly={bloqueado} aria-required="true" spellCheck={false} autoComplete="off"
          aria-invalid={erros.codigo ? true : undefined}
          aria-describedby={[`${id}-codigo-ajuda`, erros.codigo ? `${id}-codigo-erro` : ""].filter(Boolean).join(" ")}
          className={cn(CAMPO(!!erros.codigo), "font-mono")} onChange={(e) => acoes.codigo(e.target.value)}
        />
        <p id={`${id}-codigo-ajuda`} className={AJUDA_CAMPO}>{t(bloqueado ? "usersProfiles.form.role.code.locked" : "usersProfiles.form.role.code.hint")}</p>
        <ErroCampo id={`${id}-codigo-erro`} campo="code" codigo={erros.codigo} />
      </div>
      <div className="space-y-1.5">
        <RotuloCampo para={`${id}-descricao`} texto={t("usersProfiles.form.role.description")} />
        <Textarea id={`${id}-descricao`} value={valores.descricao} readOnly={bloqueado} rows={3} className={FOCO} onChange={(e) => acoes.descricao(e.target.value)} />
      </div>
      <CampoAssina id={id} ligado={valores.podeAssinar} bloqueado={bloqueado} aoMudar={acoes.podeAssinar} />
    </div>
  );
}
