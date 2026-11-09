import { useEffect, useState, type ReactNode } from 'react';
import type { SeparateOptions } from '../../preload/preload.js';
import { Icon } from './Icons.js';
import { stemInfo } from '../lib/stems.js';
import { Progress } from './Progress.js';

/**
 * Escolha das faixas a separar. Instrumentos marcados viram faixas próprias; os desmarcados
 * se juntam numa faixa "Restante" (nada se perde). A voz pode vir inteira ou dividida em
 * voz principal e backing vocals (modelo de karaokê, mais lento).
 */
interface Props {
  busy: boolean;
  /** Runtime de CPU (instalador): dividir a voz fica bem mais lento. */
  cpu: boolean;
  /** O modelo de voz principal/backing está instalado. */
  voiceSplit: boolean;
  submitLabel: string;
  onSubmit(options: SeparateOptions): void;
  onCancel?(): void;
  /** Avisado a cada mudança: faixas escolhidas e se haverá a faixa "Restante". */
  onChange?(choice: { stems: string[]; rest: boolean }): void;
  /** Conteúdo extra antes dos botões (ex.: estado inicial das faixas). */
  children?: ReactNode;
}

const INSTRUMENTS = ['bass', 'drums', 'guitar', 'piano', 'other'] as const;
type VoiceMode = 'none' | 'whole' | 'split';
const KEY = 'bf-stem-choice';

interface Choice {
  instruments: string[];
  voice: VoiceMode;
  lead: boolean;
  backing: boolean;
  quality: 'fast' | 'best';
}

/** "a", "a e b", "a, b e c", com a primeira letra maiúscula. */
function joinPt(items: string[]): string {
  const low = items.map((x, i) => (i === 0 ? x : x.toLowerCase()));
  const text = low.length <= 1 ? (low[0] ?? '') : `${low.slice(0, -1).join(', ')} e ${low[low.length - 1]}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const DEFAULT: Choice = { instruments: [...INSTRUMENTS], voice: 'whole', lead: true, backing: true, quality: 'best' };

function load(): Choice {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT, ...(JSON.parse(raw) as Partial<Choice>) };
  } catch {
    /* sem preferência salva */
  }
  return DEFAULT;
}

export function StemPicker({ busy, cpu, voiceSplit, submitLabel, onSubmit, onCancel, onChange, children }: Props) {
  const [c, setC] = useState<Choice>(load);
  // Modelo de karaokê: pode ser baixado aqui mesmo, quando a pessoa escolhe dividir a voz.
  const [ready, setReady] = useState(voiceSplit);
  useEffect(() => {
    if (voiceSplit) setReady(true);
  }, [voiceSplit]);
  const needModel = c.voice === 'split' && !ready;
  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(c));
    } catch {
      /* preferência só nesta sessão */
    }
  }, [c]);

  const stems = [
    ...c.instruments,
    ...(c.voice === 'whole' ? ['vocals'] : []),
    ...(c.voice === 'split' ? [...(c.lead ? ['lead'] : []), ...(c.backing ? ['backing'] : [])] : []),
  ];
  const leftovers = INSTRUMENTS.filter((i) => !c.instruments.includes(i)).map((i) => stemInfo(i).label);
  if (c.voice === 'none') leftovers.push('voz');
  if (c.voice === 'split' && !c.lead) leftovers.push('voz principal');
  if (c.voice === 'split' && !c.backing) leftovers.push('backing vocals');

  const stemsKey = stems.join(',');
  const hasRest = leftovers.length > 0;
  useEffect(() => {
    onChange?.({ stems: stemsKey ? stemsKey.split(',') : [], rest: hasRest });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stemsKey, hasRest]);

  const toggle = (k: string) =>
    setC((x) => ({ ...x, instruments: x.instruments.includes(k) ? x.instruments.filter((i) => i !== k) : [...x.instruments, k] }));

  return (
    <div className="stem-picker" role="group" aria-label="Faixas a separar">
      <div className="sp-section">
        <span className="sp-title">Instrumentos</span>
        <div className="sp-chips">
          {INSTRUMENTS.map((k) => {
            const info = stemInfo(k);
            const on = c.instruments.includes(k);
            return (
              <label key={k} className={`sp-chip stem-${k} ${on ? 'on' : ''}`}>
                <input type="checkbox" checked={on} onChange={() => toggle(k)} disabled={busy} />
                <Icon name={info.icon} size={16} /> {info.label}
              </label>
            );
          })}
        </div>
      </div>
      <div className="sp-section">
        <span className="sp-title">Voz</span>
        <div className="seg small" role="radiogroup" aria-label="Voz">
          {(
            [
              ['none', 'Não separar'],
              ['whole', 'Voz inteira'],
              ['split', 'Principal e backing'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={c.voice === v}
              aria-pressed={c.voice === v}
              disabled={busy}
              title={v === 'split' && !ready ? 'Precisa de um modelo extra (913 MB), baixado uma vez.' : undefined}
              onClick={() => setC((x) => ({ ...x, voice: v }))}
            >
              {label}
            </button>
          ))}
        </div>
        {c.voice === 'split' && (
          <div className="sp-chips">
            <label className={`sp-chip stem-lead ${c.lead ? 'on' : ''}`}>
              <input type="checkbox" checked={c.lead} onChange={() => setC((x) => ({ ...x, lead: !x.lead }))} disabled={busy} />
              <Icon name="vocals" size={16} /> Voz principal
            </label>
            <label className={`sp-chip stem-backing ${c.backing ? 'on' : ''}`}>
              <input type="checkbox" checked={c.backing} onChange={() => setC((x) => ({ ...x, backing: !x.backing }))} disabled={busy} />
              <Icon name="backing" size={16} /> Backing vocals
            </label>
          </div>
        )}
        {needModel && <VoiceModelCard onReady={() => setReady(true)} />}
        {c.voice === 'split' && ready && (
          <p className="muted small">
            Usa um segundo modelo (karaokê) sobre a voz separada: cerca de {cpu ? '3×' : '0,8×'} a duração da música a mais{cpu ? ', pelo processador' : ''}.
          </p>
        )}
      </div>
      <div className="sp-section">
        <span className="sp-title">Qualidade</span>
        <div className="seg small" role="radiogroup" aria-label="Qualidade da separação">
          <button type="button" aria-pressed={c.quality === 'fast'} disabled={busy} onClick={() => setC((x) => ({ ...x, quality: 'fast' }))} title="Uma passada do modelo">
            Rápida
          </button>
          <button type="button" aria-pressed={c.quality === 'best'} disabled={busy} onClick={() => setC((x) => ({ ...x, quality: 'best' }))} title="Duas passadas deslocadas: menos vazamento entre faixas, cerca de 2× mais lenta">
            Precisa
          </button>
        </div>
      </div>
      {children}
      <div className="sp-foot">
        <span className="muted small">
          {stems.length === 0
            ? 'Escolha ao menos uma faixa.'
            : leftovers.length > 0
              ? `${joinPt(leftovers)} ${leftovers.length > 1 ? 'ficam juntos' : 'fica'} na faixa "Restante".`
              : 'Todas as faixas separadas.'}
        </span>
        <div className="spacer" />
        {onCancel && (
          <button className="ghost" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
        )}
        <button
          className="primary"
          disabled={busy || stems.length === 0 || needModel}
          title={needModel ? 'Baixe o modelo de voz ou escolha "Voz inteira"' : undefined}
          onClick={() => onSubmit({ quality: c.quality, stems })}
        >
          <Icon name="scissors" size={16} /> {submitLabel}
        </button>
      </div>
    </div>
  );
}

function mb(n: number): string {
  return `${Math.round(n / 1e6)} MB`; // decimal, como o tamanho anunciado (913 MB)
}

/** Download do modelo de voz principal/backing (913 MB, uma vez), com progresso, cancelar e retomar. */
function VoiceModelCard({ onReady }: { onReady(): void }) {
  const [state, setState] = useState<'idle' | 'down' | 'error'>('idle');
  const [prog, setProg] = useState<{ received: number; total: number; speed: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => window.baixaria.onVoiceModelProgress((p) => setProg(p)), []);
  useEffect(() => {
    // Download já em andamento (outra tela abriu): acompanha.
    void window.baixaria
      .voiceModelStatus()
      .then((st) => {
        if (st.installed) onReady();
        else if (st.downloading) setState('down');
      })
      .catch(() => undefined);
  }, [onReady]);
  async function start() {
    setErr(null);
    setState('down');
    try {
      const r = await window.baixaria.voiceModelDownload();
      if (r.installed) onReady();
      else setState('idle');
    } catch (e) {
      const m = e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'falha no download';
      setErr(/cancelado/.test(m) ? null : m);
      setState(/cancelado/.test(m) ? 'idle' : 'error');
    }
  }
  const eta = prog && prog.speed > 0 ? Math.max(1, Math.round((prog.total - prog.received) / prog.speed / 60)) : null;
  return (
    <div className="voice-dl" role="group" aria-label="Modelo de voz">
      {state === 'down' ? (
        <>
          <Progress
            value={prog ? prog.received / prog.total : null}
            label={prog ? `Baixando o modelo de voz · ${mb(prog.received)} de ${mb(prog.total)}${eta ? ` · ~${eta} min` : ''}` : 'Conectando…'}
          />
          <button type="button" className="ghost small-btn" onClick={() => void window.baixaria.voiceModelCancel()} title="Para o download; dá para continuar depois de onde parou">
            Cancelar
          </button>
        </>
      ) : (
        <>
          <p className="small">
            Dividir a voz usa um modelo extra de <b>913 MB</b>, baixado uma vez só (fica guardado para as próximas músicas).
            {err && <span className="alert-inline"> {err}</span>}
          </p>
          <button type="button" className="primary small-btn" onClick={() => void start()}>
            <Icon name="import" size={14} /> {state === 'error' ? 'Tentar de novo' : 'Baixar modelo'}
          </button>
        </>
      )}
    </div>
  );
}
