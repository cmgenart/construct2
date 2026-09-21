const assert = require("assert");
const {
  orderBuildValueKeys,
  pruneBuildValueKeyOrder,
  removeKeyFromOrder,
  appendKeyToOrder,
  isValidBuildValueKeyReorder,
} = require("./build_value_order.js");

assert.deepStrictEqual(
  orderBuildValueKeys(["c", "a", "b"], ["b", "a", "c"]),
  ["b", "a", "c"],
);

assert.deepStrictEqual(
  orderBuildValueKeys(["name", "new_key"], ["description", "name"]),
  ["name", "new_key"],
);

assert.deepStrictEqual(
  orderBuildValueKeys(["a", "b"], ["a", "b", "removed"]),
  ["a", "b"],
);

assert.deepStrictEqual(
  pruneBuildValueKeyOrder(["name", "gone", "tag"], ["name", "tag"]),
  ["name", "tag"],
);

assert.deepStrictEqual(removeKeyFromOrder(["name", "tag"], "tag"), ["name"]);
assert.deepStrictEqual(appendKeyToOrder(["name"], "tag"), ["name", "tag"]);
assert.deepStrictEqual(appendKeyToOrder(["name"], "name"), ["name"]);

assert.strictEqual(
  isValidBuildValueKeyReorder(["b", "a"], ["a", "b"]),
  true,
);
assert.strictEqual(
  isValidBuildValueKeyReorder(["b", "a"], ["a", "b", "c"]),
  false,
);
assert.strictEqual(
  isValidBuildValueKeyReorder(["b", "b"], ["a", "b"]),
  false,
);

console.log("build_value_order tests OK");
