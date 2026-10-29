import type { IconTone } from "../components/IconBadge";

export type Screen = "dashboard" | "pos" | "cash" | "orders" | "inventory" | "purchases" | "production" | "products" | "recipes" | "kitchen" | "delivery" | "customers" | "users" | "reports" | "settings";
export type ModuleGroupId = "home" | "sales" | "operations" | "catalog" | "analysis" | "administration";
export type NavigationUser = { role: { slug: string }; permissions?: string[] };

export const moduleGroups: { id: ModuleGroupId; label: string }[] = [
  { id: "home", label: "Inicio" }, { id: "sales", label: "Ventas" }, { id: "operations", label: "Operación" },
  { id: "catalog", label: "Catálogo" }, { id: "analysis", label: "Análisis" }, { id: "administration", label: "Administración" },
];

export type AppModule = { id: Screen; label: string; group: ModuleGroupId; icon: string; tone: IconTone; access: (user: NavigationUser) => boolean };
const has = (user: NavigationUser, permission: string) => user.permissions?.includes("*") || user.permissions?.includes(permission) || false;
const admin = (user: NavigationUser) => user.role.slug === "administrador" || has(user, "*");

export const appModules: AppModule[] = [
  { id: "dashboard", label: "Resumen", group: "home", icon: "⌂", tone: "primary", access: user => admin(user) || has(user,"cash.manage") && has(user,"orders.view") && has(user,"inventory.view") },
  { id: "pos", label: "Punto de venta", group: "sales", icon: "▣", tone: "success", access: user => admin(user) || has(user,"pos.use") },
  { id: "orders", label: "Pedidos", group: "sales", icon: "≡", tone: "info", access: user => admin(user) || has(user,"pos.use") && has(user,"orders.view") },
  { id: "cash", label: "Caja del turno", group: "sales", icon: "$", tone: "warning", access: user => admin(user) || has(user,"cash.manage") },
  { id: "customers", label: "Clientes", group: "sales", icon: "C", tone: "primary", access: user => admin(user) || has(user,"customers.manage") },
  { id: "kitchen", label: "Cocina", group: "operations", icon: "♨", tone: "warning", access: user => admin(user) || has(user,"kitchen.use") },
  { id: "delivery", label: "Reparto", group: "operations", icon: "➜", tone: "info", access: user => admin(user) || has(user,"delivery.use") },
  { id: "inventory", label: "Inventario", group: "operations", icon: "I", tone: "success", access: user => admin(user) || has(user,"inventory.view") },
  { id: "purchases", label: "Compras", group: "operations", icon: "↓", tone: "warning", access: user => admin(user) || has(user,"inventory.view") && has(user,"purchases.manage") },
  { id: "production", label: "Producción", group: "operations", icon: "P", tone: "danger", access: user => admin(user) || has(user,"inventory.view") && has(user,"production.manage") },
  { id: "products", label: "Productos", group: "catalog", icon: "◫", tone: "primary", access: admin },
  { id: "recipes", label: "Recetas", group: "catalog", icon: "R", tone: "success", access: admin },
  { id: "reports", label: "Reportes", group: "analysis", icon: "↗", tone: "info", access: admin },
  { id: "users", label: "Usuarios y permisos", group: "administration", icon: "U", tone: "success", access: admin },
  { id: "settings", label: "Ajustes", group: "administration", icon: "⚙", tone: "neutral", access: () => true },
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
/** Where each role starts its shift: the screen it uses most, not the first one in the menu. */
export function homeScreen(user: NavigationUser): Screen {
  const allowed = modulesForUser(user).map((module) => module.id);
  const preferred: Screen[] = admin(user) ? ["dashboard"]
    : has(user, "pos.use") ? ["pos"]
    : has(user, "kitchen.use") ? ["kitchen"]
    : has(user, "delivery.use") ? ["delivery"]
    : [];
  return preferred.find((screen) => allowed.includes(screen)) ?? firstAllowed(user);
}
export function isScreen(value: unknown): value is Screen { return typeof value === "string" && moduleById.has(value as Screen); }
