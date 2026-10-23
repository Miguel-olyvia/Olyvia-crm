// Junta o que a função neg_ficha_pessoa devolve no objeto que o FichaReal passa à ficha do protótipo: o resumo (pessoa, negócios, registos),
// a atividade e o mapa de pessoas. O papel, os abertos e a etapa vêm da base (nunca se inferem dos negócios: um negócio aberto com contrato
// assinado fica aberto e a Lista e a ficha dizem o mesmo).
import type { NegocioMes } from "@/components/negocio-metas/negocioMetas";
import { ETAPAS } from "@/components/pessoas/etapaPessoa";
import { resumir } from "@/components/pessoas/juntarPessoas";
import { ehHistorico, type ItemAtividade, type PapelPessoa, type Pessoa, type ResumoPessoa } from "@/components/pessoas/pessoasTipos";
import { adaptarAtividade } from "./adaptarAtividade";
import { escolher } from "./adaptarComum";
import { adaptarPessoa } from "./adaptarFichaPessoa";
import { adaptarNegocios } from "./adaptarNegociosFicha";
import { adaptarRegistos } from "./adaptarRegistos";
import type { FichaDb } from "./fichaTipos";
import type { MomentoGanho } from "./useFontePessoas";

export interface FichaAdaptada {
  resumo: ResumoPessoa;
  atividade: ItemAtividade[];
  /** Só a pessoa da ficha (as candidatas das submissões não existem aqui). */
  pessoas: ReadonlyMap<string, Pessoa>;
}

/** A ficha pronta para o ecrã. `hoje` é o dia de Lisboa (AAAA-MM-DD). Não muda a ficha de entrada. */
export function adaptarFicha(ficha: FichaDb, hoje: string, momentoGanho: MomentoGanho | null = null): FichaAdaptada {
  const pessoa = adaptarPessoa(ficha, hoje);
  const negocios = adaptarNegocios(ficha, hoje, momentoGanho);
  const abertos = negocios.filter((n): n is NegocioMes => !ehHistorico(n) && n.estadoReal === "aberto");
  const papel: PapelPessoa = ficha.pessoa.papel === "cliente" ? "cliente" : "lead";
  const etapa = escolher(ficha.pessoa.etapa, ETAPAS) ?? "nova";
  const resumo = resumir(pessoa, negocios, adaptarRegistos(ficha), hoje, { papel, abertos, etapa });
  return { resumo, atividade: adaptarAtividade(ficha), pessoas: new Map([[pessoa.id, pessoa]]) };
}
