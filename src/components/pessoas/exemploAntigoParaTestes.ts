// SÓ PARA OS TESTES: os casos de exemplo que já existiam antes dos exemplos variados (as 17 pessoas, os seus negócios e pedidos). Os
// testes que fixam listas e contagens exatas desses casos (filtros, ordenação, atrasos, papel) usam estes, para continuarem a dizer
// o mesmo; os casos variados têm os seus próprios testes (`exemploVariado.test.ts` e `matrizExemploVariado.test.ts`).
import { PEDIDOS_EXEMPLO } from "./pedidosDeExemplo";
import { NEGOCIOS_PESSOAS_EXEMPLO, PESSOAS_EXEMPLO } from "./pessoasExemplo";
import { IDS_PESSOAS_VARIADO } from "./pessoasExemploVariado";

export const PESSOAS_ANTIGAS = PESSOAS_EXEMPLO.filter((p) => !IDS_PESSOAS_VARIADO.has(p.id));
export const NEGOCIOS_ANTIGOS = NEGOCIOS_PESSOAS_EXEMPLO.filter((n) => !IDS_PESSOAS_VARIADO.has(n.pessoaId));
export const PEDIDOS_ANTIGOS = PEDIDOS_EXEMPLO.filter((d) => !IDS_PESSOAS_VARIADO.has(d.pessoaId));
