import { describe, expect, it } from 'vitest';
import { restrictCandidatesToOwner } from '../knownOwner';

const cands = [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }];

describe('restrictCandidatesToOwner (marcacao publica)', () => {
  it('sem dono conhecido: todos os candidatos, como sempre', () => {
    expect(restrictCandidatesToOwner(cands, false, [])).toEqual(cands);
  });

  it('com dono: so os recursos dele, pela ordem de proximidade', () => {
    expect(restrictCandidatesToOwner(cands, true, ['r3', 'r1'])).toEqual([{ id: 'r1' }, { id: 'r3' }]);
  });

  it('dono sem nenhum recurso activo: lista vazia (vai para a fila), nunca outro tecnico', () => {
    expect(restrictCandidatesToOwner(cands, true, [])).toEqual([]);
  });

  it('dono com recurso que nao tem a hora livre: lista vazia', () => {
    expect(restrictCandidatesToOwner(cands, true, ['r9'])).toEqual([]);
  });
});
