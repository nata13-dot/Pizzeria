import assert from 'node:assert/strict';
import test from 'node:test';
import { money, moneySum, moneyMultiply, moneyDivide, orderTotal } from './money.ts';

test('money uses decimal half up at unit and line boundaries', () => {
  assert.equal(moneySum(['0.10','0.20']), 0.30);
  assert.equal(money('1.005'), 1.01);
  assert.equal(moneyMultiply('1.005','3'), 3.03);
  assert.equal(moneyMultiply('0.05','0.5'), 0.03);
  assert.equal(orderTotal('25.55', '2.05', '1.50'),25);
  assert.equal(orderTotal('1', '2', '0'),0);
  assert.equal(money('9999999999.99'),9999999999.99);
  for (const value of ['10000000000', '-1', 'NaN', 'Infinity']) assert.throws(()=>money(value));
  assert.throws(()=>moneyMultiply('9999999999.99',2));
});

test('purchase cost per presentation uses the same exact money boundary', () => {
  assert.equal(moneyDivide('90.00','2'),45);
  assert.equal(moneyDivide('0.01','1.5'),0.01);
  assert.throws(()=>moneyDivide('10','0'));
});

const {loadUi} = await import('./testSupport/loadUi.mjs');
const {productPrice, comboPrice} = await import(await loadUi('pricing.ts'));
test('product, Tricombo, overrides and combo units use the same pricing rules', () => {
  const settings = {half_and_half_extra:.10,additional_wing_flavor_extra:.15,max_wing_flavors:3};
  const variant={id:1,price:'1.20',modifier_rules:[{modifier_id:1,allowed:true,price_override:'.15',modifier:{price:'10.00'}},{modifier_id:2,allowed:true,price_override:null,modifier:{price:'.20'}}]};
  const product={id:1,type:'pizza',variants:[variant]};
  assert.equal(productPrice(product,variant,[1,2],[1,2],settings),1.65);
  assert.equal(productPrice({...product,type:'wings'},variant,[1,2,3],[1,2],settings),1.85);
  assert.equal(productPrice({...product,type:'other'},{...variant,price:325},[1,2],[],settings),325);
  const combo={price:2,items:[{id:3,product_variant_id:1,quantity:2}]};
  const selections=[{combo_item_id:3,flavor_ids:[1,2],modifier_ids:[1,2]}];
  assert.equal(comboPrice(combo,selections,[product],settings),2.90);
  assert.equal(comboPrice(combo,[{...selections[0],unit_index:1},{...selections[0],unit_index:2}],[product],settings),2.90);
  assert.equal(orderTotal(moneyMultiply(2.90,3),'.10','.30'),8.90);
});
