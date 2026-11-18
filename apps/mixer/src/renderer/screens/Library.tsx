import { useCallback, useEffect, useState } from 'react';
import { errorText } from '@baixaria/ui-core';
import { Icon } from '@baixaria/ui-core';
import { Progress } from '@baixaria/ui-core';
import type { SongJob, UrlDownload } from '../App.js';
import { cleanName } from '../App.js';
import type { LibrarySong } from '../../preload/preload.js';
import { sortStems, stemInfo } from '../lib/stems.js';
import { readStore, writeStore } from '@baixaria/ui-core';

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

/** Filtro especial da barra de coleções: músicas que ainda não estão em nenhuma coleção. */
const NO_COLLECTION = '\u0000sem-coleção';

type SortBy = 'recent' | 'name' | 'key' | 'bpm';
type Status = 'all' | 'ready' | 'pending';
const SORTS: ReadonlyArray<{ id: SortBy; label: string }> = [
  { id: 'recent', label: 'Mais recentes' },
  { id: 'name', label: 'Nome (A–Z)' },
  { id: 'key', label: 'Tom' },
  { id: 'bpm', label: 'Andamento' },
];
const STATUSES: ReadonlyArray<{ id: Status; label: string }> = [
  { id: 'all', label: 'Todas' },
  { id: 'ready', label: 'Prontas para tocar' },
  { id: 'pending', label: 'Ainda não separadas' },
];

/** Ordena a lista sem mudar o original. Sem dado (tom ou andamento), a música vai para o fim. */
export function sortSongs(list: readonly LibrarySong[], by: SortBy): LibrarySong[] {
  const name = (s: LibrarySong) => cleanName(s.name).toLocaleLowerCase('pt-BR');
  const byName = (a: LibrarySong, b: LibrarySong) => name(a).localeCompare(name(b), 'pt-BR');
  const bpm = (s: LibrarySong) => s.meta?.bpm ?? s.meta?.bpmRange?.[0] ?? Infinity;
  const out = [...list];
  if (by === 'name') return out.sort(byName);
  if (by === 'key') return out.sort((a, b) => (a.meta?.key ?? '\uffff').localeCompare(b.meta?.key ?? '\uffff', 'pt-BR') || byName(a, b));
  if (by === 'bpm') return out.sort((a, b) => bpm(a) - bpm(b) || byName(a, b));
  // Recentes: pela data de entrada; sem data, vale a ordem do índice (as mais novas no fim dele).
  return out
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (b.s.addedAt ?? '').localeCompare(a.s.addedAt ?? '') || b.i - a.i)
    .map((x) => x.s);
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
  /** Ordem e filtro de estado, guardados entre as sessões. */
  const [view, setView] = useState<{ sort: SortBy; status: Status }>(() => readStore('bf-lib-view', { sort: 'recent' as SortBy, status: 'all' as Status }));
  useEffect(() => writeStore('bf-lib-view', view), [view]);

  /** Exportar / reimportar a biblioteca: painel aberto, opções, progresso e se há pasta para abrir. */
  const [transferOpen, setTransferOpen] = useState(false);
  const [xferOpts, setXferOpts] = useState(() => readStore('bf-lib-export', { original: false, onlyCollection: false }));
  useEffect(() => writeStore('bf-lib-export', xferOpts), [xferOpts]);
  const [transfer, setTransfer] = useState<{ phase: 'export' | 'import'; done: number; total: number; name?: string } | null>(null);
  const [exported, setExported] = useState(false);
  useEffect(() => window.baixaria.onTransferProgress((p) => setTransfer(p)), []);
  const anyJob = Object.values(jobs).some((j) => j.state === 'separating' || j.state === 'analyzing');

  async function exportSongs(ids?: readonly string[], collection?: string) {
    setError(null);
    setNotice(null);
    setExported(false);
    try {
      setTransfer({ phase: 'export', done: 0, total: ids?.length ?? songs?.length ?? 0 });
      const r = await window.baixaria.libraryExport({ includeOriginal: xferOpts.original, ...(ids ? { ids } : {}), ...(collection ? { collection } : {}) });
      if (r.canceled) return;
      const mb = r.bytes / 1024 ** 2;
      const size = mb >= 1024 ? `${(mb / 1024).toFixed(1).replace('.', ',')} GB` : `${Math.max(1, Math.round(mb))} MB`;
      setNotice(
        `Biblioteca exportada: ${r.songs} ${r.songs === 1 ? 'música' : 'músicas'}, ${r.stems} faixas (${size}).${r.skipped.length ? ` Sem faixas para exportar: ${r.skipped.map(cleanName).join(', ')}.` : ''}`,
      );
      setExported(true);
    } catch (e) {
      setError(errorText(e, 'falha ao exportar a biblioteca'));
    } finally {
      setTransfer(null);
    }
  }

  /** Pasta onde a biblioteca é montada (escolhida pelo usuário). */
  const [location, setLocation] = useState<{ root: string; chosen: boolean } | null>(null);
  useEffect(() => {
    void window.baixaria
      .libraryLocation()
      .then(setLocation)
      .catch(() => undefined);
  }, []);
  async function chooseLocation(keep = false) {
    setError(null);
    setNotice(null);
    try {
      const r = await window.baixaria.libraryChooseLocation({ keep });
      if (r.canceled) return;
      setLocation({ root: r.root, chosen: true });
      setNotice(
        keep
          ? `A biblioteca fica em ${r.root}.`
          : r.opened
            ? `Biblioteca aberta de ${r.root}.`
            : `A biblioteca agora fica em ${r.root}${r.copied ? ` (${r.copied} ${r.copied === 1 ? 'música copiada' : 'músicas copiadas'}; a pasta antiga continua onde estava)` : ''}.`,
      );
      await refresh();
    } catch (e) {
      setError(errorText(e, 'falha ao mudar a pasta da biblioteca'));
    }
  }

  async function importSongs() {
    setError(null);
    setNotice(null);
    setExported(false);
    try {
      setTransfer({ phase: 'import', done: 0, total: 0 });
      const r = await window.baixaria.libraryImport();
      if (r.canceled) return;
      const parts = [
        `${r.added} ${r.added === 1 ? 'música importada' : 'músicas importadas'}`,
        r.existing.length ? `${r.existing.length} já ${r.existing.length === 1 ? 'estava' : 'estavam'} na biblioteca` : '',
        r.failed.length ? `não deu para trazer: ${r.failed.map(cleanName).join(', ')}` : '',
      ].filter(Boolean);
      setNotice(`Biblioteca importada: ${parts.join('; ')}.`);
      await refresh();
    } catch (e) {
      setError(errorText(e, 'falha ao importar a biblioteca'));
    } finally {
      setTransfer(null);
    }
  }

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
      setError(errorText(e, 'falha ao ler a biblioteca'));
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
      setError(errorText(e, 'falha ao abrir a origem'));
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
    if (active && active !== NO_COLLECTION && songs && !collections.includes(active)) setActive(null);
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
      setError(errorText(e, 'falha na coleção'));
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
    } else if (naming === 'rename' && active && active !== NO_COLLECTION && name !== active) {
      if (await collectionOp('rename', active, { to: name }, `Coleção renomeada para “${name}”.`)) setActive(name);
    }
    setNaming(null);
    setAddMenu(false);
  }
  const counts = new Map<string, number>();
  for (const s of songs ?? []) for (const c of s.collections ?? []) counts.set(c, (counts.get(c) ?? 0) + 1);

  const uncollected = (songs ?? []).filter((s) => !s.collections?.length).length;
  const inActive = (s: LibrarySong) => !active || (active === NO_COLLECTION ? !s.collections?.length : (s.collections ?? []).includes(active));
  const ready = (s: LibrarySong) => !!s.stems && s.stems.length > 0;
  const inStatus = (s: LibrarySong) => view.status === 'all' || (view.status === 'ready' ? ready(s) : !ready(s));
  const q = query.trim().toLocaleLowerCase('pt-BR');
  const shown = sortSongs(
    (songs ?? []).filter((s) => s.name.toLocaleLowerCase('pt-BR').includes(q) && inActive(s) && inStatus(s)),
    view.sort,
  );
  // Coleção de verdade escolhida (o filtro "Sem coleção" não se renomeia nem se exclui).
  const realActive = active && active !== NO_COLLECTION ? active : null;
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
      setError(errorText(e, 'falha ao excluir'));
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
          <button className={transferOpen ? 'ghost on' : 'ghost'} onClick={() => setTransferOpen((o) => !o)} aria-expanded={transferOpen} title="Salvar as músicas separadas por faixas no computador, ou trazer de volta uma biblioteca salva">
            <Icon name="export" size={15} /> Exportar / importar
          </button>
        )}
        {!selecting && (
          <button className="primary" onClick={onImport}>
            <Icon name="import" size={16} /> Importar música
          </button>
        )}
      </header>

      {location && !location.chosen && (
        <div className="card location-ask" role="region" aria-label="Pasta da biblioteca">
          <Icon name="library" size={22} />
          <div>
            <b>Onde montar sua biblioteca?</b>
            <p className="muted small">
              Escolha uma pasta do seu computador (ou de um disco externo). Cada música importada é guardada nela, com o áudio, as faixas separadas e a análise: a
              biblioteca fica sempre montada e pronta. Agora ela está em {location.root}.
            </p>
          </div>
          <div className="spacer" />
          <button className="primary small-btn" onClick={() => void chooseLocation()}>
            Escolher a pasta
          </button>
          <button className="ghost small-btn" onClick={() => void chooseLocation(true)}>
            Manter onde está
          </button>
        </div>
      )}
      {transferOpen && (
        <div className="card transfer-panel" role="region" aria-label="Exportar e importar a biblioteca">
          <section className="loc-sec">
            <h2>Pasta da biblioteca</h2>
            <p className="muted small">
              Tudo fica em <b className="loc-path">{location?.root ?? '…'}</b>. Ao escolher outra pasta, a biblioteca é copiada para lá; se a pasta já tiver uma biblioteca do
              MixerMonster, ela é aberta.
            </p>
            <div className="loc-acts">
              <button className="ghost small-btn" disabled={!!transfer || anyJob} onClick={() => void chooseLocation()}>
                <Icon name="library" size={14} /> Escolher outra pasta
              </button>
              <button className="ghost small-btn" onClick={() => void window.baixaria.libraryOpenLocation().catch(() => undefined)}>
                <Icon name="external" size={14} /> Abrir a pasta
              </button>
            </div>
          </section>
          <section>
            <h2>Exportar a biblioteca</h2>
            <p className="muted small">
              Cada música vira uma pasta com as faixas separadas (Baixo, Bateria, Voz…) em arquivos de áudio, a análise, o mapa e as coleções. Fica no seu computador e
              abre em qualquer programa de música.
            </p>
            <label className="check">
              <input type="checkbox" checked={xferOpts.original} onChange={() => setXferOpts((o) => ({ ...o, original: !o.original }))} /> Incluir o áudio original de cada música (a pasta fica maior)
            </label>
            {realActive && (
              <label className="check">
                <input type="checkbox" checked={xferOpts.onlyCollection} onChange={() => setXferOpts((o) => ({ ...o, onlyCollection: !o.onlyCollection }))} /> Só a coleção “{realActive}” ({counts.get(realActive) ?? 0})
              </label>
            )}
            <button
              className="primary small-btn"
              disabled={!!transfer || anyJob || !songs?.length}
              title={anyJob ? 'Espere a separação ou a análise terminar' : undefined}
              onClick={() => void exportSongs(realActive && xferOpts.onlyCollection ? (songs ?? []).filter((x) => x.collections?.includes(realActive)).map((x) => x.id) : undefined, realActive && xferOpts.onlyCollection ? realActive : undefined)}
            >
              <Icon name="export" size={14} /> Escolher a pasta e exportar
            </button>
          </section>
          <section>
            <h2>Importar uma biblioteca</h2>
            <p className="muted small">
              Escolha a pasta de uma biblioteca exportada (a que tem o arquivo biblioteca.json). As músicas novas entram com as faixas, a análise e o mapa; as que já estão aqui
              ficam como estão.
            </p>
            <button className="ghost small-btn" disabled={!!transfer || anyJob} onClick={() => void importSongs()}>
              <Icon name="import" size={14} /> Escolher a pasta e importar
            </button>
          </section>
        </div>
      )}
      {transfer && (
        <div className="compact-line" role="status">
          <Progress
            value={transfer.total ? transfer.done / transfer.total : null}
            label={
              transfer.total
                ? `${transfer.phase === 'export' ? 'Exportando' : 'Importando'} ${Math.min(transfer.done + 1, transfer.total)} de ${transfer.total}${transfer.name ? `: ${cleanName(transfer.name)}` : ''}`
                : transfer.phase === 'export'
                  ? 'Escolha a pasta onde salvar…'
                  : 'Escolha a pasta da biblioteca exportada…'
            }
          />
        </div>
      )}

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
          {collections.length > 0 && uncollected > 0 && (
            <button
              className={`coll-chip ${active === NO_COLLECTION ? 'on' : ''}`}
              aria-pressed={active === NO_COLLECTION}
              onClick={() => (setActive(NO_COLLECTION), setConfirmDropColl(false), setNaming(null))}
              title="Músicas que ainda não estão em nenhuma coleção"
            >
              Sem coleção <span className="coll-n">{uncollected}</span>
            </button>
          )}
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
          {realActive && !naming && (
            <span className="coll-actions">
              <button className="ghost small-btn" onClick={() => (setNaming('rename'), setNameDraft(realActive))}>
                Renomear
              </button>
              <button
                className={confirmDropColl ? 'danger small-btn' : 'ghost small-btn'}
                onClick={() => (confirmDropColl ? void collectionOp('delete', realActive, undefined, `Coleção “${realActive}” excluída. As músicas continuam na biblioteca.`).then(() => (setActive(null), setConfirmDropColl(false))) : setConfirmDropColl(true))}
                onBlur={() => setConfirmDropColl(false)}
                title="As músicas continuam na biblioteca"
              >
                {confirmDropColl ? 'Confirmar: excluir coleção' : 'Excluir coleção'}
              </button>
            </span>
          )}
        </nav>
      )}

      {songs && songs.length > 0 && (
        <div className="lib-tools" role="toolbar" aria-label="Organizar a lista">
          <span className="muted small">
            {shown.length === songs.length ? `${songs.length} ${songs.length === 1 ? 'música' : 'músicas'}` : `${shown.length} de ${songs.length} músicas`}
          </span>
          <div className="spacer" />
          <label className="lib-select">
            <span>Mostrar</span>
            <select value={view.status} onChange={(e) => setView((v) => ({ ...v, status: e.target.value as Status }))}>
              {STATUSES.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          <label className="lib-select">
            <span>Ordenar</span>
            <select value={view.sort} onChange={(e) => setView((v) => ({ ...v, sort: e.target.value as SortBy }))}>
              {SORTS.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
        </div>
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
          {realActive && (
            <button
              className="ghost small-btn"
              disabled={selected.size === 0}
              onClick={() =>
                void collectionOp('remove', realActive, { ids: [...selected] }, `${selected.size === 1 ? 'Música tirada' : `${selected.size} músicas tiradas`} de “${realActive}”.`).then(
                  (ok) => ok && (setSelecting(false), setSelected(new Set())),
                )
              }
            >
              Tirar de “{realActive}”
            </button>
          )}
          <button className="ghost small-btn" disabled={selected.size === 0 || !!transfer || anyJob} onClick={() => void exportSongs([...selected]).then(() => (setSelecting(false), setSelected(new Set())))}>
            <Icon name="export" size={14} /> Exportar{selected.size ? ` (${selected.size})` : ''}
          </button>
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
                  setError(errorText(e, 'falha ao compactar'));
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
          {exported && (
            <button className="ghost small-btn" onClick={() => void window.baixaria.libraryShowExport().catch(() => undefined)}>
              Abrir a pasta
            </button>
          )}
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
          {view.status !== 'all' && !query.trim()
            ? `Nenhuma música ${view.status === 'ready' ? 'pronta para tocar' : 'por separar'} aqui.`
            : realActive && !query.trim()
              ? `A coleção “${realActive}” está vazia. Arraste músicas para ela, ou use Selecionar → Adicionar à coleção.`
              : `Nenhuma música${query.trim() ? ` com “${query}”` : ''}${realActive ? ` em “${realActive}”` : active === NO_COLLECTION ? ' sem coleção' : ''}.`}
        </p>
      )}
    </section>
  );
}
