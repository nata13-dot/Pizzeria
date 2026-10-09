import type { Screen } from "./modules";

export type ScreenComponentKey="dashboard"|"pos"|"orders"|"cash"|"customers"|"users"|"settings"|"inventory"|"purchases"|"production"|"products"|"reports"|"operational";
export const screenComposition:Record<Screen,ScreenComponentKey>={dashboard:"dashboard",pos:"pos",cash:"cash",orders:"orders",inventory:"inventory",purchases:"purchases",production:"production",products:"products",kitchen:"operational",delivery:"operational",customers:"customers",users:"users",reports:"reports",settings:"settings"};
