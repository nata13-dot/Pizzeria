import { useState } from "react";
import { View } from "react-native";
import { RemoteListStatus } from "../../components/RemoteListStatus";
import { useRemoteResource } from "../../hooks/useRemoteResource";
import { useNavigationField } from "../../navigation/NavigationContext";
import { Tabs, useOpsStyles } from "../operations/ui";
import { SaleRecipes } from "../recipes/SaleRecipes";
import { ComboManager, type CatalogProduct } from "./ComboManager";
import { ProductsView } from "./ProductsView";
import { ProductWizard } from "./ProductWizard";

type ProductsTab = "catalog" | "new" | "combos" | "recipes";

/** Products module: one task per tab instead of every form stacked on one page. */
export function ProductsScreen({ token, isAdministrator }: { token: string; isAdministrator: boolean }) {
  const ops = useOpsStyles();
  const [context, setContext] = useNavigationField("products", { tab: "catalog" as ProductsTab });
  const [tab, setTabState] = useState<ProductsTab>(isAdministrator ? context.tab : "catalog");
  const setTab = (next: ProductsTab) => { setTabState(next); setContext({ tab: next }); };
  // Administrators also see deactivated products so they can reactivate them.
  const products = useRemoteResource<CatalogProduct[] | { data: CatalogProduct[] }>(isAdministrator ? "/products?include_inactive=1" : "/products", token, "los productos");
  const data = Array.isArray(products.data) ? products.data : products.data?.data ?? [];
  const reload = async () => { products.reload(); };

  return <View style={ops.screen}>
    {isAdministrator && <Tabs active={tab} onChange={(key) => setTab(key as ProductsTab)} items={[
      { key: "catalog", label: "Catálogo" },
      { key: "new", label: "Nuevo producto" },
      { key: "combos", label: "Paquetes y promociones" },
      { key: "recipes", label: "Recetas" },
    ]} />}
    {(tab === "catalog" || tab === "combos") && <RemoteListStatus loading={products.loading && !data.length} error={products.error} count={data.length || 1} emptyText="" onRetry={products.reload} />}
    {tab === "catalog" && <ProductsView data={data} token={token} onSaved={reload} canConfigure={isAdministrator} />}
    {tab === "new" && isAdministrator && <ProductWizard token={token} onCreated={reload} onOpenRecipes={() => setTab("recipes")} />}
    {tab === "combos" && isAdministrator && <ComboManager products={data} token={token} />}
    {tab === "recipes" && isAdministrator && <SaleRecipes token={token} />}
  </View>;
}
