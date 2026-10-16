// Dos valores do painel «Nova pessoa» para o payload REAL de `usePessoas.criarPessoa`. Funções puras.
//
// O que o painel partilha com o assistente real (nomes, contactos, morada, banco, contrato, retribuição...) vai tal e qual
// como `payloadDoRascunho` o escreve: aqui não se reimplementa nenhuma normalização (vazio é `null`, NIF sem espaços, país em
// maiúsculas, BIC...). Só se juntam, em campos próprios e opcionais, os extras que o painel recolhe a mais e que têm coluna
// real: saúde, sindicalização, categoria/renovável/isenção do vínculo, agência da conta e o contacto de emergência completo.
// Nada do que não tem coluna segue (o nome de tratamento fica de fora).
//
// SAÚDE E SINDICALIZAÇÃO (art. 9.º do RGPD) seguem a permissão de quem cria, não só o ecrã: sem `hr.pessoas.saude.edit` /
// `hr.pessoas.sindicalizacao.edit` o satélite correspondente fica `null`, mesmo que o estado do formulário tenha valores (um
// campo escondido que ficou preenchido, ou um valor que viajou noutro caminho). Esconder um campo não é fechá-lo.
import { linhasParaGravar } from "@/lib/hr/horario";
import { payloadDoRascunho, type NovaPessoaPayload } from "@/lib/hr/novaPessoa";
import { numeroDe } from "@/lib/hr/numeros";
import { textoOuNull as texto, type ExtrasForm, type ValoresNovaPessoa } from "./tiposNova";

export interface OpcoesPayload {
  /** Só com `hr.pessoas.conta.link` a conta escolhida segue para ser ligada; sem ela só serviu para preencher. */
  podeLigarConta: boolean;
  /** `hr.pessoas.saude.edit`: sem ela a saúde não segue, tenha o formulário o que tiver. */
  podeSaude: boolean;
  /** `hr.pessoas.sindicalizacao.edit`: sem ela a sindicalização não segue, tenha o formulário o que tiver. */
  podeSindicalizacao: boolean;
  /** O nome do cargo escolhido (a legenda `pessoas.cargo`); `null` só quando não há cargo escolhido. */
  cargoNome: string | null;
}

const algum = (...valores: string[]): boolean => valores.some((v) => v.trim() !== "");

/** `pessoas_dados_saude`: nada escrito é `null`. */
function saude(e: ExtrasForm): NovaPessoaPayload["saude"] {
  if (!algum(e.saude_incapacidade, e.saude_validade, e.saude_adaptacoes, e.saude_observacoes)) return null;
  return {
    incapacidade_percentagem: numeroDe(e.saude_incapacidade),
    incapacidade_comprovativo_valido_ate: texto(e.saude_validade),
    necessidades_adaptacao: texto(e.saude_adaptacoes),
    observacoes: texto(e.saude_observacoes),
  };
}

/** `pessoas_sindicalizacao`: «por decidir» não grava nada; o sindicato e a quota só contam para quem está sindicalizado. */
function sindicalizacao(e: ExtrasForm): NovaPessoaPayload["sindicalizacao"] {
  if (e.sindicalizado === "") return null;
  const sim = e.sindicalizado === "sim";
  return {
    sindicalizado: sim,
    sindicato: sim ? texto(e.sindicato) : null,
    quota_percentagem: sim ? numeroDe(e.sindicato_quota) : null,
  };
}

/** As colunas de `pessoas_vinculos` que o assistente de cinco passos não pede; só as que foram escolhidas. */
function vinculoExtra(e: ExtrasForm): NovaPessoaPayload["vinculoExtra"] {
  const extra: Record<string, unknown> = {
    ...(e.categoria_funcao !== "" ? { categoria_funcao: e.categoria_funcao } : {}),
    ...(texto(e.categoria_profissional) !== null ? { categoria_profissional: texto(e.categoria_profissional) } : {}),
    ...(e.renovavel !== "" ? { renovavel: e.renovavel === "sim" } : {}),
    ...(e.isencao_horario ? { isencao_horario: true } : {}),
  };
  return Object.keys(extra).length === 0 ? null : extra;
}

export function paraPayload(v: ValoresNovaPessoa, o: OpcoesPayload): NovaPessoaPayload {
  const real = payloadDoRascunho(v, linhasParaGravar, o.podeLigarConta, o.cargoNome);
  const e = v.extra;
  const telefoneAlt = texto(e.emergencia_telefone_alt);
  const emailEmergencia = texto(e.emergencia_email);
  const agencia = texto(e.conta_agencia);
  return {
    ...real,
    // O contacto de emergência completo: o telefone alternativo e o e-mail só seguem com o contacto (nome e telefone).
    emergencia: real.emergencia
      ? {
          ...real.emergencia,
          ...(telefoneAlt !== null ? { telefone_alternativo: telefoneAlt } : {}),
          ...(emailEmergencia !== null ? { email: emailEmergencia } : {}),
        }
      : null,
    // A agência segue com a conta (a RPC tem `p_agencia`); sem número de conta não há conta onde a pôr.
    conta: real.conta ? { ...real.conta, ...(agencia !== null ? { agencia } : {}) } : null,
    // O papel e o e-mail de acesso só seguem se o acesso foi pedido: um papel escolhido e depois desligado fica de fora.
    acesso: e.criar_acesso
      ? { ...real.acesso, enviar_convite: false, email_convite: texto(e.email_acesso) ?? real.acesso.email_convite }
      : { ...real.acesso, role_id: null },
    vinculoExtra: vinculoExtra(e),
    saude: o.podeSaude ? saude(e) : null,
    sindicalizacao: o.podeSindicalizacao ? sindicalizacao(e) : null,
  };
}
