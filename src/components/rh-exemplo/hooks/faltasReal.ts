/**
 * O desconto de faltas e a conferencia das faltas no fecho, REAIS (`@/lib/hr/descontoFalta`, `@/lib/hr/faltasFecho`), delegados.
 * Os ecras de /rh-exemplo importam daqui; so os wrappers desta pasta importam codigo real.
 */
export { descontoDaFalta, totalDeDescontos } from "@/lib/hr/descontoFalta";
export type { RazaoDesconto, DescontoDaFalta, FaltaParaDesconto } from "@/lib/hr/descontoFalta";
export { conferirFaltasDoFecho } from "@/lib/hr/faltasFecho";
