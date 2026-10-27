/**
 * O payload real de `usePessoas.criarPessoa`, montado pelo `paraPayload` do painel real de RH. Fica aqui, em hooks/, porque
 * é o único sítio de rh-exemplo onde o teste guarda (semBase.test.ts) deixa importar código real de RH.
 */
import { paraPayload } from "@/components/hr/novaPessoa/paraPayload";
import type { NovaPessoaPayload } from "@/lib/hr/novaPessoa";

export type { NovaPessoaPayload };
export { paraPayload };
