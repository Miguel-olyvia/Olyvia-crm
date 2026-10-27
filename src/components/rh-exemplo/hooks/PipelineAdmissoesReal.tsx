/**
 * O pipeline de admissões da lista de Pessoas, o real (`rpc_hr_admissao_listar`, via `useAdmissoesPipeline`).
 * Vive aqui porque só os wrappers desta pasta podem importar código real de RH; a lista de /rh-exemplo usa este nome.
 * A organização é a ativa no ecrã: quem o monta deve dar-lhe `key` com o id da organização.
 */
export { PipelineAdmissoes } from "@/components/hr/admissao/PipelineAdmissoes";
