/**
 * Passo 1 -- Informacoes gerais: "quem e".
 *
 * As seis coisas que se sabem sem consultar documento nenhum. O numero interno
 * fica aqui, e nao nas laborais, porque e atribuido por quem cria a ficha e
 * nao negociado com a pessoa.
 *
 * Primeiro nome e apelido sao os UNICOS campos obrigatorios de todo o
 * assistente -- e sao os unicos NOT NULL de conteudo em `pessoas`.
 */
import { useTranslation } from "@/hooks/useTranslation";
import { CampoTexto } from "@/components/hr/form/Campos";
import type { RascunhoGeral } from "@/lib/hr/novaPessoa";

interface SeccaoInformacoesGeraisProps {
  valor: RascunhoGeral;
  onPatch: (patch: Partial<RascunhoGeral>) => void;
  erroDe: (campoId: string) => string | null;
}

export function SeccaoInformacoesGerais({
  valor,
  onPatch,
  erroDe,
}: SeccaoInformacoesGeraisProps) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <CampoTexto
        id="hr-novo-primeiro-nome"
        label={t("employees.form.firstName")}
        valor={valor.primeiro_nome}
        erro={erroDe("hr-novo-primeiro-nome")}
        placeholder={t("employees.form.firstNamePlaceholder")}
        onChange={(v) => onPatch({ primeiro_nome: v })}
      />
      <CampoTexto
        id="hr-novo-apelido"
        label={t("employees.form.lastName")}
        valor={valor.apelido}
        erro={erroDe("hr-novo-apelido")}
        placeholder={t("employees.form.lastNamePlaceholder")}
        onChange={(v) => onPatch({ apelido: v })}
      />
      <CampoTexto
        id="hr-novo-nome-social"
        label={t("hr.laborais.nomeSocial")}
        ajuda={t("hr.form.ajudaNomeSocial")}
        valor={valor.nome_social}
        onChange={(v) => onPatch({ nome_social: v })}
      />
      <CampoTexto
        id="hr-novo-numero-interno"
        label={t("hr.laborais.numeroInterno")}
        valor={valor.numero_interno}
        onChange={(v) => onPatch({ numero_interno: v })}
      />
      <CampoTexto
        id="hr-novo-email-trabalho"
        label={t("hr.laborais.emailTrabalho")}
        tipo="email"
        valor={valor.email_trabalho}
        erro={erroDe("hr-novo-email-trabalho")}
        onChange={(v) => onPatch({ email_trabalho: v })}
      />
      <CampoTexto
        id="hr-novo-telefone-trabalho"
        label={t("hr.laborais.telefoneTrabalho")}
        tipo="tel"
        valor={valor.telefone_trabalho}
        onChange={(v) => onPatch({ telefone_trabalho: v })}
      />
    </div>
  );
}
