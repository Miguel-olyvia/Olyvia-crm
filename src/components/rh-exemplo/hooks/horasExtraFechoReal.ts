/**
 * Funcoes PURAS do fecho das horas extra aprovadas (os argumentos da preparacao e a chave a gravar), delegadas. Ficam fora de
 * horasExtraReal para os testes dos ecras poderem simular so a leitura (a RPC). So os wrappers desta pasta importam codigo real.
 */
export { argsDoFechoDeHorasExtra, assinaturaDeHorasExtraDoCalculo, type TotaisHorasExtraDoCalculo } from "@/lib/hr/horasExtraFecho";
