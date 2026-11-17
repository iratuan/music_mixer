/**
 * Pauta musical em SVG: clave de Sol ou de Fá, armadura, notas com acidentes, linhas suplementares,
 * hastes, bandeirolas e ponto. Notas "juntas" formam um acorde na mesma coluna.
 */
export interface StaffNote {
  readonly midi: number;
  /** Duração em tempos (4, 2, 1, 0,5, 0,25 ou pontuada: 3, 1,5, 0,75). */
  readonly beats: number;
}
interface Props {
  clef: 'treble' | 'bass';
  /** Colunas: cada uma com uma ou mais notas tocadas juntas. */
  columns: ReadonlyArray<readonly StaffNote[]>;
  flats?: boolean;
  /** Sustenidos na armadura (1 = Fá#). */
  keySharps?: number;
  /** Destaque (tônica). */
  tonicPc?: number;
}

const SHARP_SPELL: ReadonlyArray<readonly [number, boolean]> = [[0, false], [0, true], [1, false], [1, true], [2, false], [3, false], [3, true], [4, false], [4, true], [5, false], [5, true], [6, false]];
const FLAT_SPELL: ReadonlyArray<readonly [number, boolean]> = [[0, false], [1, true], [1, false], [2, true], [2, false], [3, false], [4, true], [4, false], [5, true], [5, false], [6, true], [6, false]];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];

function spell(midi: number, flats: boolean) {
  const pc = ((midi % 12) + 12) % 12;
  const [letter, acc] = (flats ? FLAT_SPELL : SHARP_SPELL)[pc]!;
  // Número diatônico (C0 = 0): oitava * 7 + letra.
  const octave = Math.floor(midi / 12) - 1;
  return { diatonic: octave * 7 + letter, accidental: acc ? (flats ? '♭' : '♯') : '', pc };
}

const GAP = 6;
/** Classes de altura alteradas pela armadura de sustenidos (Fá, Dó, Sol, Ré, Lá, Mi, Si). */
const SHARP_PCS = [6, 1, 8, 3, 10, 5, 0];
/** Sustenidos da armadura: posição (em graus acima da linha de base) do Fá#, Dó#, Sol#... na clave. */
const SHARP_POS = { treble: [8, 5, 9, 6, 3, 7, 4], bass: [6, 3, 7, 4, 1, 5, 2] } as const;

export function Staff({ clef, columns, flats = false, keySharps = 0, tonicPc = 0 }: Props) {
  const base = clef === 'treble' ? 4 * 7 + 2 : 2 * 7 + 4; // Mi4 / Sol2 na linha inferior
  const all = columns.flat().map((n) => spell(n.midi, flats).diatonic - base);
  const topPad = 22 + Math.max(0, Math.max(...all) - 9) * GAP + 28;
  const top = topPad;
  const yOf = (d: number) => top + 4 * GAP * 2 - (d - base) * GAP; // linha inferior em top + 8 GAP
  const left = 62 + keySharps * 9;
  const colW = 38;
  const width = Math.max(230, left + columns.length * colW + 20);
  const height = top + 8 * GAP + 24 + Math.max(0, -Math.min(...all) + 1) * GAP;
  const lines = [0, 2, 4, 6, 8];

  return (
    <svg className="th-staff" style={{ width: width * 1.7 }} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Trecho escrito em pauta, clave de ${clef === 'treble' ? 'Sol' : 'Fá'}`}>
      {lines.map((l) => (
        <line key={l} x1={8} x2={width - 6} y1={yOf(base + l)} y2={yOf(base + l)} stroke="#2a2d3a" strokeWidth={1.2} />
      ))}
      <line x1={8} x2={8} y1={yOf(base + 8)} y2={yOf(base)} stroke="#2a2d3a" strokeWidth={1.6} />
      {clef === 'treble' ? (
        <text x={14} y={yOf(base + 1) + 4} fontSize={70} fontFamily="'Segoe UI Symbol','Noto Music','Bravura Text',serif" fill="#15161b">
          {'\u{1D11E}'}
        </text>
      ) : (
        <text x={14} y={yOf(base + 7) + 8} fontSize={52} fontFamily="'Segoe UI Symbol','Noto Music','Bravura Text',serif" fill="#15161b">
          {'\u{1D122}'}
        </text>
      )}
      {Array.from({ length: keySharps }, (_, i) => (
        <text key={i} x={50 + i * 9} y={yOf(base + SHARP_POS[clef][i]!) + 5} fontSize={17} fill="#15161b">
          ♯
        </text>
      ))}
      {columns.map((col, ci) => {
        const x = left + ci * colW + colW / 2;
        const notes = col.map((n) => ({ ...n, ...spell(n.midi, flats) }));
        const ds = notes.map((n) => n.diatonic - base);
        const lo = Math.min(...ds);
        const hi = Math.max(...ds);
        const beats = notes[0]!.beats;
        const open = beats >= 2;
        const whole = beats >= 3.5;
        const flagsN = beats <= 0.25 ? 2 : beats <= 0.75 ? 1 : 0;
        const dotted = beats === 3 || beats === 1.5 || beats === 0.75;
        const stemUp = (lo + hi) / 2 < 4;
        const stemX = stemUp ? x + 5.5 : x - 5.5;
        const yTop = yOf(base + hi);
        const yBot = yOf(base + lo);
        const stemEnd = stemUp ? yTop - 26 : yBot + 26;
        const ledger: number[] = [];
        for (let d = -2; d >= lo; d -= 2) ledger.push(d);
        for (let d = 10; d <= hi; d += 2) ledger.push(d);
        return (
          <g key={ci}>
            {ledger.map((d) => (
              <line key={d} x1={x - 10} x2={x + 10} y1={yOf(base + d)} y2={yOf(base + d)} stroke="#2a2d3a" strokeWidth={1.2} />
            ))}
            {!whole && <line x1={stemX} x2={stemX} y1={stemUp ? yBot : yTop} y2={stemEnd} stroke="#15161b" strokeWidth={1.4} />}
            {!whole &&
              Array.from({ length: flagsN }, (_, f) => (
                <path
                  key={f}
                  d={stemUp ? `M ${stemX} ${stemEnd + f * 6} q 9 5 6 15` : `M ${stemX} ${stemEnd - f * 6} q 9 -5 6 -15`}
                  fill="none"
                  stroke="#15161b"
                  strokeWidth={2}
                />
              ))}
            {notes.map((n) => {
              const y = yOf(n.diatonic);
              const tonic = n.pc === tonicPc;
              return (
                <g key={n.midi}>
                  {n.accidental && !(!flats && SHARP_PCS.slice(0, keySharps).includes(n.pc)) && (
                    <text x={x - 20} y={y + 5} fontSize={15} fill="#15161b">
                      {n.accidental}
                    </text>
                  )}
                  <ellipse cx={x} cy={y} rx={whole ? 7.5 : 6.2} ry={4.6} transform={whole ? undefined : `rotate(-20 ${x} ${y})`} fill={open ? '#fff' : tonic ? '#d9490f' : '#15161b'} stroke={tonic ? '#d9490f' : '#15161b'} strokeWidth={1.6} />
                  {dotted && <circle cx={x + 12} cy={y - ((((n.diatonic - base) % 2) + 2) % 2 === 0 ? 3 : 0)} r={1.8} fill="#15161b" />}
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
