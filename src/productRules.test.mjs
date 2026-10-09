import assert from "node:assert/strict";
import test from "node:test";
import { loadUi } from "./testSupport/loadUi.mjs";

const { allowsStuffedCrust, allowedModifierIds, hasForbiddenStuffedCrust } = await import(await loadUi("productRules.ts"));

const variant = (name) => ({
  name,
  modifier_rules: [
    { modifier_id: 10, modifier: { type: "stuffed_crust" } },
    { modifier_id: 11, modifier: { type: "instruction" } },
  ],
});

test("square and Neapolitan presentations only allow normal crust", () => {
  for (const name of ["Cuadrada 35x25 cm", "PIZZA CUADRADA", "Napolitana 35 cm", "napolitána familiar"]) {
    assert.equal(allowsStuffedCrust(name), false, name);
    assert.deepEqual(allowedModifierIds(variant(name), [10, 11]), [11]);
    assert.equal(hasForbiddenStuffedCrust(variant(name), [10]), true);
  }
});

test("other presentations preserve stuffed crust", () => {
  for (const name of ["Mediana 35 cm", "Grande", "Familiar 45 cm"]) {
    assert.equal(allowsStuffedCrust(name), true, name);
    assert.deepEqual(allowedModifierIds(variant(name), [10, 11]), [10, 11]);
  }
});
