// A aba "Acesso e convite" do painel "Nova pessoa": pedir ou não o acesso à plataforma (grupo de permissões e e-mail de acesso)
// e, à parte, o convite de admissão (para a pessoa preencher os seus dados): destinatário e validade. O acesso pedido aqui
// fica como pendência da ficha e conclui-se nela («Criar acesso»); o convite envia-se com «Criar e enviar convite», e o link
// só se mostra uma vez, no diálogo de envio (nunca aqui).
//
// O seletor do grupo de permissões depende de `roles.view` (quem só tem permissão de RH não lê os grupos): sem ela mostra-se o
// MOTIVO em vez de um seletor vazio, e o grupo não se exige (ver `papelDisponivel` na validação).
import { Mail } from "lucide-react";
import { usePapeisDaOrganizacao } from "@/components/rh-exemplo/hooks/usePapeisDaOrganizacao";
import { usePermissions } from "@/components/rh-exemplo/hooks/usePermissions";
import { useTranslation } from "@/hooks/useTranslation";
import { CampoI, CampoS, CampoT, GRELHA, LinhaCampo } from "./camposNova";
import { useNova } from "./contextoNova";
import { SeccaoNova } from "./SeccaoNova";
import { DIAS_DO_CONVITE } from "./tiposNova";

/** O seletor só existe (e só pede os grupos à base) para quem pode ver os grupos. */
function SeletorPapel() {
  const { t } = useTranslation();
  const { papeis } = usePapeisDaOrganizacao();
  return (
    <CampoS
      g="acesso" k="role_id" id="hr-novo-papel" rotulo={t("hr.acesso.papel")} placeholder={t("hr.acesso.papelPlaceholder")}
      opcoes={papeis.map((p) => ({ value: p.id, label: p.name }))}
    />
  );
}

function PapelSemPermissao() {
  const { t } = useTranslation();
  return (
    <LinhaCampo id="hr-novo-papel-motivo">
      <p id="hr-novo-papel-motivo" className="text-sm text-muted-foreground">{t("rhNova.h.papelSemPermissao")}</p>
    </LinhaCampo>
  );
}

function Plataforma() {
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  return (
    <SeccaoNova titulo={t("rhNova.sec.acesso")}>
      <div className={GRELHA}>
        <CampoI g="extra" k="criar_acesso" id="hr-novo-criar-acesso" rotulo={t("rhNova.f.criarAcesso")} ajuda={t("rhNova.h.criarAcesso")} largo />
        {hasPermission("roles.view") ? <SeletorPapel /> : <PapelSemPermissao />}
        <CampoT g="extra" k="email_acesso" id="hr-novo-email-acesso" tipo="email" rotulo={t("rhNova.f.emailAcesso")} ajuda={t("rhNova.h.emailAcesso")} />
      </div>
    </SeccaoNova>
  );
}

function Convite() {
  const { t } = useTranslation();
  const { valores } = useNova();
  const destino = valores.pessoais.email_pessoal.trim();
  return (
    <SeccaoNova titulo={t("hr.convite.estado.titulo")}>
      <div className="space-y-2 rounded-md border p-3 text-sm">
        <p className="flex items-start gap-2">
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span>{t("rhNova.convite.explicacao")}</span>
        </p>
        <dl className="grid gap-x-4 gap-y-1 sm:grid-cols-[auto_1fr]">
          <dt className="text-muted-foreground">{t("hr.convite.email")}</dt>
          <dd>{destino === "" ? t("rhNova.convite.semEmail") : destino}</dd>
          <dt className="text-muted-foreground">{t("rhNova.convite.validade")}</dt>
          <dd>{t("rhNova.convite.validadeDias", { dias: DIAS_DO_CONVITE })}</dd>
        </dl>
      </div>
    </SeccaoNova>
  );
}

export function AbaAcesso() {
  return (
    <div className="space-y-4">
      <Plataforma />
      <Convite />
    </div>
  );
}
