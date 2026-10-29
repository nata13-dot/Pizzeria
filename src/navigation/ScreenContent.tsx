import type { Screen } from "./modules";
import { DashboardScreen } from "../features/dashboard/DashboardScreen";
import { CashScreen } from "../features/administration/CashScreen";
import { CustomersScreen } from "../features/administration/CustomersScreen";
import { SettingsScreen } from "../features/administration/SettingsScreen";
import { UsersScreen } from "../features/administration/UsersScreen";
import { InventoryScreen } from "../features/operations/InventoryScreen";
import { ProductionScreen } from "../features/operations/ProductionScreen";
import { PurchasesScreen } from "../features/operations/PurchasesScreen";
import { PosScreen } from "../features/pos/PosScreen";
import { OperationalOrdersScreen } from "../features/orders/OperationalOrdersScreen";
import { OrdersDayScreen } from "../features/orders/OrdersDayScreen";
import { ProductsScreen } from "../features/products/ProductsScreen";
import { ReportsScreen } from "../features/reports/ReportsScreen";
import { RecipesScreen } from "../features/recipes/RecipesScreen";
import { screenComposition } from "./screenComposition";

export function ScreenContent({screen,token,branchId,userId,isAdministrator,canOverrideStock,onNavigate}:{screen:Screen;token:string;branchId:number;userId:number;isAdministrator:boolean;canOverrideStock:boolean;onNavigate:(screen:Screen)=>void}){
  const component=screenComposition[screen];
  if(component==="dashboard")return <DashboardScreen token={token} onNavigate={onNavigate}/>;
  if(component==="pos")return <PosScreen token={token} isAdministrator={isAdministrator} canOverrideStock={canOverrideStock}/>;
  if(component==="orders")return <OrdersDayScreen token={token} branchId={branchId} isAdministrator={isAdministrator}/>;
  if(component==="cash")return <CashScreen token={token}/>;
  if(component==="customers")return <CustomersScreen token={token} isAdministrator={isAdministrator}/>;
  if(component==="users")return <UsersScreen token={token} currentUserId={userId}/>;
  if(component==="settings")return <SettingsScreen token={token} isAdministrator={isAdministrator}/>;
  if(component==="inventory")return <InventoryScreen token={token} isAdministrator={isAdministrator}/>;
  if(component==="purchases")return <PurchasesScreen token={token} isAdministrator={isAdministrator}/>;
  if(component==="production")return <ProductionScreen token={token} isAdministrator={isAdministrator}/>;
  if(component==="products")return <ProductsScreen token={token} isAdministrator={isAdministrator}/>;
  if(component==="reports")return <ReportsScreen token={token}/>;
  if(component==="recipes")return <RecipesScreen token={token} isAdministrator={isAdministrator}/>;
  if(component==="operational"&&(screen==="kitchen"||screen==="delivery"))return <OperationalOrdersScreen mode={screen} token={token} branchId={branchId}/>;
  return null;
}
