// O relatório mensal de assiduidade da organização («Exportar tudo»), ligado à base: o diálogo do RH real, que gera uma
// instância do relatório de cada pessoa do mapa (vistas v_hr_*) para imprimir. Só os wrappers desta pasta podem importar
// código real de RH (ver semBase.test.ts).
export {
  RelatorioAssiduidadeMensalOrganizacao,
  type PessoaDoRelatorioOrganizacao,
} from "@/components/hr/assiduidade/RelatorioAssiduidadeMensalOrganizacao";
