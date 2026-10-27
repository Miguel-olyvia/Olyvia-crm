/**
 * O que o cartão «Estado do convite» da ficha usa do RH real: os dois selos (admissão e portal), a frase do link e os diálogos
 * de prolongar e cancelar. As regras de que estado admite que ação estão em `estadoAdmissaoReal` (só lógica). Fica aqui, em
 * hooks/, porque é o único sítio de rh-exemplo onde o teste guarda (semBase.test.ts) deixa importar código real de RH.
 */
export { fraseDoPortal } from "@/components/hr/admissao/aspectoSelos";
export { SelosAdmissao } from "@/components/hr/admissao/SelosAdmissao";
export { CancelarConviteDialog } from "@/components/hr/CancelarConviteDialog";
export { ProlongarConviteDialog } from "@/components/hr/ProlongarConviteDialog";
export { cancelarExigeAprovar, podeCancelar, podeProlongar, processoAberto } from "@/components/rh-exemplo/hooks/estadoAdmissaoReal";
