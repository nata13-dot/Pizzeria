import assert from "node:assert/strict";
import test from "node:test";
import { flavorSelectionExtra } from "./flavorPricing.ts";

const settings = { half_and_half_extra: 30, additional_wing_flavor_extra: 15 };

test("Tricombo Familiar includes two flavors at its base price", () => {
  assert.equal(325 + flavorSelectionExtra("other", [1, 2], settings), 325);
});

test("regular pizza and wings preserve their respective surcharges", () => {
  assert.equal(flavorSelectionExtra("pizza", [1, 2], settings), 30);
  assert.equal(flavorSelectionExtra("wings", [1, 2], settings), 15);
  assert.equal(flavorSelectionExtra("wings", [1, 2, 3], settings), 30);
});

test("zero, one or repeated selections do not incur a surcharge", () => {
  for (const type of ["pizza", "wings", "other"]) {
    for (const flavors of [[], [1], [1, 1]]) {
      assert.equal(flavorSelectionExtra(type, flavors, settings), 0);
    }
  }
});
