// A aba "Acesso e convite" do painel "Nova pessoa": criar ou não o acesso à plataforma (grupo de permissões e e-mail de acesso) e,
// à parte, o convite de admissão (para a pessoa preencher os seus dados): destinatário, validade e um link de exemplo.
import { Mail } from "lucide-react";
import { validadeDoConvite } from "@/components/rh-exemplo/dados/fichaNovaPessoa";
import { usePapeisDaOrganizacao } from "@/components/rh-exemplo/hooks/usePapeisDaOrganizacao";
import { useTranslation } from "@/hooks/useTranslation";
import { CampoI, CampoS, CampoT, GRELHA } from "./camposNova";
import { useNova } from "./contextoNova";
import { SeccaoNova } from "./SeccaoNova";

/** O link de exemplo: não aponta para lado nenhum, só mostra o aspeto de um link de convite. */
export const LINK_CONVITE_EXEMPLO = "https://exemplo.olyvia.pt/convite/k7Qm2xW9";

function Plataforma() {
  const { t } = useTranslation();
  const { papeis } = usePapeisDaOrganizacao();
  return (
    <SeccaoNova titulo={t("rhNova.sec.acesso")}>
      <div className={GRELHA}>
        <CampoI g="extra" k="criar_acesso" id="hr-novo-criar-acesso" rotulo={t("rhNova.f.criarAcesso")} ajuda={t("rhNova.h.criarAcesso")} largo />
        <CampoS
          g="acesso" k="role_id" id="hr-novo-papel" rotulo={t("hr.acesso.papel")} placeholder={t("hr.acesso.papelPlaceholder")}
          opcoes={papeis.map((p) => ({ value: p.id, label: p.name }))}
        />
        <CampoT g="extra" k="email_acesso" id="hr-novo-email-acesso" tipo="email" rotulo={t("rhNova.f.emailAcesso")} ajuda={t("rhNova.h.emailAcesso")} />
      </div>
    </SeccaoNova>
  );
}

function Convite() {
  const { t, language } = useTranslation();
  const { valores } = useNova();
  const validade = new Date(`${validadeDoConvite()}T00:00:00Z`).toLocaleDateString(language === "pt" ? "pt-PT" : language, { timeZone: "UTC" });
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
          <dd>{t("rhNova.convite.validadeValor", { data: validade })}</dd>
          <dt className="text-muted-foreground">{t("hr.convite.linkDoConvite")}</dt>
          <dd><code className="break-all rounded bg-muted px-1.5 py-0.5 text-xs">{LINK_CONVITE_EXEMPLO}</code></dd>
        </dl>
        <p className="text-xs text-muted-foreground">{t("rhNova.convite.exemplo")}</p>
        <p className="text-xs text-muted-foreground">{t("rhAdm.nova.fluxo")}</p>
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
