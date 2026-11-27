import {places} from './world.mjs';

// The world defines which sites have transferable title. This register contains
// the deeds as they stand in this family save, independent of the goods on site.
const familyNames = {player:'윤 가문', rival:'박 가문'};
const dayLength = 360;
export const plotRentPerDay = places.plot.rentPerDay;
const hasTitle = place => Object.hasOwn(place,'initialOwner');
const knownFamily = id => typeof id === 'string' && Object.hasOwn(familyNames,id);

export function freshProperties() {
  const titles = {};
  for (const [id,place] of Object.entries(places)) {
    if (hasTitle(place)) titles[id] = {owner:place.initialOwner, acquiredAt:null, rentDays:0};
  }
  return titles;
}

function validDeed(deed, place, time) {
  if (!deed || !Number.isSafeInteger(deed.rentDays) || deed.rentDays < 0) return false;
  if (deed.owner !== null && !knownFamily(deed.owner)) return false;
  if (deed.acquiredAt === null) return deed.owner === place.initialOwner && deed.rentDays === 0;
  return deed.owner !== null && Number.isFinite(deed.acquiredAt)
    && deed.acquiredAt >= 0 && deed.acquiredAt <= time
    && deed.rentDays <= (place.rentPerDay ? Math.floor((time - deed.acquiredAt) / dayLength) : 0);
}

export function validProperties(s) {
  const titles = s.properties;
  if (!titles || typeof titles !== 'object' || Array.isArray(titles)) return false;
  for (const [id,place] of Object.entries(places)) {
    if (hasTitle(place) && !validDeed(titles[id],place,s.time)) return false;
  }
  return Object.keys(titles).every(id => Object.hasOwn(places,id) && hasTitle(places[id]));
}

export function migrateProperties(s) {
  const old = s.opportunity;
  if (!old || ![null,'master','rival'].includes(old.landOwner) || Object.hasOwn(s,'properties')) return false;
  const owner = old.landOwner === 'master' ? 'player' : old.landOwner;
  const deed = {owner, acquiredAt:old.acquiredAt, rentDays:old.rentDays};
  if (!validDeed(deed, places.plot, s.time)) return false;
  s.properties = freshProperties();
  s.properties.plot = deed;
  delete old.landOwner;
  delete old.acquiredAt;
  delete old.rentDays;
  return true;
}

export function propertyView(s, placeId) {
  if (!Object.hasOwn(places,placeId)) return null;
  const place = places[placeId];
  if (!hasTitle(place)) {
    return {placeId,kind:'public',owner:null,ownerLabel:'공용 장터',acquiredAt:null,rentPerDay:0,nextRentAt:null};
  }
  const title = s.properties[placeId];
  return {
    placeId,
    kind:title.owner ? 'family' : 'unowned',
    owner:title.owner,
    ownerLabel:title.owner ? familyNames[title.owner] : '매각 전',
    acquiredAt:title.acquiredAt,
    rentPerDay:place.rentPerDay ?? 0,
    nextRentAt:place.rentPerDay && title.acquiredAt !== null ? title.acquiredAt + (title.rentDays + 1) * dayLength : null
  };
}

export function settlePlotRent(s, note) {
  for (const id in s.properties) {
    const deed = s.properties[id],place = places[id];
    if (!place.rentPerDay || deed.acquiredAt === null) continue;
    const days = Math.floor((s.time - deed.acquiredAt) / dayLength);
    if (days <= deed.rentDays) continue;
    const payment = (days - deed.rentDays) * place.rentPerDay;
    deed.rentDays = days;
    if (deed.owner === 'player') s.grain += payment;
    else s.opportunity.rivalPurse += payment;
    note(s, familyNames[deed.owner]+'의 '+place.name+'에 짐을 부린 객주가 사용료 '+payment+'말을 치렀다.');
  }
}
