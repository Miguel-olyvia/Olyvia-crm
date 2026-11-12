// 26/10: o estado de dentro das páginas no endereço. Vive em src/lib porque o RH de exemplo (src/pages/rh-exemplo) também o usa e não
// pode importar páginas do protótipo (components/rh-exemplo/semBase.test.ts); o protótipo reexporta-o em usarParamUrl.ts.
// O estado de dentro de uma página no endereço (26/10/2026): o separador da obra (?sec=meios), o passo do negócio (?passo=orc), a pessoa
// aberta (?pessoa=…). Mudar junta uma entrada ao histórico, por isso o "voltar" do browser fecha o painel ou volta ao separador
// anterior; recarregar abre no mesmo sítio. A moldura (PrototipoNegocios.tsx) guarda estes parâmetros enquanto se fica no mesmo ecrã
// e larga-os ao mudar de ecrã (navegacao.ts: juntarExtras).
// 12/11 (Rúben: «quero voltar atrás e manda para a página inicial»): a página dos Negócios da app (/negocios, /home) também põe o seu
// estado no endereço, mas na pesquisa (?passo=…), não no hash: EnderecoAtivo = "pesquisa".
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/** 26/10: a moldura do protótipo diz às páginas que o endereço é delas (PrototipoNegocios.tsx). Sem ela (os testes, uma página usada
 *  sozinha), o estado fica em memória e o endereço não se toca. */
export const EnderecoAtivo = createContext<boolean | "pesquisa">(false);

/** Onde vivem os parâmetros: no hash (a moldura do protótipo, #/negocio/1027?passo=orc) ou na pesquisa (a app, /negocios?negocio=1026&passo=orc). */
export type ModoEndereco = "hash" | "pesquisa";

/** Os parâmetros do endereço (depois do "?" do hash, ou a pesquisa). */
function params(modo: ModoEndereco = "hash"): URLSearchParams {
  try {
    if (modo === "pesquisa") return new URLSearchParams(window.location.search);
    const h = window.location.hash, i = h.indexOf("?");
    return new URLSearchParams(i >= 0 ? h.slice(i + 1) : "");
  } catch { return new URLSearchParams(); }
}
export const lerParamUrl = (nome: string, modo: ModoEndereco = "hash"): string | null => params(modo).get(nome);

/** Escreve um parâmetro no endereço (vazio tira-o): junta uma entrada ao histórico, ou substitui-a com `substituir`. */
export function escreverParamUrl(nome: string, valor: string, substituir = false, modo: ModoEndereco = "hash"): void {
  try {
    if (modo === "pesquisa") {
      const p = params("pesquisa");
      if ((p.get(nome) ?? "") === valor) return;
      if (valor) p.set(nome, valor); else p.delete(nome);
      const s = p.toString(), url = window.location.pathname + (s ? "?" + s : "") + window.location.hash;
      // o estado do BrowserRouter ({ usr, key, idx }) segue com a entrada nova (idx + 1), para ele contar bem as setas
      const st = (window.history.state ?? {}) as { idx?: unknown };
      if (substituir) window.history.replaceState(window.history.state, "", url);
      else window.history.pushState({ ...st, olyvia: true, key: Math.random().toString(36).slice(2, 10), ...(typeof st.idx === "number" ? { idx: st.idx + 1 } : {}) }, "", url);
      return;
    }
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
  const noEndereco = forcar ?? !!ativo;
  const modo: ModoEndereco = ativo === "pesquisa" ? "pesquisa" : "hash";
  const ler = useCallback((): T => {
    if (!noEndereco) return omissao;
    const v = lerParamUrl(nome, modo) as T | null;
    return v != null && (!validos || validos.includes(v)) ? v : omissao;
  }, [nome, omissao, validos?.join("|"), noEndereco, modo]); // eslint-disable-line react-hooks/exhaustive-deps
  const [valor, setValor] = useState<T>(() => {
    const v = ler();
    return v === omissao && inicial !== undefined && (!noEndereco || lerParamUrl(nome, modo) == null) ? inicial : v;
  });
  // o valor inicial vai para o endereço (sem juntar entrada), para recarregar e "voltar" o conhecerem
  useEffect(() => { if (noEndereco && valor !== omissao && lerParamUrl(nome, modo) == null) escreverParamUrl(nome, valor, true, modo); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // as setas do browser: volta a ler o endereço
  useEffect(() => {
    if (!noEndereco) return undefined;
    const f = (): void => setValor(ler());
    window.addEventListener("popstate", f);
    return () => window.removeEventListener("popstate", f);
  }, [ler, noEndereco]);
  const mudar = useCallback((v: T, op?: { substituir?: boolean }) => {
    setValor(v);
    if (noEndereco) escreverParamUrl(nome, v === omissao ? "" : v, op?.substituir, modo);
  }, [nome, omissao, noEndereco, modo]);
  return [valor, mudar];
}

/**
 * 12/11: um painel por cima da página (um Estúdio, «Ver tudo do negócio») aberto no endereço (?estudio=plano): o «voltar» do browser
 * fecha-o em vez de sair da página, e recarregar volta a abri-lo. Fechar com o botão do painel recua a entrada que o abriu (assim o
 * «voltar» a seguir não o reabre); `substituir` fecha-o sem mexer no histórico (quando logo a seguir se abre outra coisa).
 */
export function usePainelUrl(nome: string, valor: string): [boolean, (abrir: boolean, op?: { substituir?: boolean }) => void] {
  const ativo = useContext(EnderecoAtivo);
  const modo: ModoEndereco = ativo === "pesquisa" ? "pesquisa" : "hash";
  const [v, setV] = useParamUrl<string>(nome, "");
  const abertoAqui = useRef(false);
  const mudar = useCallback((abrir: boolean, op?: { substituir?: boolean }) => {
    if (abrir) { abertoAqui.current = !op?.substituir; setV(valor, op); return; }
    const recuar = !!ativo && abertoAqui.current && !op?.substituir && lerParamUrl(nome, modo) === valor;
    abertoAqui.current = false;
    // o «popstate» do recuo fecha-o (useParamUrl volta a ler o endereço)
    if (recuar) { try { window.history.back(); return; } catch { /* sem window: fecha já */ } }
    setV("", op);
  }, [ativo, modo, nome, setV, valor]);
  return [v === valor, mudar];
}
