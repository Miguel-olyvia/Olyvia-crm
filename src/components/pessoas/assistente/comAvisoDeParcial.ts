// Uma gravação que vem depois de outra já feita no mesmo «Continuar»: se falhar, o erro diz primeiro o que ficou gravado e a seguir a mensagem do código que
// falhou (a mesma regra de `guardarContactoDaPessoa`). Se ainda nada tinha sido gravado, o erro segue como veio.
import { ErroNeg } from "@/hooks/pessoas/chamarNeg";

export async function comAvisoDeParcial<T>(gravouAntes: boolean, chaveParcial: string, acao: () => Promise<T>): Promise<T> {
  try {
    return await acao();
  } catch (erro) {
    if (gravouAntes && erro instanceof ErroNeg) throw new ErroNeg(erro, erro.codigo, chaveParcial, erro.chave);
    throw erro;
  }
}
