import { midiHz as midiToHz } from '@baixaria/music-theory';
import { getAudioContext } from './context.js';
import { createCabinetStage, getGlobalCabinet, type CabinetId } from './cabinets.js';

/**
 * Vozes sintetizadas: "pluck" de baixo/guitarra/violão (portada do ScaleMonster, agendada no relógio
 * do motor), estágio de distorção, barramento de saída com limitador e clique do metrônomo.
 */

/** Timbres de baixo, guitarra e teclado (modelados em osciladores e filtros; sem amostras externas). */
export type BassTimbre =
  | 'jazz'
  | 'precision'
  | 'stingray'
  | 'upright'
  | 'strat'
  | 'lespaul'
  | 'steel'
  | 'nylon'
  | 'crunch'
  | 'highgain'
  | 'bassdrive'
  | 'piano'
  | 'rhodes'
  | 'organ';
/** Timbres que cada instrumento oferece. */
export const TIMBRES_OF: Record<'bass' | 'guitar' | 'keyboard', readonly BassTimbre[]> = {
  bass: ['jazz', 'precision', 'stingray', 'upright', 'bassdrive'],
  /* Primeiro o elétrico (padrão, como antes); o violão de aço e o nylon são timbres da mesma guitarra. */
  guitar: ['strat', 'lespaul', 'crunch', 'highgain', 'steel', 'nylon'],
  keyboard: ['piano', 'rhodes', 'organ'],
};
interface BassVoice {
  readonly label: string;
  readonly saw: number;
  readonly sub: number;
  readonly tri: number;
  /** Abertura do filtro no ataque e depois do decaimento (múltiplos da fundamental). */
  readonly open: number;
  readonly close: number;
  readonly decay: number;
  readonly sustain: number;
  /** Toque do dedo / palheta (ruído) e seu brilho (Hz). */
  readonly tick: number;
  readonly tickHz: number;
  /** Estalo agudo do slap. */
  readonly slap: number;
  /** Distorção (0 = limpo). */
  readonly drive?: number;
}
export const BASS_TIMBRES: Record<BassTimbre, BassVoice> = {
  jazz: { label: '60s Jazz Bass (dedos)', saw: 0.6, sub: 0.7, tri: 0.1, open: 14, close: 3, decay: 0.8, sustain: 0.2, tick: 0.3, tickHz: 2200, slap: 0 },
  precision: { label: '70s Precision (flatwound)', saw: 0.3, sub: 0.95, tri: 0.35, open: 6, close: 1.8, decay: 0.7, sustain: 0.28, tick: 0.12, tickHz: 900, slap: 0 },
  stingray: { label: 'StingRay (slap / ativo)', saw: 0.9, sub: 0.7, tri: 0, open: 26, close: 5, decay: 0.45, sustain: 0.12, tick: 0.5, tickHz: 3500, slap: 0.6 },
  strat: { label: 'Stratocaster limpa', saw: 0.5, sub: 0.15, tri: 0.1, open: 11, close: 4, decay: 0.6, sustain: 0.15, tick: 0.35, tickHz: 3000, slap: 0 },
  lespaul: { label: 'Les Paul (captador da ponte)', saw: 0.7, sub: 0.2, tri: 0.25, open: 8, close: 3, decay: 0.7, sustain: 0.3, tick: 0.2, tickHz: 2000, slap: 0 },
  crunch: { label: 'Guitarra crunch (valvulado)', saw: 0.7, sub: 0.15, tri: 0.2, open: 12, close: 5, decay: 0.9, sustain: 0.35, tick: 0.2, tickHz: 2500, slap: 0, drive: 6 },
  highgain: { label: 'Guitarra distorcida (high gain)', saw: 0.8, sub: 0.2, tri: 0.1, open: 16, close: 7, decay: 1.2, sustain: 0.5, tick: 0.15, tickHz: 2500, slap: 0, drive: 22 },
  bassdrive: { label: 'Baixo com overdrive', saw: 0.7, sub: 0.8, tri: 0.1, open: 12, close: 3.5, decay: 0.8, sustain: 0.3, tick: 0.25, tickHz: 2000, slap: 0, drive: 5 },
  steel: { label: 'Violão de aço', saw: 0.55, sub: 0.1, tri: 0.2, open: 14, close: 5, decay: 0.5, sustain: 0.1, tick: 0.4, tickHz: 3800, slap: 0 },
  nylon: { label: 'Violão de nylon', saw: 0.2, sub: 0.25, tri: 0.5, open: 6, close: 2.5, decay: 0.45, sustain: 0.08, tick: 0.25, tickHz: 1800, slap: 0 },
  upright: { label: 'Contrabaixo acústico', saw: 0.15, sub: 0.75, tri: 0.55, open: 4.5, close: 1.6, decay: 0.35, sustain: 0.06, tick: 0.18, tickHz: 1400, slap: 0 },
  piano: { label: 'Piano acústico', saw: 0.25, sub: 0.6, tri: 0.6, open: 12, close: 3, decay: 1.2, sustain: 0.25, tick: 0.3, tickHz: 2800, slap: 0 },
  rhodes: { label: 'Piano elétrico (Rhodes)', saw: 0.1, sub: 0.8, tri: 0.7, open: 8, close: 2.5, decay: 0.9, sustain: 0.35, tick: 0.15, tickHz: 1800, slap: 0 },
  organ: { label: 'Órgão de drawbars', saw: 0.5, sub: 0.6, tri: 0.4, open: 10, close: 8, decay: 2.0, sustain: 0.8, tick: 0.1, tickHz: 1200, slap: 0 },
};
let bassTimbre: BassTimbre = 'jazz';
export function setBassTimbre(t: BassTimbre): void {
  bassTimbre = t;
}


/** Curva de saturação (tanh) para distorção; guardada por intensidade. */
const shaperCurves = new Map<number, Float32Array>();
export function driveCurve(amount: number): Float32Array {
  const k = Math.round(amount);
  let c = shaperCurves.get(k);
  if (!c) {
    c = new Float32Array(2048);
    for (let i = 0; i < c.length; i++) {
      const x = (i / (c.length - 1)) * 2 - 1;
      c[i] = Math.tanh(x * k) / Math.tanh(k);
    }
    shaperCurves.set(k, c);
  }
  return c;
}

/** Saturação + caixa de alto-falante (corta o chiado acima de ~4,5 kHz e realça os médios). */
export function driveStage(ctx: BaseAudioContext, amount: number, into: AudioNode): AudioNode {
  const pre = ctx.createGain();
  pre.gain.value = 1 + amount * 0.08;
  const shaper = ctx.createWaveShaper();
  shaper.curve = driveCurve(amount) as Float32Array<ArrayBuffer>;
  shaper.oversample = '4x';
  const mid = ctx.createBiquadFilter();
  mid.type = 'peaking';
  mid.frequency.value = 900;
  mid.Q.value = 0.8;
  mid.gain.value = 4;
  const cab = ctx.createBiquadFilter();
  cab.type = 'lowpass';
  cab.frequency.value = 4500;
  cab.Q.value = 0.7;
  const post = ctx.createGain();
  post.gain.value = 0.55;
  pre.connect(shaper).connect(mid).connect(cab).connect(post).connect(into);
  return pre;
}

/** Saída geral dos exercícios: compressor suave + limitador, para nunca estourar. */
let bus: DynamicsCompressorNode | null = null;
let globalCabStage: ReturnType<typeof createCabinetStage> | null = null;

/** Retorna o estágio de gabinete conectado ao barramento principal. */
export function cabinetBus(): { input: AudioNode; setCabinet(id: CabinetId): Promise<void> } {
  const ctx = getAudioContext();
  const mb = masterBus();
  if (!globalCabStage) {
    globalCabStage = createCabinetStage(ctx, getGlobalCabinet());
    globalCabStage.output.connect(mb);
  }
  return {
    input: globalCabStage.input,
    setCabinet: (id: CabinetId) => globalCabStage!.setCabinet(id),
  };
}

export function masterBus(): AudioNode {
  const ctx = getAudioContext();
  if (!bus) {
    bus = ctx.createDynamicsCompressor();
    bus.threshold.value = -14;
    bus.knee.value = 12;
    bus.ratio.value = 6;
    bus.attack.value = 0.004;
    bus.release.value = 0.2;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -2;
    lim.knee.value = 0;
    lim.ratio.value = 20;
    lim.attack.value = 0.001;
    lim.release.value = 0.08;
    bus.connect(lim).connect(ctx.destination);
  }
  return bus;
}

/**
 * Baixo tocado: corda (dente de serra + fundamental), filtro que fecha como uma corda real, toque do
 * dedo e, no slap, um estalo. `volume` é a dinâmica (velocity); cada nota varia um pouco de afinação e
 * brilho (round-robin) para não soar como metralhadora; a nota abafa no fim da duração.
 */
export function pluckAt(at: number, midi: number, volume: number, out: AudioNode, dur = 1.4): void {
  if (volume <= 0) return;
  const ctx = getAudioContext();
  const v = BASS_TIMBRES[bassTimbre];
  const hz = midiToHz(midi);
  const end = at + Math.max(0.08, Math.min(dur, 8));
  const stopAt = end + 0.12;
  const rr = 1 + (Math.random() - 0.5) * 0.12; // brilho
  const cents = (Math.random() - 0.5) * 6;

  const osc = (type: OscillatorType, detune: number) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(hz, at);
    o.detune.value = detune;
    return o;
  };
  const saw = osc('sawtooth', cents);
  const sub = osc('sine', cents);
  const tri = osc('triangle', -cents);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 1.1;
  filter.frequency.setValueAtTime(Math.min(7000, (hz * v.open + 400) * rr), at);
  filter.frequency.exponentialRampToValueAtTime(Math.max(160, hz * v.close), at + 0.35);
  const gain = (x: number) => {
    const g = ctx.createGain();
    g.gain.value = x;
    return g;
  };
  const env = ctx.createGain();
  saw.connect(gain(v.saw)).connect(filter);
  sub.connect(gain(v.sub)).connect(filter);
  tri.connect(gain(v.tri)).connect(filter);
  if (v.drive) filter.connect(driveStage(ctx, v.drive, env));
  else filter.connect(env);

  // Roteamento: se o destino for o masterBus() ou se um gabinete estiver ativo, passa pelo estágio de gabinete
  const cab = cabinetBus();
  const dest = out === masterBus() ? cab.input : out;
  env.connect(dest);
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(volume, at + 0.004);
  env.gain.setTargetAtTime(volume * 0.45, at + 0.004, v.decay * 0.15);
  env.gain.setTargetAtTime(volume * v.sustain, at + 0.4, v.decay);
  env.gain.cancelAndHoldAtTime?.(end);
  env.gain.setTargetAtTime(0, end, 0.025); // abafa a corda no fim da nota

  // Toque do dedo (e estalo do slap): ruído curto filtrado.
  const len = Math.floor(ctx.sampleRate * (v.slap ? 0.05 : 0.03));
  const noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** (v.slap ? 2 : 1);
  const tick = ctx.createBufferSource();
  tick.buffer = noise;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = v.tickHz * rr;
  band.Q.value = 0.9;
  const tickGain = gain(volume * (v.tick + v.slap));
  tick.connect(band).connect(tickGain).connect(dest);

  saw.start(at);
  sub.start(at);
  tri.start(at);
  tick.start(at);
  saw.stop(stopAt);
  sub.stop(stopAt);
  tri.stop(stopAt);
  saw.onended = () => {
    filter.disconnect();
    env.disconnect();
    tickGain.disconnect();
  };
}

export function clickAt(at: number, accent: boolean, volume: number, out: AudioNode): void {
  if (volume <= 0) return;
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.frequency.value = accent ? 1760 : 1175;
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(accent ? 0.8 : 0.45, at + 0.002);
  env.gain.exponentialRampToValueAtTime(0.001, at + 0.06);
  osc.connect(env).connect(out);
  osc.start(at);
  osc.stop(at + 0.07);
}
