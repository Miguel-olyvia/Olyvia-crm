/**
 * Passo 1 -- Informacoes gerais: "quem e".
 *
 * As cinco coisas que se sabem sem consultar documento nenhum. O numero
 * interno fica aqui, e nao nas laborais, porque e atribuido por quem cria a
 * ficha e nao negociado com a pessoa.
 *
 * Primeiro nome e apelido sao os UNICOS campos obrigatorios de todo o
 * assistente -- e sao os unicos NOT NULL de conteudo em `pessoas`.
 *
 * A ORDEM: O E-MAIL DE TRABALHO VEM PRIMEIRO
 * ------------------------------------------
 * Nao e estetica. Se se vier a autenticar as pessoas por esta ficha, o
 * identificador de entrada sera o e-mail de TRABALHO -- e nao o pessoal, que
 * muda de emprego com a pessoa. E por isso que ele e o primeiro campo, e e
 * tambem por isso que ele e o telefone de trabalho ficam nesta seccao apesar
 * de haver um e-mail e um telefone pessoais no passo seguinte: sao contactos
 * da EMPRESA, nao da pessoa. O login em si nao se implementa nesta ronda.
 *
 * "Nome social" saiu por decisao do utilizador ("o nome social n acho
 * necessario") e a coluna foi largada em 20261120210000 -- nao esta escondido,
 * deixou de existir.
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
      {/* Primeiro, por ser o futuro identificador de entrada. Ver cabecalho. */}
      <CampoTexto
        id="hr-novo-email-trabalho"
        label={t("hr.laborais.emailTrabalho")}
        className="sm:col-span-2"
        tipo="email"
        valor={valor.email_trabalho}
        erro={erroDe("hr-novo-email-trabalho")}
        onChange={(v) => onPatch({ email_trabalho: v })}
      />
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
        id="hr-novo-telefone-trabalho"
        label={t("hr.laborais.telefoneTrabalho")}
        tipo="tel"
        valor={valor.telefone_trabalho}
        onChange={(v) => onPatch({ telefone_trabalho: v })}
      />
      {/* "ID do colaborador" fica como esta: sobre ele o utilizador disse
          "nsei", e isso nao e uma decisao. A coluna e `numero_interno`, com
          indice unico parcial por organizacao. */}
      <CampoTexto
        id="hr-novo-numero-interno"
        label={t("hr.laborais.numeroInterno")}
        valor={valor.numero_interno}
        onChange={(v) => onPatch({ numero_interno: v })}
      />
    </div>
  );
}
