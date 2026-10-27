// O que o guia do passo mostra da pessoa, tirado só de dados reais da ficha: os factos da lista da fase, o cartão do cliente e os últimos
// acontecimentos. Funções puras (a tradução chega por parâmetro).
import type { Traduzir } from "@/components/negocio-metas/saudeNegocio";
import type { AcontecimentoGuia, DadosClienteGuia } from "./GuiaPecas";
import { textoDiaCompleto } from "./formatoPessoas";
import type { EstadoRegistos } from "@/components/negocio-metas/registosTipos";
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import type { ItemAtividade, Pessoa } from "./pessoasTipos";
import type { DadosDoGuia } from "./processo/passoGuiado";

const MAXIMO_ACONTECIMENTOS = 5;
const P = "pessoasPagina.";

export type RegistosDoGuia = Pick<EstadoRegistos, "contactos" | "visitas" | "levantamentos">;

/** O que se lê da pessoa para os factos da lista da fase. */
export type PessoaDoGuia = Pick<Pessoa, "nome" | "contacto" | "campanha" | "formulario">;

/** O que se lê do negócio aberto para o registo em texto dos passos de documento (que não têm ecrã de passo); sem ele esses passos ficam sem registo. */
export type NegocioDoGuia = Partial<Pick<NegocioMes, "orcamentos" | "proposta" | "contrato">>;

export const juntar = (...partes: (string | null | undefined)[]): string => partes.filter(Boolean).join(" · ");

/** O dia e a hora mais recentes primeiro (AAAA-MM-DD e HH:MM, que ordenam como texto). */
export const maisRecente = <T extends { data: string; hora?: string }>(registos: readonly T[]): T | undefined =>
  [...registos].sort((a, b) => `${b.data} ${b.hora ?? ""}`.localeCompare(`${a.data} ${a.hora ?? ""}`))[0];

/** O dia e a hora mais próximos primeiro. */
export const maisProxima = <T extends { data: string; hora?: string }>(registos: readonly T[]): T | undefined =>
  [...registos].sort((a, b) => `${a.data} ${a.hora ?? ""}`.localeCompare(`${b.data} ${b.hora ?? ""}`))[0];

const euros = (valor: number): string => new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(valor);

/**
 * O registo em texto dos passos de documento do negócio (orçamento, proposta, contrato). Estes passos não têm um ecrã de passo para mostrar preenchido
 * (fazem-se em diálogos por cima do guia), por isso, numa fase feita, é a única leitura que existe.
 */
function detalhesDosDocumentos(t: Traduzir, n: NegocioDoGuia): Record<string, string> {
  const detalhes: Record<string, string> = {};
  const orcamentos = n.orcamentos ?? [];
  const escolhido = orcamentos.find((o) => o.escolhido);
  if (orcamentos.length > 0) {
    detalhes.orcamento = juntar(`${t(`${P}guia.resumo.orcamentos`)}: ${orcamentos.length}`, escolhido ? `${t(`${P}guia.resumo.valorEscolhido`)}: ${euros(escolhido.valor)}` : null);
  }
  if (n.proposta) {
    const estado = `${t(`${P}guia.resumo.estadoProposta`)}: ${t(`${P}guia.resumo.proposta.${n.proposta.estado}`)}`;
    detalhes.propostaCriada = estado;
    detalhes.propostaEnviada = estado;
    if (n.proposta.estado === "aceite") detalhes.respostaCliente = t(`${P}guia.resumo.proposta.aceite`);
  }
  if (n.contrato) {
    const estado = `${t(`${P}guia.resumo.estadoContrato`)}: ${t(`${P}guia.resumo.contrato.${n.contrato.estado}`)}`;
    detalhes.contratoCriado = estado;
    if (n.contrato.estado === "assinado") detalhes.contratoAssinado = t(`${P}guia.resumo.contrato.assinado`);
  }
  return detalhes;
}

/**
 * O que ficou registado em cada item da lista da fase, em texto, só do que a ficha já tem: quem pede, o contacto, a origem, a última chamada, a visita
 * marcada, a visita feita e o levantamento. O que a ficha não sabe não aparece (o ecrã diz «Sem registo»).
 */
export function detalhesDoGuia(
  t: Traduzir, pessoa: PessoaDoGuia, registos: RegistosDoGuia, negocio?: NegocioDoGuia,
): Record<string, string> {
  const detalhes: Record<string, string> = negocio ? detalhesDosDocumentos(t, negocio) : {};
  const definir = (id: string, texto: string): void => { if (texto) detalhes[id] = texto; };
  definir("quemPede", pessoa.nome.trim());
  definir("contacto", juntar(pessoa.contacto.telefone, pessoa.contacto.email));
  definir("origem", juntar(pessoa.campanha, pessoa.formulario));
  const chamada = maisRecente(registos.contactos);
  if (chamada) definir("chamada", juntar(chamada.resultado ? t(`pessoasPagina.result.${chamada.resultado}`) : null, textoDiaCompleto(chamada.data)));
  // A marcada e a visita por fazer mais proxima; so se nao houver nenhuma, a mais recente das nao canceladas (uma visita ja feita).
  const naoCanceladas = registos.visitas.filter((v) => v.estado !== "cancelada");
  const marcada = maisProxima(naoCanceladas.filter((v) => v.estado !== "feita")) ?? maisRecente(naoCanceladas);
  if (marcada) definir("visitaMarcada", juntar(textoDiaCompleto(marcada.data), marcada.hora));
  const feita = maisRecente(registos.visitas.filter((v) => v.estado === "feita"));
  if (feita) definir("visitaFeita", textoDiaCompleto(feita.data));
  const levantamento = maisRecente(registos.levantamentos);
  if (levantamento) definir("levantamento", textoDiaCompleto(levantamento.data));
  return detalhes;
}

/**
 * Os factos da lista da fase: quem pede, contacto, origem e o que há de chamadas, visitas e levantamentos (os registos dados, p. ex. os do negócio).
 * Com o tradutor `t` leva também o que ficou registado em cada passo (`detalhes`, em texto); `negocio` acrescenta os documentos do negócio. O que se
 * mostra PREENCHIDO num passo (o mesmo ecrã do passo) não vem daqui: vem da pessoa, do negócio e dos registos, nos componentes dos passos.
 */
export function dadosDoGuia(pessoa: PessoaDoGuia, registos: RegistosDoGuia, t?: Traduzir, negocio?: NegocioDoGuia): DadosDoGuia {
  return {
    nome: pessoa.nome,
    temContacto: Boolean(pessoa.contacto.telefone || pessoa.contacto.email),
    temOrigem: Boolean(pessoa.campanha || pessoa.formulario),
    chamadas: registos.contactos.length,
    visitasAtivas: registos.visitas.filter((v) => v.estado !== "cancelada").length,
    levantamentos: registos.levantamentos.length,
    ultimoResultado: maisRecente(registos.contactos)?.resultado ?? null,
    ...(t ? { detalhes: detalhesDoGuia(t, pessoa, registos, negocio) } : {}),
  };
}

/** O cartão «Cliente» e a localidade do cabeçalho: a morada é a da pessoa (a ficha não tem uma «morada da obra» à parte). */
export function clienteDoGuia(
  pessoa: Pick<Pessoa, "contacto"> & Partial<Pick<Pessoa, "morada" | "distrito" | "nif" | "nifUltimos3" | "temNif" | "empresa">>, linha: string | null,
): { cliente: DadosClienteGuia; local: string | null } {
  const m = pessoa.morada;
  const cidade = m ? [m.cp, m.localidade].filter(Boolean).join(" ") : "";
  const morada = m ? [m.linha, cidade].filter(Boolean).join(", ") : "";
  // O que o contacto antigo da ficha tinha a mais (só os campos que a pessoa tem): fica no mesmo cartão, não num segundo conjunto de dados.
  const extras = [
    ["distrito", pessoa.distrito], ["empresa", pessoa.empresa?.nome], ["nifEmpresa", pessoa.empresa?.nif], ["contacto", pessoa.empresa?.contacto],
  ].flatMap(([chave, valor]) => (valor ? [{ chave: chave as string, valor: valor as string }] : []));
  return {
    cliente: {
      telefone: pessoa.contacto.telefone, email: pessoa.contacto.email, morada: morada || null, linha: linha || null,
      // O NIF é um campo fixo (como o telefone): o cartão mostra-o ou diz «Por preencher». Só o que a ficha deixa mostrar: o NIF, ou os últimos 3 dígitos.
      nif: pessoa.nif?.trim() || null, nifUltimos3: pessoa.nifUltimos3 || null, nifRegistado: Boolean(pessoa.nifUltimos3 || pessoa.temNif),
      ...(extras.length > 0 ? { extras } : {}),
    },
    local: m?.localidade || null,
  };
}

/** Os acontecimentos mais recentes que a ficha já carregou (só o dia: a ficha não tem a hora), do mais recente para o mais antigo. */
export function acontecimentosDoGuia(t: Traduzir, atividade: readonly ItemAtividade[]): AcontecimentoGuia[] {
  return [...atividade]
    .sort((a, b) => b.quando.localeCompare(a.quando))
    .slice(0, MAXIMO_ACONTECIMENTOS)
    .map((a) => ({
      id: a.id,
      texto: [t(`pessoasPagina.activity.type.${a.tipo}`), a.chaveTitulo ? t(a.chaveTitulo) : a.titulo].filter(Boolean).join(" · "),
      quando: textoDiaCompleto(a.quando),
    }));
}
