import { useEffect, useRef, useState } from 'react';
import introUrl from '../../../assets/stage-intro.mp4';
import loopUrl from '../../../assets/stage-loop.mp4';
import posterUrl from '../../../assets/stage-loop-poster.jpg';

/**
 * Vídeo de fundo do palco do desafio (desktop e tablet na horizontal).
 *  - abertura (0–10 s do vídeo original, com som): toca antes das notas começarem; `onIntroEnd` libera o desafio;
 *  - loop (11–20 s, sem som): repete atrás da esteira enquanto o desafio roda; o som é o do exercício.
 * Com "reduzir animações" no sistema, mostra um quadro parado e pula a abertura.
 */
export const STAGE_VIDEO_QUERY = '(orientation: landscape) and (min-height: 600px)';
const REDUCED_QUERY = '(prefers-reduced-motion: reduce)';

function useMedia(query: string): boolean {
  const [on, setOn] = useState(() => typeof matchMedia === 'function' && matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const fn = () => setOn(mq.matches);
    fn();
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, [query]);
  return on;
}

/** O vídeo vale para esta tela? (horizontal e com altura de tablet ou desktop). */
export function useStageVideo(): { enabled: boolean; reduced: boolean } {
  return { enabled: useMedia(STAGE_VIDEO_QUERY), reduced: useMedia(REDUCED_QUERY) };
}

interface Props {
  intro: boolean;
  reduced: boolean;
  onIntroEnd(): void;
}

/**
 * Toca a abertura DENTRO do clique em "Começar" (gesto do usuário): no Android o WebView bloqueia o som
 * de um vídeo iniciado depois, fora do clique. Retorna false se não deu para tocar (aí o desafio começa já).
 */
export function playStageIntro(): Promise<boolean> {
  const v = document.querySelector<HTMLVideoElement>('.stage-video-intro');
  if (!v) return Promise.resolve(false);
  v.currentTime = 0;
  return v.play().then(
    () => true,
    () => {
      v.muted = true;
      return v.play().then(
        () => true,
        () => false,
      );
    },
  );
}

export function StageVideo({ intro, reduced, onIntroEnd }: Props) {
  const introRef = useRef<HTMLVideoElement>(null);
  const loopRef = useRef<HTMLVideoElement>(null);
  const done = useRef(onIntroEnd);
  done.current = onIntroEnd;

  // Abertura com movimento reduzido: pula direto (sem vídeo).
  useEffect(() => {
    if (intro && reduced) done.current();
  }, [intro, reduced]);

  // Loop: só roda fora da abertura (economiza decodificação).
  useEffect(() => {
    const v = loopRef.current;
    if (!v || reduced) return;
    if (intro) v.pause();
    else void v.play().catch(() => undefined);
  }, [intro, reduced]);

  return (
    <div className="stage-video" aria-hidden="true">
      {reduced ? (
        <img src={posterUrl} alt="" />
      ) : (
        <>
          <video ref={loopRef} src={loopUrl} poster={posterUrl} muted loop playsInline preload="auto" />
          {/* Sempre montado (oculto fora da abertura) para o clique poder tocá-lo. */}
          <video
            ref={introRef}
            className={`stage-video-intro${intro ? '' : ' stage-video-idle'}`}
            src={introUrl}
            playsInline
            preload="auto"
            onEnded={() => done.current()}
            onError={() => done.current()}
          />
        </>
      )}
    </div>
  );
}
