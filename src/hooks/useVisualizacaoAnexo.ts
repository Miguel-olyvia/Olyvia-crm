/**
 * O ficheiro de um anexo sensivel (cartao de cidadao, comprovativo de IBAN),
 * carregado para ser VISTO DENTRO DA PAGINA e nao descarregado nem aberto
 * noutro separador.
 *
 * COMO FUNCIONA
 * -------------
 * Pede um URL assinado novo (`obterUrl` -> `hr-anexo-url`, que audita a abertura
 * e tem TTL de 60 s), descarrega-o como blob e entrega um URL de objecto. O URL
 * assinado nunca chega ao DOM; o de objecto so vive enquanto a janela esta
 * aberta: ao fechar, ao desmontar ou ao trocar de anexo e revogado e o ficheiro
 * deixa de estar guardado. Uma resposta que chega depois de fechar e deitada fora.
 *
 * O TEMPO: ao fim de `DURACAO_VISUALIZACAO_MS` chama `aoExpirar` (quem usa fecha
 * a janela). O tempo conta desde a abertura, ainda que o ficheiro demore a vir.
 *
 * O TIPO: so se mostra PDF, PNG ou JPEG. O blob e refeito com esse tipo (nunca o
 * que vier no cabecalho), para o browser nao o tratar como HTML.
 */
import { useEffect, useRef, useState } from "react";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import type { UrlAnexo } from "@/lib/hr/anexoUrl";

export const DURACAO_VISUALIZACAO_MS = 120_000;

const MIMES_VISUALIZAVEIS: readonly string[] = ["application/pdf", "image/png", "image/jpeg"];

export type EstadoVisualizacao =
  | { fase: "inactivo" }
  | { fase: "a_carregar" }
  | { fase: "erro" }
  | { fase: "pronto"; url: string; mime: string };

const INACTIVO: EstadoVisualizacao = { fase: "inactivo" };
const A_CARREGAR: EstadoVisualizacao = { fase: "a_carregar" };
const ERRO: EstadoVisualizacao = { fase: "erro" };

interface Opcoes {
  /** O anexo a ver; `null` = nada aberto. */
  anexoId: string | null;
  obterUrl: (anexoId: string) => Promise<UrlAnexo>;
  aoExpirar: () => void;
}

function mimeVisualizavel(...candidatos: Array<string | null | undefined>): string | null {
  for (const c of candidatos) {
    if (c && MIMES_VISUALIZAVEIS.includes(c)) return c;
  }
  return null;
}

export function useVisualizacaoAnexo({ anexoId, obterUrl, aoExpirar }: Opcoes): EstadoVisualizacao {
  const [estado, setEstado] = useState<EstadoVisualizacao>(INACTIVO);
  const obterUrlRef = useRef(obterUrl);
  const aoExpirarRef = useRef(aoExpirar);
  obterUrlRef.current = obterUrl;
  aoExpirarRef.current = aoExpirar;

  useEffect(() => {
    if (!anexoId) {
      setEstado(INACTIVO);
      return;
    }
    setEstado(A_CARREGAR);
    const controlo = new AbortController();
    let objecto: string | null = null;
    const temporizador = setTimeout(() => aoExpirarRef.current(), DURACAO_VISUALIZACAO_MS);

    void (async () => {
      try {
        const { url, mime_type: mimeServidor } = await obterUrlRef.current(anexoId);
        if (controlo.signal.aborted) return;
        const resposta = await fetch(url, {
          signal: controlo.signal,
          credentials: "omit",
          cache: "no-store",
        });
        if (!resposta.ok) throw new Error(`hr-anexo-visualizar: http ${resposta.status}`);
        const bruto = await resposta.blob();
        if (controlo.signal.aborted) return;
        const mime = mimeVisualizavel(mimeServidor, bruto.type);
        if (!mime) throw new Error("hr-anexo-visualizar: tipo nao visualizavel");
        objecto = URL.createObjectURL(new Blob([bruto], { type: mime }));
        setEstado({ fase: "pronto", url: objecto, mime });
      } catch (erro) {
        if (controlo.signal.aborted) return;
        // O pedido do URL ja regista o que for inesperado; aqui so a leitura do blob.
        if (erro instanceof Error && erro.message.startsWith("hr-anexo-visualizar")) {
          captureFlowError(erro, "hr-anexo-obter-url");
        }
        setEstado(ERRO);
      }
    })();

    return () => {
      controlo.abort();
      clearTimeout(temporizador);
      if (objecto) URL.revokeObjectURL(objecto);
      setEstado(INACTIVO);
    };
  }, [anexoId]);

  return estado;
}
