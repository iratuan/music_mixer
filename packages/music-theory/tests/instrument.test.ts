import { describe, expect, it } from 'vitest';
import { INSTRUMENT_INFO, practiceInstrumentOf, tuningsFor } from '@baixaria/music-theory';

describe('guitarra e violão são um instrumento só', () => {
  it('ids antigos do violão viram guitarra; desconhecidos viram null', () => {
    expect(practiceInstrumentOf('acoustic')).toBe('guitar');
    expect(practiceInstrumentOf('guitar')).toBe('guitar');
    expect(practiceInstrumentOf('bass')).toBe('bass');
    expect(practiceInstrumentOf('keyboard')).toBeNull();
  });

  it('usa a afinação da guitarra (E A D G B E) e o nome unificado', () => {
    expect(tuningsFor('guitar')[0]!.strings).toEqual([40, 45, 50, 55, 59, 64]);
    expect(INSTRUMENT_INFO.guitar.label).toBe('Guitarra e violão');
  });
});
