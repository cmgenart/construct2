/**
 * Build-time value key ordering for Values panel row order.
 * @see docs/VALUES-PANEL.md, docs/MINOR-UPGRADES-PLAN.md §2
 */

/**
 * @param {string[]} allKeys
 * @param {string[]} [keyOrder]
 * @returns {string[]}
 */
function orderBuildValueKeys(allKeys, keyOrder) {
  const keys = Array.isArray(allKeys) ? allKeys : [];
  const order = Array.isArray(keyOrder) ? keyOrder : [];
  const known = new Set(keys);
  const sorted = order.filter((k) => known.has(k));
  for (const k of keys) {
    if (!sorted.includes(k)) sorted.push(k);
  }
  return sorted;
}

/**
 * @param {string[]} keyOrder
 * @param {Iterable<string>} allowedKeys
 * @returns {string[]}
 */
function pruneBuildValueKeyOrder(keyOrder, allowedKeys) {
  const allowed = new Set(allowedKeys);
  return (Array.isArray(keyOrder) ? keyOrder : []).filter((k) => allowed.has(k));
}

/**
 * @param {string[]} keyOrder
 * @param {string} key
 * @returns {string[]}
 */
function removeKeyFromOrder(keyOrder, key) {
  return (Array.isArray(keyOrder) ? keyOrder : []).filter((k) => k !== key);
}

/**
 * @param {string[]} keyOrder
 * @param {string} key
 * @returns {string[]}
 */
function appendKeyToOrder(keyOrder, key) {
  const order = Array.isArray(keyOrder) ? [...keyOrder] : [];
  if (key && !order.includes(key)) order.push(key);
  return order;
}

/**
 * @param {string[]} reorderKeys
 * @param {string[]} schemaKeys
 * @returns {boolean}
 */
function isValidBuildValueKeyReorder(reorderKeys, schemaKeys) {
  if (!Array.isArray(reorderKeys) || !Array.isArray(schemaKeys)) return false;
  if (reorderKeys.length !== schemaKeys.length) return false;
  const set = new Set(reorderKeys);
  if (set.size !== schemaKeys.length) return false;
  return schemaKeys.every((k) => set.has(k));
}

module.exports = {
  orderBuildValueKeys,
  pruneBuildValueKeyOrder,
  removeKeyFromOrder,
  appendKeyToOrder,
  isValidBuildValueKeyReorder,
};
