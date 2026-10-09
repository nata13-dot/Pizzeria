export type Screen = "dashboard" | "pos" | "cash" | "orders" | "inventory" | "purchases" | "production" | "products" | "kitchen" | "delivery" | "customers" | "users" | "reports" | "settings";
export type ModuleGroupId = "home" | "sales" | "operations" | "catalog" | "analysis" | "administration";
export type NavigationUser = { role: { slug: string }; permissions?: string[] };

export const moduleGroups: { id: ModuleGroupId; label: string }[] = [
  { id: "home", label: "Inicio" }, { id: "sales", label: "Ventas" }, { id: "operations", label: "Operación" },
  { id: "catalog", label: "Catálogo" }, { id: "analysis", label: "Análisis" }, { id: "administration", label: "Administración" },
];

export type AppModule = { id: Screen; label: string; group: ModuleGroupId; icon: string; access: (user: NavigationUser) => boolean };
const has = (user: NavigationUser, permission: string) => user.permissions?.includes("*") || user.permissions?.includes(permission) || false;
const admin = (user: NavigationUser) => user.role.slug === "administrador" || has(user, "*");

export const appModules: AppModule[] = [
  { id: "dashboard", label: "Resumen", group: "home", icon: "⌂", access: user => admin(user) || has(user,"cash.manage") && has(user,"orders.view") && has(user,"inventory.view") },
  { id: "pos", label: "Punto de venta", group: "sales", icon: "▣", access: user => admin(user) || has(user,"pos.use") },
  { id: "orders", label: "Pedidos", group: "sales", icon: "≡", access: user => admin(user) || has(user,"pos.use") && has(user,"orders.view") },
  { id: "cash", label: "Caja del turno", group: "sales", icon: "$", access: user => admin(user) || has(user,"cash.manage") },
  { id: "customers", label: "Clientes", group: "sales", icon: "C", access: user => admin(user) || has(user,"customers.manage") },
  { id: "kitchen", label: "Cocina", group: "operations", icon: "♨", access: user => admin(user) || has(user,"kitchen.use") },
  { id: "delivery", label: "Reparto", group: "operations", icon: "➜", access: user => admin(user) || has(user,"delivery.use") },
  { id: "inventory", label: "Inventario", group: "operations", icon: "I", access: user => admin(user) || has(user,"inventory.view") },
  { id: "purchases", label: "Compras", group: "operations", icon: "↓", access: user => admin(user) || has(user,"inventory.view") && has(user,"purchases.manage") },
  { id: "production", label: "Producción", group: "operations", icon: "P", access: user => admin(user) || has(user,"inventory.view") && has(user,"production.manage") },
  { id: "products", label: "Productos", group: "catalog", icon: "◫", access: admin },
  { id: "reports", label: "Reportes", group: "analysis", icon: "↗", access: admin },
  { id: "users", label: "Usuarios y permisos", group: "administration", icon: "U", access: admin },
  { id: "settings", label: "Ajustes", group: "administration", icon: "⚙", access: () => true },
];

export const moduleById = new Map(appModules.map(module => [module.id,module]));
export function modulesForUser(user: NavigationUser): AppModule[] { return appModules.filter(module => module.access(user)); }
export function groupedModules(modules: AppModule[]) { return moduleGroups.map(group => ({...group,modules:modules.filter(module=>module.group===group.id)})).filter(group=>group.modules.length); }
export function mobileModules(user: NavigationUser, allowed: AppModule[]): AppModule[] {
  const ids: Screen[] = admin(user) ? ["dashboard","pos","orders","inventory"]
    : has(user,"kitchen.use") ? ["kitchen","orders"]
    : has(user,"delivery.use") ? ["delivery","orders"]
    : ["pos","orders","cash","customers"];
  return [...ids.map(id=>allowed.find(module=>module.id===id)).filter((module): module is AppModule=>Boolean(module)),...allowed].filter((module,index,list)=>list.findIndex(item=>item.id===module.id)===index).slice(0,4);
}
export function firstAllowed(user: NavigationUser): Screen { return modulesForUser(user)[0]?.id ?? "settings"; }
export function isScreen(value: unknown): value is Screen { return typeof value === "string" && moduleById.has(value as Screen); }
