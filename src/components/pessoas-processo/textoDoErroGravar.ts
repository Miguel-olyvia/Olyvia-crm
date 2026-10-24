// O texto que o painel «Visita e levantamento» mostra quando gravar falha: a mensagem do erro, traduzida pela chave (nunca o texto cru). Numa falha a meio
// diz o que ficou gravado e o que falhou, seguido da mensagem do código que falhou.
import { chaveDoErroAcao, chaveExtraDoErroAcao } from "@/components/pessoas/seguirAcao";
import { ErroGuardarParcial } from "@/hooks/pessoas/useGuardarRegistos";

const R = "pessoasPagina.real.records.";

type Traduzir = (chave: string, params?: Record<string, string | number>) => string;

const juntar = (principal: string, extra: string | null, t: Traduzir): string => (extra ? `${principal} ${t(extra)}` : principal);

export function textoDoErroGravar(erro: unknown, t: Traduzir): string {
  if (erro instanceof ErroGuardarParcial) {
    const gravado = [...new Set(erro.feitos)].map((parte) => t(`${R}part.${parte}`)).join(", ");
    return juntar(t(`${R}partialDetail`, { done: gravado, failed: t(`${R}part.${erro.falhou}`) }), chaveExtraDoErroAcao(erro), t);
  }
  return juntar(t(chaveDoErroAcao(erro)), chaveExtraDoErroAcao(erro), t);
}
