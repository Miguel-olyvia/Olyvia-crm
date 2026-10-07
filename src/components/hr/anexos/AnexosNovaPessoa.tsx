/**
 * A zona de anexos do dialogo "Nova pessoa", ligada as permissoes de quem cria.
 *
 * E o que o `PessoaFormDialog` invoca: le as tres permissoes de ESCRITA (cartao
 * `hr.pessoas.identificacao.edit`, comprovativo `hr.pessoas.bancarios.edit`,
 * fotografia `hr.pessoas.pessoais.edit`) e entrega-as a zona, que so desenha os
 * tipos permitidos. Quem nao tem nenhuma nao ve a zona. O servidor repete a
 * decisao quando os ficheiros sao enviados.
 */
import { useMemo } from "react";
import { ZonaAnexosNovaPessoa } from "@/components/hr/anexos/ZonaAnexosNovaPessoa";
import { usePermissions } from "@/hooks/usePermissions";
import type { ResultadoAnexosNovaPessoa } from "@/hooks/useAnexosNovaPessoa";
import { PERMISSAO_ESCRITA_POR_TIPO, type PermissoesEscritaAnexos } from "@/lib/hr/anexosRh";

interface AnexosNovaPessoaProps {
  estado: ResultadoAnexosNovaPessoa;
  /** A ficha esta a ser criada. */
  desactivado: boolean;
}

export function AnexosNovaPessoa({ estado, desactivado }: AnexosNovaPessoaProps) {
  const { hasPermission } = usePermissions();
  const permissoes = useMemo<PermissoesEscritaAnexos>(
    () => ({
      identificacaoEdit: hasPermission(PERMISSAO_ESCRITA_POR_TIPO.cartao_cidadao),
      bancariosEdit: hasPermission(PERMISSAO_ESCRITA_POR_TIPO.comprovativo_iban),
      pessoaisEdit: hasPermission(PERMISSAO_ESCRITA_POR_TIPO.fotografia),
    }),
    [hasPermission],
  );
  return <ZonaAnexosNovaPessoa estado={estado} permissoes={permissoes} desactivado={desactivado} />;
}
