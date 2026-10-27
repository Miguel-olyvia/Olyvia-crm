// O relatório de erros do RH real (Sentry), para os ecrãs de /rh-exemplo: os erros que o código trata e engole (motivos
// do detalhe de ausências, erros de cargo e de fim de contrato) passam a ser reportados como no módulo real. Só os
// wrappers desta pasta podem importar de @/lib/observability (ver semBase.test.ts). Não lança nunca.
export { captureFlowError, type BusinessFlow } from "@/lib/observability/captureFlowError";
