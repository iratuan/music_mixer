import { getAudioContext } from './context.js';
import { masterBus } from './voices.js';
import { encodeWav } from './wav.js';

export interface LiveMonitorHandle {
  setGain(gain: number): void;
  level(): number;
  stop(): void;
}

export interface PracticeRecorderHandle {
  stop(): Promise<{ blob: Blob; url: string; durationSec: number }>;
}

let activeStream: MediaStream | null = null;
let monitorGainNode: GainNode | null = null;
let analyserNode: AnalyserNode | null = null;
let currentSource: MediaStreamAudioSourceNode | null = null;

/**
 * Inicia o monitoramento ao vivo do instrumento plugado (microfone, interface ou entrada P2/P3).
 * Roteia o áudio da entrada para o masterBus com controle de ganho ao vivo e medidor de nível.
 */
export async function startLiveInstrumentMonitor(
  deviceId: string | null,
  initialGain = 0.8,
  routeToSpeaker = true,
): Promise<LiveMonitorHandle> {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') await ctx.resume();

  stopLiveInstrumentMonitor();

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      channelCount: 1,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });

  activeStream = stream;
  currentSource = ctx.createMediaStreamSource(stream);

  analyserNode = ctx.createAnalyser();
  analyserNode.fftSize = 256;

  monitorGainNode = ctx.createGain();
  monitorGainNode.gain.value = routeToSpeaker ? initialGain : 0;

  currentSource.connect(analyserNode);
  if (routeToSpeaker) {
    analyserNode.connect(monitorGainNode);
    monitorGainNode.connect(masterBus());
  }

  const pcm = new Float32Array(analyserNode.fftSize);

  return {
    setGain(g: number) {
      if (monitorGainNode) {
        monitorGainNode.gain.setTargetAtTime(Math.max(0, Math.min(2, g)), ctx.currentTime, 0.02);
      }
    },
    level(): number {
      if (!analyserNode) return 0;
      analyserNode.getFloatTimeDomainData(pcm);
      let sum = 0;
      for (let i = 0; i < pcm.length; i++) {
        const s = pcm[i]!;
        sum += s * s;
      }
      return Math.min(1, Math.sqrt(sum / pcm.length) * 3);
    },
    stop() {
      stopLiveInstrumentMonitor();
    },
  };
}

export function stopLiveInstrumentMonitor(): void {
  if (activeStream) {
    activeStream.getTracks().forEach((t) => t.stop());
    activeStream = null;
  }
  if (currentSource) {
    currentSource.disconnect();
    currentSource = null;
  }
  if (monitorGainNode) {
    monitorGainNode.disconnect();
    monitorGainNode = null;
  }
  if (analyserNode) {
    analyserNode.disconnect();
    analyserNode = null;
  }
}

/**
 * Grava a sessão de prática diretamente da saída geral (Base da Harmonia + Instrumento ao vivo).
 */
export function startPracticeRecording(): PracticeRecorderHandle {
  const ctx = getAudioContext();
  const mb = masterBus();

  // Cria um stream de destino a partir do barramento master
  const dest = ctx.createMediaStreamDestination();
  mb.connect(dest);

  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
      ? 'audio/ogg;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';

  const recorder = mimeType ? new MediaRecorder(dest.stream, { mimeType }) : new MediaRecorder(dest.stream);
  const chunks: Blob[] = [];
  const startAt = performance.now();

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  recorder.start(100);

  return {
    async stop(): Promise<{ blob: Blob; url: string; durationSec: number }> {
      return new Promise((resolve) => {
        recorder.onstop = () => {
          mb.disconnect(dest);
          const durationSec = Math.round((performance.now() - startAt) / 1000);
          const finalType = recorder.mimeType || 'audio/webm';
          const blob = new Blob(chunks, { type: finalType });
          const url = URL.createObjectURL(blob);
          resolve({ blob, url, durationSec });
        };
        recorder.stop();
      });
    },
  };
}
