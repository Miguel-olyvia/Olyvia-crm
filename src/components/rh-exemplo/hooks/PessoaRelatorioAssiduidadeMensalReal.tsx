// O relatório mensal de assiduidade da pessoa, ligado à base: o diálogo do RH real (selector de mês, grelha diária,
// totais, obras, organização e exportação de PDF verdadeiro), que lê as vistas v_hr_* pelo hook real. Só os wrappers
// desta pasta podem importar código real de RH (ver semBase.test.ts).
export { PessoaRelatorioAssiduidadeMensal } from "@/components/hr/PessoaRelatorioAssiduidadeMensal";
