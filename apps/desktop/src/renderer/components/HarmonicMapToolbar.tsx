import { Icon } from './Icons.js';
import type { MapDensity, MapView } from './HarmonicGrid.js';

/**
 * Barra do mapa harmônico: transposição (−12…+12, sustenidos ou bemóis), visão (cifra, grau,
 * híbrido), densidade (palco ou estudo) e exportação (PDF, texto, JSON).
 */
interface Props {
  keyLabel: string;
  semis: number;
  onSemis(v: number): void;
  flats: boolean;
  onFlats(v: boolean): void;
  view: MapView;
  onView(v: MapView): void;
  density: MapDensity;
  onDensity(v: MapDensity): void;
  onExport(kind: 'pdf' | 'txt' | 'json'): void;
  /** Esconde a transposição (quando ela vem do player da música). */
  hideTranspose?: boolean;
}

export function HarmonicMapToolbar({ keyLabel, semis, onSemis, flats, onFlats, view, onView, density, onDensity, onExport, hideTranspose }: Props) {
  return (
    <div className="hm-toolbar" role="toolbar" aria-label="Mapa harmônico">
      <span className="hm-key">
        Tom <b>{keyLabel}</b>
      </span>
      {!hideTranspose && (
        <span className="key-pick" role="group" aria-label="Transpor">
          <button className="ghost icon-btn" onClick={() => onSemis(Math.max(-12, semis - 1))} aria-label="Meio tom abaixo">
            <Icon name="minus" size={13} />
          </button>
          <b className="semis">{semis === 0 ? 'original' : `${semis > 0 ? '+' : ''}${semis}`}</b>
          <button className="ghost icon-btn" onClick={() => onSemis(Math.min(12, semis + 1))} aria-label="Meio tom acima">
            <Icon name="plus" size={13} />
          </button>
        </span>
      )}
      <div className="seg tiny" role="group" aria-label="Acidentes">
        <button aria-pressed={!flats} onClick={() => onFlats(false)} title="Escrever com sustenidos">
          ♯
        </button>
        <button aria-pressed={flats} onClick={() => onFlats(true)} title="Escrever com bemóis">
          ♭
        </button>
      </div>
      <div className="seg tiny" role="group" aria-label="Visão">
        <button aria-pressed={view === 'chords'} onClick={() => onView('chords')}>
          Cifras
        </button>
        <button aria-pressed={view === 'degrees'} onClick={() => onView('degrees')}>
          Graus
        </button>
        <button aria-pressed={view === 'hybrid'} onClick={() => onView('hybrid')}>
          Híbrido
        </button>
      </div>
      <div className="seg tiny" role="group" aria-label="Densidade">
        <button aria-pressed={density === 'stage'} onClick={() => onDensity('stage')} title="Só a harmonia, letra grande: para tocar">
          Palco
        </button>
        <button aria-pressed={density === 'study'} onClick={() => onDensity('study')} title="Com notas-alvo (1·3·7) e a nota de condução para o próximo acorde">
          Estudo
        </button>
      </div>
      <div className="spacer" />
      <button className="ghost small-btn" onClick={() => onExport('txt')}>
        <Icon name="export" size={13} /> Texto
      </button>
      <button className="ghost small-btn" onClick={() => onExport('json')}>
        <Icon name="export" size={13} /> JSON
      </button>
      <button className="small-btn primary" onClick={() => onExport('pdf')}>
        <Icon name="export" size={13} /> PDF
      </button>
    </div>
  );
}
