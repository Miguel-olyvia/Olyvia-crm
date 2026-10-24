// A aba "Vínculos" do formulário de utilizador: pelo menos um vínculo (organização + role), cada organização uma só vez.
import { Plus } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { FOCO } from "@/components/negocio-metas/estilos";
import { AJUDA_CAMPO, ErroCampo } from "./CampoForm";
import { CartaoVinculoForm } from "./CartaoVinculoForm";
import type { Editor } from "./logica";
import { haOrganizacaoLivre, organizacoesLivres, rolesOferecidas } from "./regrasVinculos";
import type { Organizacao, Role, Vinculo } from "./tipos";

export interface AcoesVinculos {
  mudar: (indice: number, parcial: Partial<Vinculo>) => void;
  adicionar: () => void;
  remover: (indice: number) => void;
}

interface AbaVinculosFormProps {
  /** A base dos ids dos campos (`<id>-v0-org`, `<id>-v0-role`...). */
  id: string;
  vinculos: Vinculo[];
  erro: string | undefined;
  organizacoes: Organizacao[];
  roles: Role[];
  editor: Editor;
  /** Super administrador: só se vê. */
  bloqueado: boolean;
  acoes: AcoesVinculos;
}

export function AbaVinculosForm({ id, vinculos, erro, organizacoes, roles, editor, bloqueado, acoes }: AbaVinculosFormProps) {
  const { t } = useTranslation();
  const oferecidas = rolesOferecidas(roles, editor);
  const livre = haOrganizacaoLivre(organizacoes, vinculos);
  return (
    <div className="space-y-4">
      <p className={AJUDA_CAMPO}>{t("usersProfiles.form.links.intro")} {t("usersProfiles.form.links.onlyAssignable")}</p>
      <ErroCampo id={`${id}-vinculos-erro`} campo="vinculos" codigo={erro} />
      {vinculos.map((v, i) => (
        <CartaoVinculoForm
          key={i} id={`${id}-v${i}`} indice={i} vinculo={v} roles={oferecidas} todasAsRoles={roles}
          organizacoes={organizacoesLivres(organizacoes, vinculos, i)} desativado={bloqueado}
          podeRemover={vinculos.length > 1} comErro={!!erro} aoMudar={(parcial) => acoes.mudar(i, parcial)} aoRemover={() => acoes.remover(i)}
        />
      ))}
      <div className="space-y-1.5">
        <Button type="button" variant="outline" className={cn("min-h-11", FOCO)} disabled={bloqueado || !livre} onClick={acoes.adicionar}>
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {t("usersProfiles.form.links.add")}
        </Button>
        {!livre && !bloqueado && <p className={AJUDA_CAMPO}>{t("usersProfiles.form.links.noFree")}</p>}
      </div>
    </div>
  );
}
