// A single record commits the family, camera and appointment together. Older
// clients still writing their versioned keys cannot overwrite this slot.
import {fresh, loadGame} from './simulation.mjs';

export const familySlot = 'hanseong-garok-family';
export const backupSlot = familySlot + '-previous';
const oldSlots = [3, 2, 1].map(v => 'hanseong-garok-realtime-v' + v);

function parse(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function restoreCheckpoint(raw, game) {
  if (!raw || game.opportunity.startedAt === null) return null;
  const before = loadGame(raw);
  return before && before.opportunity.startedAt === null && before.time === game.opportunity.startedAt
    ? raw : null;
}

function readRecord(raw) {
  const record = parse(raw);
  if (record?.format !== 1 || typeof record.game !== 'string') return null;
  const game = loadGame(record.game);
  if (!game) return null;
  return {game, view:record.view ?? null, checkpoint:restoreCheckpoint(record.checkpoint, game)};
}

function newerThanReader(raw, version) {
  const record = parse(raw);
  return record?.format > 1 || parse(record?.game)?.version > version;
}

function readLegacy(storage) {
  let skipped = false;
  for (const slot of oldSlots) {
    const raw = storage.getItem(slot);
    const game = loadGame(raw);
    if (!game) { if (raw !== null) skipped = true; continue; }
    const view = parse(storage.getItem(slot + '-view'));
    const checkpoint = restoreCheckpoint(storage.getItem(slot + '-appointment'), game);
    return {game, view, checkpoint, skipped};
  }
  return null;
}

export function openFamilyStore(getStorage, exclusiveWrite) {
  let storage, expected, lastGood, recovery = '', needsArchive = false, frozen = false;
  let loaded = null;
  try {
    storage = getStorage();
    expected = storage.getItem(familySlot);
    loaded = readRecord(expected);
    if (loaded) lastGood = expected;
    else {
      const backupRaw = storage.getItem(backupSlot);
      const backup = readRecord(backupRaw);
      const currentVersion = fresh().version;
      loaded = backup || readLegacy(storage);
      lastGood = backup ? backupRaw : null;
      const priorData = expected !== null || backupRaw !== null || oldSlots.some(k => storage.getItem(k) !== null);
      const future = newerThanReader(expected, currentVersion) ||
        (!expected && !backup && oldSlots.some(k => parse(storage.getItem(k))?.version > currentVersion));
      if (future) {
        frozen = true;
        recovery = '더 최신 버전의 저장 기록이 있습니다. 게임을 새로고침해 주세요.';
      } else if (backup || loaded?.skipped || expected !== null || (priorData && !loaded)) {
        recovery = loaded ? '읽을 수 있는 이전 저장본으로 복구했습니다.' : '기존 기록을 읽지 못해 새 가문을 열었습니다. 원본 기록은 보존합니다.';
      }
      needsArchive = expected !== null;
    }
  } catch {
    storage = null;
    recovery = '이 브라우저에서 저장 공간을 열 수 없습니다.';
  }

  function stale() {
    if (!storage || frozen) return false;
    // Do not let a denied read masquerade as a deleted or empty save.
    try { return storage.getItem(familySlot) !== expected; } catch { return false; }
  }

  function write(record) {
    if (frozen) return 'blocked';
    const actual = storage.getItem(familySlot);
    if (actual !== expected) {
      if (record === actual) { expected = lastGood = actual; return 'saved'; }
      frozen = true;
      return 'conflict';
    }
    if (actual === record) return 'saved';
    if (needsArchive) {
      // Never discard an unrecognized primary, even when storage quota is full.
      let suffix = 1;
      while (storage.getItem(familySlot + '-damaged-' + suffix) !== null) suffix++;
      storage.setItem(familySlot + '-damaged-' + suffix, actual);
      needsArchive = false;
    }
    if (lastGood && lastGood === expected) storage.setItem(backupSlot, lastGood);
    storage.setItem(familySlot, record);
    expected = record;
    lastGood = record;
    return 'saved';
  }

  // Snapshot before entering the write queue: a user may start rehearsing
  // immediately after clicking "other choice". Only the main snapshot belongs here.
  function save(game, view, checkpoint) {
    if (!storage) return Promise.resolve('unavailable');
    if (frozen) return Promise.resolve('blocked');
    const gameRaw = JSON.stringify(game);
    if (!loadGame(gameRaw)) return Promise.resolve('invalid');
    const record = JSON.stringify({format:1, game:gameRaw, view, checkpoint});
    try {
      return Promise.resolve(exclusiveWrite(() => write(record))).catch(() => 'unavailable');
    } catch {
      return Promise.resolve('unavailable');
    }
  }
  return {loaded:loaded ?? {game:fresh(), view:null, checkpoint:null}, recovery, frozen, save, stale};
}

// Web Locks serialize compare-and-write across tabs on HTTPS. Browsers lacking
// Web Locks can use IndexedDB's exclusive read/write transactions on this one store.
export function browserSaveLock() {
  if (globalThis.navigator?.locks) return write => navigator.locks.request(familySlot, write);
  if (!globalThis.indexedDB) return () => Promise.reject(new Error('저장 잠금을 열 수 없습니다.'));
  let database;
  return async write => {
    if (!database) {
      database = new Promise((resolve, reject) => {
        const request = indexedDB.open(familySlot + '-lock', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('writer');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
        request.onblocked = () => reject(new Error('저장 잠금 대기 중'));
      }).catch(error => { database = null; throw error; });
    }
    const db = await database;
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('writer', 'readwrite');
      const guard = transaction.objectStore('writer').get('family');
      let result;
      guard.onsuccess = () => {
        try { result = write(); } catch (error) { transaction.abort(); reject(error); }
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = transaction.onerror = () => reject(transaction.error);
    });
  };
}
