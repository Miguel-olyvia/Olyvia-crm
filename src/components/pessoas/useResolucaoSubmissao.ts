// O fluxo de "Registar na ficha como nota": pedir, confirmar no diálogo, resolver, avisar com um
// toast curto, anunciar para leitores de ecrã e devolver o foco (ao cartão seguinte, ao botão
// "Ver pessoas" quando já não há cartões, ou à ficha se o pedido veio de lá).
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import { toast } from "@/lib/toast";
import type { Pessoa, Submissao } from "./pessoasTipos";
import { resolverSubmissao } from "./resolverSubmissao";

export interface PedidoResolver {
  submissaoId: string;
  pessoaId: string;
  nome: string;
  conflito: boolean;
  origem: "lista" | "ficha";
}

interface Entradas {
  /** As submissões pendentes, pela ordem em que se veem na lista. */
  ordenadas: Submissao[];
  pessoas: ReadonlyMap<string, Pessoa>;
  resolver: (submissaoId: string, pessoaId?: string) => void;
}

/** O cartão que fica a seguir (ou, se era o último, o anterior); `null` quando era o único. */
export function vizinha(ordenadas: readonly Submissao[], id: string): string | null {
  const i = ordenadas.findIndex((s) => s.id === id);
  return ordenadas[i + 1]?.id ?? ordenadas[i - 1]?.id ?? null;
}

export function useResolucaoSubmissao({ ordenadas, pessoas, resolver }: Entradas) {
  const { t } = useTranslation();
  const [pedido, setPedido] = useState<PedidoResolver | null>(null);
  const [anuncio, setAnuncio] = useState({ texto: "", vez: 0 });
  const foco = useRef<string | null>(null);

  const pedir = useCallback((submissaoId: string, pessoaId: string, origem: PedidoResolver["origem"]) => {
    const s = ordenadas.find((x) => x.id === submissaoId);
    if (!s) return;
    setPedido({ submissaoId, pessoaId, origem, nome: pessoas.get(pessoaId)?.nome ?? "", conflito: s.codigo === "CONFLITO" });
  }, [ordenadas, pessoas]);

  const confirmar = () => {
    if (!pedido) return;
    const { submissaoId, pessoaId, nome, origem } = pedido;
    // Só avisa se a resolução muda mesmo o estado (senão não houve nada a registar).
    const base = { submissoes: ordenadas, notas: [] };
    if (resolverSubmissao(base, submissaoId, pessoaId) === base) {
      setPedido(null);
      return;
    }
    const proxima = vizinha(ordenadas, submissaoId);
    foco.current =
      origem === "ficha" ? "[data-foco-ficha]" : proxima ? `[data-submissao-id="${proxima}"]` : "[data-foco-vazio]";
    resolver(submissaoId, pessoaId);
    toast.success(t("pessoasPagina.resolved.toast", { name: nome }));
    const restam = ordenadas.length - 1;
    // O toast diz o que aconteceu; a região aria-live só acrescenta quantas faltam (não repete o toast).
    // Um espaço inseparável alternado faz o leitor de ecrã voltar a anunciar um texto igual.
    setAnuncio((a) => ({
      texto: t(restam > 0 ? "pessoasPagina.resolved.live" : "pessoasPagina.resolved.liveNone", { count: restam }),
      vez: a.vez + 1,
    }));
    setPedido(null);
  };

  /** Ao fechar o diálogo: se acabou de resolver, o foco vai ao alvo guardado; se cancelou, volta ao botão de onde veio. */
  const aoFechar = (e: Event) => {
    const alvo = foco.current ? document.querySelector<HTMLElement>(foco.current) : null;
    foco.current = null;
    if (!alvo) return;
    e.preventDefault();
    alvo.focus();
  };

  const textoAnuncio = anuncio.vez % 2 === 0 ? anuncio.texto : `${anuncio.texto}\u00A0`;
  return { pedido, anuncio: textoAnuncio, pedir, confirmar, cancelar: () => setPedido(null), aoFechar };
}
