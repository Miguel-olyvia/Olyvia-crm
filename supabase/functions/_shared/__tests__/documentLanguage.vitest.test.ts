// A escolha de idioma de um documento, lida pelas Edge Functions (que nao podem importar de src/).
// O parser tem de ser SEMANTICAMENTE IGUAL a src/lib/idiomaDocumento/escolha.ts: aqui prova-se por paridade.
import { describe, expect, it } from 'vitest';
import { IDIOMAS } from '../../../../src/lib/idiomaDocumento/registo';
import { idiomasDoDocumento, parseEscolha } from '../../../../src/lib/idiomaDocumento/escolha';
import {
  DOCUMENT_LANGUAGE_CODES,
  contractLanguages,
  fetchDocumentLanguages,
  firstMailLang,
  mailLangsOf,
  parseDocumentLanguages,
  proposalLanguages,
} from '../documentLanguage';

const VALORES: unknown[] = [
  undefined, null, '', ' ', 'pt', 'en', 'PT', ' En ', 'pt+en', 'en+pt', 'pt+en+fr', 'pt, en', 'pt,en', 'pt+pt', 'pt+xx',
  'xx', 'fr', 'es', 'es+fr', 'pt-BR', 'en-GB', 'pt+en-GB', '+', '++pt++', ['pt', 'en'], ['en', 'pt'], ['EN'], [], ['xx'],
  ['pt', 'pt', 'en'], [null, 'en'], [1, 'en'], 7, {}, true,
];

describe('parseDocumentLanguages: paridade com parseEscolha (src/lib/idiomaDocumento/escolha.ts)', () => {
  it('os codigos conhecidos sao exatamente os do registo', () => {
    expect([...DOCUMENT_LANGUAGE_CODES]).toEqual(IDIOMAS.map((i) => i.codigo));
  });

  it.each(VALORES.map((v, i) => [i, v] as const))('mesmo resultado para o valor #%i', (_i, v) => {
    expect(parseDocumentLanguages(v)).toEqual(parseEscolha(v));
  });

  it('a omissao tambem coincide', () => {
    for (const v of VALORES) expect(parseDocumentLanguages(v, 'en')).toEqual(parseEscolha(v, 'en'));
  });

  it('proposta: language; contrato: prompt_values.__idiomas; ambos iguais a idiomasDoDocumento', () => {
    for (const v of VALORES) {
      expect(proposalLanguages({ language: v })).toEqual(idiomasDoDocumento({ language: v as never }));
      expect(contractLanguages({ prompt_values: { __idiomas: v } })).toEqual(
        idiomasDoDocumento({ prompt_values: { __idiomas: v } }),
      );
    }
  });

  it('sem linha, sem campo ou sem prompt_values = portugues', () => {
    expect(proposalLanguages(null)).toEqual(['pt']);
    expect(proposalLanguages(undefined)).toEqual(['pt']);
    expect(proposalLanguages({})).toEqual(['pt']);
    expect(contractLanguages(null)).toEqual(['pt']);
    expect(contractLanguages({ prompt_values: null })).toEqual(['pt']);
    expect(contractLanguages({ prompt_values: { outra: 'en' } })).toEqual(['pt']);
  });

  it('a proposta le so language e o contrato so __idiomas (decisao do utilizador)', () => {
    expect(proposalLanguages({ language: 'en', prompt_values: { __idiomas: 'pt' } } as never)).toEqual(['en']);
    expect(contractLanguages({ language: 'en', prompt_values: { __idiomas: 'pt+en' } } as never)).toEqual(['pt', 'en']);
  });
});

describe('mailLangsOf: do idioma do documento ao idioma dos textos', () => {
  it('um idioma: so en tem versao inglesa; outro codigo cai em portugues', () => {
    expect(mailLangsOf(['pt'])).toEqual(['pt']);
    expect(mailLangsOf(['en'])).toEqual(['en']);
    expect(mailLangsOf(['fr'])).toEqual(['pt']);
    expect(mailLangsOf(['es'])).toEqual(['pt']);
  });

  it('dois idiomas: pt e en, pela ordem da escolha, sem repetidos', () => {
    expect(mailLangsOf(['pt', 'en'])).toEqual(['pt', 'en']);
    expect(mailLangsOf(['en', 'pt'])).toEqual(['en', 'pt']);
    expect(mailLangsOf(['es', 'en'])).toEqual(['pt', 'en']);
    expect(mailLangsOf(['fr', 'es'])).toEqual(['pt']);
    expect(mailLangsOf(['pt', 'fr'])).toEqual(['pt']);
  });

  it('aceita a escolha em texto e valores sem sentido (= portugues)', () => {
    expect(mailLangsOf('pt+en')).toEqual(['pt', 'en']);
    expect(mailLangsOf(undefined)).toEqual(['pt']);
    expect(mailLangsOf(null)).toEqual(['pt']);
    expect(mailLangsOf([])).toEqual(['pt']);
    expect(mailLangsOf('zz')).toEqual(['pt']);
  });

  it('firstMailLang: o primeiro idioma da escolha (o do SMS)', () => {
    expect(firstMailLang(['pt', 'en'])).toBe('pt');
    expect(firstMailLang(['en', 'pt'])).toBe('en');
    expect(firstMailLang(['en'])).toBe('en');
    expect(firstMailLang(['fr'])).toBe('pt');
    expect(firstMailLang(undefined)).toBe('pt');
  });
});

interface Chamada { table: string; cols: string; filters: Array<[string, unknown]> }

function fakeSupabase(result: { data?: unknown; error?: unknown } | Error, chamadas: Chamada[]) {
  return {
    from(table: string) {
      const q: Chamada = { table, cols: '', filters: [] };
      chamadas.push(q);
      const b: Record<string, unknown> = {
        select(c: string) { q.cols = c; return b; },
        eq(k: string, v: unknown) { q.filters.push([k, v]); return b; },
        maybeSingle: async () => {
          if (result instanceof Error) throw result;
          return { data: result.data ?? null, error: result.error ?? null };
        },
      };
      return b;
    },
  };
}

describe('fetchDocumentLanguages: leitura com organization_id, sem partir nada se falhar', () => {
  it('proposta: le language da proposta na organizacao pedida', async () => {
    const chamadas: Chamada[] = [];
    const sb = fakeSupabase({ data: { language: 'pt+en' } }, chamadas);
    expect(await fetchDocumentLanguages(sb, 'proposal', 'p1', 'org-1')).toEqual(['pt', 'en']);
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].table).toBe('proposals');
    expect(chamadas[0].cols).toBe('language');
    expect(chamadas[0].filters).toEqual([['id', 'p1'], ['organization_id', 'org-1']]);
  });

  it('contrato: le prompt_values da minuta na organizacao pedida', async () => {
    const chamadas: Chamada[] = [];
    const sb = fakeSupabase({ data: { prompt_values: { __idiomas: 'en', nome: 'x' } } }, chamadas);
    expect(await fetchDocumentLanguages(sb, 'contract', 'c1', 'org-9')).toEqual(['en']);
    expect(chamadas[0].table).toBe('client_contracts');
    expect(chamadas[0].cols).toBe('prompt_values');
    expect(chamadas[0].filters).toEqual([['id', 'c1'], ['organization_id', 'org-9']]);
  });

  it('sem organizacao ou sem id nao consulta nada: portugues', async () => {
    const chamadas: Chamada[] = [];
    const sb = fakeSupabase({ data: { language: 'en' } }, chamadas);
    expect(await fetchDocumentLanguages(sb, 'proposal', 'p1', null)).toEqual(['pt']);
    expect(await fetchDocumentLanguages(sb, 'proposal', 'p1', '')).toEqual(['pt']);
    expect(await fetchDocumentLanguages(sb, 'proposal', '', 'org-1')).toEqual(['pt']);
    expect(chamadas).toHaveLength(0);
  });

  it('orcamento e outros tipos de documento: portugues, sem consulta', async () => {
    const chamadas: Chamada[] = [];
    const sb = fakeSupabase({ data: { language: 'en' } }, chamadas);
    expect(await fetchDocumentLanguages(sb, 'quote', 'q1', 'org-1')).toEqual(['pt']);
    expect(await fetchDocumentLanguages(sb, 'direct_sale', 'd1', 'org-1')).toEqual(['pt']);
    expect(await fetchDocumentLanguages(sb, undefined, 'd1', 'org-1')).toEqual(['pt']);
    expect(chamadas).toHaveLength(0);
  });

  it('linha inexistente, erro da base (ex.: coluna ainda nao aplicada) ou excecao: portugues', async () => {
    const c1: Chamada[] = [];
    expect(await fetchDocumentLanguages(fakeSupabase({ data: null }, c1), 'proposal', 'p1', 'o')).toEqual(['pt']);
    const c2: Chamada[] = [];
    expect(
      await fetchDocumentLanguages(fakeSupabase({ error: { message: 'column proposals.language does not exist' } }, c2), 'proposal', 'p1', 'o'),
    ).toEqual(['pt']);
    const c3: Chamada[] = [];
    expect(await fetchDocumentLanguages(fakeSupabase(new Error('rede'), c3), 'contract', 'c1', 'o')).toEqual(['pt']);
  });
});
