// A aba "Acesso" do painel "Nova pessoa": criar ou não o acesso à plataforma. Desligado (o normal), a pessoa fica só como
// trabalhadora; ligado, pede o grupo de permissões e o e-mail de acesso. RH é a pessoa como trabalhador, não o utilizador.
import { Seccao } from "@/components/ficha-comum/Seccao";
import { CampoInterruptor, CampoSelect, CampoTexto } from "@/components/rh-exemplo/form/Campos";
import { usePapeisDaOrganizacao } from "@/components/rh-exemplo/hooks/usePapeisDaOrganizacao";
import { useTranslation } from "@/hooks/useTranslation";
import { idCampo, type CamposNovaProps } from "./tiposCampos";

export function CamposAcesso({ valores, definir, erro }: CamposNovaProps) {
  const { t } = useTranslation();
  const { papeis } = usePapeisDaOrganizacao();
  const ligar = (ligado: boolean) =>
    definir({ criarAcesso: ligado, ...(ligado && valores.emailAcesso === "" ? { emailAcesso: valores.emailPessoal } : {}) });
  return (
    <div className="space-y-4">
      <Seccao titulo={t("rhForm.nova.sec.acesso")}>
        <div className="space-y-4">
          <CampoInterruptor
            id="rh-nova-criarAcesso" label={t("rhForm.nova.f.criarAcesso")} descricao={t("rhForm.nova.h.criarAcesso")}
            checked={valores.criarAcesso} onChange={ligar}
          />
          {valores.criarAcesso && (
            <div className="grid gap-4 sm:grid-cols-2">
              <CampoSelect
                id={idCampo("papelId")} label={t("rhForm.nova.f.papelId")} valor={valores.papelId} obrigatorio
                placeholder={t("rhForm.nova.escolher")} erro={erro("papelId")} onChange={(v) => definir({ papelId: v })}
                opcoes={papeis.map((p) => ({ value: p.id, label: p.name }))}
              />
              <CampoTexto
                id={idCampo("emailAcesso")} label={t("rhForm.nova.f.emailAcesso")} tipo="email" valor={valores.emailAcesso}
                obrigatorio ajuda={t("rhForm.nova.h.acessoEmail")} erro={erro("emailAcesso")}
                onChange={(v) => definir({ emailAcesso: v })}
              />
            </div>
          )}
        </div>
      </Seccao>
    </div>
  );
}
