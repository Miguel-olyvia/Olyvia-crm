// 26/10: o estado de dentro das páginas no endereço. Vive em src/lib porque o RH de exemplo (src/pages/rh-exemplo) também o usa e não
// pode importar páginas do protótipo (components/rh-exemplo/semBase.test.ts); o protótipo reexporta-o em usarParamUrl.ts.
// O estado de dentro de uma página no endereço (26/10/2026): o separador da obra (?sec=meios), o passo do negócio (?passo=orc), a pessoa
// aberta (?pessoa=…). Mudar junta uma entrada ao histórico, por isso o "voltar" do browser fecha o painel ou volta ao separador
// anterior; recarregar abre no mesmo sítio. A moldura (PrototipoNegocios.tsx) guarda estes parâmetros enquanto se fica no mesmo ecrã
// e larga-os ao mudar de ecrã (navegacao.ts: juntarExtras).
import { createContext, useCallback, useContext, useEffect, useState } from "react";

/** 26/10: a moldura do protótipo diz às páginas que o endereço é delas (PrototipoNegocios.tsx). Sem ela (os testes, uma página usada
 *  sozinha), o estado fica em memória e o endereço não se toca. */
export const EnderecoAtivo = createContext(false);

/** Os parâmetros do endereço (depois do "?" do hash). */
function params(): URLSearchParams {
  try {
    const h = window.location.hash, i = h.indexOf("?");
    return new URLSearchParams(i >= 0 ? h.slice(i + 1) : "");
  } catch { return new URLSearchParams(); }
}
export const lerParamUrl = (nome: string): string | null => params().get(nome);

/** Escreve um parâmetro no endereço (vazio tira-o): junta uma entrada ao histórico, ou substitui-a com `substituir`. */
export function escreverParamUrl(nome: string, valor: string, substituir = false): void {
  try {
    const h = window.location.hash || "#/", i = h.indexOf("?");
    const caminho = i >= 0 ? h.slice(0, i) : h, p = params();
    if ((p.get(nome) ?? "") === valor) return;
    if (valor) p.set(nome, valor); else p.delete(nome);
    const s = p.toString();
    const url = window.location.pathname + window.location.search + caminho + (s ? "?" + s : "");
    if (substituir) window.history.replaceState(window.history.state, "", url);
    else window.history.pushState({ olyvia: true }, "", url);
  } catch { /* sem window */ }
}

/**
 * Um valor da página que vive no endereço. `omissao` não se escreve (o endereço fica limpo); `validos` recusa valores que a página
 * não conhece (um endereço antigo ou escrito à mão). O setter aceita `{ substituir: true }` para mudanças que não são navegação
 * (por exemplo, o separador que muda sozinho quando a obra arranca).
 */
export function useParamUrl<T extends string>(nome: string, omissao: T, validos?: readonly T[], forcar?: boolean, inicial?: T): [T, (v: T, op?: { substituir?: boolean }) => void] {
  // `inicial`: o valor ao abrir quando o endereço não traz nenhum (por exemplo, o separador guardado em memória da última vez)
  // sem a moldura (EnderecoAtivo), um estado normal: a página usada sozinha (os testes, o uso isolado). `forcar` decide à mão.
  const ativo = useContext(EnderecoAtivo);
  const noEndereco = forcar ?? ativo;
  const ler = useCallback((): T => {
    if (!noEndereco) return omissao;
    const v = lerParamUrl(nome) as T | null;
    return v != null && (!validos || validos.includes(v)) ? v : omissao;
  }, [nome, omissao, validos?.join("|"), noEndereco]); // eslint-disable-line react-hooks/exhaustive-deps
  const [valor, setValor] = useState<T>(() => {
    const v = ler();
    return v === omissao && inicial !== undefined && (!noEndereco || lerParamUrl(nome) == null) ? inicial : v;
  });
  // o valor inicial vai para o endereço (sem juntar entrada), para recarregar e "voltar" o conhecerem
  useEffect(() => { if (noEndereco && valor !== omissao && lerParamUrl(nome) == null) escreverParamUrl(nome, valor, true); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // as setas do browser: volta a ler o endereço
  useEffect(() => {
    if (!noEndereco) return undefined;
    const f = (): void => setValor(ler());
    window.addEventListener("popstate", f);
    return () => window.removeEventListener("popstate", f);
  }, [ler, noEndereco]);
  const mudar = useCallback((v: T, op?: { substituir?: boolean }) => {
    setValor(v);
    if (noEndereco) escreverParamUrl(nome, v === omissao ? "" : v, op?.substituir);
  }, [nome, omissao, noEndereco]);
  return [valor, mudar];
}
