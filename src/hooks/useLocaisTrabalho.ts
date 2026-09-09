/**
 * Os locais de trabalho da organizacao activa (`hr_locais_trabalho`).
 *
 * PORQUE EXISTE UMA TABELA PROPRIA
 * --------------------------------
 * Na ronda 1 o local era `pessoas.local_trabalho`, texto livre: "Porto" e
 * "porto" eram dois locais distintos e nao havia como dizer QUANTAS horas se
 * fizeram em cada um. A partir de `20261120130000` o local e uma linha com
 * nome unico por organizacao, e cada intervalo de horario aponta para ele.
 *
 * `organizacao_ref_id` e o que responde a "das 9 as 14 naquela empresa": o
 * local pode referir uma organizacao, e a maioria dos locais nao refere
 * nenhuma (uma loja, uma obra, a casa de um cliente).
 *
 * UMA RECUSA POR PERMISSAO NAO E UM DEFEITO. Quem nao tem `hr.locais.view`
 * fica com a lista vazia e `semPermissao = true` -- e os ecras mostram-no como
 * "pedir a quem gere locais", nao como avaria. Ao Sentry so vai o resto.
 */
import { useCallback, useEffect, useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { hrFrom, isPermissionError } from "@/lib/hr/hrDb";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import type { LocalTrabalho, TipoLocal } from "@/types/hr";

const COLUNAS = [
  "id",
  "organization_id",
  "nome",
  "codigo",
  "tipo",
  "organizacao_ref_id",
  "morada",
  "cidade",
  "codigo_postal",
  "pais",
  "latitude",
  "longitude",
  "activo",
  "notas",
].join(", ");

export function useLocaisTrabalho() {
  const { activeCompany } = useCompany();
  const [locais, setLocais] = useState<LocalTrabalho[]>([]);
  const [loading, setLoading] = useState(true);
  const [semPermissao, setSemPermissao] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeCompany?.id) {
      setLocais([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setSemPermissao(false);
    const { data, error: erro } = await hrFrom("hr_locais_trabalho")
      .select(COLUNAS)
      .eq("organization_id", activeCompany.id)
      .eq("activo", true)
      .is("deleted_at", null)
      .order("nome", { ascending: true });

    if (erro) {
      if (isPermissionError(erro)) {
        setSemPermissao(true);
      } else {
        captureFlowError(erro, "hr-locais-load");
        setError(await getFriendlyErrorMessage(erro));
      }
      setLocais([]);
      setLoading(false);
      return;
    }
    setLocais((data ?? []) as LocalTrabalho[]);
    setLoading(false);
  }, [activeCompany?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Cria um local e devolve o id, ou lanca. `organization_id` vem SEMPRE da
   * organizacao activa: a base recusaria de outra forma, mas nao se manda ao
   * servidor uma escolha que o utilizador nao devia poder fazer.
   */
  const criarLocal = useCallback(
    async (dados: { nome: string; tipo: TipoLocal }): Promise<string> => {
      if (!activeCompany?.id) throw new Error("Sem organizacao activa");
      const autorId = await resolveCurrentBusinessUserId();
      const { data, error: erro } = await hrFrom("hr_locais_trabalho")
        .insert({
          organization_id: activeCompany.id,
          nome: dados.nome.trim(),
          tipo: dados.tipo,
          created_by: autorId,
          updated_by: autorId,
        })
        .select("id")
        .single();
      if (erro) {
        if (!isPermissionError(erro)) captureFlowError(erro, "hr-locais-write");
        throw erro;
      }
      await load();
      return (data as { id: string }).id;
    },
    [activeCompany?.id, load],
  );

  return { locais, loading, semPermissao, error, refresh: load, criarLocal };
}
