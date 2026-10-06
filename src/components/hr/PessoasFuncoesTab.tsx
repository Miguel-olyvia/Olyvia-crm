/**
 * O separador Funcoes: o catalogo de CARGOS de RH (onde se gerem, com quantas
 * pessoas tem cada um), e um atalho para os GRUPOS DE PERMISSOES -- que sao
 * outra coisa.
 *
 * DOIS CONCEITOS QUE NAO SE MISTURAM
 * ----------------------------------
 * "Cargo" e o que a pessoa faz (`pessoas.cargo_id` -> `hr_cargos`, e o vinculo
 * laboral em `pessoas_vinculos`). "Papel" e o que a pessoa pode ver na
 * aplicacao (`anew_roles`, editado em `/roles` por `rpc_create_role` e
 * companhia).
 *
 * Por isso este separador NAO embute o ecra de Papeis: (a) sao conceitos
 * diferentes e junta-los faz confundir permissao com cargo; (b) esse ecra e
 * monolitico, com o catalogo de permissoes por categorias no proprio ficheiro,
 * e nao ha componente extraivel sem um refactor grande; (c) esta protegido por
 * `roles.view` -- embuti-lo aqui daria, a quem so tem permissao de RH, a
 * superficie de edicao das permissoes do sistema.
 *
 * O atalho para `/roles` so aparece a quem tem `roles.view`.
 *
 * Os cargos geriam-se noutro ecra (`/rh/cargos`); essa rota agora redirecciona
 * para aqui. Ver `CargosGestao` para as contagens e as permissoes.
 */
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";
import { CargosGestao } from "@/components/hr/CargosGestao";
import { usePermissions } from "@/hooks/usePermissions";
import { useTranslation } from "@/hooks/useTranslation";
import type { PessoaListItem } from "@/types/hr";

interface PessoasFuncoesTabProps {
  pessoas: PessoaListItem[];
  loading: boolean;
}

export function PessoasFuncoesTab({ pessoas, loading }: PessoasFuncoesTabProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const podeVerPapeis = hasPermission("roles.view");

  return (
    <div className="space-y-4">
      <CargosGestao pessoas={pessoas} loading={loading} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            {t("hr.funcoes.papeisTitulo")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{t("hr.funcoes.papeisExplicacao")}</p>
          {podeVerPapeis ? (
            <Button variant="outline" size="sm" onClick={() => navigate("/roles")}>
              {t("hr.funcoes.gerirEmPapeis")}
            </Button>
          ) : (
            <Badge variant="outline" className="font-normal">
              {t("hr.semAcesso")}
            </Badge>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
