import { useEffect, useRef } from 'react';
import type { FofHighwayEngine, HighwayNote } from '@domain';
import stageBgUrl from '../../../assets/stage-bg.jpg';

/**
 * Palco do desafio: esteira em perspectiva cônica indo até o horizonte de um palco de show (amplificadores,
 * caixas, bateria e treliça, sem personagens), com canhões de luz que se mexem no ritmo, fumaça, poeira
 * e estrobo. As gemas são de vidro com brilho próprio, a linha de acerto solta faíscas e chamas, e o
 * HUD mostra pontos, combo, o medidor de performance e os resultados da sessão.
 * Desenhado em Canvas 2D (60 fps) a cada quadro; os dados vêm por referência (`feed`).
 * O cenário fica numa camada guardada e levemente desfocada (profundidade de campo).
 */
export interface StageFeed {
  engine: FofHighwayEngine | null;
  /** Instantes das batidas (relógio do motor), para as linhas da pista e as luzes do palco. */
  beats: number[];
  /** Trilhas (cordas) apertadas no teclado. */
  pressed: Set<number>;
  /** Relógio do motor (AudioContext.currentTime). */
  now(): number;
  playing: boolean;
  /** Batidas da contagem antes de começar (relógio do motor): o palco mostra 4, 3, 2, 1, JÁ!. */
  countIn?: number[];
}

/** Cores das trilhas, da corda mais grave para a mais aguda. */
export const LANE_COLORS = ['#3ddc6a', '#ff4d4d', '#ffd23f', '#3d8bff', '#ff8a2a', '#b46bff', '#ff5fc1'];
/** Teclas de cada trilha. */
export const LANE_KEYS = ['1', '2', '3', '4', '5', '6', '7'];

interface Props {
  feed: React.MutableRefObject<StageFeed>;
  lanes: number;
  /** Nomes das cordas (da mais grave), escritos abaixo dos receptáculos. */
  stringNames: readonly string[];
  /** Linha de corte de precisão (%). */
  goal?: number;
  /** Abertura da câmera (maior = perspectiva mais dramática). */
  fov?: number;
  /** Há um vídeo atrás do canvas: não pinta o cenário, só escurece para a esteira ficar legível. */
  videoBg?: boolean;
}

/** Segundos de pista visíveis à frente. */
const AHEAD = 2.4;

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}
interface Pop {
  text: string;
  color: string;
  life: number;
}

const hexA = (hex: string, a: number): string => {
  const h = hex.replace('#', '');
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a)).toFixed(3)})`;
};

/** Foto do palco (fundo da esteira): carregada uma vez; até chegar, vale o cenário desenhado. */
let stageBg: HTMLImageElement | null = null;
let stageBgReady = false;
function loadStageBg(onReady: () => void): void {
  if (stageBgReady) return;
  if (!stageBg) {
    stageBg = new Image();
    stageBg.src = stageBgUrl;
  }
  if (stageBg.complete && stageBg.naturalWidth > 0) {
    stageBgReady = true;
    return;
  }
  stageBg.addEventListener(
    'load',
    () => {
      stageBgReady = true;
      onReady();
    },
    { once: true },
  );
}

/** Foto de fundo cobrindo o painel (centrada), escurecida embaixo para a esteira ficar legível. */
function paintPhoto(W: number, H: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(W));
  c.height = Math.max(1, Math.round(H));
  const g = c.getContext('2d')!;
  const img = stageBg!;
  const scale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
  const sw = W / scale;
  const sh = H / scale;
  g.drawImage(img, (img.naturalWidth - sw) / 2, img.naturalHeight - sh - (img.naturalHeight - sh) * 0.25, sw, sh, 0, 0, W, H);
  const shade = g.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, 'rgba(5,3,12,0.25)');
  shade.addColorStop(0.5, 'rgba(5,3,12,0.35)');
  shade.addColorStop(1, 'rgba(5,3,12,0.8)');
  g.fillStyle = shade;
  g.fillRect(0, 0, W, H);
  return c;
}

/** Cenário fixo (fundo do palco) desenhado uma vez por tamanho. */
function paintSet(W: number, H: number, horizon: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(W));
  c.height = Math.max(1, Math.round(H));
  const g = c.getContext('2d')!;
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#08060f');
  bg.addColorStop(0.5, '#150b22');
  bg.addColorStop(1, '#06050a');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // Brilho do fundo do palco.
  const glow = g.createRadialGradient(W / 2, horizon, 10, W / 2, horizon, W * 0.6);
  glow.addColorStop(0, 'rgba(120,60,200,0.35)');
  glow.addColorStop(1, 'rgba(120,60,200,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, W, H);

  // Treliça de metal no teto.
  g.strokeStyle = 'rgba(150,160,190,0.35)';
  g.lineWidth = 2;
  for (const y of [H * 0.035, H * 0.085]) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(W, y);
    g.stroke();
  }
  g.lineWidth = 1;
  g.beginPath();
  for (let x = -20; x < W + 20; x += 26) {
    g.moveTo(x, H * 0.035);
    g.lineTo(x + 13, H * 0.085);
    g.lineTo(x + 26, H * 0.035);
  }
  g.stroke();
  // Refletores presos na treliça.
  for (let k = 0; k < 6; k++) {
    const x = W * (0.1 + k * 0.16);
    g.fillStyle = '#1c1c26';
    g.fillRect(x - 9, H * 0.085, 18, 12);
    g.fillStyle = '#9aa3c0';
    g.fillRect(x - 6, H * 0.085 + 10, 12, 3);
  }

  const floorY = horizon + (H - horizon) * 0.02;
  // Piso do palco com reflexo.
  const fl = g.createLinearGradient(0, floorY, 0, H);
  fl.addColorStop(0, '#1a1224');
  fl.addColorStop(1, '#09070d');
  g.fillStyle = fl;
  g.fillRect(0, floorY, W, H - floorY);

  const u = Math.min(W, H) / 100;
  // Bateria ao fundo (centro-direita).
  const dx = W * 0.62;
  const dy = horizon - u * 2;
  const metal = (x: number, y: number, rx: number, ry: number) => {
    const m = g.createRadialGradient(x - rx * 0.3, y - ry * 0.3, 1, x, y, rx);
    m.addColorStop(0, '#f2d27a');
    m.addColorStop(1, '#8a6a22');
    g.fillStyle = m;
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
  };
  g.strokeStyle = '#4a4f60';
  g.lineWidth = Math.max(1, u * 0.25);
  for (const [x, y] of [[dx - u * 13, dy - u * 12], [dx + u * 14, dy - u * 13], [dx + u * 24, dy - u * 6]] as const) {
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x, dy + u * 4);
    g.stroke();
  }
  metal(dx - u * 13, dy - u * 12, u * 6.5, u * 1.2);
  metal(dx + u * 14, dy - u * 13, u * 6.5, u * 1.2);
  metal(dx + u * 24, dy - u * 6, u * 5, u * 1);
  const drum = (x: number, y: number, r: number, col: string) => {
    g.fillStyle = '#d8d8e0';
    g.beginPath();
    g.ellipse(x, y, r, r * 0.5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = col;
    g.fillRect(x - r, y, r * 2, r * 0.9);
    g.fillStyle = '#e9e9f0';
    g.beginPath();
    g.ellipse(x, y + r * 0.9, r, r * 0.5, 0, 0, Math.PI);
    g.fill();
  };
  drum(dx - u * 4, dy - u * 2, u * 4.5, '#a8243b');
  drum(dx + u * 7, dy - u * 2, u * 4.5, '#a8243b');
  // Bumbo grande.
  const kick = g.createRadialGradient(dx + u * 1, dy + u * 6, 2, dx + u * 1, dy + u * 6, u * 10);
  kick.addColorStop(0, '#31101a');
  kick.addColorStop(0.75, '#26101a');
  kick.addColorStop(1, '#c23a4f');
  g.fillStyle = kick;
  g.beginPath();
  g.arc(dx + u * 1, dy + u * 6, u * 10, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#d9d9e2';
  g.lineWidth = u * 0.5;
  g.stroke();
  g.fillStyle = '#0c0b12';
  g.beginPath();
  g.arc(dx + u * 1, dy + u * 6, u * 2.4, 0, Math.PI * 2);
  g.fill();

  // Amplificadores à esquerda (pilha com cabeçote), caixas de som à direita.
  const amp = (x: number, y: number, w: number, hh: number) => {
    g.fillStyle = '#17171d';
    g.fillRect(x, y, w, hh);
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = 1;
    g.strokeRect(x + 0.5, y + 0.5, w - 1, hh - 1);
    g.fillStyle = '#26262f';
    for (let yy = y + hh * 0.08; yy < y + hh * 0.92; yy += 3) g.fillRect(x + w * 0.08, yy, w * 0.84, 1);
  };
  const head = (x: number, y: number, w: number) => {
    g.fillStyle = '#0f0f14';
    g.fillRect(x, y, w, u * 5);
    g.fillStyle = '#b9b9c4';
    g.fillRect(x + 2, y + 2, w - 4, u * 1.2);
    g.fillStyle = '#ff6a3c';
    for (let k = 0; k < 6; k++) {
      g.beginPath();
      g.arc(x + w * (0.12 + k * 0.15), y + u * 3.4, u * 0.55, 0, Math.PI * 2);
      g.fill();
    }
  };
  amp(W * 0.02, horizon - u * 24, u * 19, u * 28);
  amp(W * 0.02 + u * 20, horizon - u * 14, u * 15, u * 18);
  head(W * 0.02, horizon - u * 29, u * 19);
  head(W * 0.02 + u * 20, horizon - u * 19, u * 15);
  const cab = (x: number, y: number, w: number, hh: number) => {
    g.fillStyle = '#121218';
    g.fillRect(x, y, w, hh);
    g.strokeStyle = 'rgba(255,255,255,0.1)';
    g.strokeRect(x + 0.5, y + 0.5, w - 1, hh - 1);
    for (const [cx2, cy2, r] of [[x + w / 2, y + hh * 0.3, w * 0.3], [x + w / 2, y + hh * 0.72, w * 0.2]] as const) {
      const sp = g.createRadialGradient(cx2, cy2, 1, cx2, cy2, r);
      sp.addColorStop(0, '#2a2a34');
      sp.addColorStop(0.6, '#14141a');
      sp.addColorStop(1, '#3a3a46');
      g.fillStyle = sp;
      g.beginPath();
      g.arc(cx2, cy2, r, 0, Math.PI * 2);
      g.fill();
    }
  };
  cab(W - u * 20, horizon - u * 28, u * 18, u * 34);
  cab(W - u * 39, horizon - u * 18, u * 16, u * 24);
  // Pedestal de microfone e cabos no chão.
  g.strokeStyle = '#2b2b36';
  g.lineWidth = u * 0.4;
  g.beginPath();
  g.moveTo(W * 0.3, horizon + u * 6);
  g.lineTo(W * 0.3, horizon - u * 14);
  g.quadraticCurveTo(W * 0.3, horizon - u * 17, W * 0.3 + u * 4, horizon - u * 16);
  g.stroke();
  g.strokeStyle = '#0c0c10';
  g.lineWidth = u * 0.5;
  g.beginPath();
  g.moveTo(W * 0.1, horizon + u * 6);
  g.bezierCurveTo(W * 0.2, horizon + u * 9, W * 0.25, horizon + u * 4, W * 0.36, horizon + u * 7);
  g.stroke();
  return c;
}

export function ArcadeStageCanvas({ feed, lanes, stringNames, goal = 80, fov = 1, videoBg = false }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const props = useRef({ lanes, stringNames, goal, fov, videoBg });
  props.current = { lanes, stringNames, goal, fov, videoBg };

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const g = cv.getContext('2d');
    if (!g) return;
    let raf = 0;
    const sparks: Spark[] = [];
    const pops: Pop[] = [];
    const glow = new Array<number>(7).fill(0);
    const missFlash = new Array<number>(7).fill(0);
    const dust = Array.from({ length: 70 }, () => ({ x: Math.random(), y: Math.random(), z: Math.random(), s: 0.3 + Math.random() * 0.7 }));
    let set: HTMLCanvasElement | null = null;
    let setKey = '';
    let strobe = 0;
    let rock = 0.5;
    let lastT = performance.now();
    let popT = 0;

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const dpr = window.devicePixelRatio || 1;
      const W = cv.clientWidth;
      const H = cv.clientHeight;
      if (!W || !H) return;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) {
        cv.width = Math.round(W * dpr);
        cv.height = Math.round(H * dpr);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const t = performance.now();
      const dt = Math.min(0.05, (t - lastT) / 1000);
      lastT = t;
      const sec = t / 1000;
      const { lanes: L, stringNames: names, goal: goalPct, fov: FOV, videoBg: overVideo } = props.current;
      const f = feed.current;
      const eng = f.engine;
      const now = f.now();
      const st = eng?.stats;
      const mult = eng ? eng.multiplier() : 1;
      const base = Math.min(4, mult);
      const intensity = (base - 1) / 3; // 0 … 1 com o combo

      // Batida: 1 na batida, caindo a 0.
      let pulse = 0;
      if (f.playing) {
        for (let k = f.beats.length - 1; k >= 0; k--) {
          if (f.beats[k]! <= now) {
            pulse = 1 - Math.min(1, (now - f.beats[k]!) / 0.35);
            break;
          }
        }
      }

      /* ------------------------------ câmera ------------------------------ */
      const horizon = H * 0.4;
      const strikeY = H * 0.86;
      const cx = W / 2;
      const bottomHalf = Math.min(W * 0.46, 80 + L * 40);
      const topHalf = bottomHalf * (0.1 + 0.07 / Math.max(0.5, FOV)); // quanto mais fov, mais fechado no horizonte
      const k = 3.2 * Math.max(0.5, FOV); // perspectiva cônica
      const depth = (d: number) => {
        const p = 1 / (1 + Math.max(-0.3, d) * (k / AHEAD));
        return (p - 1 / (1 + k)) / (1 - 1 / (1 + k)); // 1 na linha de acerto, 0 no horizonte
      };
      const yAt = (q: number) => horizon + (strikeY - horizon) * q;
      const halfAt = (q: number) => topHalf + (bottomHalf - topHalf) * q;
      const laneX = (lane: number, q: number) => cx + ((lane + 0.5) / L - 0.5) * 2 * halfAt(q);

      // Eventos: faíscas, flashes e os avisos PERFECT!/GREAT!.
      if (eng) {
        for (const e of eng.drain()) {
          if (e.kind === 'hit' || e.kind === 'octave') {
            const lane = Math.max(0, Math.min(L - 1, e.lane));
            glow[lane] = 1;
            const x = laneX(lane, 1);
            const n = e.grade === 'perfect' ? 30 : e.grade === 'great' ? 20 : 12;
            for (let i = 0; i < n; i++) {
              const a = -Math.PI / 2 + (Math.random() - 0.5) * 2;
              const v = 140 + Math.random() * 320;
              sparks.push({ x, y: strikeY, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.45 + Math.random() * 0.5, color: Math.random() < 0.5 ? '#ffe28a' : LANE_COLORS[lane]!, size: 1.5 + Math.random() * 2.5 });
            }
            // Direção do tempo: adiantada ou atrasada, com os milissegundos (não só a classe).
            const ms = e.offsetMs ?? 0;
            const when = Math.abs(ms) < 20 ? '' : ` · ${ms < 0 ? 'adiantada' : 'atrasada'} ${Math.abs(ms)} ms`;
            if (e.grade === 'perfect') pops.push({ text: 'PERFECT!', color: '#ffe28a', life: 1 });
            else if (e.grade === 'great') pops.push({ text: `GREAT!${when}`, color: '#7fe0ff', life: 1 });
            else if (e.grade === 'good') pops.push({ text: `GOOD${when}`, color: '#c8f7a1', life: 1 });
            if (pops.length > 3) pops.shift();
          } else if (e.kind === 'miss' || e.kind === 'overstrum') {
            if (e.lane >= 0) missFlash[Math.min(L - 1, e.lane)] = 1;
          } else if (e.kind === 'overdrive') strobe = 1;
          // Rock meter: sobe com acertos, cai mais rápido com erros.
          if (e.kind === 'hit') rock = Math.min(1, rock + 0.045);
          else if (e.kind === 'octave') rock = Math.min(1, rock + 0.015);
          else if (e.kind === 'miss' || e.kind === 'overstrum') rock = Math.max(0, rock - 0.1);
        }
      }
      if (!f.playing && !eng) rock = 0.5;

      /* ------------------------------ cenário ------------------------------ */
      if (overVideo) {
        // Vídeo atrás: canvas transparente com sombra embaixo (esteira e placar legíveis).
        g.clearRect(0, 0, W, H);
        const shade = g.createLinearGradient(0, 0, 0, H);
        shade.addColorStop(0, 'rgba(5,3,12,0.2)');
        shade.addColorStop(0.45, 'rgba(5,3,12,0.35)');
        shade.addColorStop(1, 'rgba(5,3,12,0.75)');
        g.fillStyle = shade;
        g.fillRect(0, 0, W, H);
      } else {
        loadStageBg(() => (setKey = ''));
        const key = `${Math.round(W)}x${Math.round(H)}${stageBgReady ? 'p' : 'd'}`;
        if (!set || setKey !== key) {
          set = stageBgReady ? paintPhoto(W, H) : paintSet(W, H, horizon);
          setKey = key;
        }
        g.drawImage(set, 0, 0, W, H);
        // Profundidade de campo: o fundo do palco fica levemente suavizado (nítido só na pista).
        g.save();
        g.globalAlpha = 0.5;
        g.filter = 'blur(2.5px)';
        g.drawImage(set, 0, 0, W, horizon + 6, 0, 0, W, horizon + 6);
        g.restore();
      }

      // Canhões de luz: roxo, azul e rosa, balançando no tempo e abrindo com o combo.
      const cols = ['#a35bff', '#4a9bff', '#ff4fb4', '#a35bff', '#4a9bff', '#ff4fb4'];
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 6; i++) {
        const x0 = W * (0.08 + i * 0.168);
        const sw = Math.sin(sec * (0.8 + i * 0.13) + i * 1.9) * W * (0.12 + 0.12 * intensity) + (i % 2 ? 1 : -1) * pulse * W * 0.03;
        const alpha = (0.1 + 0.1 * intensity + 0.16 * pulse) * (stageBgReady ? 0.6 : 1);
        const grd = g.createLinearGradient(x0, H * 0.07, x0 + sw, horizon + 60);
        grd.addColorStop(0, hexA(cols[i]!, Math.min(0.7, alpha * 2.4)));
        grd.addColorStop(1, hexA(cols[i]!, 0));
        g.fillStyle = grd;
        g.beginPath();
        g.moveTo(x0 - 5, H * 0.07);
        g.lineTo(x0 + 5, H * 0.07);
        g.lineTo(x0 + sw + 55 + 25 * intensity, horizon + 60);
        g.lineTo(x0 + sw - 55 - 25 * intensity, horizon + 60);
        g.closePath();
        g.fill();
        // Ponto de luz na fonte.
        const dot = g.createRadialGradient(x0, H * 0.085, 0, x0, H * 0.085, 18);
        dot.addColorStop(0, hexA(cols[i]!, 0.9));
        dot.addColorStop(1, hexA(cols[i]!, 0));
        g.fillStyle = dot;
        g.fillRect(x0 - 18, H * 0.085 - 18, 36, 36);
      }
      g.restore();

      // Fumaça de palco: grandes manchas que derivam devagar.
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const fx = ((sec * 6 * (0.5 + i * 0.2) + i * 180) % (W + 300)) - 150;
        const fy = horizon + 10 + i * 12 + Math.sin(sec * 0.4 + i) * 8;
        const fg = g.createRadialGradient(fx, fy, 0, fx, fy, 150);
        fg.addColorStop(0, `rgba(150,110,220,${0.1 + 0.05 * pulse})`);
        fg.addColorStop(1, 'rgba(150,110,220,0)');
        g.fillStyle = fg;
        g.fillRect(fx - 150, fy - 150, 300, 300);
      }
      g.restore();

      /* ------------------------------ braço do instrumento em 3D ------------------------------ */
      // A esteira é o próprio braço (visto de cima, em perspectiva): madeira, filetes de osso nas bordas,
      // trastes de metal nas batidas, marcas de madrepérola e uma corda por trilha (grave = mais grossa).
      const bandBottom = strikeY + 26;
      const edgeL = (q: number) => cx - halfAt(q);
      const edgeR = (q: number) => cx + halfAt(q);
      const qBottom = (bandBottom - horizon) / (strikeY - horizon);
      // Sombra do braço no palco e a lateral (espessura) do lado esquerdo e direito.
      g.save();
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.filter = 'blur(10px)';
      g.beginPath();
      g.moveTo(edgeL(0) - 10, horizon + 4);
      g.lineTo(edgeR(0) + 10, horizon + 4);
      g.lineTo(edgeR(qBottom) + 26, bandBottom + 6);
      g.lineTo(edgeL(qBottom) - 26, bandBottom + 6);
      g.closePath();
      g.fill();
      g.restore();
      const side = g.createLinearGradient(0, horizon, 0, bandBottom);
      side.addColorStop(0, '#120a06');
      side.addColorStop(1, '#2a170d');
      g.fillStyle = side;
      g.beginPath();
      g.moveTo(edgeL(0), horizon);
      g.lineTo(edgeL(qBottom), bandBottom);
      g.lineTo(edgeL(qBottom) - 9, bandBottom + 7);
      g.lineTo(edgeL(0) - 2, horizon + 2);
      g.closePath();
      g.fill();
      g.beginPath();
      g.moveTo(edgeR(0), horizon);
      g.lineTo(edgeR(qBottom), bandBottom);
      g.lineTo(edgeR(qBottom) + 9, bandBottom + 7);
      g.lineTo(edgeR(0) + 2, horizon + 2);
      g.closePath();
      g.fill();
      // Escala (madeira escura, mais clara perto de quem toca).
      g.beginPath();
      g.moveTo(edgeL(0), horizon);
      g.lineTo(edgeR(0), horizon);
      g.lineTo(edgeR(qBottom), bandBottom);
      g.lineTo(edgeL(qBottom), bandBottom);
      g.closePath();
      const wood = g.createLinearGradient(0, horizon, 0, bandBottom);
      wood.addColorStop(0, '#1b0f09');
      wood.addColorStop(0.55, '#2e1a10');
      wood.addColorStop(1, '#4a2b19');
      g.fillStyle = wood;
      g.fill();
      g.save();
      g.clip();
      // Veios da madeira acompanhando o comprimento.
      for (let i = 0; i < 26; i++) {
        const u = (i + 0.5) / 26;
        const wob = Math.sin(i * 12.9898) * 0.012;
        g.strokeStyle = `rgba(${i % 3 ? '0,0,0' : '255,200,150'},${0.06 + (i % 4) * 0.015})`;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(cx + (u * 2 - 1 + wob) * topHalf, horizon);
        g.lineTo(cx + (u * 2 - 1 + wob * 2) * bottomHalf, bandBottom);
        g.stroke();
      }
      // Cada trilha com seu tom de neon sobre a madeira.
      for (let i = 0; i < L; i++) {
        const col = LANE_COLORS[i]!;
        const a0 = (i / L - 0.5) * 2;
        const a1 = ((i + 1) / L - 0.5) * 2;
        g.beginPath();
        g.moveTo(cx + a0 * topHalf, horizon);
        g.lineTo(cx + a1 * topHalf, horizon);
        g.lineTo(cx + a1 * bottomHalf, bandBottom);
        g.lineTo(cx + a0 * bottomHalf, bandBottom);
        g.closePath();
        const lg = g.createLinearGradient(0, horizon, 0, bandBottom);
        lg.addColorStop(0, hexA(col, 0.0));
        lg.addColorStop(1, hexA(col, 0.07 + 0.26 * glow[i]! + (f.pressed.has(i) ? 0.14 : 0)));
        g.fillStyle = lg;
        g.fill();
      }
      g.restore();
      // Filetes das bordas (osso).
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(236,226,200,0.75)';
      g.beginPath();
      g.moveTo(edgeL(0), horizon);
      g.lineTo(edgeL(qBottom), bandBottom);
      g.moveTo(edgeR(0), horizon);
      g.lineTo(edgeR(qBottom), bandBottom);
      g.stroke();
      // Pestana (nut) no fundo do braço.
      const nutW = Math.max(3, (strikeY - horizon) * 0.012);
      const nut = g.createLinearGradient(0, horizon - nutW, 0, horizon + nutW);
      nut.addColorStop(0, '#f5efe0');
      nut.addColorStop(1, '#a89f8a');
      g.fillStyle = nut;
      g.fillRect(edgeL(0) - 2, horizon - nutW, halfAt(0) * 2 + 4, nutW * 1.6);

      // Trastes nas batidas (metal) e madrepérola entre eles.
      const spacing = f.beats.length > 1 ? Math.max(0.05, f.beats[1]! - f.beats[0]!) : 0.5;
      for (let bi = 0; bi < f.beats.length; bi++) {
        const d = f.beats[bi]! - now;
        if (d < -0.1 || d > AHEAD) continue;
        const q = depth(d);
        const y = yAt(q);
        const half = halfAt(q);
        const th = 1.2 + q * 3.2;
        const fretFade = Math.min(1, 0.25 + q * 1.3);
        const metalG = g.createLinearGradient(0, y - th, 0, y + th);
        metalG.addColorStop(0, `rgba(250,250,255,${0.85 * fretFade})`);
        metalG.addColorStop(0.5, `rgba(185,190,205,${0.9 * fretFade})`);
        metalG.addColorStop(1, `rgba(90,95,110,${0.85 * fretFade})`);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(cx - half, y + th * 0.6, half * 2, th * 0.9); // sombra sob o traste
        g.fillStyle = metalG;
        g.fillRect(cx - half, y - th * 0.5, half * 2, th);
        // Marca de madrepérola no meio da casa (de duas em duas).
        const idx = Math.round(f.beats[bi]! / spacing);
        if (idx % 2 === 0 && bi + 1 < f.beats.length) {
          const qm = depth((f.beats[bi]! + f.beats[bi + 1]!) / 2 - now);
          if (qm > 0.04) {
            const r = (bottomHalf / L) * 0.1 * (0.3 + 0.7 * qm);
            const pg = g.createRadialGradient(cx - r * 0.3, yAt(qm) - r * 0.2, 0, cx, yAt(qm), r);
            pg.addColorStop(0, 'rgba(255,255,255,0.95)');
            pg.addColorStop(1, 'rgba(190,200,225,0.55)');
            g.fillStyle = pg;
            g.beginPath();
            g.ellipse(cx, yAt(qm), r * 1.4, r * 0.8, 0, 0, Math.PI * 2);
            g.fill();
          }
        }
      }

      // Cordas: uma por trilha, mais grossas nos graves, com brilho metálico; vibram no acerto.
      for (let i = 0; i < L; i++) {
        const thick = 1 + (L - 1 - i) * 0.55; // corda 0 = a mais grave (mais grossa)
        const vib = glow[i]!;
        const pts: Array<[number, number, number]> = [];
        for (let k = 0; k <= 16; k++) {
          const q = k / 16;
          const off = vib > 0 ? Math.sin(sec * 70 + k * 1.7) * vib * 2.6 * (0.3 + 0.7 * q) * Math.sin((k / 16) * Math.PI) : 0;
          pts.push([laneX(i, q) + off, yAt(q), thick * (0.3 + 0.7 * q)]);
        }
        const bass = i < Math.ceil(L / 2);
        const stringCol = bass ? ['#9a8f78', '#e0d6bd'] : ['#aeb3c0', '#f4f6ff'];
        for (const [pass, col] of [[1.9, 'rgba(0,0,0,0.5)'], [1, stringCol[0]!], [0.35, stringCol[1]!]] as const) {
          g.strokeStyle = col;
          g.lineCap = 'round';
          for (let k = 0; k < pts.length - 1; k++) {
            g.lineWidth = Math.max(0.6, pts[k]![2] * pass);
            g.beginPath();
            g.moveTo(pts[k]![0] + (pass === 0.35 ? -thick * 0.15 : pass === 1.9 ? 1.5 : 0), pts[k]![1] + (pass === 1.9 ? 1.5 : 0));
            g.lineTo(pts[k + 1]![0] + (pass === 0.35 ? -thick * 0.15 : pass === 1.9 ? 1.5 : 0), pts[k + 1]![1] + (pass === 1.9 ? 1.5 : 0));
            g.stroke();
          }
        }
        if (vib > 0.05) {
          g.strokeStyle = hexA(LANE_COLORS[i]!, vib * 0.8);
          g.lineWidth = 1.2;
          g.beginPath();
          g.moveTo(pts[8]![0], pts[8]![1]);
          for (let k = 9; k < pts.length; k++) g.lineTo(pts[k]![0], pts[k]![1]);
          g.stroke();
        }
      }

      /* ------------------------------ notas ------------------------------ */
      if (eng) {
        const visible: HighwayNote[] = [];
        for (const n of eng.notes) {
          const d = n.time - now;
          if (d + n.sustain < -0.15 || d > AHEAD) continue;
          visible.push(n);
        }
        // Caudas (neon por baixo das gemas).
        for (const n of visible) {
          if (n.sustain <= 0 || n.lane >= L) continue;
          const d0 = Math.max(0, n.time - now);
          const d1 = Math.min(AHEAD, n.time + n.sustain - now);
          if (d1 <= d0) continue;
          const q0 = depth(d0);
          const q1 = depth(d1);
          const col = LANE_COLORS[n.lane]!;
          const lit = n.holding;
          const w0 = 8 * (0.25 + 0.75 * q0);
          const w1 = 8 * (0.25 + 0.75 * q1);
          g.fillStyle = n.state === 'miss' ? 'rgba(120,120,130,0.35)' : hexA(col, lit ? 0.95 : 0.5 * (0.4 + 0.6 * q1));
          if (lit) {
            g.shadowColor = col;
            g.shadowBlur = 18;
          }
          g.beginPath();
          g.moveTo(laneX(n.lane, q0) - w0, yAt(q0));
          g.lineTo(laneX(n.lane, q1) - w1, yAt(q1));
          g.lineTo(laneX(n.lane, q1) + w1, yAt(q1));
          g.lineTo(laneX(n.lane, q0) + w0, yAt(q0));
          g.closePath();
          g.fill();
          g.shadowBlur = 0;
        }
        for (let i = visible.length - 1; i >= 0; i--) {
          const n = visible[i]!;
          if (n.lane >= L || n.state === 'hit' || n.state === 'octave') continue;
          const d = n.time - now;
          if (d < -0.15) continue;
          const q = depth(d);
          // Longe do horizonte as gemas ficam mais suaves (profundidade de campo).
          drawGem(g, laneX(n.lane, q), yAt(q), (bottomHalf / L) * 0.6 * (0.28 + 0.72 * q), n, LANE_COLORS[n.lane]!, 0.45 + 0.55 * Math.min(1, q * 1.6));
        }
      }

      /* ------------------------------ linha de acerto ------------------------------ */
      // Barra de acerto brilhante.
      const barGrad = g.createLinearGradient(cx - bottomHalf, 0, cx + bottomHalf, 0);
      barGrad.addColorStop(0, 'rgba(255,255,255,0)');
      barGrad.addColorStop(0.5, `rgba(255,255,255,${0.35 + 0.3 * pulse})`);
      barGrad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = barGrad;
      g.fillRect(cx - bottomHalf, strikeY - 1.5, bottomHalf * 2, 3);
      for (let i = 0; i < L; i++) {
        const x = laneX(i, 1);
        const r = (bottomHalf / L) * 0.6;
        const col = LANE_COLORS[i]!;
        const down = f.pressed.has(i);
        const gl = glow[i]!;
        g.save();
        g.translate(x, strikeY + (down ? 3 : 0));
        g.scale(1, 0.5);
        g.lineWidth = 6;
        g.strokeStyle = gl > 0 ? '#fff' : col;
        if (gl > 0 || down) {
          g.shadowColor = col;
          g.shadowBlur = 20 + gl * 26;
        }
        g.beginPath();
        g.arc(0, 0, r, 0, Math.PI * 2);
        g.stroke();
        const rg = g.createRadialGradient(0, 0, 1, 0, 0, r);
        rg.addColorStop(0, hexA(col, down || gl > 0 ? 0.85 : 0.25));
        rg.addColorStop(1, hexA(col, down || gl > 0 ? 0.4 : 0.08));
        g.fillStyle = rg;
        g.fill();
        g.shadowBlur = 0;
        if (missFlash[i]! > 0) {
          g.fillStyle = `rgba(255,70,70,${missFlash[i]! * 0.55})`;
          g.fill();
        }
        g.restore();
        g.fillStyle = 'rgba(255,255,255,0.6)';
        g.font = '600 11px Segoe UI, sans-serif';
        g.textAlign = 'center';
        g.fillText(`${names[i] ?? ''} · ${LANE_KEYS[i]}`, x, strikeY + r * 0.5 + 20);
        glow[i] = Math.max(0, gl - dt * 4);
        missFlash[i] = Math.max(0, missFlash[i]! - dt * 3);
        // Chama sobre a casa recém-acertada.
        if (gl > 0.2) {
          g.save();
          g.globalCompositeOperation = 'lighter';
          const fh = 34 * gl + 10 * Math.sin(sec * 40 + i);
          const fg = g.createLinearGradient(0, strikeY, 0, strikeY - fh);
          fg.addColorStop(0, 'rgba(255,200,80,0.9)');
          fg.addColorStop(0.5, hexA(col, 0.6));
          fg.addColorStop(1, 'rgba(255,80,40,0)');
          g.fillStyle = fg;
          g.beginPath();
          g.moveTo(x - r * 0.7, strikeY);
          g.quadraticCurveTo(x - r * 0.2, strikeY - fh * 1.1, x, strikeY - fh * 1.4);
          g.quadraticCurveTo(x + r * 0.2, strikeY - fh * 1.1, x + r * 0.7, strikeY);
          g.fill();
          g.restore();
        }
      }
      // Energia cheia: chamas contínuas ao longo da linha.
      if (st?.overdrive) {
        g.save();
        g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 28; i++) {
          const x = cx - bottomHalf + ((i + 0.5) / 28) * bottomHalf * 2;
          const h = 16 + 20 * Math.abs(Math.sin(sec * 11 + i * 1.3));
          const fl = g.createLinearGradient(0, strikeY, 0, strikeY - h);
          fl.addColorStop(0, 'rgba(120,210,255,0.85)');
          fl.addColorStop(1, 'rgba(120,210,255,0)');
          g.fillStyle = fl;
          g.beginPath();
          g.moveTo(x - 7, strikeY);
          g.quadraticCurveTo(x, strikeY - h * 1.3, x + 7, strikeY);
          g.fill();
        }
        g.restore();
      }

      // Faíscas.
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i]!;
        p.life -= dt;
        if (p.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        p.vy += 560 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        g.fillStyle = hexA(p.color, Math.min(1, p.life * 2.2));
        g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      g.restore();

      // Poeira iluminada no ar.
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (const d of dust) {
        const dx = (d.x + Math.sin(sec * 0.2 * d.s + d.z * 9) * 0.02) % 1;
        const dy = (d.y + sec * 0.012 * d.s) % 1;
        g.fillStyle = `rgba(200,180,255,${0.12 + 0.2 * d.z})`;
        g.fillRect(dx * W, dy * H * 0.9, 1 + d.z * 1.6, 1 + d.z * 1.6);
      }
      g.restore();

      // Estrobo: com a energia cheia ou o combo máximo, pisca na batida.
      strobe = Math.max(strobe - dt * 5, st?.overdrive || base >= 4 ? pulse * 0.28 : 0);
      if (strobe > 0.02) {
        g.fillStyle = `rgba(255,255,255,${Math.min(0.5, strobe * 0.4)})`;
        g.fillRect(0, 0, W, H);
      }

      // PERFECT! / GREAT! sobem e somem.
      popT += dt;
      for (let i = pops.length - 1; i >= 0; i--) {
        const p = pops[i]!;
        p.life -= dt * 1.4;
        if (p.life <= 0) {
          pops.splice(i, 1);
          continue;
        }
        const sc = 1 + (1 - p.life) * 0.25;
        g.save();
        g.translate(cx, strikeY - 70 - (1 - p.life) * 26);
        g.scale(sc, sc);
        g.globalAlpha = Math.min(1, p.life * 2);
        g.textAlign = 'center';
        g.font = '900 28px Segoe UI, sans-serif';
        g.shadowColor = p.color;
        g.shadowBlur = 18;
        g.fillStyle = p.color;
        g.fillText(p.text, 0, 0);
        g.restore();
      }

      drawHud(g, W, H, eng, goalPct, rock, intensity);

      // Contagem regressiva: número grande no centro a cada batida da contagem, e "JÁ!" na entrada.
      const ci = f.countIn;
      if (f.playing && ci && ci.length) {
        const beatLen = ci.length > 1 ? ci[1]! - ci[0]! : 0.5;
        const end = ci[ci.length - 1]! + beatLen;
        let label = '';
        let phase = 0;
        if (now >= ci[0]! - 0.05 && now < end) {
          const k = Math.min(ci.length - 1, Math.max(0, Math.floor((now - ci[0]!) / beatLen)));
          label = String(ci.length - k);
          phase = (now - ci[k]!) / beatLen;
        } else if (now >= end && now < end + 0.6) {
          label = 'JÁ!';
          phase = (now - end) / 0.6;
        } else if (now < ci[0]!) {
          label = String(ci.length);
        }
        if (label) {
          g.save();
          g.fillStyle = `rgba(5,3,12,${0.45 * (1 - (label === 'JÁ!' ? phase : 0))})`;
          g.fillRect(0, 0, W, H);
          const size = Math.min(W, H) * (label === 'JÁ!' ? 0.2 : 0.28) * (1.15 - 0.25 * Math.min(1, phase));
          g.globalAlpha = Math.max(0, 1 - Math.max(0, phase - 0.55) * 2.2);
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.font = `900 ${Math.round(size)}px Segoe UI, sans-serif`;
          g.shadowColor = label === 'JÁ!' ? '#3ddc6a' : '#ff8a2a';
          g.shadowBlur = 30;
          g.fillStyle = '#fff';
          g.fillText(label, W / 2, H * 0.45);
          g.shadowBlur = 0;
          g.font = '700 14px Segoe UI, sans-serif';
          g.fillStyle = 'rgba(255,255,255,0.75)';
          if (label !== 'JÁ!') g.fillText('Prepare-se', W / 2, H * 0.45 + size * 0.62);
          g.restore();
        }
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // O desenho lê tudo por referência; não reinicia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas ref={canvas} className="arcade-canvas" aria-label="Palco: esteira de notas e placar" role="img" />;
}

/** Gema de vidro: corpo com degradê, brilho especular, contorno neon; ligado tem miolo branco. */
function drawGem(g: CanvasRenderingContext2D, x: number, y: number, r: number, n: HighwayNote, col: string, alpha: number): void {
  const missed = n.state === 'miss';
  g.save();
  g.globalAlpha = alpha;
  g.translate(x, y);
  g.scale(1, 0.62);
  if (!missed) {
    g.shadowColor = col;
    g.shadowBlur = r * 1.1;
  }
  const body = g.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
  body.addColorStop(0, missed ? '#888' : '#ffffff');
  body.addColorStop(0.35, missed ? '#666' : col);
  body.addColorStop(1, missed ? '#333' : hexA(col, 0.75));
  g.fillStyle = body;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fill();
  g.shadowBlur = 0;
  g.lineWidth = Math.max(1.5, r * 0.13);
  g.strokeStyle = missed ? '#333' : 'rgba(255,255,255,0.7)';
  g.stroke();
  if (n.hopo && !missed) {
    g.shadowColor = '#fff';
    g.shadowBlur = r * 0.8;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(0, 0, r * 0.58, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 0;
  } else {
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.beginPath();
    g.arc(0, 0, r * 0.56, 0, Math.PI * 2);
    g.fill();
  }
  // Reflexo curvo no alto.
  g.fillStyle = 'rgba(255,255,255,0.45)';
  g.beginPath();
  g.ellipse(-r * 0.25, -r * 0.5, r * 0.45, r * 0.16, -0.3, 0, Math.PI * 2);
  g.fill();
  g.restore();
  if (n.fret >= 0 && r > 6) {
    g.save();
    g.globalAlpha = alpha;
    g.fillStyle = n.hopo && !missed ? '#111' : '#fff';
    g.font = `800 ${Math.round(r * 0.78)}px Segoe UI, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(n.fret), x, y + 0.5);
    g.restore();
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
  g.fill();
}

/** HUD de vidro: pontos e multiplicador, combo e medidor de performance, resultados da sessão. */
function drawHud(g: CanvasRenderingContext2D, W: number, H: number, eng: FofHighwayEngine | null, goal: number, rock: number, intensity: number): void {
  const st = eng?.stats;
  const mult = eng ? eng.multiplier() : 1;
  const acc = eng?.accuracy() ?? null;
  g.textBaseline = 'alphabetic';
  const glass = (x: number, y: number, w: number, h: number) => {
    g.fillStyle = 'rgba(12,10,22,0.62)';
    roundRect(g, x, y, w, h, 12);
    g.strokeStyle = 'rgba(255,255,255,0.1)';
    g.lineWidth = 1;
    g.stroke();
  };
  const compact = W < 430;

  // Pontos + multiplicador (esquerda).
  glass(10, 10, compact ? 112 : 134, 74);
  g.textAlign = 'left';
  g.fillStyle = 'rgba(255,255,255,0.6)';
  g.font = '700 10px Segoe UI, sans-serif';
  g.fillText('PONTOS', 22, 28);
  g.fillStyle = '#fff';
  g.font = '800 24px Cascadia Mono, Consolas, monospace';
  g.fillText(String(st?.score ?? 0), 22, 54);
  g.fillStyle = mult >= 4 ? '#ff8a2a' : '#ffd23f';
  g.font = '800 15px Segoe UI, sans-serif';
  g.fillText(`Multiplicador x${mult}`, 22, 74);
  // Barra de energia vertical (esquerda).
  const bx = 14;
  const by = 100;
  const bh = Math.max(60, H * 0.3);
  g.fillStyle = 'rgba(255,255,255,0.1)';
  roundRect(g, bx, by, 8, bh, 4);
  const en = st?.energy ?? 0;
  g.fillStyle = st?.overdrive ? '#7fd8ff' : '#4fd1c5';
  roundRect(g, bx, by + bh * (1 - en), 8, Math.max(0, bh * en), 4);
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.font = '700 8px Segoe UI, sans-serif';
  g.fillText('ENERGIA', bx - 2, by + bh + 12);

  // Combo + Rock Meter (centro).
  const mw = Math.min(W * 0.34, 200);
  const mx = W / 2 - mw / 2;
  g.textAlign = 'center';
  g.fillStyle = 'rgba(255,255,255,0.6)';
  g.font = '700 10px Segoe UI, sans-serif';
  g.fillText('COMBO', W / 2, 24);
  g.fillStyle = mult >= 4 ? '#ff8a2a' : '#ffd23f';
  g.shadowColor = g.fillStyle;
  g.shadowBlur = 8 + 14 * intensity;
  g.font = '900 30px Segoe UI, sans-serif';
  g.fillText(`x${mult}`, W / 2, 54);
  g.shadowBlur = 0;
  const my = 64;
  const grad = g.createLinearGradient(mx, 0, mx + mw, 0);
  grad.addColorStop(0, '#ff4d4d');
  grad.addColorStop(0.5, '#ffd23f');
  grad.addColorStop(1, '#3ddc6a');
  g.fillStyle = 'rgba(255,255,255,0.12)';
  roundRect(g, mx, my, mw, 10, 5);
  g.save();
  g.beginPath();
  g.rect(mx, my, mw * rock, 10);
  g.clip();
  g.fillStyle = grad;
  roundRect(g, mx, my, mw, 10, 5);
  g.restore();
  // Zona de sucesso: a partir da meta de precisão.
  const gx = mx + mw * (goal / 100);
  g.strokeStyle = '#ffd166';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(gx, my - 4);
  g.lineTo(gx, my + 14);
  g.stroke();
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(mx + mw * rock, my + 5, 6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.6)';
  g.font = '700 10px Segoe UI, sans-serif';
  g.fillText(`ROCK METER · meta ${goal}%${acc !== null ? ` · ${acc}%` : ''}`, W / 2, my + 28);

  // Resultados da sessão (direita), em vidro.
  if (!compact) {
    const rw = 132;
    const rx = W - rw - 10;
    glass(rx, 10, rw, 112);
    g.textAlign = 'left';
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.font = '700 10px Segoe UI, sans-serif';
    g.fillText('RESULTADOS', rx + 12, 28);
    const rows: Array<[string, string, number]> = [
      ['Perfect', '#ffe28a', st?.perfect ?? 0],
      ['Great', '#7fe0ff', st?.great ?? 0],
      ['Good', '#3ddc6a', st?.good ?? 0],
      ['Oitava', '#ff8a2a', st?.octave ?? 0],
      ['Erros', '#ff6b6b', st?.misses ?? 0],
    ];
    rows.forEach(([label, color, n], i) => {
      const y = 46 + i * 15;
      g.fillStyle = color;
      g.beginPath();
      g.arc(rx + 16, y - 4, 4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.8)';
      g.font = '600 11px Segoe UI, sans-serif';
      g.fillText(label, rx + 28, y);
      g.textAlign = 'right';
      g.fillStyle = '#fff';
      g.font = '700 11px Cascadia Mono, Consolas, monospace';
      g.fillText(String(n), rx + rw - 12, y);
      g.textAlign = 'left';
    });
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.font = '600 10px Segoe UI, sans-serif';
    g.fillText(`Sequência ${st?.streak ?? 0} · melhor ${st?.maxStreak ?? 0}`, rx + 12, 120);
  }
  g.textAlign = 'left';
}
