import {places} from './world.mjs';

// A stationary balance is addressed by title, street address, storage role and
// item. A travelling balance has a person as holder and follows their position.
export function placeBin(owner, placeId, holder, item) {
  return {owner, placeId, holder, item};
}

export const bins = {
  bark: placeBin('player', 'workshop', 'shelf', 'bark'),
  reservedBark: placeBin('player', 'workshop', 'reserved', 'bark'),
  marketBark: placeBin('market', 'market', 'seller', 'bark'),
  pickupBark: placeBin('player', 'market', 'pickup', 'bark'),
  porterBark: placeBin('player', null, 'porter', 'bark'),
  workshop: placeBin('player', 'workshop', 'shelf', 'paper'),
  porter: placeBin('player', null, 'porter', 'paper'),
  stall: placeBin('player', 'market', 'stall', 'paper'),
  rivalShop: placeBin('rival', 'rival', 'shelf', 'paper'),
  rival: placeBin('rival', null, 'rival', 'paper'),
  market: placeBin('market', 'market', 'seller', 'paper'),
  office: placeBin('office', 'market', 'office', 'paper')
};

const owners = new Set(['player', 'rival', 'market', 'office']);
const items = new Set(['bark', 'paper']);
function validAddress(state, address) {
  if (!address || !owners.has(address.owner) || !items.has(address.item)) return false;
  if (address.placeId === null) return state.agents.some(a => a.id === address.holder);
  return Object.hasOwn(places,address.placeId) && places[address.placeId].storageRoles.includes(address.holder);
}

function sameAddress(a, b) {
  return a.owner === b.owner && a.placeId === b.placeId && a.holder === b.holder && a.item === b.item;
}

export function quantity(state, address) {
  return state.inventory.find(row => sameAddress(row, address))?.quantity ?? 0;
}

// Persisted v2/v3, and the original read API, used these names for a combined
// address and storage role. Translate once when importing; never save aliases.
const legacyHolders = {
  workshop:bins.workshop, 'workshop:reserved':bins.reservedBark, market:bins.market,
  marketPickup:bins.pickupBark, porter:bins.porter, stall:bins.stall, rivalShop:bins.rivalShop,
  rival:bins.rival, office:bins.office
};
function legacyAddress(owner, holder, item) {
  if (!Object.hasOwn(legacyHolders,holder)) return null;
  const address = legacyHolders[holder];
  return placeBin(owner,address.placeId,address.holder,item);
}

export function inventoryAt(state, owner, holder, item) {
  const address = legacyAddress(owner,holder,item);
  return address ? quantity(state,address) : 0;
}

export function inventoryRows(state) {
  return state.inventory.map(row => ({...row}));
}

export function holdingsAtPlace(state, placeId) {
  if (!Object.hasOwn(places,placeId)) return [];
  return state.inventory.filter(row => row.placeId === placeId).map(row => ({...row}));
}

// No state is changed until both ends, the item, and both resulting balances
// are checked. A null endpoint represents production or consumption.
export function moveGoods(state, from, to, count) {
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid stock quantity');
  if (from === null && to === null) throw new Error('Missing stock address');
  if ((from !== null && !validAddress(state,from)) || (to !== null && !validAddress(state,to))) {
    throw new Error('Unknown stock address');
  }
  if (from && to && from.item !== to.item) throw new Error('Cannot change item in transit');
  if (count === 0) return;
  const rows = state.inventory;
  const source = from && rows.find(row => sameAddress(row, from));
  if (from && (!source || source.quantity < count)) throw new Error('Insufficient stock');
  if (from && to && sameAddress(from,to)) return;
  const dest = to && rows.find(row => sameAddress(row, to));
  if (dest && !Number.isSafeInteger(dest.quantity + count)) throw new Error('Stock overflow');
  if (source) {
    source.quantity -= count;
    if (source.quantity === 0) rows.splice(rows.indexOf(source), 1);
  }
  if (dest) dest.quantity += count;
  else if (to) rows.push({...placeBin(to.owner,to.placeId,to.holder,to.item), quantity:count});
}

export function validInventory(state) {
  if (!Array.isArray(state.inventory)) return false;
  const seen = new Set();
  return state.inventory.every(row => {
    if (!validAddress(state,row) || !Number.isSafeInteger(row.quantity) || row.quantity <= 0) return false;
    const key = JSON.stringify([row.owner,row.placeId,row.holder,row.item]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function migratePlacedInventory(state) {
  if (!Array.isArray(state.inventory)) return false;
  const rows = [];
  for (const old of state.inventory) {
    if (!old || Object.hasOwn(old,'placeId')) return false;
    const address = legacyAddress(old.owner,old.holder,old.item);
    if (!address) return false;
    rows.push({...address,quantity:old.quantity});
  }
  if (!validInventory({...state,inventory:rows})) return false;
  state.inventory = rows;
  return true;
}
