import { useCallback, useEffect, useState } from 'react';
import { Icon } from '../components/Icons.js';
import { Progress } from '../components/Progress.js';
import type { SongJob, UrlDownload } from '../App.js';
import { cleanName } from '../App.js';
import type { LibrarySong } from '../../preload/preload.js';
import { sortStems, stemInfo } from '../lib/stems.js';

interface Props {
  jobs: Record<string, SongJob>;
  /** Download pelo link de um vídeo, em andamento. */
  download: UrlDownload | null;
  /** Música aberta agora (destacada). */
  currentId: string | null;
  onOpen(id: string, name: string): void;
  onImport(): void;
  /** Músicas excluídas (para fechar a que estiver aberta e tirar da fila). */
  onRemoved(ids: readonly string[]): void;
}

/** Cor de capa estável por música (matiz derivado do id). */
function coverOf(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 70% 56%)`;
}

function gb(bytes: number): string {
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1).replace('.', ',')} GB` : `${Math.round(bytes / 1024 ** 2)} MB`;
}

export function Library({ jobs, download, currentId, onOpen, onImport, onRemoved }: Props) {
  const [songs, setSongs] = useState<LibrarySong[] | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [covers, setCovers] = useState<Record<string, string>>({});
  /** Exclusão: confirmação de uma música, modo de seleção e quantas estão sendo apagadas. */
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirmMany, setConfirmMany] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** Coleções: lista, a escolhida no filtro (null = todas) e os campos de nome em edição. */
  const [collections, setCollections] = useState<string[]>([]);
  const [active, setActive] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem('bf-lib-collection') || null;
    } catch {
      return null;
    }
  });
  const [naming, setNaming] = useState<'new' | 'rename' | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [confirmDropColl, setConfirmDropColl] = useState(false);
  const [addMenu, setAddMenu] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  /** Faixas ainda em WAV (biblioteca de antes da compactação) e o progresso da compactação. */
  const [storage, setStorage] = useState<{ wavBytes: number; songs: number } | null>(null);
  const [compact, setCompact] = useState<{ done: number; total: number; freed: number; name?: string } | null>(null);
  useEffect(() => window.baixaria.onCompactProgress((p) => setCompact(p)), []);
  const refresh = useCallback(async () => {
    try {
      const [list, cols, st] = await Promise.all([window.baixaria.libraryList(), window.baixaria.libraryCollections(), window.baixaria.libraryStorage().catch(() => null)]);
      setCollections(cols);
      setSongs(list);
      setStorage(st);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'falha ao ler a biblioteca');
    }
  }, []);

  // Relê quando algum trabalho muda de estado (separação ou análise terminou).
  const jobKey = Object.entries(jobs)
    .map(([id, j]) => `${id}:${j.state}`)
    .join(',');
  useEffect(() => {
    void refresh();
  }, [refresh, jobKey]);

  // Miniaturas dos vídeos (lidas uma vez, como data: URL, pelo processo principal).
  useEffect(() => {
    for (const s of songs ?? []) {
      if (!s.cover || covers[s.id]) continue;
      void window.baixaria.libraryReadCover(s.id).then((url) => url && setCovers((c) => ({ ...c, [s.id]: url })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songs]);

  async function openOrigin(id: string) {
    try {
      await window.baixaria.libraryOpenOrigin(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'falha ao abrir a origem');
    }
  }

  useEffect(() => {
    try {
      if (active) window.localStorage.setItem('bf-lib-collection', active);
      else window.localStorage.removeItem('bf-lib-collection');
    } catch {
      /* sem persistência */
    }
  }, [active]);
  // A coleção escolhida pode ter sido excluída/renomeada.
  useEffect(() => {
    if (active && songs && !collections.includes(active)) setActive(null);
  }, [active, collections, songs]);

  async function collectionOp(op: 'create' | 'rename' | 'delete' | 'add' | 'remove', name: string, extra?: { to?: string; ids?: readonly string[] }, okMsg?: string) {
    setError(null);
    try {
      const cols = await window.baixaria.libraryCollectionOp(op, name, extra);
      setCollections(cols);
      if (okMsg) setNotice(okMsg);
      await refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'falha na coleção');
      return false;
    }
  }
  async function submitName() {
    const name = nameDraft.trim();
    if (!name) return setNaming(null);
    if (naming === 'new') {
      // Criada a partir da seleção: já põe as músicas escolhidas nela.
      const ids = selecting && selected.size ? [...selected] : undefined;
      if (await collectionOp(ids ? 'add' : 'create', name, ids ? { ids } : undefined, ids ? `${ids.length === 1 ? 'Música adicionada' : `${ids.length} músicas adicionadas`} a “${name}”.` : `Coleção “${name}” criada. Arraste músicas para ela.`)) {
        setActive(ids ? active : name);
        if (ids) (setSelecting(false), setSelected(new Set()));
      }
    } else if (naming === 'rename' && active && name !== active) {
      if (await collectionOp('rename', active, { to: name }, `Coleção renomeada para “${name}”.`)) setActive(name);
    }
    setNaming(null);
    setAddMenu(false);
  }
  const counts = new Map<string, number>();
  for (const s of songs ?? []) for (const c of s.collections ?? []) counts.set(c, (counts.get(c) ?? 0) + 1);

  const shown = (songs ?? []).filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase()) && (!active || (s.collections ?? []).includes(active)));
  // Separando ou analisando agora: não dá para excluir no meio (o processo está usando os arquivos).
  const busy = (id: string) => jobs[id]?.state === 'separating' || jobs[id]?.state === 'analyzing';

  async function removeSongs(ids: readonly string[]) {
    setRemoving(true);
    setError(null);
    const done: string[] = [];
    try {
      for (const id of ids) {
        if (busy(id)) continue;
        await window.baixaria.libraryRemove(id);
        done.push(id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'falha ao excluir');
    } finally {
      setRemoving(false);
      setConfirmId(null);
      setConfirmMany(false);
      setSelected(new Set());
      setSelecting(false);
      if (done.length) {
        onRemoved(done);
        setNotice(done.length === 1 ? 'Música excluída.' : `${done.length} músicas excluídas.`);
      }
      void refresh();
    }
  }
  function toggle(id: string) {
    setConfirmMany(false);
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  const selectable = shown.filter((s) => !busy(s.id));

  return (
    <section className="screen library">
      <header className="page-head row">
        <div>
          <h1>Biblioteca</h1>
          <p className="muted">Suas músicas, as faixas separadas e a análise ficam guardadas neste computador.</p>
        </div>
        <div className="spacer" />
        {songs && songs.length > 0 && (
          <input className="search" type="search" placeholder="Buscar música" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar música" />
        )}
        {songs && songs.length > 0 && !selecting && (
          <button className="ghost" onClick={() => (setSelecting(true), setConfirmId(null), setNotice(null))}>
            <Icon name="check" size={15} /> Selecionar
          </button>
        )}
        {!selecting && (
          <button className="primary" onClick={onImport}>
            <Icon name="import" size={16} /> Importar música
          </button>
        )}
      </header>

      {songs && songs.length > 0 && (
        <nav className="coll-bar" aria-label="Coleções">
          <button className={`coll-chip ${active === null ? 'on' : ''}`} aria-pressed={active === null} onClick={() => (setActive(null), setConfirmDropColl(false))}>
            Todas <span className="coll-n">{songs.length}</span>
          </button>
          {collections.map((c) => (
            <button
              key={c}
              className={`coll-chip ${active === c ? 'on' : ''} ${dropTarget === c ? 'drop' : ''}`}
              aria-pressed={active === c}
              onClick={() => (setActive(c), setConfirmDropColl(false), setNaming(null))}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes('application/x-bf-song')) {
                  e.preventDefault();
                  setDropTarget(c);
                }
              }}
              onDragLeave={() => setDropTarget((t) => (t === c ? null : t))}
              onDrop={(e) => {
                e.preventDefault();
                setDropTarget(null);
                const id = e.dataTransfer.getData('application/x-bf-song');
                const song = songs.find((s) => s.id === id);
                if (song) void collectionOp('add', c, { ids: [id] }, `“${cleanName(song.name)}” adicionada a “${c}”.`);
              }}
              title="Clique para filtrar; arraste músicas para cá"
            >
              <Icon name="library" size={12} /> {c} <span className="coll-n">{counts.get(c) ?? 0}</span>
            </button>
          ))}
          {naming ? (
            <form
              className="coll-name"
              onSubmit={(e) => {
                e.preventDefault();
                void submitName();
              }}
            >
              <input
                autoFocus
                value={nameDraft}
                maxLength={40}
                placeholder={naming === 'new' ? 'Nome da coleção (ex.: Queen, Rock 80)' : 'Novo nome'}
                aria-label={naming === 'new' ? 'Nome da nova coleção' : 'Novo nome da coleção'}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setNaming(null)}
              />
              <button className="primary small-btn" type="submit" disabled={!nameDraft.trim()}>
                {naming === 'new' ? 'Criar' : 'Renomear'}
              </button>
              <button className="ghost small-btn" type="button" onClick={() => setNaming(null)}>
                Cancelar
              </button>
            </form>
          ) : (
            <button className="coll-chip add" onClick={() => (setNaming('new'), setNameDraft(''))}>
              <Icon name="plus" size={12} /> Nova coleção
            </button>
          )}
          {active && !naming && (
            <span className="coll-actions">
              <button className="ghost small-btn" onClick={() => (setNaming('rename'), setNameDraft(active))}>
                Renomear
              </button>
              <button
                className={confirmDropColl ? 'danger small-btn' : 'ghost small-btn'}
                onClick={() => (confirmDropColl ? void collectionOp('delete', active, undefined, `Coleção “${active}” excluída. As músicas continuam na biblioteca.`).then(() => (setActive(null), setConfirmDropColl(false))) : setConfirmDropColl(true))}
                onBlur={() => setConfirmDropColl(false)}
                title="As músicas continuam na biblioteca"
              >
                {confirmDropColl ? 'Confirmar: excluir coleção' : 'Excluir coleção'}
              </button>
            </span>
          )}
        </nav>
      )}

      {selecting && (
        <div className="select-bar" role="toolbar" aria-label="Seleção de músicas">
          <b>{selected.size === 0 ? 'Escolha as músicas' : selected.size === 1 ? '1 selecionada' : `${selected.size} selecionadas`}</b>
          <button
            className="ghost small-btn"
            onClick={() => (setConfirmMany(false), setSelected(selected.size === selectable.length ? new Set() : new Set(selectable.map((s) => s.id))))}
            disabled={selectable.length === 0}
          >
            {selected.size === selectable.length && selectable.length > 0 ? 'Limpar seleção' : 'Selecionar todas'}
          </button>
          <span className="add-wrap">
            <button className="ghost small-btn" disabled={selected.size === 0} aria-expanded={addMenu} onClick={() => setAddMenu((m) => !m)}>
              <Icon name="library" size={14} /> Adicionar à coleção
            </button>
            {addMenu && selected.size > 0 && (
              <div className="add-menu" role="menu" aria-label="Escolha a coleção">
                {collections.map((c) => (
                  <button
                    key={c}
                    role="menuitem"
                    className="ghost"
                    onClick={() =>
                      void collectionOp('add', c, { ids: [...selected] }, `${selected.size === 1 ? 'Música adicionada' : `${selected.size} músicas adicionadas`} a “${c}”.`).then(
                        (ok) => ok && (setAddMenu(false), setSelecting(false), setSelected(new Set())),
                      )
                    }
                  >
                    {c}
                  </button>
                ))}
                <button role="menuitem" className="ghost" onClick={() => (setNaming('new'), setNameDraft(''), setAddMenu(false))}>
                  <Icon name="plus" size={12} /> Nova coleção…
                </button>
              </div>
            )}
          </span>
          {active && (
            <button
              className="ghost small-btn"
              disabled={selected.size === 0}
              onClick={() =>
                void collectionOp('remove', active, { ids: [...selected] }, `${selected.size === 1 ? 'Música tirada' : `${selected.size} músicas tiradas`} de “${active}”.`).then(
                  (ok) => ok && (setSelecting(false), setSelected(new Set())),
                )
              }
            >
              Tirar de “{active}”
            </button>
          )}
          <div className="spacer" />
          {confirmMany && <span className="small muted">Apaga as faixas, a análise e o mapa. Arquivos originais no seu computador ficam.</span>}
          <button className={confirmMany ? 'danger' : 'ghost danger-ghost'} disabled={selected.size === 0 || removing} onClick={() => (confirmMany ? void removeSongs([...selected]) : setConfirmMany(true))}>
            {removing ? <span className="spin" aria-hidden="true" /> : <Icon name="trash" size={15} />}
            {confirmMany ? ` Confirmar: excluir ${selected.size}` : ` Excluir${selected.size ? ` (${selected.size})` : ''}`}
          </button>
          <button className="ghost" onClick={() => (setSelecting(false), setSelected(new Set()), setConfirmMany(false))}>
            Cancelar
          </button>
        </div>
      )}
      {compact && compact.done < compact.total ? (
        <div className="compact-line" role="status">
          <Progress
            value={compact.total ? compact.done / compact.total : null}
            label={`Compactando ${compact.done + 1} de ${compact.total}${compact.name ? `: ${cleanName(compact.name)}` : ''}`}
          />
        </div>
      ) : (
        storage &&
        storage.wavBytes > 200 * 1024 ** 2 && (
          <p className="info-line compact-line" role="status">
            <Icon name="library" size={16} /> As faixas de {storage.songs === 1 ? '1 música' : `${storage.songs} músicas`} estão em WAV e ocupam {gb(storage.wavBytes)}. Em FLAC (sem perda de
            qualidade) ocupam cerca de um terço.
            <button
              className="ghost small-btn"
              disabled={Object.values(jobs).some((j) => j.state === 'separating' || j.state === 'analyzing')}
              title="Converte as faixas de todas as músicas. Leva alguns segundos por música; dá para usar o app enquanto isso."
              onClick={async () => {
                setError(null);
                setCompact({ done: 0, total: storage.songs, freed: 0 });
                try {
                  const r = await window.baixaria.libraryCompact();
                  setNotice(`Faixas compactadas em FLAC: ${gb(r.freed)} liberados.`);
                } catch (e) {
                  setError(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : 'falha ao compactar');
                } finally {
                  setCompact(null);
                  await refresh();
                }
              }}
            >
              Compactar agora
            </button>
          </p>
        )
      )}
      {notice && !error && (
        <p className="ok-line" role="status">
          <Icon name="check" size={16} /> {notice}
        </p>
      )}

      {error && (
        <p className="alert" role="alert">
          <Icon name="alert" size={16} /> {error}
        </p>
      )}
      {songs === null && <p className="muted">Carregando…</p>}
      {songs !== null && songs.length === 0 && (
        <button className="import-drop" onClick={onImport}>
          <Icon name="library" size={30} />
          <strong>Nenhuma música ainda</strong>
          <span className="muted small">Importe um MP3, WAV ou FLAC, ou o link de um vídeo, para separar as faixas e tocar junto.</span>
        </button>
      )}

      {(shown.length > 0 || (download && !download.error)) && (
        <div className="lib-grid">
          {download && !download.error && (
            <div className="lib-item">
              <div className="lib-card downloading" aria-label={`Baixando ${download.title}`}>
                <span className="lib-art" aria-hidden="true" style={{ ['--cover' as string]: 'var(--accent)' }}>
                  <Icon name="link" size={22} />
                </span>
                <span className="lib-text">
                  <strong title={download.title}>{download.title}</strong>
                  <span className="lib-meta">
                    <span>do link de vídeo</span>
                  </span>
                </span>
                <span className="lib-progress">
                  <Progress value={download.phase === 'convert' || download.percent === null ? null : download.percent / 100} label={download.phase === 'convert' ? 'Convertendo' : 'Baixando'} />
                </span>
              </div>
            </div>
          )}
          {shown.map((song) => {
            const job = jobs[song.id];
            const separated = !!song.stems && song.stems.length > 0;
            const origin = song.origin?.kind === 'url' ? song.origin : null;
            const cover = covers[song.id];
            const isSel = selected.has(song.id);
            return (
              <div className={`lib-item ${selecting ? 'selecting' : ''} ${isSel ? 'selected' : ''}`} key={song.id}>
              <button
                className={`lib-card ${song.id === currentId ? 'current' : ''}`}
                style={{ ['--cover' as string]: coverOf(song.id) }}
                draggable={!selecting}
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/x-bf-song', song.id);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                title={song.collections?.length ? `Coleções: ${song.collections.join(', ')}` : undefined}
                onClick={() => (selecting ? !busy(song.id) && toggle(song.id) : onOpen(song.id, song.name))}
                aria-current={song.id === currentId ? 'true' : undefined}
                {...(selecting ? { role: 'checkbox', 'aria-checked': isSel, 'aria-label': `Selecionar ${cleanName(song.name)}`, 'aria-disabled': busy(song.id) } : {})}
              >
                {selecting && (
                  <span className={`lib-check ${isSel ? 'on' : ''}`} aria-hidden="true">
                    <Icon name="check" size={12} />
                  </span>
                )}
                <span className={`lib-art ${cover ? 'has-cover' : ''}`} aria-hidden="true" style={cover ? { backgroundImage: `url("${cover}")` } : undefined}>
                  {!cover && <Icon name={origin ? 'link' : 'wave'} size={22} />}
                </span>
                <span className="lib-text">
                  <strong title={song.name}>{cleanName(song.name)}</strong>
                  <span className="lib-meta">
                    {song.meta?.key && <span>{song.meta.key}</span>}
                    {song.meta?.bpmRange ? (
                      <span title="Andamento variável (gravação ao vivo)">
                        {Math.round(song.meta.bpmRange[0])}–{Math.round(song.meta.bpmRange[1])} BPM
                      </span>
                    ) : (
                      song.meta?.bpm && <span>{Math.round(song.meta.bpm)} BPM</span>
                    )}
                    {!separated && !job && <span className="warn">não separada</span>}
                  </span>
                </span>
                {job && (job.state === 'separating' || job.state === 'analyzing') && (
                  <span className="lib-progress">
                    <Progress value={job.percent / 100} label={job.state === 'separating' ? (job.phase ?? 'Separando') : 'Analisando'} />
                  </span>
                )}
                {job?.state === 'queued' && <span className="muted small">Na fila…</span>}
                {job?.state === 'error' && <span className="alert small">{job.message}</span>}
                {separated && (
                  <span className="lib-stems">
                    {sortStems(song.stems!).map((k) => (
                      <span key={k} className={`stem-dot stem-${k}`} title={stemInfo(k).label} />
                    ))}
                  </span>
                )}
              </button>
              {!selecting && confirmId !== song.id && (
                <button
                  className="lib-del icon-btn ghost"
                  onClick={() => (setConfirmId(song.id), setNotice(null))}
                  disabled={busy(song.id)}
                  aria-label={`Excluir ${cleanName(song.name)}`}
                  title={busy(song.id) ? 'Aguarde a separação/análise terminar para excluir' : 'Excluir da biblioteca'}
                >
                  <Icon name="trash" size={14} />
                </button>
              )}
              {confirmId === song.id && (
                <div className="lib-confirm" role="alertdialog" aria-label={`Excluir ${cleanName(song.name)}?`}>
                  <b>Excluir esta música?</b>
                  <span className="small muted">
                    Apaga as faixas separadas, a análise e o mapa{origin ? ', e o áudio baixado do link' : '. O arquivo original no seu computador fica'}.
                  </span>
                  <div className="lib-confirm-actions">
                    <button className="ghost small-btn" onClick={() => setConfirmId(null)} autoFocus>
                      Cancelar
                    </button>
                    <button className="danger small-btn" disabled={removing} onClick={() => void removeSongs([song.id])}>
                      {removing ? <span className="spin" aria-hidden="true" /> : <Icon name="trash" size={13} />} Excluir
                    </button>
                  </div>
                </div>
              )}
              {origin && !selecting && (
                <button
                  className="lib-origin origin-badge"
                  onClick={() => void openOrigin(song.id)}
                  aria-label={`Abrir origem em ${origin.site}`}
                  title={`Baixada de ${origin.url} em ${new Date(origin.downloadedAt).toLocaleDateString('pt-BR')}. Clique para abrir no navegador.`}
                >
                  <Icon name="external" size={12} /> {origin.site}
                </button>
              )}
              </div>
            );
          })}
        </div>
      )}
      {songs !== null && songs.length > 0 && shown.length === 0 && (
        <p className="muted">
          {active && !query.trim() ? `A coleção “${active}” está vazia. Arraste músicas para ela, ou use Selecionar → Adicionar à coleção.` : `Nenhuma música com “${query}”${active ? ` em “${active}”` : ''}.`}
        </p>
      )}
    </section>
  );
}
