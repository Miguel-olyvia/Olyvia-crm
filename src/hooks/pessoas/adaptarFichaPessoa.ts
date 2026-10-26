// A pessoa da ficha real: passa o `pessoa`, o `lead` e os `agregados` de neg_ficha_pessoa para o tipo Pessoa do ecrã.
// O contrato dá a campanha e o formulário (`origem`), o NIF e a empresa quando há fonte: preenchem-se quando existem e o ecrã esconde os
// que faltam. O que o contrato não dá (saúde, canal, tipo de origem, via de entrada) fica por preencher. `origem.origin` e `origem.source`
// não se mapeiam: os valores reais são por confirmar e o tipo de origem do ecrã é uma lista fechada.
// Uma lead legada (perdida, rejeitada, cancelada) aparece como abordagem normal: `perdida` nunca se preenche.
import { MOTIVOS_PERDA, RESULTADOS_CONTACTO } from "@/components/pessoas/opcoesPessoa";
import type {
  ContactoPreferido, EncerramentoPessoa, HoraPreferida, MotivoEncerramento, TipoCliente, Pessoa, QualificacaoPessoa, ResultadoContacto, ResultadoEncerramento,
} from "@/components/pessoas/pessoasTipos";
import { lerRespostasGravadas } from "./respostasGravadas";
import { diasEntre } from "./adaptarResumoPessoa";
import { escolher, textoOuNull } from "./adaptarComum";
import type { FichaDb, MoradaFichaDb } from "./fichaTipos";
import { leadDaAbordagem, RESULTADOS_DE_ENCERRAMENTO } from "./leadDaAbordagem";
import { diaLisboa, horaDoProximoContacto } from "./tempoLisboa";

const QUALIFICACOES: readonly QualificacaoPessoa[] = ["MQL", "SQL"];
const ENCERRAMENTOS: readonly ResultadoEncerramento[] = RESULTADOS_DE_ENCERRAMENTO;

function adaptarMorada(m: MoradaFichaDb | null): Pessoa["morada"] {
  if (!m) return undefined;
  const rua = textoOuNull(m.rua);
  const andar = textoOuNull(m.andar);
  const cp = textoOuNull(m.codigo_postal) ?? "";
  const localidade = textoOuNull(m.localidade) ?? "";
  if (!rua && !cp && !localidade) return undefined;
  return { linha: [rua, andar].filter(Boolean).join(", "), cp, localidade };
}

/** Os quatro campos da morada da entidade, aparados; `undefined` sem rua, código postal nem localidade. */
function moradaEmCampos(m: MoradaFichaDb | null): Pessoa["moradaCampos"] {
  if (!m) return undefined;
  const campos = { rua: textoOuNull(m.rua) ?? "", codigoPostal: textoOuNull(m.codigo_postal) ?? "", localidade: textoOuNull(m.localidade) ?? "", andar: textoOuNull(m.andar) ?? "" };
  return campos.rua || campos.codigoPostal || campos.localidade ? campos : undefined;
}

const empresaDe = (nome: string | null): Pessoa["empresa"] => {
  const limpo = textoOuNull(nome);
  return limpo ? { nome: limpo } : undefined;
};

/**
 * O encerramento da abordagem. Motivo da lista, «outro» com texto, ou nulo (encerrada pelo resultado da visita) que vira «outro».
 * Quando a lead mais recente da ficha está morta, a abordagem é a da aberta mais recente: se essa está encerrada só se sabe o resultado
 * (`closure_result`), por isso só o resultado se devolve: o motivo e o dia ficam por preencher.
 */
function adaptarEncerramento(ficha: FichaDb, hoje: string): EncerramentoPessoa | undefined {
  const e = ficha.lead?.encerramento;
  const resultado = escolher(e?.resultado, ENCERRAMENTOS);
  if (!e || !resultado) return encerramentoDeLeadAberta(ficha);
  const data = diaLisboa(e.em) ?? hoje;
  const daLista = escolher(e.motivo, MOTIVOS_PERDA);
  if (daLista) return { resultado, motivo: daLista, data };
  const motivo: MotivoEncerramento = "outro";
  return { resultado, motivo, motivoOutro: textoOuNull(e.motivo_outro) ?? undefined, data };
}

/** Só o resultado: a base não dá o motivo nem o dia desta lead encerrada, e não se inventam. */
function encerramentoDeLeadAberta(ficha: FichaDb): EncerramentoPessoa | undefined {
  const certa = leadDaAbordagem(ficha);
  if (!certa?.encerrada || certa.id === ficha.lead?.id) return undefined;
  const fecho = (ficha.leads_abertas ?? []).find((l) => l.id === certa.id)?.closure_result;
  const resultado = escolher(fecho?.trim(), ENCERRAMENTOS) ?? "semInteresse";
  return { resultado };
}

const QUALIFICACOES_TEXTO = (valor: unknown): QualificacaoPessoa | undefined =>
  typeof valor === "string" ? escolher(valor.trim().toUpperCase(), QUALIFICACOES) ?? undefined : undefined;

/**
 * MQL ou SQL. `pessoa.qualificacao` chega da função como o OBJETO das respostas da aba Qualificação: nunca é MQL nem SQL, e ler-lhe o texto
 * rebentava a ficha. O tipo vem à parte, em `qualificacao_tipo` (migration futura); um texto em `qualificacao` (uma leitura antiga) ainda se lê.
 */
function qualificacaoDe(pessoa: FichaDb["pessoa"]): QualificacaoPessoa | undefined {
  return QUALIFICACOES_TEXTO(pessoa.qualificacao_tipo) ?? QUALIFICACOES_TEXTO(pessoa.qualificacao);
}

const CONTACTOS: readonly ContactoPreferido[] = ["telefone", "email", "whatsapp", "sms"];
const HORAS: readonly HoraPreferida[] = ["manha", "tarde", "fim_do_dia"];
const TIPOS_CLIENTE: readonly TipoCliente[] = ["particular", "empresa", "condominio"];

/** O tipo de cliente que a base diz; sem ele deduz-se do tipo da entidade e do `organization_kind`; sem nenhum dos dois, não se sabe. */
function tipoClienteDe(p: FichaDb["pessoa"]): TipoCliente | undefined {
  if (p.tipo_cliente != null) return escolher(p.tipo_cliente, TIPOS_CLIENTE) ?? undefined;
  if (p.tipo === "person") return "particular";
  if (p.tipo === "organization") return p.organization_kind === "condominio" ? "condominio" : "empresa";
  return undefined;
}

/** A pessoa da ficha. `hoje` é o dia de Lisboa (AAAA-MM-DD). */
export function adaptarPessoa(ficha: FichaDb, hoje: string): Pessoa {
  const { pessoa, agregados } = ficha;
  const morada = adaptarMorada(pessoa.morada);
  const proximo = agregados.proximo_contacto_em;
  const qualificacaoGravada = lerRespostasGravadas(pessoa.qualificacao_respostas);
  return {
    id: pessoa.id,
    nome: pessoa.nome?.trim() ?? "",
    contacto: { telefone: textoOuNull(pessoa.contacto?.telefone), email: textoOuNull(pessoa.contacto?.email) },
    comercial: pessoa.responsavel_nome?.trim() ?? "",
    ultimoContactoDias: diasEntre(agregados.ultimo_contacto_em, hoje),
    morada,
    moradaCampos: moradaEmCampos(pessoa.morada),
    distrito: textoOuNull(pessoa.morada?.distrito) ?? undefined,
    qualificacao: qualificacaoDe(pessoa),
    contactoPreferido: escolher(pessoa.preferred_contact, CONTACTOS) ?? undefined,
    horaPreferida: escolher(pessoa.preferred_time, HORAS) ?? undefined,
    lingua: textoOuNull(pessoa.locale) ?? undefined,
    tipoCliente: tipoClienteDe(pessoa),
    ...(qualificacaoGravada.length > 0 ? { qualificacaoGravada } : {}),
    campanha: textoOuNull(pessoa.origem?.campanha) ?? undefined,
    formulario: textoOuNull(pessoa.origem?.formulario) ?? undefined,
    nif: textoOuNull(pessoa.nif) ?? undefined,
    empresa: empresaDe(pessoa.empresa),
    resultadoContacto: (escolher(agregados.ultimo_resultado, RESULTADOS_CONTACTO as readonly ResultadoContacto[]) ?? undefined),
    proximoContacto: diaLisboa(proximo),
    proximoHora: horaDoProximoContacto(proximo),
    desde: diaLisboa(pessoa.desde) ?? undefined,
    encerrada: adaptarEncerramento(ficha, hoje),
  };
}
