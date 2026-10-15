import { describe, expect, it } from 'vitest';
import { pickExistingAddress } from '../addressLookup';

describe('pickExistingAddress', () => {
  it('devolve null quando nao ha linhas', () => {
    expect(pickExistingAddress([])).toBeNull();
  });

  it('devolve null para null, undefined e valores que nao sao lista', () => {
    expect(pickExistingAddress(null)).toBeNull();
    expect(pickExistingAddress(undefined)).toBeNull();
    expect(pickExistingAddress({ id: 'x' })).toBeNull();
  });

  it('devolve a unica linha', () => {
    expect(pickExistingAddress([{ id: 'a1' }])).toEqual({ id: 'a1' });
  });

  it('com duas linhas da mesma chave devolve a primeira (a mais antiga, ja ordenada pela consulta)', () => {
    const rows = [{ id: 'antiga' }, { id: 'duplicada-so-maiusculas' }];
    expect(pickExistingAddress(rows)).toEqual({ id: 'antiga' });
  });

  it('ignora uma primeira linha sem id e usa a seguinte com id', () => {
    expect(pickExistingAddress([{ id: null }, { id: 'a2' }])).toEqual({ id: 'a2' });
    expect(pickExistingAddress([{ id: '' }])).toBeNull();
  });
});
