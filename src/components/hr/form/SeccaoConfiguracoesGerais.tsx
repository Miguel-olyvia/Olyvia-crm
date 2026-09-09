/**
 * Passo 5 -- Configuracoes gerais: o ACESSO A APLICACAO, e mais nada.
 *
 * E o ultimo passo porque e a unica decisao que nao e sobre a pessoa: e sobre
 * o que ela pode ver no software, e e quem cria a ficha que a toma sozinho.
 *
 * DUAS COISAS QUE SE CONFUNDEM E NAO SAO A MESMA
 * ---------------------------------------------
 * Criar a ficha NAO da acesso. O acesso e o `membership` mais o papel -- e a
 * `COMMENT ON TABLE` de `pessoas` (20261120030000) diz exactamente isto. Por
 * isso ha aqui um cartao em texto a dizê-lo: sem ele, quem preenche o papel
 * fica convencido de que a pessoa ja entra.
 *
 * "Grupo de colaboradores" nao existe e nao se acrescenta.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Info, ShieldCheck } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { CampoInterruptor, CampoSelect, CampoTexto } from "@/components/hr/form/Campos";
import type { RascunhoAcesso } from "@/lib/hr/novaPessoa";
import type { PapelDaOrganizacao } from "@/hooks/usePapeisDaOrganizacao";

interface SeccaoConfiguracoesGeraisProps {
  valor: RascunhoAcesso;
  onPatch: (patch: Partial<RascunhoAcesso>) => void;
  erroDe: (campoId: string) => string | null;
  papeis: PapelDaOrganizacao[];
  papeisALoad: boolean;
  /** Quem nao tem `roles.view` nao ve o atalho para o ecra de Papeis. */
  podeVerPapeis: boolean;
  onAbrirPapeis: () => void;
  emailTrabalho: string;
}

export function SeccaoConfiguracoesGerais({
  valor,
  onPatch,
  erroDe,
  papeis,
  papeisALoad,
  podeVerPapeis,
  onAbrirPapeis,
  emailTrabalho,
}: SeccaoConfiguracoesGeraisProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <Card className="border-muted-foreground/30">
        <CardContent className="flex gap-3 py-4 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{t("hr.acesso.aviso")}</p>
        </CardContent>
      </Card>

      <CampoSelect
        id="hr-novo-role"
        label={t("hr.acesso.grupoPermissoes")}
        ajuda={t("hr.acesso.ajudaGrupoPermissoes")}
        valor={valor.role_id}
        vazioLabel={t("hr.acesso.semPapel")}
        placeholder={
          papeisALoad
            ? t("common.loading")
            : papeis.length === 0
              ? t("hr.acesso.semPapeis")
              : undefined
        }
        disabled={papeisALoad}
        opcoes={papeis.map((papel) => ({ value: papel.id, label: papel.name }))}
        onChange={(v) => onPatch({ role_id: v })}
      />

      {papeis.length === 0 && !papeisALoad && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">{t("hr.acesso.semPapeisExplicacao")}</p>
          {podeVerPapeis && (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={onAbrirPapeis}
            >
              <ShieldCheck className="mr-1 h-3.5 w-3.5" />
              {t("hr.acesso.irParaPapeis")}
            </Button>
          )}
        </div>
      )}

      <CampoInterruptor
        id="hr-novo-enviar-convite"
        label={t("hr.acesso.enviarConvite")}
        descricao={t("hr.acesso.ajudaEnviarConvite")}
        checked={valor.enviar_convite}
        onChange={(v) =>
          onPatch({
            enviar_convite: v,
            email_convite: v && valor.email_convite === "" ? emailTrabalho : valor.email_convite,
          })
        }
      />

      {valor.enviar_convite && (
        <CampoTexto
          id="hr-novo-email-convite"
          label={t("hr.acesso.emailConvite")}
          tipo="email"
          valor={valor.email_convite}
          erro={erroDe("hr-novo-email-convite")}
          onChange={(v) => onPatch({ email_convite: v })}
        />
      )}
    </div>
  );
}
