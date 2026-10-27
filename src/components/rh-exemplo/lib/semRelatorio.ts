/**
 * O reporte de erros dos ecrãs de RH de exemplo é o do módulo real: este ficheiro mantém o caminho de importação de
 * sempre e reencaminha para o wrapper (a única porta para @/lib/observability, ver semBase.test.ts).
 */
export { captureFlowError, type BusinessFlow } from "@/components/rh-exemplo/hooks/captureFlowError";
