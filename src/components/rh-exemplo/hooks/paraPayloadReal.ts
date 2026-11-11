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
 *
 * O CARGO E O CONTRATO SÃO OPCIONAIS NA ADMISSÃO (a pessoa pode não passar; se passar, atribui-se então o cargo e a
 * retribuição). O `paraPayload` real não sabe disto: cria sempre o vínculo com início «hoje», a contratação provisória «hoje» e
 * `cargo_id` vazio. Por isso aqui, à saída:
 *  - sem contrato completo (`contratoCompleto`: tipo e data de início; a validação não deixa passar um contrato a meio, e aqui
 *    um contrato a meio nunca cria vínculo parcial nem retribuição): sem vínculo, sem horas, sem horário, sem extras do vínculo,
 *    sem retribuição, sem afectação (o centro de trabalho não segue: `paraStore` di-lo em `naoGravado`) e `data_admissao` a `null`;
 *  - sem cargo: `cargo_id` a `null` e sem retribuição (o salário base vem do cargo; a RPC recusaria com HRC11).
 * `NovaPessoaPayload.nucleo.cargo_id` ainda é `string` no tipo partilhado (`lib/hr/novaPessoa.ts`); a conversão para `null` é
 * deliberada e só vale depois de a migração que aceita `cargo_id` NULL em `pessoas` estar aplicada.
 */
import { paraPayload as paraPayloadReal } from "@/components/hr/novaPessoa/paraPayload";
import { contratoCompleto } from "@/components/rh-exemplo/lib/novaPessoaContrato";
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

/** `cargo_id` vazio vira `null` (pessoa sem cargo). O tipo partilhado diz `string`: ver o cabeçalho deste ficheiro. */
const semCargoId = null as unknown as string;

export function paraPayload(v: ValoresSemCamposRetirados, o: OpcoesDoPainelReal): NovaPessoaPayload {
  const { data_antiguidade: antiguidadeDoContrato, ...contratoReal } = v.contrato;
  const comContrato = contratoCompleto(v);
  const comCargo = v.laborais.cargo_id.trim() !== "";
  const real = paraPayloadReal(
    {
      ...v,
      laborais: { ...v.laborais, data_admissao: v.contrato.data_inicio, data_antiguidade: "" },
      contrato: { ...contratoReal, tempo_trabalho_pct: "", horas_semanais_maximas: "" },
    },
    o,
  );
  // Nunca a antiguidade na pessoa (o servidor anula-a ao criar e depois recusa-a), e nunca a saída: so o contrato as dá.
  const nucleo = {
    ...real.nucleo,
    data_antiguidade: null,
    cargo_id: comCargo ? real.nucleo.cargo_id : semCargoId,
    // Sem contrato não há contratação provisória (nada de «hoje» por omissão) nem afectação (o `local_id` vira afectação).
    data_admissao: comContrato ? real.nucleo.data_admissao : null,
    local_id: comContrato ? real.nucleo.local_id : null,
  };
  if (!comContrato) {
    return { ...real, nucleo, vinculo: null, vinculoExtra: null, horasVinculo: null, retribuicao: null, horario: null };
  }
  // A retribuição é a parte da pessoa do cargo: sem cargo a RPC recusa-a.
  const retribuicao = comCargo ? real.retribuicao : null;
  if (real.vinculo === null) return { ...real, nucleo, retribuicao };
  const vinculo = { ...real.vinculo, data_antiguidade: textoOuNull(antiguidadeDoContrato) };
  delete vinculo.tempo_trabalho_pct;
  delete vinculo.horas_semanais_maximas;
  return { ...real, nucleo, vinculo, retribuicao };
}
