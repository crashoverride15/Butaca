import { getDb } from './db';
import { isEmptyEntry } from './library';
import type { Tag, TagGroup } from './types';

// Tags — spec §5. Initial set is created on first run.

const INITIAL: { name: string; group: TagGroup }[] = [
  { name: 'Noche', group: 'momento' },
  { name: 'Maratón', group: 'momento' },
  { name: 'Random', group: 'momento' },
  { name: 'Entre semana', group: 'momento' },
  { name: 'Para dormirme', group: 'momento' },
  { name: 'Policíaca', group: 'estilo' },
  { name: 'Acción', group: 'estilo' },
  { name: 'Thriller', group: 'estilo' },
  { name: 'Comedia', group: 'estilo' },
  { name: 'Misterio', group: 'estilo' },
  { name: 'Investigación', group: 'estilo' },
  { name: 'Procedimental', group: 'estilo' },
  { name: 'Española', group: 'origen' },
];

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export const tagId = (group: TagGroup, name: string) => `${group}:${slug(name)}`;

// Moment tags added after the first release: existing installs get them once (a deleted one stays deleted).
const ADDED_LATER = ['Maratón', 'Random'];
const ADDED_LATER_FLAG = 'butaca.tags.maraton-random';

async function topUpLaterTags(): Promise<void> {
  try {
    if (localStorage.getItem(ADDED_LATER_FLAG)) return;
    localStorage.setItem(ADDED_LATER_FLAG, '1');
  } catch {
    return;
  }
  const db = await getDb();
  const all = await db.getAll('tags');
  let order = all.reduce((m, t) => Math.max(m, t.order), -1) + 1;
  for (const name of ADDED_LATER) {
    const id = tagId('momento', name);
    if (!all.some((t) => t.id === id)) await db.put('tags', { id, name, group: 'momento', order: order++ });
  }
}

export async function ensureInitialTags(): Promise<void> {
  const db = await getDb();
  if ((await db.count('tags')) > 0) return topUpLaterTags();
  const tx = db.transaction('tags', 'readwrite');
  INITIAL.forEach((t, order) => tx.store.put({ id: tagId(t.group, t.name), name: t.name, group: t.group, order }));
  await tx.done;
}

export async function listTags(): Promise<Tag[]> {
  const all = await (await getDb()).getAll('tags');
  return all.sort((a, b) => a.order - b.order);
}

export type TagResult = { ok: true; tag: Tag } | { ok: false; reason: 'empty' | 'duplicate' };

export async function createTag(name: string, group: TagGroup): Promise<TagResult> {
  const clean = name.trim();
  if (!clean) return { ok: false, reason: 'empty' };
  const db = await getDb();
  const id = tagId(group, clean);
  if (await db.get('tags', id)) return { ok: false, reason: 'duplicate' };
  const all = await db.getAll('tags');
  const tag: Tag = { id, name: clean, group, order: all.reduce((m, t) => Math.max(m, t.order), -1) + 1 };
  await db.put('tags', tag);
  return { ok: true, tag };
}

/** Renaming changes the id (it derives from the name), so library entries are re-pointed. */
export async function renameTag(id: string, name: string): Promise<TagResult> {
  const clean = name.trim();
  if (!clean) return { ok: false, reason: 'empty' };
  const db = await getDb();
  const old = await db.get('tags', id);
  if (!old) return { ok: false, reason: 'empty' };
  const nextId = tagId(old.group, clean);
  if (nextId !== id && (await db.get('tags', nextId))) return { ok: false, reason: 'duplicate' };
  const tag: Tag = { ...old, id: nextId, name: clean };
  const tx = db.transaction(['tags', 'library'], 'readwrite');
  if (nextId !== id) {
    await tx.objectStore('tags').delete(id);
    for (const e of await tx.objectStore('library').getAll()) {
      if (e.tagIds.includes(id)) {
        await tx.objectStore('library').put({ ...e, tagIds: e.tagIds.map((t) => (t === id ? nextId : t)) });
      }
    }
  }
  await tx.objectStore('tags').put(tag);
  await tx.done;
  return { ok: true, tag };
}

/** Deleting removes the tag from every title; titles left with nothing are dropped (spec §5). */
export async function deleteTag(id: string): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['tags', 'library'], 'readwrite');
  await tx.objectStore('tags').delete(id);
  for (const e of await tx.objectStore('library').getAll()) {
    if (!e.tagIds.includes(id)) continue;
    const next = { ...e, tagIds: e.tagIds.filter((t) => t !== id) };
    if (isEmptyEntry(next)) await tx.objectStore('library').delete(e.key);
    else await tx.objectStore('library').put(next);
  }
  await tx.done;
}

/** How many titles carry each tag (shown in Ajustes). */
export async function tagCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const e of await (await getDb()).getAll('library')) {
    for (const id of e.tagIds) counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}
