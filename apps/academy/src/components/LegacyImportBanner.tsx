import { useEffect, useState } from 'react';
import { errorText } from '@baixaria/ui-core';
import { platform } from '../platform/bridge.js';

/**
 * Oferta única de trazer o progresso do mixerCraft antigo (músicos, XP, missões, conquistas, trilhas).
 * Só aparece no desktop, enquanto houver o banco antigo e o aluno não tiver decidido. Importar COPIA
 * o arquivo (o original fica onde está) e faz backup do banco atual do Academy antes.
 */
export function LegacyImportBanner() {
  const legacy = platform().legacy;
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void legacy?.available().then((ok) => alive && setVisible(ok)).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [legacy]);

  if (!legacy || !visible) return null;

  async function importNow() {
    setBusy(true);
    setError(null);
    try {
      await legacy!.importNow();
      window.location.reload();
    } catch (e) {
      setError(errorText(e, 'não foi possível importar'));
      setBusy(false);
    }
  }

  async function dismiss() {
    setBusy(true);
    try {
      await legacy!.dismiss();
      setVisible(false);
    } catch (e) {
      setError(errorText(e, 'falha'));
      setBusy(false);
    }
  }

  return (
    <section className="card legacy-import" role="region" aria-label="Importar progresso do mixerCraft" style={{ margin: '12px clamp(16px, 3vw, 44px) 0', padding: 16, display: 'grid', gap: 10 }}>
      <strong>Trazer seu progresso do mixerCraft?</strong>
      <span className="muted small">
        Encontramos os músicos, o XP, as missões e as conquistas da versão anterior neste computador. Importar copia esses dados para o Academy; o arquivo
        original não é alterado e o progresso atual do Academy fica guardado em backup.
      </span>
      {error && (
        <span className="small" role="alert">
          {error}
        </span>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="primary" disabled={busy} onClick={() => void importNow()}>
          Importar progresso
        </button>
        <button className="ghost" disabled={busy} onClick={() => void dismiss()}>
          Agora não
        </button>
      </div>
    </section>
  );
}
