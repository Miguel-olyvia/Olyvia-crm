/**
 * Dados de exemplo da apresentação de Recursos Humanos: 13 pessoas, com filiais,
 * cargos, contratos (alguns a terminar), retribuição, horários, ausências e
 * documentos. Tudo inventado e gerado em memória, com datas relativas a hoje para
 * a lista de "contratos a terminar" fazer sentido em qualquer dia.
 */
import { ORGANIZACAO_EXEMPLO_ID as ORG } from "@/components/rh-exemplo/dados/constantes";
import * as K from "@/components/rh-exemplo/dados/constantes";
import { catalogos } from "@/components/rh-exemplo/dados/catalogos";
import { fichaDeEspec, type EspecPessoa } from "@/components/rh-exemplo/dados/fichaExemplo";
import type { EstadoRh, FichaRh } from "@/components/rh-exemplo/dados/tiposLoja";

const SEG_SEX = ["seg", "ter", "qua", "qui", "sex"] as const;
const TER_SAB = ["ter", "qua", "qui", "sex", "sab"] as const;

const ESPECS: EspecPessoa[] = [
  { id: "p-marta", nome: "Marta", apelido: "Figueiredo", cargoId: "cg-diretor", localId: K.LOCAL_SEDE, filialId: K.FILIAL_SEDE, tipo: "sem_termo", inicio: -2100, fim: null, reportaA: null, conta: true, estado: "activo", genero: "feminino", nascimento: "1981-04-12", trabalho: "presencial", horas: 40, dias: SEG_SEX },
  { id: "p-rui", nome: "Rui", apelido: "Amaral", cargoId: "cg-gerente", localId: K.LOCAL_COLOMBO, filialId: K.FILIAL_LISBOA, tipo: "sem_termo", inicio: -1500, fim: null, reportaA: "p-marta", conta: true, estado: "activo", genero: "masculino", nascimento: "1985-09-03", trabalho: "presencial", horas: 40, dias: TER_SAB, historicoLocal: true },
  { id: "p-ines", nome: "Inês", apelido: "Cardoso", cargoId: "cg-gerente", localId: K.LOCAL_PORTO, filialId: K.FILIAL_PORTO, tipo: "sem_termo", inicio: -1100, fim: null, reportaA: "p-marta", conta: true, estado: "activo", genero: "feminino", nascimento: "1988-01-27", trabalho: "presencial", horas: 40, dias: TER_SAB },
  { id: "p-tiago", nome: "Tiago", apelido: "Pinheiro", cargoId: "cg-vendedor", localId: K.LOCAL_COLOMBO, filialId: K.FILIAL_LISBOA, tipo: "termo_certo", inicio: -340, fim: 21, reportaA: "p-rui", conta: true, estado: "activo", genero: "masculino", nascimento: "1996-06-18", trabalho: "presencial", horas: 40, dias: TER_SAB, renovacoes: 1 },
  { id: "p-carolina", nome: "Carolina", apelido: "Matos", cargoId: "cg-vendedor", localId: K.LOCAL_COLOMBO, filialId: K.FILIAL_LISBOA, tipo: "termo_certo", inicio: -60, fim: 58, reportaA: "p-rui", conta: true, estado: "activo", genero: "feminino", nascimento: "2000-11-02", trabalho: "presencial", horas: 40, dias: TER_SAB },
  { id: "p-hugo", nome: "Hugo", apelido: "Teixeira", cargoId: "cg-vendedor", localId: K.LOCAL_PORTO, filialId: K.FILIAL_PORTO, tipo: "sem_termo", inicio: -620, fim: null, reportaA: "p-ines", conta: true, estado: "activo", genero: "masculino", nascimento: "1993-03-30", trabalho: "presencial", horas: 40, dias: TER_SAB, historicoLocal: true },
  { id: "p-beatriz", nome: "Beatriz", apelido: "Lopes", cargoId: "cg-vendedor", localId: K.LOCAL_PORTO, filialId: K.FILIAL_PORTO, tipo: "termo_certo", inicio: -170, fim: 9, reportaA: "p-ines", conta: false, estado: "activo", genero: "feminino", nascimento: "1999-08-21", trabalho: "presencial", horas: 40, dias: TER_SAB, convite: "pendente", pendencias: ["nif", "conta_numero", "tamanho_cima"] },
  { id: "p-andre", nome: "André", apelido: "Silva", cargoId: "cg-armazem", localId: K.LOCAL_ARMAZEM, filialId: K.FILIAL_LISBOA, tipo: "sem_termo", inicio: -900, fim: null, reportaA: "p-marta", conta: true, estado: "activo", genero: "masculino", nascimento: "1990-12-09", trabalho: "presencial", horas: 40, dias: SEG_SEX },
  { id: "p-sofia", nome: "Sofia", apelido: "Rebelo", cargoId: "cg-rh", localId: K.LOCAL_SEDE, filialId: K.FILIAL_SEDE, tipo: "sem_termo", inicio: -760, fim: null, reportaA: "p-marta", conta: true, estado: "activo", genero: "feminino", nascimento: "1991-05-15", trabalho: "hibrido", horas: 40, dias: SEG_SEX },
  { id: "p-daniel", nome: "Daniel", apelido: "Ferraz", cargoId: "cg-admin", localId: K.LOCAL_SEDE, filialId: K.FILIAL_SEDE, tipo: "termo_certo", inicio: -80, fim: 140, reportaA: "p-sofia", conta: false, estado: "activo", genero: "masculino", nascimento: "1998-02-07", trabalho: "presencial", horas: 40, dias: SEG_SEX, convite: "usado", pendencias: [] },
  { id: "p-joana", nome: "Joana", apelido: "Barros", cargoId: "cg-vendedor", localId: K.LOCAL_BRAGA, filialId: K.FILIAL_BRAGA, tipo: "sem_termo", inicio: -480, fim: null, reportaA: "p-ines", conta: true, estado: "suspenso", genero: "feminino", nascimento: "1994-10-25", trabalho: "presencial", horas: 30, dias: TER_SAB, parcial: true },
  { id: "p-pedro", nome: "Pedro", apelido: "Nogueira", cargoId: "cg-vendedor", localId: K.LOCAL_FARO, filialId: K.FILIAL_FARO, tipo: "termo_certo", inicio: -400, fim: -40, reportaA: "p-ines", conta: false, estado: "terminado", genero: "masculino", nascimento: "1997-07-14", trabalho: "presencial", horas: 40, dias: TER_SAB, saida: -40 },
  { id: "p-lara", nome: "Lara", apelido: "Mendes", cargoId: "cg-vendedor", localId: K.LOCAL_FARO, filialId: K.FILIAL_FARO, tipo: "sem_termo", inicio: 20, fim: null, reportaA: "p-ines", conta: false, estado: "futuro", genero: "feminino", nascimento: "2001-01-19", trabalho: "presencial", horas: 40, dias: TER_SAB, pendencias: ["nif", "niss", "conta_numero", "tipo_documento"] },
];

/** O estado inicial: chamado no arranque e por `repor()` nos testes. */
export function criarEstadoInicial(): EstadoRh {
  const cat = catalogos();
  const fichas: Record<string, FichaRh> = {};
  for (const espec of ESPECS) {
    fichas[espec.id] = fichaDeEspec(espec, ESPECS.indexOf(espec), cat, ORG);
  }
  return {
    ordem: ESPECS.map((e) => e.id),
    fichas,
    locais: cat.locais,
    cargos: cat.cargos,
    cargosPeriodos: cat.cargosPeriodos,
    modelos: cat.modelos,
    tiposAusencia: cat.tiposAusencia,
    filiais: cat.filiais,
    papeis: cat.papeis,
    minhaPessoaId: "p-sofia",
  };
}
