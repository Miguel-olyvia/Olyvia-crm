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
 *
 * O SELECTOR DE CONTA VEM ANTES DOS CAMPOS QUE ELE PREENCHE
 * -------------------------------------------------------------
 * Esta e a UNICA razao para o cartao de conta aparecer no topo desta seccao,
 * antes da grelha: quem chega aqui tem de poder escolher a conta antes de
 * escrever a mao, nao depois. Escolher preenche; nunca liga sozinho -- ligar
 * e feito por `rpc_hr_ligar_conta`, so depois de a ficha existir, e so com
 * `hr.pessoas.conta.link`.
 */
import { useTranslation } from "@/hooks/useTranslation";
import { CampoTexto } from "@/components/hr/form/Campos";
import { CampoConta } from "@/components/hr/form/CampoConta";
import type { RascunhoGeral } from "@/lib/hr/novaPessoa";
import type { ContaLigavel } from "@/hooks/useContasLigaveis";

interface SeccaoInformacoesGeraisProps {
  valor: RascunhoGeral;
  onPatch: (patch: Partial<RascunhoGeral>) => void;
  erroDe: (campoId: string) => string | null;
  contas: ContaLigavel[];
  contasALoad: boolean;
  podeLigarConta: boolean;
  onEscolherConta: (contaId: string) => void;
  /** Mensagem do palpite (nome partido, e-mail em falta, ...) para o campo,
   * ou `null` se o campo nao tem nenhum palpite por confirmar agora. */
  ajudaDoPalpite: (campoId: string) => string | null;
  /** O campo ainda tem o valor exactamente como a conta o deixou? So entao
   * se marca visualmente como palpite. */
  ePalpite: (campoId: string) => boolean;
}

export function SeccaoInformacoesGerais({
  valor,
  onPatch,
  erroDe,
  contas,
  contasALoad,
  podeLigarConta,
  onEscolherConta,
  ajudaDoPalpite,
  ePalpite,
}: SeccaoInformacoesGeraisProps) {
  const { t } = useTranslation();

  return (
    <div className="space-y-4">
      <CampoConta
        id="hr-novo-conta"
        label={t("hr.conta.label")}
        contas={contas}
        valor={valor.conta_id}
        loading={contasALoad}
        podeLigar={podeLigarConta}
        onChange={onEscolherConta}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {/* Primeiro, por ser o futuro identificador de entrada. Ver cabecalho. */}
        <CampoTexto
          id="hr-novo-email-trabalho"
          label={t("hr.laborais.emailTrabalho")}
          className="sm:col-span-2"
          tipo="email"
          valor={valor.email_trabalho}
          erro={erroDe("hr-novo-email-trabalho")}
          ajuda={ajudaDoPalpite("hr-novo-email-trabalho") ?? undefined}
          marcado={ePalpite("hr-novo-email-trabalho")}
          onChange={(v) => onPatch({ email_trabalho: v })}
        />
        <CampoTexto
          id="hr-novo-primeiro-nome"
          label={t("employees.form.firstName")}
          valor={valor.primeiro_nome}
          erro={erroDe("hr-novo-primeiro-nome")}
          ajuda={ajudaDoPalpite("hr-novo-primeiro-nome") ?? undefined}
          marcado={ePalpite("hr-novo-primeiro-nome")}
          placeholder={t("employees.form.firstNamePlaceholder")}
          onChange={(v) => onPatch({ primeiro_nome: v })}
        />
        <CampoTexto
          id="hr-novo-apelido"
          label={t("employees.form.lastName")}
          valor={valor.apelido}
          erro={erroDe("hr-novo-apelido")}
          ajuda={ajudaDoPalpite("hr-novo-apelido") ?? undefined}
          marcado={ePalpite("hr-novo-apelido")}
          placeholder={t("employees.form.lastNamePlaceholder")}
          onChange={(v) => onPatch({ apelido: v })}
        />
        <CampoTexto
          id="hr-novo-telefone-trabalho"
          label={t("hr.laborais.telefoneTrabalho")}
          tipo="tel"
          valor={valor.telefone_trabalho}
          marcado={ePalpite("hr-novo-telefone-trabalho")}
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
    </div>
  );
}
