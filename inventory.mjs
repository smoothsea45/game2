// The proprietor, current holder, and item identify one stock balance. A
// handoff can change custody without transferring title (workshop → porter).
function bin(owner, holder, item) {
  return {owner, holder, item};
}

export const bins = {
  bark: bin('player', 'workshop', 'bark'),
  reservedBark: bin('player', 'workshop:reserved', 'bark'),
  marketBark: bin('market', 'market', 'bark'),
  pickupBark: bin('player', 'marketPickup', 'bark'),
  porterBark: bin('player', 'porter', 'bark'),
  workshop: bin('player', 'workshop', 'paper'),
  porter: bin('player', 'porter', 'paper'),
  stall: bin('player', 'stall', 'paper'),
  rivalShop: bin('rival', 'rivalShop', 'paper'),
  rival: bin('rival', 'rival', 'paper'),
  market: bin('market', 'market', 'paper'),
  office: bin('office', 'office', 'paper')
};

function matches(row, owner, holder, item) {
  return row.owner === owner && row.holder === holder && row.item === item;
}

export function inventoryAt(state, owner, holder, item) {
  return state.inventory.find(row => matches(row, owner, holder, item))?.quantity ?? 0;
}

export function inventoryRows(state) {
  return state.inventory.map(row => ({...row}));
}

export function quantity(state, {owner, holder, item}) {
  return inventoryAt(state, owner, holder, item);
}

// Called after action eligibility has been checked, before state is saved.
// A null source/sink represents production or consumption.
export function moveGoods(state, from, to, count) {
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid stock quantity');
  if (count === 0) return;
  const rows = state.inventory;
  const source = from && rows.find(row => matches(row, from.owner, from.holder, from.item));
  const dest = to && rows.find(row => matches(row, to.owner, to.holder, to.item));
  if (from && (!source || source.quantity < count)) throw new Error('Insufficient stock');
  if (to && !Number.isSafeInteger((dest?.quantity ?? 0) + count)) throw new Error('Stock overflow');
  if (source) {
    source.quantity -= count;
    if (source.quantity === 0) rows.splice(rows.indexOf(source), 1);
  }
  if (dest) dest.quantity += count;
  else if (to) rows.push({...to, quantity:count});
}

export function validInventory(rows) {
  if (!Array.isArray(rows) || rows.length > Object.keys(bins).length) return false;
  const seen = new Set();
  return rows.every(row => {
    if (!row || !Number.isSafeInteger(row.quantity) || row.quantity <= 0) return false;
    const bin = Object.values(bins).find(def => matches(row, def.owner, def.holder, def.item));
    if (!bin || seen.has(bin)) return false;
    seen.add(bin);
    return true;
  });
}
