// Os anexos do painel «Nova pessoa»: cartão de cidadão (frente e verso), comprovativo de IBAN e fotografia. Os ficheiros são
// REAIS e ficam em memória até a ficha existir (só então há `pessoa_id` para o servidor): seguem um a um depois de criar, e uma
// falha nunca desfaz a ficha. Os limites e os formatos são os do convite (no máximo 4 ficheiros no total, 2 do cartão, 1 do
// IBAN, 1 fotografia; PDF, PNG ou JPEG; fotografia só PNG ou JPEG). Cada tipo só se oferece a quem o pode escrever.
import { useMemo } from "react";
import { ZonaAnexosNovaPessoa } from "@/components/hr/anexos/ZonaAnexosNovaPessoa";
import { usePermissions } from "@/hooks/usePermissions";
import {
  PERMISSAO_ESCRITA_POR_TIPO,
  podeAnexarTipo,
  type PermissoesEscritaAnexos,
  type TipoAnexoRh,
} from "@/lib/hr/anexosRh";
import { useNova } from "./contextoNova";
import { SeccaoNova } from "./SeccaoNova";

/** As três permissões de ESCRITA (uma por tipo de anexo), lidas das do utilizador. */
function usePermissoesDeAnexos(): PermissoesEscritaAnexos {
  const { hasPermission } = usePermissions();
  return useMemo(
    () => ({
      identificacaoEdit: hasPermission(PERMISSAO_ESCRITA_POR_TIPO.cartao_cidadao),
      bancariosEdit: hasPermission(PERMISSAO_ESCRITA_POR_TIPO.comprovativo_iban),
      pessoaisEdit: hasPermission(PERMISSAO_ESCRITA_POR_TIPO.fotografia),
    }),
    [hasPermission],
  );
}

export function AnexosNova({ tipos }: { tipos: readonly TipoAnexoRh[] }) {
  const { anexos, aCriar } = useNova();
  const permissoes = usePermissoesDeAnexos();
  return <ZonaAnexosNovaPessoa estado={anexos} permissoes={permissoes} desactivado={aCriar} tipos={tipos} semMoldura />;
}

/** Uma secção de anexos que só aparece se quem cria puder escrever algum dos tipos (uma moldura vazia não diz nada). */
export function SeccaoAnexos({ titulo, tipos }: { titulo: string; tipos: readonly TipoAnexoRh[] }) {
  const permissoes = usePermissoesDeAnexos();
  if (!tipos.some((tipo) => podeAnexarTipo(tipo, permissoes))) return null;
  return (
    <SeccaoNova titulo={titulo}>
      <AnexosNova tipos={tipos} />
    </SeccaoNova>
  );
}
