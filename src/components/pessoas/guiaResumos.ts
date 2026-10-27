// O resumo de leitura de cada passo do guia, em rótulo e valor, tirado só do que a ficha e o negócio já trazem (nada se pede à base). Um valor
// `null` quer dizer «nada guardado»: o ecrã escreve «Por preencher». Funções puras (a tradução chega por parâmetro). O que a ficha não deixa
// ler (a morada da obra e o «preparar a visita» antes de marcar, o NIF inteiro, quem fez a chamada) não aparece: ver `naoFeito` do relatório.
import type { Traduzir } from "@/components/negocio-metas/saudeNegocio";
import type { EstadoRegistos } from "@/components/negocio-metas/registosTipos";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import type { RespostaGravada } from "@/components/negocio-metas/respostasQuestionario";
import { textoDiaCompleto } from "./formatoPessoas";
import type { Pessoa } from "./pessoasTipos";
import type { LinhaResumo } from "./processo/passoGuiado";

const P = "pessoasPagina.";
const SEPARADOR = " · ";

export type RegistosDoGuia = Pick<EstadoRegistos, "contactos" | "visitas" | "levantamentos">;

/** O que se lê da pessoa: o mínimo de sempre mais os campos que só a ficha da base traz. */
export type PessoaDoGuia = Pick<Pessoa, "nome" | "contacto" | "campanha" | "formulario">
  & Partial<Pick<Pessoa, "tipoCliente" | "empresa" | "nifUltimos3" | "temNif" | "contactoPreferido" | "horaPreferida" | "lingua">>;

/** O que se lê do negócio aberto; sem ele (o guia da pessoa) os passos de qualificação e de documentos ficam sem resumo. */
export type NegocioDoGuia = Partial<Pick<NegocioMes, "pedidoCliente" | "qualificacaoGravada" | "orcamentos" | "proposta" | "contrato">>;

export const juntar = (...partes: (string | null | undefined)[]): string => partes.filter(Boolean).join(SEPARADOR);

/** O dia e a hora mais recentes primeiro (AAAA-MM-DD e HH:MM, que ordenam como texto). */
export const maisRecente = <T extends { data: string; hora?: string }>(registos: readonly T[]): T | undefined =>
  [...registos].sort((a, b) => `${b.data} ${b.hora ?? ""}`.localeCompare(`${a.data} ${a.hora ?? ""}`))[0];

/** O dia e a hora mais próximos primeiro. */
export const maisProxima = <T extends { data: string; hora?: string }>(registos: readonly T[]): T | undefined =>
  [...registos].sort((a, b) => `${a.data} ${a.hora ?? ""}`.localeCompare(`${b.data} ${b.hora ?? ""}`))[0];

const texto = (v: string | null | undefined): string | null => v?.trim() || null;

/** A tradução da chave; se a chave não existe (um código que a lista não conhece), o valor tal como a base o guarda. */
const traduzirOu = (t: Traduzir, chave: string, bruto: string | null | undefined): string | null => {
  const valor = texto(bruto);
  if (!valor) return null;
  const traduzido = t(chave);
  return traduzido === chave ? valor : traduzido;
};

const linha = (rotulo: string, valor: string | null | undefined): LinhaResumo => ({ rotulo, valor: texto(valor) });

const euros = (valor: number): string => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(valor);

const diaEHora = (data: string, hora?: string): string | null => (data ? juntar(textoDiaCompleto(data), hora) : null);

function textoDaResposta(r: RespostaGravada): string | null {
  if (r.escolhasTexto && r.escolhasTexto.length > 0) return r.escolhasTexto.join(", ");
  return texto(r.valorTexto) ?? (r.valorNumero !== null && r.valorNumero !== undefined ? String(r.valorNumero) : null) ?? texto(r.resposta);
}

function quemPede(t: Traduzir, p: PessoaDoGuia): LinhaResumo[] {
  const nif = p.nifUltimos3 ? t(`${P}guia.cliente.nifTerminado`, { n: p.nifUltimos3 }) : p.temNif ? t(`${P}guia.cliente.nifRegistado`) : null;
  const linhas = [
    linha(t(`${P}real.ficha.identity.name`), p.nome),
    linha(t(`${P}assistente.quemPede.tipo`), traduzirOu(t, `${P}assistente.quemPede.tipo.${p.tipoCliente}`, p.tipoCliente)),
  ];
  // A empresa só interessa a quem é empresa (ou condomínio) ou já a tem escrita: a um particular não se pergunta.
  if (p.tipoCliente === "empresa" || p.tipoCliente === "condominio" || p.empresa?.nome) linhas.push(linha(t(`${P}contact.label.empresa`), p.empresa?.nome));
  linhas.push(linha(t(`${P}contact.label.nif`), nif));
  return linhas;
}

function contacto(t: Traduzir, p: PessoaDoGuia): LinhaResumo[] {
  const F = `${P}real.ficha.contact.`;
  return [
    linha(t(`${P}guia.cliente.telefone`), p.contacto.telefone),
    linha(t(`${P}guia.cliente.email`), p.contacto.email),
    linha(t(`${F}preferred`), traduzirOu(t, `${F}preferred.${p.contactoPreferido}`, p.contactoPreferido)),
    linha(t(`${F}time`), traduzirOu(t, `${F}time.${p.horaPreferida}`, p.horaPreferida)),
    linha(t(`${F}language`), traduzirOu(t, `${F}language.${p.lingua}`, p.lingua)),
  ];
}

const origem = (t: Traduzir, p: PessoaDoGuia): LinhaResumo[] => [
  linha(t(`${P}guia.resumo.campanha`), p.campanha), linha(t(`${P}guia.resumo.formulario`), p.formulario),
];

function chamada(t: Traduzir, registos: RegistosDoGuia): LinhaResumo[] {
  const c = maisRecente(registos.contactos);
  return [
    linha(t(`${P}guia.resumo.chamadas`), registos.contactos.length > 0 ? String(registos.contactos.length) : null),
    linha(t(`${P}guia.resumo.resultado`), c?.resultado ? t(`${P}result.${c.resultado}`) : null),
    linha(t(`${P}guia.resumo.quando`), c ? diaEHora(c.data, c.hora) : null),
    linha(t(`${P}guia.resumo.nota`), c?.nota),
  ];
}

/** O pedido do cliente e as respostas do questionário que ficaram no negócio; sem nada guardado não há resumo (o passo nem aparece). */
function qualificacao(t: Traduzir, n: NegocioDoGuia | undefined): LinhaResumo[] | undefined {
  const respostas = n?.qualificacaoGravada ?? [];
  const pedido = texto(n?.pedidoCliente);
  if (!pedido && respostas.length === 0) return undefined;
  return [
    linha(t(`${P}guia.resumo.pedido`), pedido),
    ...respostas.map((r) => linha(texto(r.perguntaTexto) ?? r.pergunta, textoDaResposta(r))),
  ];
}

function visitaMarcada(t: Traduzir, registos: RegistosDoGuia): LinhaResumo[] {
  const naoCanceladas = registos.visitas.filter((v) => v.estado !== "cancelada");
  const v = maisProxima(naoCanceladas.filter((x) => x.estado !== "feita")) ?? maisRecente(naoCanceladas);
  const A = `${P}real.visit.agenda.`;
  const cidade = v ? [v.morada.codigoPostal, v.morada.localidade].filter(Boolean).join(" ") : "";
  const morada = v ? [v.morada.rua, cidade, v.morada.andar].filter(Boolean).join(", ") : null;
  const recursos = v?.agenda?.recursos.map((r) => r.nome).filter(Boolean).join(", ");
  return [
    linha(t(`${P}guia.resumo.quando`), v ? diaEHora(v.data, v.hora) : null),
    linha(t(`${P}guia.resumo.estado`), v ? t(`${P}assistente.visitas.estado.${v.estado}`) : null),
    linha(t(`${P}guia.resumo.tipoVisita`), traduzirOu(t, `${P}real.visit.kind.${v?.tipo}`, v?.tipo)),
    linha(t(`${A}resources`), recursos),
    linha(t(`${A}present`), traduzirOu(t, `${A}present.${v?.quemVaiEstar}`, v?.quemVaiEstar)),
    linha(t(`${A}duration`), traduzirOu(t, `${A}duration.${v?.duracao}`, v?.duracao)),
    linha(t(`${P}guia.cliente.morada`), morada),
    linha(t(`${P}guia.resumo.nota`), v?.nota),
  ];
}

function visitaFeita(t: Traduzir, registos: RegistosDoGuia): LinhaResumo[] {
  const v = maisRecente(registos.visitas.filter((x) => x.estado === "feita"));
  return [
    linha(t(`${P}guia.resumo.quando`), v ? diaEHora(v.data, v.hora) : null),
    linha(t(`${P}visitResult.label`), v?.resultado ? t(`${P}visitResult.result.${v.resultado}`) : null),
    linha(t(`${P}guia.resumo.feitaPor`), v?.feitoPor),
    linha(t(`${P}guia.resumo.nota`), v?.nota),
  ];
}

function levantamento(t: Traduzir, registos: RegistosDoGuia): LinhaResumo[] {
  const l = maisRecente(registos.levantamentos);
  const linhas = l?.rascunho.linhas.length ?? 0;
  const respostas = l ? (l.rascunho.gravadas?.length ?? Object.keys(l.rascunho.respostas ?? {}).length) : 0;
  return [
    linha(t(`${P}guia.resumo.quando`), l ? diaEHora(l.data) : null),
    linha(t(`${P}guia.resumo.feitaPor`), l?.feitoPor),
    linha(t(`${P}guia.resumo.medidas`), linhas > 0 ? String(linhas) : null),
    linha(t(`${P}guia.resumo.respostas`), respostas > 0 ? String(respostas) : null),
    linha(t(`${P}guia.resumo.observacoes`), l?.rascunho.observacoes),
  ];
}

/** Os documentos do negócio: o que o negócio já sabe (quantos orçamentos e o valor do escolhido, o estado da proposta e do contrato). */
function documentos(t: Traduzir, n: NegocioDoGuia): Record<string, LinhaResumo[]> {
  const orcamentos = n.orcamentos ?? [];
  const escolhido = orcamentos.find((o) => o.escolhido);
  const proposta = n.proposta ? t(`${P}guia.resumo.proposta.${n.proposta.estado}`) : null;
  const contrato = n.contrato ? t(`${P}guia.resumo.contrato.${n.contrato.estado}`) : null;
  const rotuloProposta = t(`${P}guia.resumo.estadoProposta`);
  const rotuloContrato = t(`${P}guia.resumo.estadoContrato`);
  return {
    orcamento: [
      linha(t(`${P}guia.resumo.orcamentos`), orcamentos.length > 0 ? String(orcamentos.length) : null),
      linha(t(`${P}guia.resumo.valorEscolhido`), escolhido ? euros(escolhido.valor) : null),
    ],
    propostaCriada: [linha(rotuloProposta, proposta)],
    propostaEnviada: [linha(rotuloProposta, proposta)],
    respostaCliente: [linha(t(`${P}guia.check.respostaCliente`), n.proposta?.estado === "aceite" ? proposta : null)],
    contratoCriado: [linha(rotuloContrato, contrato)],
    contratoAssinado: [linha(t(`${P}guia.check.contratoAssinado`), n.contrato?.estado === "assinado" ? contrato : null)],
  };
}

/**
 * O resumo de leitura de cada item da lista do guia, por id do item. O de uma fase feita (ou de um passo aberto) lê-se daqui; o passo atual
 * continua a ser o formulário preenchido. Os itens de qualificação e de documentos só existem com o negócio.
 */
export function resumosDoGuia(
  t: Traduzir, pessoa: PessoaDoGuia, registos: RegistosDoGuia, negocio?: NegocioDoGuia,
): Record<string, readonly LinhaResumo[]> {
  const resumos: Record<string, readonly LinhaResumo[]> = {
    quemPede: quemPede(t, pessoa), contacto: contacto(t, pessoa), origem: origem(t, pessoa), chamada: chamada(t, registos),
    visitaMarcada: visitaMarcada(t, registos), visitaFeita: visitaFeita(t, registos), levantamento: levantamento(t, registos),
  };
  const q = qualificacao(t, negocio);
  if (q) resumos.qualificacao = q;
  return negocio ? { ...resumos, ...documentos(t, negocio) } : resumos;
}
