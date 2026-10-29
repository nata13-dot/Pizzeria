import { useState } from "react";
import { View } from "react-native";
import { useNavigationField } from "../../navigation/NavigationContext";
import { Tabs, useOpsStyles } from "../operations/ui";
import { ProductionRecipes } from "./ProductionRecipes";
import { SaleRecipes } from "./SaleRecipes";

type RecipesTab = "sale" | "production";

/** Both recipe kinds in one place: what a sale consumes and how preparations are made. */
export function RecipesScreen({ token, isAdministrator }: { token: string; isAdministrator: boolean }) {
  const ops = useOpsStyles();
  const [context, setContext] = useNavigationField("recipes", { tab: "sale" as RecipesTab });
  const [tab, setTab] = useState<RecipesTab>(context.tab);
  return <View style={ops.screen}>
    <Tabs active={tab} onChange={(key) => { setTab(key as RecipesTab); setContext({ tab: key as RecipesTab }); }} items={[
      { key: "sale", label: "Recetas de venta" },
      { key: "production", label: "Recetas de producción" },
    ]} />
    {tab === "sale" ? <SaleRecipes token={token} /> : <ProductionRecipes token={token} isAdministrator={isAdministrator} onSaved={() => {}} />}
  </View>;
}
