import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadUi } from "./testSupport/loadUi.mjs";

const { MOBILE_MAX_WIDTH, TABLET_MAX_WIDTH, responsiveSize } = await import(await loadUi("layout/responsive.ts"));
const { createTheme } = await import(await loadUi("theme/tokens.ts"));
const { createAppStyles } = await import(await loadUi("styles/appStyles.ts"));
const { createOpsStyles } = await import(await loadUi("features/operations/ui.tsx"));

test("responsive contract classifies the four boundary widths", () => {
  assert.equal(MOBILE_MAX_WIDTH, 599);
  assert.equal(TABLET_MAX_WIDTH, 1023);
  assert.equal(responsiveSize(599), "mobile");
  assert.equal(responsiveSize(600), "tablet");
  assert.equal(responsiveSize(1023), "tablet");
  assert.equal(responsiveSize(1024), "desktop");
});

test("responsive contract handles narrow and wide viewports without gaps", () => {
  assert.equal(responsiveSize(320), "mobile");
  assert.equal(responsiveSize(768), "tablet");
  assert.equal(responsiveSize(1440), "desktop");
});

test("inventory and purchases use the shared responsive contract", async () => {
  for (const file of ["features/operations/InventoryScreen.tsx", "features/operations/PurchasesScreen.tsx"]) {
    const source = await readFile(new URL(file, new URL("./", import.meta.url)), "utf8");
    assert.match(source, /useResponsiveLayout\(\)/, file);
    assert.doesNotMatch(source, /width\s*[<=>]/, file);
    assert.doesNotMatch(source, /useWindowDimensions/, file);
  }
});

test("migrated interactive primitives keep the shared touch target", () => {
  const theme = createTheme("light");
  const app = createAppStyles(theme);
  const operations = createOpsStyles(theme);
  const controls = {
    "categoría o selector de Producto": app.type,
    "acción secundaria compartida": app.secondaryButton,
    "acción destructiva compartida": app.dangerButton,
    "acción textual de Producto": app.inlineTextAction,
    "pestaña de Cocina": app.kitchenTab,
    "impresión compacta de Cocina": app.kitchenPrintButton,
    "chip de Producción": operations.chip,
    "acción destructiva de Producción": operations.dangerButton,
    "acción textual de Producción": operations.inlineTextAction,
    "paso guiado compartido": operations.workflowStep,
  };

  for (const [name, style] of Object.entries(controls)) {
    assert.ok(style.minHeight >= theme.control.minTouch, `${name} tiene ${style.minHeight ?? 0}px`);
  }
});

test("product creation uses columns on desktop and one flow on compact screens", () => {
  const styles = createAppStyles(createTheme("light"));
  assert.equal(styles.productCreateLayout.flexDirection, "row");
  assert.equal(styles.productCreateLayoutCompact.flexDirection, "column");
  assert.equal(styles.productCreateMain.minWidth, 0);
  assert.equal(styles.productCreateAsideCompact.minWidth, 0);
  assert.equal(styles.productCreateAsideCompact.width, "100%");
});
