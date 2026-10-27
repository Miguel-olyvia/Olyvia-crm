/**
 * O que o painel «Nova pessoa» usa do RH real e que não é um hook de dados: o seletor de conta de CRM e o que preenche a
 * partir dela, a zona dos anexos reais, as regras de que permissão escreve cada tipo de anexo, e o foco num campo que ainda
 * pode não existir. Fica aqui, em hooks/, porque é o único sítio de rh-exemplo onde o teste guarda (semBase.test.ts) deixa
 * importar código real de RH.
 */
export { ZonaAnexosNovaPessoa } from "@/components/hr/anexos/ZonaAnexosNovaPessoa";
export { CampoConta } from "@/components/hr/form/CampoConta";
export { PERMISSAO_ESCRITA_POR_TIPO, podeAnexarTipo } from "@/lib/hr/anexosRh";
export type { PermissoesEscritaAnexos, TipoAnexoRh } from "@/lib/hr/anexosRh";
export { focarQuandoExistir } from "@/lib/hr/focarCampo";
export { preenchimentoDaConta, reverterAutoPreenchido } from "@/lib/hr/preenchimentoPorConta";
export type { AvisoPreenchimento, CamposPreenchiveis } from "@/lib/hr/preenchimentoPorConta";
