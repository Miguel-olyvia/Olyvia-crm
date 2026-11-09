/**
 * O total bruto estimado do mes de UMA pessoa: a conta e a REAL, de `@/lib/hr/processamentoTotais` (a «Visao geral» e o «Calculo
 * do mes» usam a mesma). Este ficheiro era uma copia (so as importacoes de tipos diferiam) e duas copias divergem: o desconto de
 * faltas e as horas extra aprovadas ja so existiam numa. Passou a reexportar a real (pelo wrapper `hooks/processamentoTotaisReal`,
 * o unico sitio de rh-exemplo que importa codigo real); os tipos de `rh-exemplo/tipos` sao copias estruturais dos de `@/types/hr`.
 */
export * from "@/components/rh-exemplo/hooks/processamentoTotaisReal";
