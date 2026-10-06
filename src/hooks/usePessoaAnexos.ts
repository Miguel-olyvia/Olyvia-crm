/**
 * Os anexos da admissao de UMA pessoa (cartao de cidadao, comprovativo de IBAN,
 * fotografia) que o convite trouxe e a submissao aceitou.
 *
 * SO METADADOS AQUI DENTRO
 * ------------------------
 * `pessoas_anexos` so deixa `authenticated` ler as colunas listadas em
 * `COLUNAS_ANEXO` (GRANT por coluna): o caminho no Storage, o hash, o IP e o
 * convite ficam fechados. A RLS so mostra os `promovido` a quem tem
 * `hr.pessoas.view` (ou `view.own` na propria ficha) -- por isso a lista e
 * visivel a quem ve a ficha, mas o CONTEUDO continua gated no servidor: abre-se
 * um ficheiro de cada vez por `obterUrl` (`hr-anexo-url`), que decide por tipo
 * e audita. O URL nunca se guarda nem se reaproveita.
 *
 * Uma recusa de permissao (`isPermissionError`) e a resposta CORRECTA e fica
 * silenciosa para o registo; qualquer outra falha vai por `captureFlowError`.
 */
import { useCallback, useEffect, useState } from "react";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { hrFrom, isPermissionError } from "@/lib/hr/hrDb";
import { pedirUrlAnexo, type UrlAnexo } from "@/lib/hr/anexoUrl";
import type { PessoaAnexo } from "@/types/hr";

/** Exactamente as colunas concedidas a `authenticated`; nunca `*`. */
const COLUNAS_ANEXO =
  "id, organization_id, pessoa_id, tipo, estado, nome_original, mime_type, " +
  "tamanho_bytes, promovido_em, criado_em";

export interface UsePessoaAnexosResult {
  anexos: PessoaAnexo[];
  loading: boolean;
  /** Distingue "sem anexos" de "sem permissao de os ver". */
  recusado: boolean;
  /** Pede um URL novo; lanca em erro -- quem chama mostra a mensagem. */
  obterUrl: (anexoId: string) => Promise<UrlAnexo>;
}

export function usePessoaAnexos(
  pessoaId: string | undefined,
  organizationId: string | undefined,
): UsePessoaAnexosResult {
  const [anexos, setAnexos] = useState<PessoaAnexo[]>([]);
  const [loading, setLoading] = useState(true);
  const [recusado, setRecusado] = useState(false);

  useEffect(() => {
    let cancelado = false;
    if (!pessoaId || !organizationId) {
      setAnexos([]);
      setRecusado(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await hrFrom("pessoas_anexos")
          .select(COLUNAS_ANEXO)
          .eq("pessoa_id", pessoaId)
          .eq("organization_id", organizationId)
          .eq("estado", "promovido")
          .order("criado_em", { ascending: true });
        if (cancelado) return;
        if (error) {
          setAnexos([]);
          if (isPermissionError(error)) {
            setRecusado(true);
          } else {
            setRecusado(false);
            captureFlowError(error, "hr-pessoa-anexos-carregar");
          }
          return;
        }
        setRecusado(false);
        setAnexos((data ?? []) as PessoaAnexo[]);
      } catch (error) {
        if (cancelado) return;
        setAnexos([]);
        captureFlowError(error, "hr-pessoa-anexos-carregar");
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [pessoaId, organizationId]);

  const obterUrl = useCallback((anexoId: string) => pedirUrlAnexo(anexoId), []);

  return { anexos, loading, recusado, obterUrl };
}
