import { beforeEach, describe, expect, it } from 'vitest';
import { DB_NAME, DB_VERSION, getDb } from '../src/store/db';
import { emptyEntry, getAllEntries, getEntry, isEmptyEntry, saveEntry } from '../src/store/library';
import { getSettings, needsSetup, saveSettings } from '../src/store/settings';
import { createTag, deleteTag, ensureInitialTags, listTags, renameTag, tagCounts } from '../src/store/tags';
import { freshDb } from './helpers';

beforeEach(freshDb);

describe('database (the schema floor)', () => {
  it('is version 1 and has every store of spec §5', async () => {
    const db = await getDb();
    expect(db.name).toBe(DB_NAME);
    expect(db.version).toBe(DB_VERSION);
    expect(DB_VERSION).toBe(1);
    expect([...db.objectStoreNames].sort()).toEqual(['alerts', 'cache', 'library', 'settings', 'snapshots', 'tags', 'titles']);
  });
});

describe('settings', () => {
  it('starts in first-run mode and leaves it once a token is saved', async () => {
    const initial = await getSettings();
    expect(needsSetup(initial)).toBe(true);
    expect(initial).toMatchObject({ region: 'ES', language: 'es-ES', platforms: [] });
    await saveSettings({ tmdbToken: ' tok ' });
    expect(needsSetup(await getSettings())).toBe(false);
  });

  it('keeps earlier values when saving a patch', async () => {
    await saveSettings({ tmdbToken: 'a', omdbKey: 'b' });
    await saveSettings({ platforms: [{ id: 1, name: 'X' }] });
    expect(await getSettings()).toMatchObject({ tmdbToken: 'a', omdbKey: 'b', platforms: [{ id: 1, name: 'X' }] });
  });
});

describe('tags', () => {
  it('creates the initial set once', async () => {
    await ensureInitialTags();
    await ensureInitialTags();
    const tags = await listTags();
    expect(tags).toHaveLength(11);
    expect(tags.filter((t) => t.group === 'momento').map((t) => t.name)).toEqual(['Noche', 'Entre semana', 'Para dormirme']);
    expect(tags.find((t) => t.group === 'origen')?.name).toBe('Española');
  });

  it('rejects empty and duplicate names', async () => {
    await ensureInitialTags();
    expect(await createTag('   ', 'libre')).toEqual({ ok: false, reason: 'empty' });
    expect(await createTag('noche', 'momento')).toEqual({ ok: false, reason: 'duplicate' });
    expect((await createTag('Navidad', 'libre')).ok).toBe(true);
  });

  it('renaming re-points the titles that carry the tag', async () => {
    await ensureInitialTags();
    await saveEntry({ ...emptyEntry('movie:1', 'movie'), tagIds: ['estilo:policiaca'] });
    const renamed = await renameTag('estilo:policiaca', 'Policiaco');
    expect(renamed.ok).toBe(true);
    expect((await getEntry('movie:1'))?.tagIds).toEqual(['estilo:policiaco']);
    expect((await listTags()).some((t) => t.id === 'estilo:policiaca')).toBe(false);
  });

  it('deleting removes the tag from titles and drops titles left with nothing', async () => {
    await ensureInitialTags();
    await saveEntry({ ...emptyEntry('movie:1', 'movie'), tagIds: ['estilo:accion'] });
    await saveEntry({ ...emptyEntry('movie:2', 'movie'), tagIds: ['estilo:accion'], myScore: 8 });
    expect((await tagCounts())['estilo:accion']).toBe(2);
    await deleteTag('estilo:accion');
    expect(await getEntry('movie:1')).toBeUndefined();
    expect((await getEntry('movie:2'))?.tagIds).toEqual([]);
    expect(await getAllEntries()).toHaveLength(1);
  });
});

describe('library entries', () => {
  it('an entry with nothing in it is deleted when saved', async () => {
    const entry = { ...emptyEntry('tv:1', 'tv'), inWatchlist: true };
    await saveEntry(entry);
    expect(await getEntry('tv:1')).toBeDefined();
    await saveEntry({ ...entry, inWatchlist: false });
    expect(await getEntry('tv:1')).toBeUndefined();
  });

  it('counts watched episodes, an empty season list is not content', () => {
    const base = emptyEntry('tv:1', 'tv');
    expect(isEmptyEntry({ ...base, seenEpisodes: { '1': [] } })).toBe(true);
    expect(isEmptyEntry({ ...base, seenEpisodes: { '1': [1] } })).toBe(false);
  });
});
