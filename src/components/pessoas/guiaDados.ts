// O que o guia do passo mostra da pessoa, tirado só de dados reais da ficha: os factos da lista da fase, o cartão do cliente e os últimos
// acontecimentos. Funções puras (a tradução chega por parâmetro).
import type { Traduzir } from "@/components/negocio-metas/saudeNegocio";
import type { EstadoRegistos } from "@/components/negocio-metas/registosTipos";
import type { AcontecimentoGuia, DadosClienteGuia } from "./GuiaPecas";
import { textoDiaCompleto } from "./formatoPessoas";
import type { ItemAtividade, Pessoa } from "./pessoasTipos";
import type { DadosDoGuia } from "./processo/passoGuiado";

const MAXIMO_ACONTECIMENTOS = 5;

type RegistosDoGuia = Pick<EstadoRegistos, "contactos" | "visitas" | "levantamentos">;

const SEPARADOR = " · ";

const juntar = (...partes: (string | null | undefined)[]): string => partes.filter(Boolean).join(SEPARADOR);

/** O dia e a hora mais recentes primeiro (AAAA-MM-DD e HH:MM, que ordenam como texto). */
const maisRecente = <T extends { data: string; hora?: string }>(registos: readonly T[]): T | undefined =>
  [...registos].sort((a, b) => `${b.data} ${b.hora ?? ""}`.localeCompare(`${a.data} ${a.hora ?? ""}`))[0];

/** O dia e a hora mais próximos primeiro. */
const maisProxima = <T extends { data: string; hora?: string }>(registos: readonly T[]): T | undefined =>
  [...registos].sort((a, b) => `${a.data} ${a.hora ?? ""}`.localeCompare(`${b.data} ${b.hora ?? ""}`))[0];

/**
 * O que ficou registado em cada item da lista da fase, em texto, só do que a ficha já tem: quem pede, o contacto, a origem, a última chamada, a visita
 * marcada, a visita feita e o levantamento. O que a ficha não sabe não aparece (o ecrã diz «Sem registo»).
 */
export function detalhesDoGuia(
  t: Traduzir, pessoa: Pick<Pessoa, "nome" | "contacto" | "campanha" | "formulario">, registos: RegistosDoGuia,
): Record<string, string> {
  const detalhes: Record<string, string> = {};
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
 * Com o tradutor `t` leva também o que ficou registado em cada passo (`detalhes`).
 */
export function dadosDoGuia(pessoa: Pick<Pessoa, "nome" | "contacto" | "campanha" | "formulario">, registos: RegistosDoGuia, t?: Traduzir): DadosDoGuia {
  return {
    nome: pessoa.nome,
    temContacto: Boolean(pessoa.contacto.telefone || pessoa.contacto.email),
    temOrigem: Boolean(pessoa.campanha || pessoa.formulario),
    chamadas: registos.contactos.length,
    visitasAtivas: registos.visitas.filter((v) => v.estado !== "cancelada").length,
    levantamentos: registos.levantamentos.length,
    ultimoResultado: maisRecente(registos.contactos)?.resultado ?? null,
    ...(t ? { detalhes: detalhesDoGuia(t, pessoa, registos) } : {}),
  };
}

/** O cartão «Cliente» e a localidade do cabeçalho: a morada é a da pessoa (a ficha não tem uma «morada da obra» à parte). */
export function clienteDoGuia(
  pessoa: Pick<Pessoa, "contacto"> & Partial<Pick<Pessoa, "morada" | "distrito" | "nif" | "empresa">>, linha: string | null,
): { cliente: DadosClienteGuia; local: string | null } {
  const m = pessoa.morada;
  const cidade = m ? [m.cp, m.localidade].filter(Boolean).join(" ") : "";
  const morada = m ? [m.linha, cidade].filter(Boolean).join(", ") : "";
  // O que o contacto antigo da ficha tinha a mais (só os campos que a pessoa tem): fica no mesmo cartão, não num segundo conjunto de dados.
  const extras = [
    ["distrito", pessoa.distrito], ["nif", pessoa.nif], ["empresa", pessoa.empresa?.nome], ["nifEmpresa", pessoa.empresa?.nif], ["contacto", pessoa.empresa?.contacto],
  ].flatMap(([chave, valor]) => (valor ? [{ chave: chave as string, valor: valor as string }] : []));
  return {
    cliente: {
      telefone: pessoa.contacto.telefone, email: pessoa.contacto.email, morada: morada || null, linha: linha || null, ...(extras.length > 0 ? { extras } : {}),
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
