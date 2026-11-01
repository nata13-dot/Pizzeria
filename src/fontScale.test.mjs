import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { JSDOM } from 'jsdom';
import React from 'react';
import { loadUi } from './testSupport/loadUi.mjs';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.localStorage = dom.window.localStorage; globalThis.getComputedStyle = dom.window.getComputedStyle;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true; globalThis.__realFields = true;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const { render, cleanup, fireEvent, act } = await import('@testing-library/react');
const { ThemeProvider, useTheme } = await import(await loadUi('theme/ThemeProvider.tsx'));
const { ThemedText } = await import(await loadUi('theme/ThemedText.tsx'));
const { FontScaleControl } = await import(await loadUi('components/FontScaleControl.tsx'));
const { FloatingTextInput } = await import(await loadUi('components/FloatingTextInput.tsx'));
const { clampFontScale, resolveFontScale, readFontPreference, percent } = await import(await loadUi('theme/fontScale.ts'));
afterEach(() => { cleanup(); localStorage.clear(); delete window.PizzeriaDevice; delete globalThis.PizzeriaDevice; });

function Probe() { const { fontScale } = useTheme(); return React.createElement(React.Fragment, null, React.createElement(ThemedText, null, `escala ${fontScale}`), React.createElement(FloatingTextInput, { label: 'Nombre' })); }
const mount = () => render(React.createElement(ThemeProvider, null, React.createElement(FontScaleControl), React.createElement(Probe)));
const bodySize = (view) => parseFloat(view.getByText(/^escala /).style.fontSize);

test('scale stays between 85 % and 150 % and migrates the old three-size setting', () => {
  assert.equal(clampFontScale(2), 1.5); assert.equal(clampFontScale(0.5), 0.85); assert.equal(clampFontScale(Number.NaN), 1);
  assert.equal(resolveFontScale('auto', 1.3), 1.3); assert.equal(resolveFontScale(1.15, 2), 1.15); assert.equal(percent(1.15), '115 %');
  assert.equal(readFontPreference(), 'auto');
  localStorage.setItem('pizzeria-font-size', 'large'); assert.equal(readFontPreference(), 1.15);
  localStorage.setItem('pizzeria-font-scale', '1.3'); assert.equal(readFontPreference(), 1.3);
});

test('bigger text applies to the whole app instantly and is remembered on this device', () => {
  const view = mount();
  assert.match(view.getByText(/^escala /).textContent, /escala 1$/); const before = bodySize(view);
  fireEvent.click(view.getByRole('button', { name: 'Aumentar letra' }));
  assert.match(view.getByText(/^escala /).textContent, /escala 1\.15$/);
  assert.ok(bodySize(view) > before, 'el texto creció sin recargar');
  assert.equal(parseFloat(view.getByLabelText('Nombre').style.fontSize), bodySize(view), 'los campos de texto crecen igual');
  assert.equal(localStorage.getItem('pizzeria-font-scale'), '1.15');
  fireEvent.click(view.getByRole('radio', { name: '150 %' }));
  assert.equal(view.getByRole('button', { name: 'Aumentar letra' }).disabled, true);
  assert.equal(view.getByRole('radio', { name: '150 %' }).getAttribute('aria-checked'), 'true');
});

test('automatic follows the device font size live and never goes past 150 %', () => {
  globalThis.PizzeriaDevice = { getFontScale: () => 1.3 };
  const view = mount();
  assert.match(view.getByText(/^escala /).textContent, /escala 1\.3$/);
  assert.ok(view.getByRole('radio', { name: 'Automático, como el dispositivo (130 %)' }));
  globalThis.PizzeriaDevice = { getFontScale: () => 2 };
  act(() => { window.dispatchEvent(new window.Event('pizzeria:fontscale')); });
  assert.match(view.getByText(/^escala /).textContent, /escala 1\.5$/);
  assert.match(view.container.textContent, /Tu dispositivo pide 200 %; la app usa 150 %/);
});
