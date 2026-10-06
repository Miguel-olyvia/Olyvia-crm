/**
 * O URL assinado da fotografia da pessoa, para o cabecalho da ficha.
 *
 * A fotografia vive num bucket privado: so se mostra por um URL assinado de
 * `hr-anexo-url` (TTL 300 s), pedido a quem tem `hr.pessoas.view` ou e a propria
 * pessoa. O hook renova o URL aos 240 s -- antes de expirar, para a imagem
 * nunca partir enquanto a ficha esta aberta -- e NUNCA o persiste (nem em
 * `localStorage`, nem em cache de dados).
 *
 * Devolve `null` quando nao ha fotografia, enquanto carrega e quando o primeiro
 * pedido falha: o cabecalho cai nas iniciais e nao insiste. Uma RENOVACAO que
 * falha (rede, 5xx) mantem o URL anterior, que ainda vale cerca de 60 s, e
 * repete ate 3 vezes de 15 em 15 s antes de desistir. Uma recusa de permissao
 * e a resposta correcta: limpa o URL, nao se repete e nao vai para o registo.
 */
import { useEffect, useState } from "react";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { eRecusaDePermissao, pedirUrlAnexo } from "@/lib/hr/anexoUrl";

/** Renova aos 240 s quando o servidor nao diz a validade (TTL 300 s menos uma folga). */
const RENOVAR_POR_OMISSAO_MS = 240_000;
/** Folga antes de o URL expirar. */
const FOLGA_MS = 60_000;
/** Quantas renovacoes falhadas seguidas se toleram antes de voltar as iniciais. */
const TENTATIVAS_DE_RENOVACAO = 3;
/** Espera entre tentativas de uma renovacao falhada: 3 x 15 s cabem na folga de 60 s do URL. */
const INTERVALO_DE_NOVA_TENTATIVA_MS = 15_000;
/** Nunca renovar mais depressa do que isto: um TTL absurdo nao pode virar um ciclo de pedidos. */
const RENOVAR_MINIMO_MS = 30_000;

export function usePessoaFotografia(fotografiaAnexoId: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    setUrl(null);
    if (!fotografiaAnexoId) return;

    let cancelado = false;
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    let jaTemUrl = false;
    let falhasSeguidas = 0;

    const pedir = async (): Promise<void> => {
      try {
        const resposta = await pedirUrlAnexo(fotografiaAnexoId);
        if (cancelado) return;
        jaTemUrl = true;
        falhasSeguidas = 0;
        setUrl(resposta.url);
        const validadeMs =
          resposta.expiraEmSegundos !== null ? resposta.expiraEmSegundos * 1000 : null;
        const aoFim =
          validadeMs === null
            ? RENOVAR_POR_OMISSAO_MS
            : Math.max(RENOVAR_MINIMO_MS, validadeMs - FOLGA_MS);
        temporizador = setTimeout(() => void pedir(), aoFim);
      } catch (erro) {
        if (cancelado) return;
        const recusa = eRecusaDePermissao(erro);
        // `pedirUrlAnexo` ja regista o que nao e recusa; aqui so se evita
        // registar duas vezes uma resposta mal formada.
        if (!recusa && erro instanceof Error && !("context" in erro)) {
          captureFlowError(erro, "hr-pessoa-fotografia");
        }
        // Uma RENOVACAO que falha por rede ou 5xx nao tira a fotografia: o URL
        // anterior ainda vale cerca de 60 s, e tenta-se de novo pouco depois.
        // O primeiro pedido, uma recusa de permissao ou as tentativas esgotadas
        // caem nas iniciais.
        falhasSeguidas += 1;
        if (jaTemUrl && !recusa && falhasSeguidas < TENTATIVAS_DE_RENOVACAO) {
          temporizador = setTimeout(() => void pedir(), INTERVALO_DE_NOVA_TENTATIVA_MS);
          return;
        }
        setUrl(null);
      }
    };

    void pedir();
    return () => {
      cancelado = true;
      if (temporizador) clearTimeout(temporizador);
    };
  }, [fotografiaAnexoId]);

  return url;
}
