// As oito abas da ficha de RH, pela ordem em que aparecem (o Custo, do fluxo 11, é a última).
export const ABAS_FICHA = ["visaoGeral", "laborais", "pessoais", "contratos", "planeamento", "ausencias", "documentos", "custo"] as const;
export type AbaFicha = (typeof ABAS_FICHA)[number];

export const ehAbaFicha = (valor: string): valor is AbaFicha => (ABAS_FICHA as readonly string[]).includes(valor);
