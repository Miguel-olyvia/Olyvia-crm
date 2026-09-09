/**
 * As catorze permissoes de assiduidade, resolvidas num sitio so.
 *
 * Existe para nao haver quatro ecras a escrever a mesma lista de `hasPermission`
 * com uma diferenca por distraccao -- foi assim que, noutro modulo, a leitura
 * ganhou ambito e a escrita ficou sem ele.
 *
 * `validarRealizado` e de emprestimo: validar horas continua a ser
 * `hr.pessoas.horario_realizado.validar`, da ronda anterior.
 * `hr.assiduidade.validar` nao existe, e nao se cria uma permissao nova para
 * uma coisa que ja tem dona.
 */
import { useMemo } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import type { PermissoesAssiduidade } from "@/types/hrAssiduidade";

export function usePermissoesAssiduidade(): {
  permissoes: PermissoesAssiduidade;
  loading: boolean;
} {
  const { hasPermission, loading } = usePermissions();

  const permissoes = useMemo<PermissoesAssiduidade>(
    () => ({
      view: hasPermission("hr.assiduidade.view"),
      viewOwn: hasPermission("hr.assiduidade.view.own"),
      equipaView: hasPermission("hr.assiduidade.equipa.view"),
      picar: hasPermission("hr.assiduidade.picar"),
      picarOutros: hasPermission("hr.assiduidade.picar.outros"),
      gerir: hasPermission("hr.assiduidade.gerir"),
      corrigir: hasPermission("hr.assiduidade.corrigir"),
      faltasView: hasPermission("hr.assiduidade.faltas.view"),
      faltasEdit: hasPermission("hr.assiduidade.faltas.edit"),
      justificacaoView: hasPermission("hr.assiduidade.justificacao.view"),
      justificacaoEdit: hasPermission("hr.assiduidade.justificacao.edit"),
      dispositivosView: hasPermission("hr.assiduidade.dispositivos.view"),
      dispositivosEdit: hasPermission("hr.assiduidade.dispositivos.edit"),
      validarRealizado: hasPermission("hr.pessoas.horario_realizado.validar"),
    }),
    [hasPermission],
  );

  return { permissoes, loading };
}
