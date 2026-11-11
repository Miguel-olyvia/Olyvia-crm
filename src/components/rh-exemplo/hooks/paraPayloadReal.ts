/**
 * O payload real de `usePessoas.criarPessoa`, montado pelo `paraPayload` do painel real de RH. Fica aqui, em hooks/, porque
 * é o único sítio de rh-exemplo onde o teste guarda (semBase.test.ts) deixa importar código real de RH.
 *
 * «TEMPO DE TRABALHO %» E «MÁXIMO DE HORAS SEMANAIS» SAÍRAM DO FORMULÁRIO DE RH-EXEMPLO. O `paraPayload` do painel real
 * ainda os lê do rascunho (o painel real continua a pedi-los), por isso aqui recebe-os vazios e o vínculo que daí sai é
 * limpo das duas chaves: o INSERT em `pessoas_vinculos` não as leva e as colunas ficam a NULL (ambas são anuláveis).
 *
 * A CONTRATAÇÃO E A ANTIGUIDADE DA PESSOA DERIVAM DOS CONTRATOS (20270114100000). O formulário de rh-exemplo pede UMA só data
 * de contratação, a de início do contrato (`contrato.data_inicio`), e a antiguidade do contrato (`contrato.data_antiguidade`).
 * O `paraPayload` real ainda lê `laborais.data_admissao` e `laborais.data_antiguidade`, por isso aqui recebe a data de início
 * como admissão (o mesmo valor segue em `nucleo.data_admissao` como PROVISÓRIO: o trigger do cargo abre a primeira linha nessa
 * data, e o primeiro contrato passa a mandar) e a antiguidade vazia. A antiguidade vai no contrato (`vinculo.data_antiguidade`):
 * na pessoa o servidor anula-a em silêncio (e recusa a saída), e o INSERT do contrato recalcula as três datas da pessoa.
 */
import { paraPayload as paraPayloadReal } from "@/components/hr/novaPessoa/paraPayload";
import type { NovaPessoaPayload } from "@/lib/hr/novaPessoa";

export type { NovaPessoaPayload };

type ValoresDoPainelReal = Parameters<typeof paraPayloadReal>[0];
type OpcoesDoPainelReal = Parameters<typeof paraPayloadReal>[1];
type CamposRetirados = "tempo_trabalho_pct" | "horas_semanais_maximas";
type DatasDaPessoaRetiradas = "data_admissao" | "data_antiguidade";

/**
 * Os valores do formulário de rh-exemplo: os do painel real, sem as duas colunas do contrato que saíram do ecrã, sem as datas
 * de admissão e de antiguidade na pessoa (passaram para o contrato) e com a antiguidade no contrato.
 */
export type ValoresSemCamposRetirados = Omit<ValoresDoPainelReal, "contrato" | "laborais"> & {
  contrato: Omit<ValoresDoPainelReal["contrato"], CamposRetirados> & { data_antiguidade: string };
  laborais: Omit<ValoresDoPainelReal["laborais"], DatasDaPessoaRetiradas>;
};

const textoOuNull = (valor: string): string | null => (valor.trim() === "" ? null : valor.trim());

export function paraPayload(v: ValoresSemCamposRetirados, o: OpcoesDoPainelReal): NovaPessoaPayload {
  const { data_antiguidade: antiguidadeDoContrato, ...contratoReal } = v.contrato;
  const real = paraPayloadReal(
    {
      ...v,
      laborais: { ...v.laborais, data_admissao: v.contrato.data_inicio, data_antiguidade: "" },
      contrato: { ...contratoReal, tempo_trabalho_pct: "", horas_semanais_maximas: "" },
    },
    o,
  );
  // Nunca a antiguidade na pessoa (o servidor anula-a ao criar e depois recusa-a), e nunca a saída: so o contrato as dá.
  const nucleo = { ...real.nucleo, data_antiguidade: null };
  if (real.vinculo === null) return { ...real, nucleo };
  const vinculo = { ...real.vinculo, data_antiguidade: textoOuNull(antiguidadeDoContrato) };
  delete vinculo.tempo_trabalho_pct;
  delete vinculo.horas_semanais_maximas;
  return { ...real, nucleo, vinculo };
}
