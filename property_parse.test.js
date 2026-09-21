/**
 * ParseLine grouped property syntax — see docs/PROPERTIES-PANEL.md
 */
const assert = require("assert");
const { ParseLine } = require("./builder.pmaster.v2.js");

function test(name, fn) {
  try {
    fn();
    console.log("ok:", name);
  } catch (e) {
    console.error("FAIL:", name, e.message);
    process.exitCode = 1;
  }
}

test("legacy v2 property — base group", () => {
  const r = ParseLine("//#<Mode:Calm>");
  assert.strictEqual(r.isProperty, true);
  assert.strictEqual(r.property_group, null);
  assert.strictEqual(r.property_name, "Mode");
  assert.strictEqual(r.property_value, "Calm");
});

test("grouped v2 property", () => {
  const r = ParseLine("//#<<Hex DNA>chaos_core:iAA>");
  assert.strictEqual(r.isProperty, true);
  assert.strictEqual(r.property_group, "Hex DNA");
  assert.strictEqual(r.property_name, "chaos_core");
  assert.strictEqual(r.property_value, "iAA");
  assert.strictEqual(r.errors.length, 0);
});

test("grouped Debug property", () => {
  const r = ParseLine("//#<<Debug>canvas_input:off>");
  assert.strictEqual(r.property_group, "Debug");
  assert.strictEqual(r.property_name, "canvas_input");
  assert.strictEqual(r.property_value, "off");
});

test("grouped v1 block property", () => {
  const r = ParseLine("/*#<<Hex DNA>iris_struct:aB>");
  assert.strictEqual(r.isProperty, true);
  assert.strictEqual(r.property_group, "Hex DNA");
  assert.strictEqual(r.property_name, "iris_struct");
  assert.strictEqual(r.property_value, "aB");
});

test("property name with colon segments", () => {
  const r = ParseLine("//#<<base>Wire Style:thin>");
  assert.strictEqual(r.property_group, "base");
  assert.strictEqual(r.property_name, "Wire Style");
  assert.strictEqual(r.property_value, "thin");
});

test("grouped property with JSON options", () => {
  const r = ParseLine('//#<<BG_Field>base_field:exp4> {"prob":8 }');
  assert.strictEqual(r.isProperty, true);
  assert.strictEqual(r.property_group, "BG_Field");
  assert.strictEqual(r.property_name, "base_field");
  assert.strictEqual(r.property_value, "exp4");
  assert.strictEqual(r.property_options.prob, 8);
  assert.strictEqual(r.errors.length, 0);
});

test("grouped v1 block property with JSON options", () => {
  const r = ParseLine('/*#<<Debug>res:500x500> {"prob":2}');
  assert.strictEqual(r.isProperty, true);
  assert.strictEqual(r.property_group, "Debug");
  assert.strictEqual(r.property_name, "res");
  assert.strictEqual(r.property_value, "500x500");
  assert.strictEqual(r.property_options.prob, 2);
});

test("grouped choices include exp4 when opener has JSON options", () => {
  const { Node } = require("./builder.pmaster.v2.js");
  const code = [
    " //#<<BG_Field>base_field:none>",
    " x=1;",
    " //#<<BG_Field>base_field:exp4> {\"prob\":8 }",
    " x=2;",
    " //#<<BG_Field>base_field:exp4b>",
    " x=3;",
    " //#",
  ].join("\n");
  const node = new Node(code);
  const choices = node.GetPropertyChoices("base_field");
  assert.ok(choices.includes("exp4"), "exp4 should be a base_field choice");
  assert.ok(choices.includes("exp4b"), "exp4b should be a base_field choice");
  assert.ok(!choices.includes("<BG_Field"), "should not have phantom BG_Field value");
});

test("CollectPropertyGroups on minimal tree", () => {
  const { Node } = require("./builder.pmaster.v2.js");
  const code = [
    "//#<Mode:Calm>",
    " //#<<Hex DNA>chaos_core:iAA>",
    " x=1;",
    " //#<<Hex DNA>chaos_core:iAB>",
    " x=2;",
    " //#",
    " //#<<Debug>toggle:off>",
    " y=1;",
    " //#<<Debug>toggle:on>",
    " y=2;",
    " //#",
  ].join("\n");
  const node = new Node(code);
  const meta = node.CollectPropertyGroups();
  assert.strictEqual(meta.propertyGroups.Mode, null);
  assert.strictEqual(meta.propertyGroups.chaos_core, "Hex DNA");
  assert.strictEqual(meta.propertyGroups.toggle, "Debug");
  assert.deepStrictEqual(meta.propertyGroupOrder, ["Hex DNA", "Debug"]);
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
console.log("property_parse.test.js: all passed");
