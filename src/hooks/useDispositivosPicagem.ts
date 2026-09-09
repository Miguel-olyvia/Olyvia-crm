/**
 * O catalogo de dispositivos de picagem.
 *
 * A EXCEPCAO DO MODULO, E ESTA ESCRITO AQUI PARA NAO SE PROCURAR UMA RPC
 * ---------------------------------------------------------------------
 * `hr_picagens_dispositivos` e a UNICA tabela deste modulo com escrita
 * directa: `authenticated` tem GRANT de SELECT, INSERT e UPDATE, e a RLS pede
 * `hr.assiduidade.dispositivos.edit`. Nao ha `rpc_hr_dispositivo_*` nenhuma e
 * nao e esquecimento -- procura-la e perder tempo. Em contrapartida, as outras
 * tres tabelas do modulo recusam qualquer insert directo, e um `hrFrom(...)
 * .insert(...)` sobre elas nao e um atalho: e um erro.
 *
 * NAO SE APAGA
 * ------------
 * O DELETE esta bloqueado por politica RESTRICTIVE. Desactivar um dispositivo
 * e `activo = false`; retira-lo do catalogo e `deleted_at`. Um dispositivo com
 * picagens agarradas nunca deve desaparecer -- as picagens ficariam a apontar
 * para nada.
 *
 * A CHAVE NUNCA PASSA POR AQUI
 * ----------------------------
 * A tabela guarda `chave_registo_hash`, e nem o hash se le: as colunas pedidas
 * sao as do catalogo mais `chave_rodada_em`, para o ecra poder dizer quando foi
 * rodada. A chave em claro nao existe do lado do cliente.
 */
import { useCallback, useEffect, useState } from "react";
import { useCompany } from "@/contexts/CompanyContext";
import { captureFlowError } from "@/lib/observability/captureFlowError";
import { getFriendlyErrorMessage } from "@/utils/friendlyError";
import { resolveCurrentBusinessUserId } from "@/lib/identity/resolveBusinessUserId";
import { hrFrom, isPermissionError } from "@/lib/hr/hrDb";
import type { Dispositivo, TipoDispositivo } from "@/types/hrAssiduidade";

const COLUNAS =
  "id, organization_id, codigo, nome, tipo, local_id, chave_rodada_em, ref_externa, " +
  "fabricante, modelo, notas, activo, ultima_picagem_em";

export interface DispositivoParaGravar {
  id?: string;
  codigo: string;
  nome: string;
  tipo: TipoDispositivo;
  localId: string | null;
  refExterna: string | null;
  fabricante: string | null;
  modelo: string | null;
  notas: string | null;
  activo: boolean;
}

export function useDispositivosPicagem() {
  const { activeCompany } = useCompany();
  const orgId = activeCompany?.id ?? null;

  const [dispositivos, setDispositivos] = useState<Dispositivo[]>([]);
  const [recusado, setRecusado] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) {
      setDispositivos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await hrFrom("hr_picagens_dispositivos")
        .select(COLUNAS)
        .eq("organization_id", orgId)
        .is("deleted_at", null)
        .order("nome", { ascending: true });

      if (error) {
        if (isPermissionError(error)) {
          setRecusado(true);
          setDispositivos([]);
          return;
        }
        captureFlowError(error, "hr-assiduidade-load");
        setDispositivos([]);
        return;
      }
      setRecusado(false);
      setDispositivos((data ?? []) as Dispositivo[]);
    } catch (e) {
      captureFlowError(e, "hr-assiduidade-load");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** `null` em sucesso, ou a mensagem amigavel. Nunca so na consola. */
  const guardar = useCallback(
    async (valores: DispositivoParaGravar): Promise<string | null> => {
      setSaving(true);
      try {
        const autor = await resolveCurrentBusinessUserId();
        const comuns = {
          codigo: valores.codigo.trim(),
          nome: valores.nome.trim(),
          tipo: valores.tipo,
          local_id: valores.localId,
          ref_externa: valores.refExterna,
          fabricante: valores.fabricante,
          modelo: valores.modelo,
          notas: valores.notas,
          activo: valores.activo,
          updated_by: autor,
        };

        const { error } = valores.id
          ? await hrFrom("hr_picagens_dispositivos").update(comuns).eq("id", valores.id)
          : await hrFrom("hr_picagens_dispositivos").insert({
              ...comuns,
              organization_id: orgId,
              created_by: autor,
            });

        if (error) throw error;
        await load();
        return null;
      } catch (e) {
        if (!isPermissionError(e)) captureFlowError(e, "hr-assiduidade-write");
        return await getFriendlyErrorMessage(e);
      } finally {
        setSaving(false);
      }
    },
    [orgId, load],
  );

  return { dispositivos, recusado, loading, saving, recarregar: load, guardar };
}
