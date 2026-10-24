// SÓ PARA OS TESTES: os casos de exemplo que já existiam antes dos exemplos variados (as 17 pessoas, os seus negócios e registos). Os
// testes que fixam listas e contagens exatas desses casos (filtros, ordenação, atrasos, papel) usam estes, para continuarem a dizer
// o mesmo; os casos variados têm os seus próprios testes (`exemploVariado.test.ts` e `matrizExemploVariado.test.ts`).
import type { EstadoRegistos } from "@/components/negocio-metas/registosTipos";
import { NEGOCIOS_PESSOAS_EXEMPLO, PESSOAS_EXEMPLO } from "./pessoasExemplo";
import { IDS_PESSOAS_VARIADO } from "./pessoasExemploVariado";
import { REGISTOS_EXEMPLO } from "./registosExemplo";

export const PESSOAS_ANTIGAS = PESSOAS_EXEMPLO.filter((p) => !IDS_PESSOAS_VARIADO.has(p.id));
export const NEGOCIOS_ANTIGOS = NEGOCIOS_PESSOAS_EXEMPLO.filter((n) => !IDS_PESSOAS_VARIADO.has(n.pessoaId));
const deAntes = (r: { pessoaId: string }): boolean => !IDS_PESSOAS_VARIADO.has(r.pessoaId);
export const REGISTOS_ANTIGOS: EstadoRegistos = {
  contactos: REGISTOS_EXEMPLO.contactos.filter(deAntes),
  visitas: REGISTOS_EXEMPLO.visitas.filter(deAntes),
  levantamentos: REGISTOS_EXEMPLO.levantamentos.filter(deAntes),
};
