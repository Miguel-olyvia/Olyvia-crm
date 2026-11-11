/**
 * O payload real de `usePessoas.criarPessoa`, montado pelo `paraPayload` do painel real de RH. Fica aqui, em hooks/, porque
 * é o único sítio de rh-exemplo onde o teste guarda (semBase.test.ts) deixa importar código real de RH.
 *
 * «TEMPO DE TRABALHO %» E «MÁXIMO DE HORAS SEMANAIS» SAÍRAM DO FORMULÁRIO DE RH-EXEMPLO. O `paraPayload` do painel real
 * ainda os lê do rascunho (o painel real continua a pedi-los), por isso aqui recebe-os vazios e o vínculo que daí sai é
 * limpo das duas chaves: o INSERT em `pessoas_vinculos` não as leva e as colunas ficam a NULL (ambas são anuláveis).
 */
import { paraPayload as paraPayloadReal } from "@/components/hr/novaPessoa/paraPayload";
import type { NovaPessoaPayload } from "@/lib/hr/novaPessoa";

export type { NovaPessoaPayload };

type ValoresDoPainelReal = Parameters<typeof paraPayloadReal>[0];
type OpcoesDoPainelReal = Parameters<typeof paraPayloadReal>[1];
type CamposRetirados = "tempo_trabalho_pct" | "horas_semanais_maximas";

/** Os valores do formulário de rh-exemplo: os do painel real, sem as duas colunas do contrato que saíram do ecrã. */
export type ValoresSemCamposRetirados = Omit<ValoresDoPainelReal, "contrato"> & {
  contrato: Omit<ValoresDoPainelReal["contrato"], CamposRetirados>;
};

export function paraPayload(v: ValoresSemCamposRetirados, o: OpcoesDoPainelReal): NovaPessoaPayload {
  const real = paraPayloadReal({ ...v, contrato: { ...v.contrato, tempo_trabalho_pct: "", horas_semanais_maximas: "" } }, o);
  if (real.vinculo === null) return real;
  const vinculo = { ...real.vinculo };
  delete vinculo.tempo_trabalho_pct;
  delete vinculo.horas_semanais_maximas;
  return { ...real, vinculo };
}
