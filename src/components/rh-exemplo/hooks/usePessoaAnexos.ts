/** Os anexos de admissao de uma pessoa de exemplo (cartao, comprovativo, fotografia), em memoria. */
import { useCallback, useMemo, useState } from "react";
import { atualizarFicha, novoId, useFichaRh } from "@/components/rh-exemplo/dados/loja";
import type { EnvioAnexoRh } from "@/components/rh-exemplo/hooks/useAnexarAnexoRh";
import { urlDeExemplo, type UrlAnexo } from "@/components/rh-exemplo/lib/anexoUrl";
import type { TipoAnexoRh } from "@/components/rh-exemplo/lib/anexosRh";
import type { PessoaAnexo } from "@/components/rh-exemplo/tipos";

export interface ResultadoAccaoAnexo {
  ok: boolean;
  codigo: string | null;
}

export interface ErroLimiteAnexo {
  tipo: TipoAnexoRh;
  codigo: string;
}

const SEM_ANEXOS: PessoaAnexo[] = [];
const SEM_ENVIOS: Record<string, EnvioAnexoRh> = {};
const SEM_ERROS: Record<string, string> = {};
const NADA_A_REMOVER: ReadonlySet<string> = new Set();
const OK: ResultadoAccaoAnexo = { ok: true, codigo: null };

export function usePessoaAnexos(pessoaId: string | undefined, organizationId: string | undefined) {
  const ficha = useFichaRh(pessoaId);
  const anexos = ficha?.anexos ?? SEM_ANEXOS;
  const [erroLimite] = useState<ErroLimiteAnexo | null>(null);

  const obterUrl = useCallback(
    async (anexoId: string): Promise<UrlAnexo> => {
      const anexo = anexos.find((a) => a.id === anexoId);
      return {
        url: urlDeExemplo(anexo?.nome_original ?? "Anexo"),
        expiraEmSegundos: 120,
        tipo: anexo?.tipo ?? null,
        mime_type: "image/svg+xml",
      };
    },
    [anexos],
  );

  const gravar = useCallback(
    (tipo: TipoAnexoRh, file: File, substituirId: string | null): ResultadoAccaoAnexo => {
      if (!pessoaId || !organizationId) return { ok: false, codigo: "pessoa_nao_encontrada" };
      const id = novoId("anx");
      const agora = new Date().toISOString();
      atualizarFicha(pessoaId, (f) => ({
        ...f,
        pessoa: tipo === "fotografia" ? { ...f.pessoa, fotografia_anexo_id: id } : f.pessoa,
        anexos: [
          ...f.anexos.filter((a) => a.id !== substituirId),
          {
            id,
            organization_id: organizationId,
            pessoa_id: pessoaId,
            tipo,
            estado: "promovido",
            nome_original: file.name,
            mime_type: file.type || null,
            tamanho_bytes: file.size,
            promovido_em: agora,
            criado_em: agora,
          },
        ],
      }));
      return OK;
    },
    [pessoaId, organizationId],
  );

  const anexar = useCallback(
    async (tipo: TipoAnexoRh, file: File): Promise<ResultadoAccaoAnexo> => gravar(tipo, file, null),
    [gravar],
  );
  const substituir = useCallback(
    async (anexoId: string, tipo: TipoAnexoRh, file: File): Promise<ResultadoAccaoAnexo> =>
      gravar(tipo, file, anexoId),
    [gravar],
  );
  const remover = useCallback(
    async (anexoId: string): Promise<ResultadoAccaoAnexo> => {
      if (!pessoaId) return { ok: false, codigo: null };
      atualizarFicha(pessoaId, (f) => ({
        ...f,
        pessoa: f.pessoa.fotografia_anexo_id === anexoId ? { ...f.pessoa, fotografia_anexo_id: null } : f.pessoa,
        anexos: f.anexos.filter((a) => a.id !== anexoId),
      }));
      return OK;
    },
    [pessoaId],
  );

  return useMemo(
    () => ({
      anexos,
      loading: false,
      recusado: false,
      erroCarregar: false,
      obterUrl,
      recarregar: () => undefined,
      anexar,
      substituir,
      remover,
      envios: SEM_ENVIOS,
      descartarEnvio: (_id: string) => undefined,
      aRemover: NADA_A_REMOVER,
      errosRemocao: SEM_ERROS,
      limparErroRemocao: (_anexoId: string) => undefined,
      erroLimite,
    }),
    [anexos, obterUrl, anexar, substituir, remover, erroLimite],
  );
}
