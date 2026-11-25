// 25/11 (Obra Viva, etapa 3b): o que o pacote do servidor (motor.bundle.js) exporta para o index.ts. Empacota-se com
// `npm run build:agentes-obra` (scripts/construir-agentes-obra.mjs), que troca o cliente da app pelo clienteServidor.ts.
export { correrAgentesServidor, type ResumoAgentes } from "../../../src/emylia/estudioObra/agentesServidor";
export { definirClienteServidor } from "./clienteServidor";
