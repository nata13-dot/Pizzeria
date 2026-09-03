import { StatusBar } from "expo-status-bar";
import { App as CapacitorApp } from "@capacitor/app";
import { Component, type ErrorInfo, type ReactNode, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { api, ApiError, type ApiStockWarning, setUnauthorizedHandler } from "./src/api";
import { CashScreen } from "./src/features/administration/CashScreen";
import { CustomersScreen } from "./src/features/administration/CustomersScreen";
import { UsersScreen } from "./src/features/administration/UsersScreen";
import { SettingsScreen } from "./src/features/administration/SettingsScreen";
import { LogoPicker } from "./src/features/administration/LogoPicker";
import { PosScreen } from "./src/features/pos/PosScreen";
import { InventoryScreen } from "./src/features/operations/InventoryScreen";
import { ProductionScreen } from "./src/features/operations/ProductionScreen";
import { PurchasesScreen } from "./src/features/operations/PurchasesScreen";
import { ordersChannel } from "./src/realtime";
import { registerPush } from "./src/push";
import { printThermalHtml, type ThermalPaperWidth } from "./src/printing";
import { clearSession, readSession, saveSession } from "./src/session";
import { SystemTheme, ThemeToggle } from "./src/SystemTheme";
type Session = {
  token: string;
  user: { id: number; name: string; branch_id: number; permissions: string[]; role: { name: string; slug: string } };
};
type Screen = "dashboard" | "pos" | "cash" | "orders" | "inventory" | "purchases" | "production" | "products" | "kitchen" | "delivery" | "customers" | "users" | "reports" | "settings";
const allScreens: Screen[] = ["dashboard", "pos", "cash", "orders", "inventory", "purchases", "production", "products", "kitchen", "delivery", "customers", "users", "reports", "settings"];
type Product = {
  id: number;
  name: string;
  description?: string | null;
  image_data_uri?: string | null;
  flavors: { id: number; name: string }[];
  variants: { id: number; name: string; price: string; max_flavors: number }[];
};
type OrderStatus = "draft" | "pending_payment" | "confirmed" | "kitchen_pending" | "preparing" | "prepared" | "ready" | "on_way" | "delivered" | "cancelled";
type OrderType = "pickup" | "whatsapp" | "dine_in" | "delivery";
type OrderFlavor = {
  id?: number;
  product_flavor_id?: number;
  ratio?: string | number;
  name?: string;
  flavor?: { id: number; name: string } | null;
};
type OrderModifier = { id?: number; modifier_id?: number; name: string; price?: string | number };
type OrderComponent = {
  id?: number;
  name: string;
  quantity: string | number;
  flavors?: string[];
  modifiers?: OrderModifier[];
  notes?: string | null;
};
type OrderItem = {
  id?: number;
  name: string;
  quantity: string | number;
  notes?: string | null;
  flavors?: OrderFlavor[];
  modifiers?: OrderModifier[];
  components?: OrderComponent[];
};
type OrderHistory = {
  id?: number;
  from_status?: OrderStatus | null;
  to_status: OrderStatus;
  comment?: string | null;
  created_at: string;
};
type Order = {
  id: number;
  daily_number: number;
  status: OrderStatus;
  type: OrderType;
  sales_channel?: "local" | "whatsapp" | "phone" | "other";
  total: string;
  amount_paid?: string | number;
  amount_due?: string | number;
  payment_status?: "paid" | "partial" | "unpaid" | "courtesy";
  collection_required?: boolean;
  collect_on_delivery?: boolean;
  courtesy?: boolean;
  notes?: string | null;
  order_date?: string;
  created_at?: string;
  scheduled_at?: string | null;
  customer?: { id: number; name: string; phone?: string | null } | null;
  delivery?: { recipient: string; phone: string; address: string; references?: string; map_url?: string; payment_received?: boolean } | null;
  payments?: { method: string; amount: string | number }[];
  stock_warnings?: ApiStockWarning[];
  histories?: OrderHistory[];
  items: OrderItem[];
};
type PaginatedOrders = {
  data: Order[];
  current_page: number;
  last_page: number;
};
const labels: Record<Screen, string> = {
  dashboard: "Resumen",
  pos: "Caja / POS",
  cash: "Corte de caja",
  orders: "Pedidos del día",
  inventory: "Inventario",
  purchases: "Compras",
  production: "Producción",
  products: "Productos",
  kitchen: "Cocina",
  delivery: "Reparto",
  customers: "Clientes",
  users: "Usuarios",
  reports: "Reportes",
  settings: "Ajustes",
};
const screenIcons: Record<Screen, string> = {
  dashboard: "⌂", pos: "▣", cash: "$", orders: "≡", inventory: "▦",
  purchases: "↓", production: "◆", products: "◫", kitchen: "♨",
  delivery: "➜", customers: "♙", users: "♟", reports: "↗", settings: "⚙",
};
function hasPermission(user: Session["user"], permission: string): boolean {
  return user.permissions?.includes("*") || user.permissions?.includes(permission);
}
function screensForUser(user: Session["user"]): Screen[] {
  if (user.role.slug === "administrador" || hasPermission(user, "*")) return [...allScreens];
  const screens: Screen[] = [];
  if (hasPermission(user, "cash.manage") && hasPermission(user, "orders.view") && hasPermission(user, "inventory.view")) screens.push("dashboard");
  if (hasPermission(user, "pos.use")) screens.push("pos");
  if (hasPermission(user, "cash.manage")) screens.push("cash");
  if (hasPermission(user, "pos.use") && hasPermission(user, "orders.view")) screens.push("orders");
  if (hasPermission(user, "inventory.view")) screens.push("inventory");
  if (hasPermission(user, "inventory.view") && hasPermission(user, "purchases.manage")) screens.push("purchases");
  if (hasPermission(user, "inventory.view") && hasPermission(user, "production.manage")) screens.push("production");
  if (hasPermission(user, "*")) screens.push("products");
  if (hasPermission(user, "kitchen.use")) screens.push("kitchen");
  if (hasPermission(user, "delivery.use")) screens.push("delivery");
  if (hasPermission(user, "customers.manage")) screens.push("customers");
  if (hasPermission(user, "*")) screens.push("users", "reports", "settings");
  return screens;
}
export default function App() {
  return <><SystemTheme /><AppErrorBoundary><PizzeriaApp /></AppErrorBoundary></>;
}
function PizzeriaApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [restoringSession, setRestoringSession] = useState(true);
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const screenHistory = useRef<Screen[]>([]);
  const screenRef = useRef<Screen>(screen);
  const mobileMenuOpenRef = useRef(false);
  const { width } = useWindowDimensions();
  const compact = width < 780;
  useEffect(() => {
    let active = true;
    readSession<Session>().then(async (stored) => {
      if (!stored) return;
      const user = await api<Session["user"]>("/me", stored.token);
      if (active) {
        const restored = { token: stored.token, user };
        setSession(restored);
        setScreen(screensForUser(user)[0] ?? "dashboard");
        await saveSession(restored);
      }
    }).catch(() => clearSession()).finally(() => { if (active) setRestoringSession(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    setUnauthorizedHandler(() => { clearSession().catch(() => {}); setSession(null); });
    return () => setUnauthorizedHandler(null);
  }, []);
  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);
  useEffect(() => {
    mobileMenuOpenRef.current = mobileMenuOpen;
  }, [mobileMenuOpen]);
  useEffect(() => {
    const listener = CapacitorApp.addListener("backButton", () => {
      if (mobileMenuOpenRef.current) {
        mobileMenuOpenRef.current = false;
        setMobileMenuOpen(false);
        return;
      }
      const previousScreen = screenHistory.current.pop();
      if (previousScreen) {
        screenRef.current = previousScreen;
        setScreen(previousScreen);
        return;
      }
      void CapacitorApp.minimizeApp();
    });
    return () => { void listener.then((handle) => handle.remove()); };
  }, []);
  useEffect(()=>{if(session)registerPush(session.token).catch(()=>{})},[session?.token]);
  if (restoringSession) return <SafeAreaView style={s.loginPage}><ActivityIndicator size="large" color="#cf4b32" /><Text style={s.muted}>Restaurando sesión...</Text></SafeAreaView>;
  if (!session) return <Login onLogin={(next, remember)=>{const screens=screensForUser(next.user);const firstScreen=screens[0] ?? "dashboard";screenHistory.current=[];screenRef.current=firstScreen;setSession(next);setScreen(firstScreen);if(remember)saveSession(next).catch(()=>{});else clearSession().catch(()=>{})}} />;
  const visibleScreens = screensForUser(session.user);
  const currentScreen = visibleScreens.includes(screen) ? screen : visibleScreens[0];
  const isAdministrator = hasPermission(session.user, "*");
  const mobilePriority: Screen[] = ["dashboard", "pos", "orders", "kitchen", "delivery", "cash"];
  const quickScreens = mobilePriority.filter((item) => visibleScreens.includes(item)).slice(0, 4);
  const changeScreen = (next: Screen) => {
    if (next !== screenRef.current) screenHistory.current.push(screenRef.current);
    screenRef.current = next;
    setScreen(next);
    setMobileMenuOpen(false);
  };
  const logout = async () => { try { await api("/logout", session.token, { method: "POST" }); } finally { screenHistory.current=[];await clearSession();setSession(null); } };
  return (
    <SafeAreaView style={s.page}>
      <View style={[s.layout, compact && s.layoutCompact]}>
        {!compact && <View style={s.nav}>
          <View style={s.brandBlock}><View style={s.brandMark}><Text style={s.brandMarkText}>🍕</Text></View><View><Text style={s.brand}>Pizzería</Text><Text style={s.brandCaption}>Gestión integral</Text></View></View>
          <ScrollView
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.navList}
          >
          {visibleScreens.map((x) => (
            <Pressable
              key={x}
              onPress={() => changeScreen(x)}
              style={[s.navItem, currentScreen === x && s.navActive]}
            >
              <Text style={[s.navIcon, currentScreen === x && s.navActiveText]}>{screenIcons[x]}</Text>
              <Text style={currentScreen === x ? s.navActiveText : s.navText}>
                {labels[x]}
              </Text>
            </Pressable>
          ))}
          </ScrollView>
          <View style={s.userCard}><View style={s.avatar}><Text style={s.avatarText}>{session.user.name.slice(0, 1).toUpperCase()}</Text></View><View style={s.userInfo}><Text numberOfLines={1} style={s.userName}>{session.user.name}</Text><Text numberOfLines={1} style={s.userRole}>{session.user.role.name}</Text></View><ThemeToggle /></View>
          <Pressable onPress={logout} style={s.logout}>
            <Text style={s.logoutText}>Cerrar sesión</Text>
          </Pressable>
        </View>}
        {compact && <View style={s.mobileHeader}><View style={s.mobileBrand}><View style={s.mobileBrandMark}><Text>🍕</Text></View><View><Text style={s.mobileBrandName}>Pizzería</Text><Text style={s.mobileRole}>{session.user.role.name}</Text></View></View><View style={s.headerActions}><ThemeToggle /><Pressable accessibilityLabel="Abrir todos los módulos" onPress={() => setMobileMenuOpen(true)} style={s.mobileAvatar}><Text style={s.avatarText}>{session.user.name.slice(0, 1).toUpperCase()}</Text></Pressable></View></View>}
        <ScrollView style={s.content} contentContainerStyle={[s.contentBody, compact && s.contentBodyCompact]}>
          <View style={s.pageHeading}><View><Text style={s.eyebrow}>{session.user.role.name.toUpperCase()}</Text>
          <Text style={[s.title, compact && s.titleCompact]}>{currentScreen ? labels[currentScreen] : "Sin módulos asignados"}</Text>
          </View>{!compact && <Text style={s.headingDate}>{new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}</Text>}</View>
          {!currentScreen ? (
            <View style={s.warningBox}>
              <Text style={s.sectionTitle}>Tu sesión está activa, pero no tiene acceso a ningún módulo.</Text>
              <Text style={s.muted}>Solicita a un administrador que asigne los permisos necesarios a tu rol y vuelve a iniciar sesión.</Text>
            </View>
          ) : currentScreen === "dashboard" ? (
            <Dashboard token={session.token} onNavigate={changeScreen} />
          ) : currentScreen === "pos" ? (
            <PosScreen token={session.token} isAdministrator={isAdministrator} canOverrideStock={hasPermission(session.user, "stock.override")} />
          ) : currentScreen === "orders" ? (
            <OrdersDayScreen
              token={session.token}
              branchId={session.user.branch_id}
              isAdministrator={isAdministrator}
            />
          ) : currentScreen === "cash" ? (
            <CashScreen token={session.token} />
          ) : currentScreen === "customers" ? (
            <CustomersScreen token={session.token} isAdministrator={isAdministrator} />
          ) : currentScreen === "users" ? (
            <UsersScreen token={session.token} currentUserId={session.user.id} />
          ) : currentScreen === "settings" ? (
            <SettingsScreen token={session.token} />
          ) : currentScreen === "inventory" ? (
            <InventoryScreen token={session.token} isAdministrator={isAdministrator} />
          ) : currentScreen === "purchases" ? (
            <PurchasesScreen token={session.token} isAdministrator={isAdministrator} />
          ) : currentScreen === "production" ? (
            <ProductionScreen token={session.token} isAdministrator={isAdministrator} />
          ) : (
            <DataScreen screen={currentScreen} token={session.token} branchId={session.user.branch_id} isAdministrator={isAdministrator} />
          )}
        </ScrollView>
      </View>
      {compact && <View style={s.bottomNav}>{quickScreens.map((item) => <Pressable key={item} onPress={() => changeScreen(item)} style={s.bottomNavItem}><View style={[s.bottomIconWrap, currentScreen === item && s.bottomIconActive]}><Text style={[s.bottomIcon, currentScreen === item && s.bottomTextActive]}>{screenIcons[item]}</Text></View><Text numberOfLines={1} style={[s.bottomLabel, currentScreen === item && s.bottomTextActive]}>{labels[item].replace(" del día", "")}</Text></Pressable>)}<Pressable onPress={() => setMobileMenuOpen(true)} style={s.bottomNavItem}><View style={[s.bottomIconWrap, !quickScreens.includes(currentScreen) && s.bottomIconActive]}><Text style={[s.bottomIcon, !quickScreens.includes(currentScreen) && s.bottomTextActive]}>•••</Text></View><Text style={[s.bottomLabel, !quickScreens.includes(currentScreen) && s.bottomTextActive]}>Más</Text></Pressable></View>}
      <Modal animationType="slide" transparent visible={compact && mobileMenuOpen} onRequestClose={() => setMobileMenuOpen(false)}><Pressable style={s.modalBackdrop} onPress={() => setMobileMenuOpen(false)}><Pressable style={s.menuSheet} onPress={(event) => event.stopPropagation()}><View style={s.sheetHandle} /><View style={s.sheetHeading}><View><Text style={s.sheetTitle}>Todos los módulos</Text><Text style={s.muted}>{session.user.name} · {session.user.role.name}</Text></View><Pressable onPress={() => setMobileMenuOpen(false)} style={s.closeButton}><Text style={s.closeButtonText}>×</Text></Pressable></View><ScrollView contentContainerStyle={s.moduleGrid}>{visibleScreens.map((item) => <Pressable key={item} onPress={() => changeScreen(item)} style={[s.moduleCard, currentScreen === item && s.moduleCardActive]}><Text style={[s.moduleIcon, currentScreen === item && s.navActiveText]}>{screenIcons[item]}</Text><Text style={[s.moduleLabel, currentScreen === item && s.navActiveText]}>{labels[item]}</Text></Pressable>)}</ScrollView><Pressable onPress={logout} style={s.sheetLogout}><Text style={s.sheetLogoutText}>Cerrar sesión</Text></Pressable></Pressable></Pressable></Modal>
      <StatusBar style="auto" />
    </SafeAreaView>
  );
}
class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("Error de interfaz", error, info.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return <SafeAreaView style={s.loginPage}><View style={s.card}><Text style={s.title}>Algo salió mal</Text><Text style={s.error}>{this.state.error.message}</Text><Pressable style={s.primary} onPress={() => this.setState({ error: null })}><Text style={s.primaryText}>Intentar de nuevo</Text></Pressable></View></SafeAreaView>;
  }
}
function Login({ onLogin }: { onLogin: (s: Session, remember: boolean) => void }) {
  const { width } = useWindowDimensions();
  const compact = width < 780;
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [remember, setRemember] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    let form = document.getElementById("pizzeria-login-form") as HTMLFormElement | null;
    if (!form) {
      form = document.createElement("form");
      form.id = "pizzeria-login-form";
      form.autocomplete = "on";
      form.style.display = "none";
      form.addEventListener("submit", (event) => event.preventDefault());
      document.body.appendChild(form);
    }
    const username = document.getElementById("login-username") as HTMLInputElement | null;
    const passwordField = document.getElementById("login-password") as HTMLInputElement | null;
    if (username) { username.name = "username"; username.autocomplete = "username"; username.setAttribute("form", form.id); }
    if (passwordField) { passwordField.name = "password"; passwordField.autocomplete = "current-password"; passwordField.setAttribute("form", form.id); }
    return () => form?.remove();
  }, []);
  async function go() {
    setBusy(true);
    setError("");
    try {
      const authenticated = await api<Session>("/login", undefined, {
          method: "POST",
          body: JSON.stringify({ login: email, password, device_name: Platform.OS }),
        });
      if (Platform.OS === "web" && typeof document !== "undefined") {
        document.getElementById("pizzeria-login-form")?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      }
      onLogin(authenticated, remember);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <SafeAreaView style={[s.loginPage, compact && s.loginPageCompact]}>
      <View style={[s.hero, compact && s.heroCompact]}>
        <Text style={s.pizza}>🍕</Text>
        <Text style={[s.heroTitle, compact && s.heroTitleCompact]}>Tu pizzería,{`\n`}bajo control.</Text>
        <Text style={s.muted}>
          Ventas, cocina, reparto e inventario conectados.
        </Text>
      </View>
      <View style={[s.card, compact && s.cardCompact]}>
        <Text style={s.eyebrow}>BIENVENIDO</Text>
        <Text style={s.title}>Inicia sesión</Text>
        <Text style={s.label}>Correo o usuario</Text>
        <TextInput
          nativeID="login-username"
          accessibilityLabel="Correo o usuario"
          placeholder="Correo o usuario"
          style={s.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="username"
          textContentType="username"
          importantForAutofill="yes"
          returnKeyType="next"
        />
        <Text style={s.label}>Contraseña</Text>
        <TextInput
          nativeID="login-password"
          accessibilityLabel="Contraseña"
          placeholder="Contraseña"
          style={s.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          importantForAutofill="yes"
          returnKeyType="done"
          onSubmitEditing={go}
        />
        <Pressable onPress={() => setRemember((value) => !value)} style={[s.type, remember && s.typeActive]}>
          <Text>{remember ? "✓ Recordar sesión" : "Recordar sesión"}</Text>
        </Pressable>
        {!!error && <Text style={s.error}>{error}</Text>}
        <Pressable
          disabled={busy || !email.trim() || !password}
          style={[s.primary, (busy || !email.trim() || !password) && s.disabled]}
          onPress={go}
        >
          {busy ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={s.primaryText}>Entrar</Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
function Dashboard({token,onNavigate}:{token:string;onNavigate:(screen:Screen)=>void}) {
  const { width } = useWindowDimensions();
  const compact = width < 780;
  type CashDashboard = { gross_sales?: number };
  type OrderDashboard = { total?: number; data?: unknown[] };
  type AlertDashboard = { type: string };
  const [values,setValues]=useState<number[] | null>(null);
  const [error,setError]=useState("");
  const [revision,setRevision]=useState(0);
  useEffect(()=>{let active=true;setError("");Promise.all([api<CashDashboard>("/reports/cash-day",token),api<OrderDashboard>("/orders?status=kitchen_pending",token),api<AlertDashboard[]>("/inventory/alerts",token)]).then(([cash,orders,alerts])=>{if(active)setValues([cash.gross_sales??0,orders.total??orders.data?.length??0,alerts.filter((alert)=>alert.type.includes("stock")).length,alerts.filter((alert)=>["expiring","expired"].includes(alert.type)).length])}).catch((loadError)=>{if(active){setValues(null);setError((loadError as Error).message)}});return()=>{active=false}},[token,revision]);
  if(error)return <View style={s.warningBox}><Text style={s.error}>No se pudo cargar el resumen: {error}</Text><Pressable style={s.secondaryButton} onPress={()=>setRevision((value)=>value+1)}><Text style={s.secondaryText}>Reintentar</Text></Pressable></View>;
  if(!values)return <ActivityIndicator color="#cf4b32" style={{margin:40}}/>;
  return (
    <View style={[s.metrics, compact && s.metricsCompact]}>
      {[{label:"Ventas de hoy",icon:"$",tone:"good",screen:"cash" as Screen},{label:"Pedidos activos",icon:"≡",tone:"primary",screen:"orders" as Screen},{label:"Stock bajo",icon:"!",tone:"warning",screen:"inventory" as Screen},{label:"Por caducar",icon:"⌛",tone:"danger",screen:"inventory" as Screen}].map(
        (item,i) => (
          <Pressable accessibilityRole="button" accessibilityLabel={`Abrir ${item.label}`} onPress={() => onNavigate(item.screen)} style={({pressed}) => [s.metric, compact && s.metricCompact, pressed && s.metricPressed]} key={item.label}>
            <View style={[s.metricIcon, item.tone === "good" ? s.metricGood : item.tone === "warning" ? s.metricWarning : item.tone === "danger" ? s.metricDanger : s.metricPrimary]}><Text style={s.metricIconText}>{item.icon}</Text></View>
            <View><Text style={[s.number, compact && s.numberCompact]}>{i===0?'$':''}{values[i]}</Text>
            <Text style={s.metricLabel}>{item.label}</Text></View>
            <Text style={s.metricLink}>Ver detalle →</Text>
          </Pressable>
        ),
      )}
    </View>
  );
}
function DataScreen({ screen, token, branchId, isAdministrator }: { screen: Screen; token: string; branchId: number; isAdministrator: boolean }) {
  const [data, setData] = useState<any[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true);
  const endpoint =
    screen === "products"
      ? "/products"
      : screen === "customers"
        ? "/customers"
        : screen === "users"
          ? "/users"
        : screen === "reports"
          ? "/reports/cash-day"
          : screen === "settings"
            ? "/business-profile"
      : screen === "kitchen"
        ? "/kitchen/orders"
      : screen === "delivery"
          ? "/delivery/orders"
          : "/products";
  const loadRequestId = useRef(0);
  const loadSource = `${screen}\u0000${endpoint}\u0000${token}`;
  const loadSourceRef = useRef(loadSource);
  loadSourceRef.current = loadSource;
  async function load(showSpinner = true) {
    const requestId = ++loadRequestId.current;
    const requestSource = loadSource;
    if (showSpinner) setBusy(true);
    setError("");
    try {
      const x: any = await api(endpoint, token);
      if (requestId !== loadRequestId.current || requestSource !== loadSourceRef.current) return;
      setData(x.data ?? (Array.isArray(x)?x:[x]));
    } catch (e) {
      if (requestId !== loadRequestId.current || requestSource !== loadSourceRef.current) return;
      setError((e as Error).message);
    } finally {
      if (requestId === loadRequestId.current && requestSource === loadSourceRef.current) setBusy(false);
    }
  }
  useEffect(() => {
    load();
    return () => { loadRequestId.current += 1; };
  }, [screen, token]);
  useEffect(() => {
    if (screen === "kitchen" || screen === "delivery") {
      const refresh = setInterval(() => load(false), 10000);
      const leave = ordersChannel(token, branchId, () => load(false));
      return () => {
        clearInterval(refresh);
        leave();
      };
    }
  }, [screen, token, branchId]);
  async function action(order: Order, status: OrderStatus): Promise<boolean> {
    setError("");
    try {
      await api(`/orders/${order.id}/status`, token, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      await load(false);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  }
  if (busy) return <ActivityIndicator color="#cf4b32" style={{ margin: 40 }} />;
  if (error && !data.length) return <View style={s.warningBox}>
    <Text style={s.error}>{error}</Text>
    <Pressable style={s.secondaryButton} onPress={() => load()}><Text style={s.secondaryText}>Reintentar</Text></Pressable>
  </View>;
  if (screen === "pos") return <Pos products={data} token={token} />;
  if (screen === "customers") return <CustomersView data={data} token={token} onSaved={load} canConfigure={isAdministrator} />;
  if (screen === "users") return <UsersView data={data} token={token} onSaved={load} />;
  if (screen === "reports") return <Reports token={token} />;
  if (screen === "settings") return <AdministrationView profile={data[0] ?? {}} token={token} />;
  if (screen === "products") return <ProductsView data={data} token={token} onSaved={load} canConfigure={isAdministrator} />;
  if (screen === "kitchen") return <View>
    {!!error && <Text style={s.error}>{error}</Text>}
    <KitchenBoard orders={data as Order[]} token={token} onAction={action} />
  </View>;
  if (screen === "delivery") return <View>
    {!!error && <Text style={s.error}>{error}</Text>}
    <DeliveryBoard orders={data as Order[]} token={token} onAction={action} onReload={() => load(false)} />
  </View>;
  return <Empty />;
}
function confirmOperation(message: string): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(globalThis.confirm(message));
  return new Promise((resolve) => Alert.alert("Confirmar acción", message, [
    { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
    { text: "Aceptar", onPress: () => resolve(true) },
  ], { cancelable: true, onDismiss: () => resolve(false) }));
}
async function openPhoneDialer(phone?: string | null): Promise<void> {
  const normalized = (phone ?? "").trim().replace(/[^\d+]/g, "");
  if (!normalized) return;
  await Linking.openURL(`tel:${normalized}`);
}
const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  pickup: "Recoger",
  whatsapp: "WhatsApp",
  dine_in: "Consumo en local",
  delivery: "Domicilio",
};
const SALES_CHANNEL_LABELS: Record<string, string> = { local: "Local", whatsapp: "WhatsApp", phone: "Teléfono", other: "Otro" };
const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  draft: "Borrador",
  pending_payment: "Pendiente de pago",
  confirmed: "Confirmado",
  kitchen_pending: "En cola de cocina",
  preparing: "En preparación",
  prepared: "Preparado",
  ready: "Listo",
  on_way: "En camino",
  delivered: "Entregado",
  cancelled: "Cancelado",
};
const ORDER_GROUPS: { key: string; label: string; statuses: OrderStatus[] }[] = [
  { key: "draft", label: "Borradores", statuses: ["draft"] },
  { key: "pending", label: "Pendientes de pago", statuses: ["pending_payment"] },
  { key: "confirmed", label: "Confirmados y programados", statuses: ["confirmed"] },
  { key: "process", label: "En proceso", statuses: ["kitchen_pending", "preparing", "prepared", "on_way"] },
  { key: "ready", label: "Listos", statuses: ["ready"] },
  { key: "delivered", label: "Entregados", statuses: ["delivered"] },
  { key: "cancelled", label: "Cancelados", statuses: ["cancelled"] },
];
type KitchenSendFailure = { warnings: ApiStockWarning[]; message: string };

function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function OrdersDayScreen({ token, branchId, isAdministrator }: { token: string; branchId: number; isAdministrator: boolean }) {
  const { width } = useWindowDimensions();
  const compact = width < 780;
  const [date, setDate] = useState(localDateKey);
  const [orders, setOrders] = useState<Order[]>([]);
  const [busy, setBusy] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [workingOrderIds, setWorkingOrderIds] = useState<number[]>([]);
  const [sendFailures, setSendFailures] = useState<Record<number, KitchenSendFailure>>({});
  const [cancellationReasons, setCancellationReasons] = useState<Record<number, string>>({});
  const loadRequestId = useRef(0);
  const actionLocks = useRef(new Set<number>());

  async function load(initial = false, indicate = false): Promise<Order[] | null> {
    const requestId = ++loadRequestId.current;
    if (initial) setBusy(true);
    if (indicate) setRefreshing(true);
    setError("");
    try {
      const basePath = `/orders?date=${encodeURIComponent(date)}`;
      const firstPage = await api<PaginatedOrders>(`${basePath}&page=1`, token);
      const lastPage = Math.max(1, Number(firstPage.last_page) || 1);
      const remainingPages = lastPage > 1
        ? await Promise.all(Array.from({ length: lastPage - 1 }, (_, index) => api<PaginatedOrders>(`${basePath}&page=${index + 2}`, token)))
        : [];
      if (requestId !== loadRequestId.current) return null;
      const uniqueOrders = new Map<number, Order>();
      [firstPage, ...remainingPages].forEach((page) => page.data.forEach((order) => uniqueOrders.set(order.id, order)));
      const nextOrders = Array.from(uniqueOrders.values());
      setOrders(nextOrders);
      setSendFailures((current) => Object.fromEntries(
        Object.entries(current).filter(([orderId]) => uniqueOrders.get(Number(orderId))?.status === "confirmed"),
      ));
      return nextOrders;
    } catch (loadError) {
      if (requestId === loadRequestId.current) setError((loadError as Error).message);
      return null;
    } finally {
      if (requestId === loadRequestId.current) {
        setBusy(false);
        setRefreshing(false);
      }
    }
  }

  useEffect(() => {
    load(true);
    return () => { loadRequestId.current += 1; };
  }, [date, token]);
  useEffect(() => {
    const midnightCheck = setInterval(() => setDate((current) => {
      const today = localDateKey();
      return current === today ? current : today;
    }), 60000);
    return () => clearInterval(midnightCheck);
  }, []);
  useEffect(() => {
    const refresh = setInterval(() => load(false), 10000);
    const leave = ordersChannel(token, branchId, () => load(false));
    return () => {
      clearInterval(refresh);
      leave();
    };
  }, [date, token, branchId]);

  function beginAction(orderId: number): boolean {
    if (actionLocks.current.has(orderId)) return false;
    actionLocks.current.add(orderId);
    setWorkingOrderIds((current) => current.includes(orderId) ? current : [...current, orderId]);
    setActionError("");
    setNotice("");
    return true;
  }
  function finishAction(orderId: number): void {
    actionLocks.current.delete(orderId);
    setWorkingOrderIds((current) => current.filter((id) => id !== orderId));
  }
  function clearSendFailure(orderId: number): void {
    setSendFailures((current) => {
      if (!current[orderId]) return current;
      const next = { ...current };
      delete next[orderId];
      return next;
    });
  }
  async function reconcileOperation(
    orderId: number,
    completed: (order: Order) => boolean,
    successMessage: string,
  ): Promise<boolean> {
    const refreshedOrders = await load(false);
    const refreshedOrder = refreshedOrders?.find((order) => order.id === orderId);
    if (refreshedOrder && completed(refreshedOrder)) {
      clearSendFailure(orderId);
      setActionError("");
      setNotice(successMessage);
      return true;
    }
    return false;
  }

  async function confirmOrder(order: Order): Promise<void> {
    if (!beginAction(order.id)) return;
    try {
      const total = Number(order.total);
      if (!Number.isFinite(total) || total < 0) {
        setActionError(`La orden #${order.daily_number} no tiene un total válido.`);
        return;
      }
      const collectOnDelivery = order.type === "delivery" && order.collect_on_delivery === true;
      const paymentMessage = order.courtesy
        ? `¿Confirmas la cortesía de la orden #${order.daily_number}?`
        : collectOnDelivery
          ? `¿Confirmas la orden #${order.daily_number} con cobro de $${total.toFixed(2)} contra entrega?`
          : `¿Confirmas el pago en efectivo de $${total.toFixed(2)} para la orden #${order.daily_number}?`;
      if (!(await confirmOperation(paymentMessage))) return;
      try {
        await api<Order>(`/orders/${order.id}/confirm`, token, {
          method: "POST",
          body: JSON.stringify({ payments: order.courtesy || collectOnDelivery ? [] : [{ method: "cash", amount: total }] }),
        });
        setNotice(order.courtesy
          ? `Orden #${order.daily_number} confirmada como cortesía.`
          : collectOnDelivery
            ? `Orden #${order.daily_number} confirmada con cobro contra entrega.`
            : `Orden #${order.daily_number} confirmada con pago en efectivo.`);
        await load(false);
      } catch (confirmError) {
        const reconciled = await reconcileOperation(
          order.id,
          (current) => !["draft", "pending_payment", "cancelled"].includes(current.status),
          `La orden #${order.daily_number} ya quedó confirmada; se recuperó su estado actualizado.`,
        );
        if (!reconciled) setActionError((confirmError as Error).message);
      }
    } finally {
      finishAction(order.id);
    }
  }

  async function performKitchenSend(order: Order, allowStockShortage: boolean): Promise<boolean> {
    try {
      await api<Order>(`/orders/${order.id}/send-to-kitchen`, token, {
        method: "POST",
        body: allowStockShortage ? JSON.stringify({ allow_stock_shortage: true }) : undefined,
      });
      clearSendFailure(order.id);
      setNotice(`Orden #${order.daily_number} enviada a cocina${allowStockShortage ? " con faltante autorizado" : ""}.`);
      await load(false);
      return true;
    } catch (sendError) {
      if (sendError instanceof ApiError && sendError.code === "stock_shortage") {
        const warnings = sendError.stockWarnings;
        setSendFailures((current) => ({ ...current, [order.id]: { warnings, message: sendError.message } }));
        setNotice(`La orden #${order.daily_number} sigue confirmada y no se duplicó; falta autorizar inventario insuficiente.`);
        if (!isAdministrator) {
          setActionError(`La orden #${order.daily_number} requiere que un administrador autorice el faltante de inventario.`);
          return false;
        }
        if (!allowStockShortage && await confirmOperation(`${stockWarningDescription(warnings)}\n\n¿Autorizas el faltante y el envío de la orden #${order.daily_number} a cocina?`)) {
          return performKitchenSend(order, true);
        }
        return false;
      }
      const reconciled = await reconcileOperation(
        order.id,
        (current) => current.status !== "confirmed",
        `La orden #${order.daily_number} ya avanzó; se recuperó su estado actualizado sin repetirla.`,
      );
      if (!reconciled) {
        const message = (sendError as Error).message;
        setSendFailures((current) => ({ ...current, [order.id]: { warnings: [], message } }));
        setActionError(`No se pudo enviar la orden #${order.daily_number}. Puedes reintentar únicamente el envío a cocina.`);
      }
      return reconciled;
    }
  }

  async function sendToKitchen(order: Order): Promise<void> {
    if (!beginAction(order.id)) return;
    try {
      const persistedWarnings = order.status === "confirmed" ? order.stock_warnings ?? [] : [];
      const failure = sendFailures[order.id] ?? (persistedWarnings.length
        ? { warnings: persistedWarnings, message: "La orden está detenida por inventario insuficiente." }
        : undefined);
      if (failure?.warnings.length) {
        if (!isAdministrator) {
          setActionError(`La orden #${order.daily_number} requiere que un administrador autorice el faltante de inventario.`);
          return;
        }
        if (!(await confirmOperation(`${stockWarningDescription(failure.warnings)}\n\n¿Autorizas el faltante y el envío de la orden #${order.daily_number} a cocina?`))) return;
        await performKitchenSend(order, true);
        return;
      }
      const prompt = failure
        ? `¿Deseas reintentar únicamente el envío de la orden #${order.daily_number} a cocina?`
        : `¿Deseas enviar la orden #${order.daily_number} a cocina?`;
      if (await confirmOperation(prompt)) await performKitchenSend(order, false);
    } finally {
      finishAction(order.id);
    }
  }

  async function cancelOrder(order: Order): Promise<void> {
    if (!beginAction(order.id)) return;
    try {
      const advanced = ["preparing", "prepared", "ready", "on_way"].includes(order.status);
      const reason = cancellationReasons[order.id]?.trim() ?? "";
      if (advanced && !reason) {
        setActionError(`Escribe el motivo antes de cancelar la orden #${order.daily_number}; la preparación ya inició.`);
        return;
      }
      const wasteWarning = advanced
        ? " La preparación ya inició y la cancelación puede registrar merma."
        : "";
      if (!(await confirmOperation(`¿Confirmas cancelar la orden #${order.daily_number}?${wasteWarning}`))) return;
      try {
        await api<Order>(`/orders/${order.id}/cancel`, token, {
          method: "POST",
          body: JSON.stringify({ comment: reason || "Cancelado desde Pedidos del día" }),
        });
        clearSendFailure(order.id);
        setCancellationReasons((current) => {
          if (!current[order.id]) return current;
          const next = { ...current };
          delete next[order.id];
          return next;
        });
        setNotice(`Orden #${order.daily_number} cancelada.`);
        await load(false);
      } catch (cancelError) {
        const reconciled = await reconcileOperation(
          order.id,
          (current) => current.status === "cancelled",
          `La orden #${order.daily_number} ya estaba cancelada; se recuperó su estado actualizado.`,
        );
        if (!reconciled) setActionError((cancelError as Error).message);
      }
    } finally {
      finishAction(order.id);
    }
  }

  async function markDelivered(order: Order): Promise<void> {
    if (!beginAction(order.id)) return;
    try {
      if (!(await confirmOperation(`¿Confirmas que la orden #${order.daily_number} fue entregada?`))) return;
      try {
        await api<Order>(`/orders/${order.id}/status`, token, {
          method: "POST",
          body: JSON.stringify({ status: "delivered" }),
        });
        setNotice(`Orden #${order.daily_number} entregada.`);
        await load(false);
      } catch (deliveryError) {
        const reconciled = await reconcileOperation(
          order.id,
          (current) => current.status === "delivered",
          `La orden #${order.daily_number} ya estaba entregada; se recuperó su estado actualizado.`,
        );
        if (!reconciled) setActionError((deliveryError as Error).message);
      }
    } finally {
      finishAction(order.id);
    }
  }

  function orderCard(order: Order) {
    const working = workingOrderIds.includes(order.id);
    const storedWarnings = order.status === "confirmed" ? order.stock_warnings ?? [] : [];
    const sendFailure = sendFailures[order.id] ?? (storedWarnings.length
      ? { warnings: storedWarnings, message: "La orden está detenida por inventario insuficiente." }
      : undefined);
    const canConfirm = ["draft", "pending_payment"].includes(order.status);
    const scheduledAt = order.scheduled_at ? Date.parse(order.scheduled_at) : Number.NaN;
    const scheduledIsDue = Number.isFinite(scheduledAt) && scheduledAt <= Date.now();
    const canSend = order.status === "confirmed" && (!order.scheduled_at || scheduledIsDue || Boolean(sendFailure?.warnings.length));
    const canDeliver = order.status === "ready" && order.type !== "delivery";
    const contactPhone = order.delivery?.phone || order.customer?.phone;
    const advancedCancellation = ["preparing", "prepared", "ready", "on_way"].includes(order.status);
    const canCancel = !["delivered", "cancelled"].includes(order.status) && (!advancedCancellation || isAdministrator);
    return <View style={s.order} key={order.id}>
      <OrderContents order={order} />
      <View style={[s.orderSummary, compact && s.orderSummaryCompact]}>
        <Text style={s.badge}>{ORDER_STATUS_LABELS[order.status]}</Text>
        <Text style={s.orderTotal}>${Number(order.total).toFixed(2)}</Text>
      </View>
      {order.customer && <Text style={s.muted}>Cliente: {order.customer.name}{order.customer.phone ? ` · ${order.customer.phone}` : ""}</Text>}
      {order.status === "confirmed" && order.scheduled_at && <Text style={s.scheduled}>Se enviará automáticamente a cocina en su ventana de preparación.</Text>}
      {sendFailure && <View style={s.warningBox}>
        <Text style={s.label}>{sendFailure.warnings.length ? "Faltante de inventario" : "Envío a cocina pendiente"}</Text>
        {sendFailure.warnings.length
          ? sendFailure.warnings.map((warning) => <Text style={s.muted} key={`${order.id}-${warning.ingredient_id ?? warning.name}`}>{warning.name}: requerido {warning.required ?? "-"}, disponible {warning.available ?? "-"}, faltan {warning.shortage}</Text>)
          : <Text style={s.muted}>{sendFailure.message}</Text>}
        {!!sendFailure.warnings.length && !isAdministrator && <Text style={s.error}>Solicita la autorización de un administrador.</Text>}
      </View>}
      {advancedCancellation && canCancel && <TextInput
        style={s.cancelReasonInput}
        value={cancellationReasons[order.id] ?? ""}
        onChangeText={(value) => setCancellationReasons((current) => ({ ...current, [order.id]: value }))}
        placeholder="Motivo obligatorio para cancelar y registrar merma"
        multiline
      />}
      {advancedCancellation && !isAdministrator && <Text style={s.muted}>Solo un administrador puede cancelar este pedido porque la preparación ya inició.</Text>}
      <View style={s.reportActions}>
        {!!contactPhone && <Pressable style={s.secondaryButton} onPress={() => openPhoneDialer(contactPhone)}><Text style={s.secondaryText}>☎ Llamar {contactPhone}</Text></Pressable>}
        {canConfirm && <Pressable disabled={working} style={[s.smallButton, working && s.disabled]} onPress={() => confirmOrder(order)}><Text style={s.primaryText}>{order.courtesy ? "Confirmar cortesía" : order.collect_on_delivery ? "Confirmar contra entrega" : "Confirmar y cobrar efectivo"}</Text></Pressable>}
        {canSend && (!sendFailure?.warnings.length || isAdministrator) && <Pressable disabled={working} style={[s.smallButton, working && s.disabled]} onPress={() => sendToKitchen(order)}><Text style={s.primaryText}>{sendFailure?.warnings.length ? "Autorizar faltante y enviar" : sendFailure ? "Reintentar envío a cocina" : "Enviar a cocina"}</Text></Pressable>}
        {canDeliver && <Pressable disabled={working} style={[s.smallButton, working && s.disabled]} onPress={() => markDelivered(order)}><Text style={s.primaryText}>Marcar entregado</Text></Pressable>}
        {canCancel && <Pressable disabled={working} style={[s.dangerButton, working && s.disabled]} onPress={() => cancelOrder(order)}><Text style={s.dangerText}>Cancelar pedido</Text></Pressable>}
        {working && <ActivityIndicator color="#cf4b32" />}
      </View>
    </View>;
  }

  return <View>
    <View style={[s.ordersToolbar, compact && s.ordersToolbarCompact]}>
      <View>
        <Text style={s.sectionTitle}>Operación de {new Date(`${date}T00:00:00`).toLocaleDateString()}</Text>
        <Text style={s.muted}>{orders.length} pedido(s), incluyendo estados cerrados</Text>
      </View>
      <Pressable disabled={refreshing} style={[s.secondaryButton, refreshing && s.disabled]} onPress={() => load(false, true)}>
        <Text style={s.secondaryText}>{refreshing ? "Actualizando..." : "Actualizar"}</Text>
      </Pressable>
    </View>
    {!!error && <View style={s.warningBox}><Text style={s.error}>{error}</Text><Pressable style={s.secondaryButton} onPress={() => load(!orders.length, true)}><Text style={s.secondaryText}>Reintentar actualización</Text></Pressable></View>}
    {!!actionError && <Text style={s.error}>{actionError}</Text>}
    {!!notice && <Text style={s.notice}>{notice}</Text>}
    {busy ? <ActivityIndicator color="#cf4b32" style={{ margin: 40 }} /> : ORDER_GROUPS.map((group) => {
      const groupOrders = orders.filter((order) => group.statuses.includes(order.status));
      return <View style={s.orderGroup} key={group.key}>
        <Text style={s.boardTitle}>{group.label} ({groupOrders.length})</Text>
        {groupOrders.map(orderCard)}
        {!groupOrders.length && <Text style={s.groupEmpty}>Sin pedidos en este estado.</Text>}
      </View>;
    })}
  </View>;
}

function quantityLabel(value: string | number): string {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toLocaleString(undefined, { maximumFractionDigits: 4 }) : String(value);
}
function OrderItemContents({ item }: { item: OrderItem }) {
  const selections = item.flavors ?? [];
  const flavors = selections.map((selection) => {
    const name = selection.flavor?.name ?? selection.name ?? (selection.product_flavor_id ? `Sabor #${selection.product_flavor_id}` : "Sabor sin nombre");
    const ratio = Number(selection.ratio);
    return selections.length > 1 && Number.isFinite(ratio) && ratio > 0
      ? `${Math.round(ratio * 100)}% ${name}`
      : name;
  });
  const modifiers = (item.modifiers ?? []).map((modifier) => modifier.name);
  return <View style={s.orderItemDetail}>
    <Text style={s.productName}>{quantityLabel(item.quantity)} × {item.name}</Text>
    {!!flavors.length && <Text style={s.itemOption}>Sabores: {flavors.join(" / ")}</Text>}
    {!!modifiers.length && <Text style={s.itemOption}>Modificadores: {modifiers.join(", ")}</Text>}
    {!!item.notes && <Text style={s.itemNotes}>Nota: {item.notes}</Text>}
    {(item.components ?? []).map((component, index) => {
      const componentModifiers = (component.modifiers ?? []).map((modifier) => modifier.name);
      return <View style={s.comboComponent} key={component.id ?? `${component.name}-${index}`}>
        <Text style={s.componentName}>↳ {quantityLabel(component.quantity)} × {component.name}</Text>
        {!!component.flavors?.length && <Text style={s.itemOption}>Sabores: {component.flavors.join(" / ")}</Text>}
        {!!componentModifiers.length && <Text style={s.itemOption}>Modificadores: {componentModifiers.join(", ")}</Text>}
        {!!component.notes && <Text style={s.itemNotes}>Nota: {component.notes}</Text>}
      </View>;
    })}
  </View>;
}
function OrderContents({ order }: { order: Order }) {
  return <View style={s.orderContents}>
    <Text style={s.orderNo}>Orden #{order.daily_number}</Text>
    <Text style={s.orderMeta}>Tipo: {ORDER_TYPE_LABELS[order.type]}</Text>
    {!!order.sales_channel && <Text style={s.orderMeta}>Canal: {SALES_CHANNEL_LABELS[order.sales_channel] ?? order.sales_channel}</Text>}
    {order.scheduled_at
      ? <Text style={s.scheduled}>Programada: {new Date(order.scheduled_at).toLocaleString()}</Text>
      : <Text style={s.muted}>Horario: inmediato</Text>}
    {!!order.notes && <Text style={s.orderNotes}>Notas del pedido: {order.notes}</Text>}
    {(order.items ?? []).map((item, index) => <OrderItemContents item={item} key={item.id ?? `${item.name}-${index}`} />)}
    {!order.items?.length && <Text style={s.muted}>Sin detalle de productos</Text>}
  </View>;
}
type OrderStatusAction = (order: Order, status: OrderStatus) => Promise<boolean>;
function KitchenBoard({ orders, token, onAction }: { orders: Order[]; token: string; onAction: OrderStatusAction }) {
  const { width } = useWindowDimensions();
  const compact = width < 920;
  const [workingOrderIds, setWorkingOrderIds] = useState<number[]>([]);
  const actionLocks = useRef(new Set<number>());
  const columns: { status: OrderStatus; title: string }[] = [
    { status: "kitchen_pending", title: "Pendientes" },
    { status: "preparing", title: "En preparación" },
    { status: "prepared", title: "Preparados" },
  ];
  async function advance(order: Order) {
    if (actionLocks.current.has(order.id)) return;
    actionLocks.current.add(order.id);
    setWorkingOrderIds((current) => [...current, order.id]);
    const next: OrderStatus = order.status === "kitchen_pending" ? "preparing" : order.status === "preparing" ? "prepared" : "ready";
    const label = next === "preparing" ? "iniciar la preparación" : next === "prepared" ? "marcar la orden como preparada" : order.type === "delivery" ? "enviarla a reparto" : "marcarla lista para recoger";
    try {
      if (await confirmOperation(`¿Deseas ${label}?`)) await onAction(order, next);
    } finally {
      actionLocks.current.delete(order.id);
      setWorkingOrderIds((current) => current.filter((id) => id !== order.id));
    }
  }
  return <View style={[s.board, compact && s.boardCompact]}>{columns.map(({ status, title }) => {
    const columnOrders = orders.filter((order) => order.status === status);
    return <View style={[s.boardColumn, compact && s.boardColumnCompact]} key={status}>
      <Text style={s.boardTitle}>{title} ({columnOrders.length})</Text>
      {columnOrders.map((order) => {
        const working = workingOrderIds.includes(order.id);
        return <View style={s.order} key={order.id}>
        <Pressable disabled={working} style={[s.smallButton, compact && s.kitchenActionCompact, working && s.disabled]} onPress={() => advance(order)}>
          {working ? <ActivityIndicator color="white" /> : <Text style={s.primaryText}>{status === "kitchen_pending" ? "Iniciar" : status === "preparing" ? "Marcar preparada" : order.type === "delivery" ? "Lista para reparto" : "Lista para recoger"}</Text>}
        </Pressable>
        <OrderContents order={order} />
        <KitchenElapsedTime order={order} />
        <DocumentButton order={order} token={token} kind="kitchen" />
      </View>})}
      {!columnOrders.length && <Text style={s.empty}>Sin pedidos</Text>}
    </View>;
  })}</View>;
}
function latestHistoryDate(order: Order, status: OrderStatus): string | undefined {
  return order.histories
    ?.filter((history) => history.to_status === status && Number.isFinite(Date.parse(history.created_at)))
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))[0]?.created_at;
}
function KitchenElapsedTime({ order }: { order: Order }) {
  const kitchenPendingAt = latestHistoryDate(order, "kitchen_pending");
  const preparingAt = latestHistoryDate(order, "preparing");
  const preparedAt = latestHistoryDate(order, "prepared");
  if (order.status === "kitchen_pending") return <ElapsedTime label="En cola" from={kitchenPendingAt} />;
  if (order.status === "preparing") return <ElapsedTime label="En preparación" from={preparingAt} />;
  return <ElapsedTime label="Tiempo de preparación" from={preparingAt ?? kitchenPendingAt} to={preparedAt} />;
}
function ElapsedTime({ from, to, label }: { from?: string; to?: string; label: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (to) return;
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, [to]);
  if (!from) return null;
  const fromTime = Date.parse(from);
  const toTime = to ? Date.parse(to) : now;
  if (!Number.isFinite(fromTime) || !Number.isFinite(toTime)) return null;
  return <Text style={s.timer}>⏱ {label}: {Math.max(0, Math.floor((toTime - fromTime) / 60000))} min</Text>;
}
function DeliveryBoard({ orders, token, onAction, onReload }: { orders: Order[]; token: string; onAction: OrderStatusAction; onReload: () => void }) {
  const [paymentError, setPaymentError] = useState("");
  const ready = orders.filter((order) => order.status === "ready");
  const onWay = orders.filter((order) => order.status === "on_way");
  const scheduled = orders.filter((order) => !["ready", "on_way"].includes(order.status) && order.scheduled_at);
  const amountDue = (order: Order) => {
    const value = Number(order.amount_due);
    return Number.isFinite(value) && value > 0 ? value : 0;
  };
  const mustCollect = (order: Order) => order.collection_required === true && amountDue(order) > 0.009;
  async function advance(order: Order) {
    const next: OrderStatus = order.status === "ready" ? "on_way" : "delivered";
    if (next === "delivered" && mustCollect(order)) {
      setPaymentError(`La orden #${order.daily_number} todavía tiene saldo pendiente. Registra el cobro antes de entregarla.`);
      return;
    }
    if (await confirmOperation(next === "on_way" ? "¿Confirmas que el pedido va en camino?" : "¿Confirmas que el pedido fue entregado?")) {
      await onAction(order, next);
    }
  }
  async function payment(order: Order) {
    const due = amountDue(order);
    if (!mustCollect(order) || !(await confirmOperation(`¿Confirmas que recibiste $${due.toFixed(2)} en efectivo?`))) return;
    setPaymentError("");
    try {
      await api(`/delivery/orders/${order.id}/payment-received`, token, {
        method: "POST",
        body: JSON.stringify({ method: "cash" }),
      });
      onReload();
    } catch (error) {
      setPaymentError((error as Error).message);
    }
  }
  function card(order: Order) {
    const delivery = order.delivery;
    const due = amountDue(order);
    const collectionRequired = mustCollect(order);
    const paymentLabel = order.payment_status === "courtesy"
      ? "Cortesía, sin cobro"
      : order.payment_status === "partial"
        ? "Pago parcial"
        : order.payment_status === "unpaid"
          ? "Pendiente de pago"
          : "Pago completo";
    const mapUrl = delivery?.map_url ?? (delivery?.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(delivery.address)}` : null);
    return <View style={s.order} key={order.id}>
      <OrderContents order={order} />
      <Text style={s.productName}>{delivery?.recipient ?? "Cliente sin nombre"}</Text>
      <Text>{delivery?.address ?? "Dirección pendiente"}</Text>
      {delivery?.references && <Text style={s.muted}>Referencias: {delivery.references}</Text>}
      {collectionRequired
        ? <Text style={s.total}>Cobrar ${due.toFixed(2)}</Text>
        : <Text style={s.paid}>✓ Sin saldo por cobrar</Text>}
      <Text style={s.muted}>Pago: {paymentLabel}</Text>
      <View style={s.reportActions}>
        {delivery?.phone && <Pressable style={s.secondaryButton} onPress={() => openPhoneDialer(delivery.phone)}><Text style={s.secondaryText}>☎ Llamar</Text></Pressable>}
        {delivery?.phone && <Pressable style={s.secondaryButton} onPress={() => Linking.openURL(`https://wa.me/${delivery.phone.replace(/\D/g, "")}`)}><Text style={s.secondaryText}>WhatsApp</Text></Pressable>}
        {mapUrl && <Pressable style={s.secondaryButton} onPress={() => Linking.openURL(mapUrl)}><Text style={s.secondaryText}>Mapa</Text></Pressable>}
      </View>
      {["ready", "on_way"].includes(order.status) && <Pressable style={s.smallButton} onPress={() => advance(order)}><Text style={s.primaryText}>{order.status === "ready" ? "Marcar en camino" : "Marcar entregado"}</Text></Pressable>}
      {["ready", "on_way"].includes(order.status) && collectionRequired && <Pressable style={s.secondaryButton} onPress={() => payment(order)}><Text style={s.secondaryText}>Registrar cobro en efectivo</Text></Pressable>}
      <DocumentButton order={order} token={token} kind="delivery" />
    </View>;
  }
  return <View>
    {!!paymentError && <Text style={s.error}>{paymentError}</Text>}
    <Text style={s.sectionTitle}>Listos para entregar</Text>{ready.map(card)}{!ready.length && <Empty />}
    <Text style={s.sectionTitle}>En camino</Text>{onWay.map(card)}{!onWay.length && <Empty />}
    <Text style={s.sectionTitle}>Programados próximos</Text>{scheduled.map(card)}{!scheduled.length && <Empty />}
  </View>;
}
function CustomersView({ data, token, onSaved, canConfigure }: { data: any[]; token: string; onSaved: () => void; canConfigure: boolean }) {
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [email, setEmail] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const [customerId, setCustomerId] = useState<number | null>(null); const [addressLabel, setAddressLabel] = useState("Casa"); const [address, setAddress] = useState(""); const [references, setReferences] = useState(""); const [mapUrl, setMapUrl] = useState("");
  const [ruleName, setRuleName] = useState(""); const [ruleType, setRuleType] = useState("per_amount"); const [threshold, setThreshold] = useState("100"); const [points, setPoints] = useState("1"); const [expiresDays, setExpiresDays] = useState(""); const [rules, setRules] = useState<any[]>([]);
  useEffect(() => { api<any[]>("/loyalty-rules", token).then(setRules).catch(() => {}); }, [token]);
  async function save() { setBusy(true); setMessage(""); try { await api("/customers", token, { method: "POST", body: JSON.stringify({ name: name.trim(), phone: phone.trim(), email: email.trim() || null }) }); setName(""); setPhone(""); setEmail(""); setMessage("Cliente registrado."); await onSaved(); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); } }
  async function saveAddress() { if (!customerId || !address.trim()) return; setBusy(true); setMessage(""); try { await api(`/customers/${customerId}/addresses`, token, { method:"POST", body:JSON.stringify({label:addressLabel.trim(),address:address.trim(),references:references.trim()||null,map_url:mapUrl.trim()||null,is_default:true}) }); setAddress("");setReferences("");setMapUrl("");setMessage("Dirección registrada.");await onSaved(); } catch(error){setMessage((error as Error).message);}finally{setBusy(false);} }
  async function saveRule(){setBusy(true);setMessage("");try{const rule=await api<any>("/loyalty-rules",token,{method:"POST",body:JSON.stringify({name:ruleName.trim(),type:ruleType,threshold:Number(threshold),points:Number(points),expires_days:expiresDays?Number(expiresDays):null})});setRules((current)=>[...current,rule]);setRuleName("");setMessage("Regla de puntos registrada.");}catch(error){setMessage((error as Error).message);}finally{setBusy(false);}}
  return <View>
    <View style={s.formCard}><Text style={s.sectionTitle}>Registrar cliente</Text><TextInput style={s.input} placeholder="Nombre completo" value={name} onChangeText={setName} /><TextInput style={s.input} placeholder="Teléfono" value={phone} onChangeText={setPhone} keyboardType="phone-pad" /><TextInput style={s.input} placeholder="Correo (opcional)" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />{!!message && <Text style={s.notice}>{message}</Text>}<Pressable disabled={busy || !name.trim() || !phone.trim()} style={[s.primary, (busy || !name.trim() || !phone.trim()) && s.disabled]} onPress={save}><Text style={s.primaryText}>{busy ? "Guardando..." : "Registrar cliente"}</Text></Pressable></View>
    <View style={s.formCard}><Text style={s.sectionTitle}>Agregar dirección</Text><View style={s.types}>{data.map((customer)=><Pressable key={customer.id} onPress={()=>setCustomerId(customer.id)} style={[s.type,customerId===customer.id&&s.typeActive]}><Text>{customer.name}</Text></Pressable>)}</View><TextInput style={s.input} placeholder="Alias (Casa, Trabajo...)" value={addressLabel} onChangeText={setAddressLabel}/><TextInput style={s.input} placeholder="Dirección completa" value={address} onChangeText={setAddress}/><TextInput style={s.input} placeholder="Referencias" value={references} onChangeText={setReferences}/><TextInput style={s.input} placeholder="Enlace de mapa (opcional)" value={mapUrl} onChangeText={setMapUrl} autoCapitalize="none"/><Pressable disabled={busy||!customerId||!address.trim()} style={[s.primary,(busy||!customerId||!address.trim())&&s.disabled]} onPress={saveAddress}><Text style={s.primaryText}>Guardar dirección</Text></Pressable></View>
    {canConfigure&&<View style={s.formCard}><Text style={s.sectionTitle}>Reglas de puntos</Text><TextInput style={s.input} placeholder="Nombre de la regla" value={ruleName} onChangeText={setRuleName}/><View style={s.types}>{[["per_amount","Por monto"],["per_order","Por pedido"],["product","Por producto"],["category","Por categoría"]].map(([key,label])=><Pressable key={key} onPress={()=>setRuleType(key)} style={[s.type,ruleType===key&&s.typeActive]}><Text>{label}</Text></Pressable>)}</View><View style={s.inlineFields}><TextInput style={[s.input,s.flexField]} placeholder="Cada monto/pedidos" value={threshold} onChangeText={setThreshold} keyboardType="decimal-pad"/><TextInput style={[s.input,s.flexField]} placeholder="Puntos" value={points} onChangeText={setPoints} keyboardType="decimal-pad"/><TextInput style={[s.input,s.flexField]} placeholder="Caduca en días" value={expiresDays} onChangeText={setExpiresDays} keyboardType="number-pad"/></View><Pressable disabled={busy||!ruleName.trim()} style={[s.primary,(busy||!ruleName.trim())&&s.disabled]} onPress={saveRule}><Text style={s.primaryText}>Guardar regla</Text></Pressable>{rules.map((rule)=><Text key={rule.id} style={s.muted}>{rule.name}: {rule.points} punto(s)</Text>)}</View>}
    <FlatList data={data} keyExtractor={(item) => String(item.id)} renderItem={({item}) => <View style={s.row}><View style={s.rowText}><Text style={s.productName}>{item.name}</Text><Text style={s.muted}>{item.phone} · {item.email ?? "Sin correo"}</Text>{(item.addresses??[]).map((customerAddress:any)=><Text style={s.muted} key={customerAddress.id}>{customerAddress.label}: {customerAddress.address}</Text>)}</View><Text style={s.stock}>{item.points_balance ?? 0} pts</Text></View>} ListEmptyComponent={<Empty />} />
  </View>;
}
function UsersView({ data, token, onSaved }: { data: any[]; token: string; onSaved: () => void }) {
  const [roles, setRoles] = useState<any[]>([]); const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [roleId, setRoleId] = useState<number | null>(null); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { api<any[]>("/roles", token).then((next) => { setRoles(next); setRoleId(next[0]?.id ?? null); }).catch((error) => setMessage((error as Error).message)); }, [token]);
  async function save() { setBusy(true); setMessage(""); try { await api("/users", token, { method: "POST", body: JSON.stringify({ name: name.trim(), email: email.trim(), password, role_id: roleId }) }); setName(""); setEmail(""); setPassword(""); setMessage("Usuario registrado."); await onSaved(); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); } }
  return <View><View style={s.formCard}><Text style={s.sectionTitle}>Registrar usuario</Text><TextInput style={s.input} placeholder="Nombre" value={name} onChangeText={setName} /><TextInput style={s.input} placeholder="Correo" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" /><TextInput style={s.input} placeholder="Contraseña (mínimo 8 caracteres)" value={password} onChangeText={setPassword} secureTextEntry /><View style={s.types}>{roles.map((role) => <Pressable key={role.id} onPress={() => setRoleId(role.id)} style={[s.type, roleId === role.id && s.typeActive]}><Text>{role.name}</Text></Pressable>)}</View>{!!message && <Text style={s.notice}>{message}</Text>}<Pressable disabled={busy || !name.trim() || !email.trim() || password.length < 8 || !roleId} style={[s.primary, (busy || !name.trim() || !email.trim() || password.length < 8 || !roleId) && s.disabled]} onPress={save}><Text style={s.primaryText}>{busy ? "Guardando..." : "Registrar usuario"}</Text></Pressable></View><FlatList data={data} keyExtractor={(item) => String(item.id)} renderItem={({item}) => <View style={s.row}><View><Text style={s.productName}>{item.name}</Text><Text style={s.muted}>{item.email} · {item.role?.name}</Text></View><Text style={item.active ? s.activeText : s.error}>{item.active ? "Activo" : "Inactivo"}</Text></View>} ListEmptyComponent={<Empty />} /></View>;
}
function AdministrationView({ profile, token }: { profile: any; token: string }) {
  const [name, setName] = useState(profile.name ?? ""), [phone, setPhone] = useState(profile.phone ?? ""), [address, setAddress] = useState(profile.address ?? ""), [footer, setFooter] = useState(profile.receipt_footer ?? ""), [cash, setCash] = useState<any>(null), [opening, setOpening] = useState("0"), [actual, setActual] = useState(""), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  async function reloadCash() { setCash(await api<any>("/reports/cash-day", token)); }
  useEffect(() => { reloadCash().catch((error) => setMessage((error as Error).message)); }, [token]);
  async function save() { setBusy(true); setMessage(""); try { await api("/business-profile", token, { method: "PUT", body: JSON.stringify({ name: name.trim(), phone: phone.trim() || null, address: address.trim() || null, receipt_footer: footer.trim() || null }) }); setMessage("Datos del negocio guardados."); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); } }
  async function openCash() { setBusy(true); setMessage(""); try { await api("/cash-days/open", token, { method: "POST", body: JSON.stringify({ opening_amount: Number(opening) || 0 }) }); await reloadCash(); setMessage("Caja abierta."); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); } }
  async function closeCash() { if (!cash?.cash_day_id || !(await confirmOperation("¿Confirmas el cierre de caja?"))) return; setBusy(true); setMessage(""); try { await api(`/cash-days/${cash.cash_day_id}/close`, token, { method: "POST", body: JSON.stringify({ actual_amount: Number(actual) }) }); await reloadCash(); setMessage("Caja cerrada."); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); } }
  return <View><View style={s.formCard}><Text style={s.sectionTitle}>Datos del negocio y notas</Text><TextInput style={s.input} placeholder="Nombre comercial" value={name} onChangeText={setName} /><TextInput style={s.input} placeholder="Teléfono" value={phone} onChangeText={setPhone} /><TextInput style={s.input} placeholder="Dirección" value={address} onChangeText={setAddress} /><TextInput style={s.input} placeholder="Mensaje de agradecimiento" value={footer} onChangeText={setFooter} /><Pressable style={[s.primary, (busy || !name.trim()) && s.disabled]} disabled={busy || !name.trim()} onPress={save}><Text style={s.primaryText}>Guardar datos</Text></Pressable></View><View style={s.formCard}><Text style={s.sectionTitle}>Caja diaria</Text>{cash && <View style={s.metrics}><Metric label="Ventas" value={`$${Number(cash.gross_sales ?? 0).toFixed(2)}`} /><Metric label="Efectivo esperado" value={`$${Number(cash.expected_cash ?? 0).toFixed(2)}`} /><Metric label="Compras desde caja" value={`$${Number(cash.cash_purchases ?? 0).toFixed(2)}`} /></View>}{!cash?.cash_day_id ? <><TextInput style={s.input} placeholder="Fondo inicial" value={opening} onChangeText={setOpening} keyboardType="decimal-pad" /><Pressable style={s.primary} onPress={openCash}><Text style={s.primaryText}>Abrir caja</Text></Pressable></> : cash.closed_at ? <Text style={s.paid}>Caja cerrada</Text> : <><TextInput style={s.input} placeholder="Efectivo real para cierre" value={actual} onChangeText={setActual} keyboardType="decimal-pad" /><Pressable style={s.smallButton} onPress={closeCash}><Text style={s.primaryText}>Cerrar caja</Text></Pressable></>}{!!message && <Text style={s.notice}>{message}</Text>}</View></View>;
}
function Reports({ token }: { token: string }) {
  const options = [
    ["cash-day", "Caja"],
    ["sales", "Ventas"],
    ["products", "Productos"],
    ["inventory", "Inventario"],
    ["purchases", "Compras"],
    ["customers", "Clientes"],
    ["profit", "Utilidad"],
    ["times", "Tiempos"],
  ];
  const [report, setReport] = useState(options[0][0]);
  const [data, setData] = useState<any>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function load(next = report) {
    setBusy(true);
    setMessage("");
    try {
      const query = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString();
      setData(await api(`/reports/${next}${query ? `?${query}` : ""}`, token));
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    load(report);
  }, [report]);
  async function daily() {
    setBusy(true);
    try {
      const response = await api<any>("/reports/daily", token, { method: "POST" });
      setMessage("Reporte diario generado.");
      if (response.whatsapp_url) Linking.openURL(response.whatsapp_url);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={s.reportLayout}>
      <View style={s.types}>
        {options.map(([key, label]) => (
          <Pressable key={key} onPress={() => setReport(key)} style={[s.type, report === key && s.typeActive]}>
            <Text>{label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={s.reportActions}>
        <Pressable style={s.smallButton} onPress={() => load()}>
          <Text style={s.primaryText}>Actualizar</Text>
        </Pressable>
        <Pressable style={s.smallButton} onPress={daily}>
          <Text style={s.primaryText}>Reporte WhatsApp</Text>
        </Pressable>
      </View>
      <View style={s.inlineFields}><TextInput style={[s.input, s.flexField]} placeholder="Desde AAAA-MM-DD" value={from} onChangeText={setFrom} /><TextInput style={[s.input, s.flexField]} placeholder="Hasta AAAA-MM-DD" value={to} onChangeText={setTo} /></View>
      {busy ? <ActivityIndicator color="#cf4b32" style={{ margin: 30 }} /> : <ReportData data={data} />}
      {!!message && <Text style={s.notice}>{message}</Text>}
    </View>
  );
}
function ProductsView({ data, token, onSaved, canConfigure }: { data: any[]; token: string; onSaved: () => void; canConfigure: boolean }) {
  const [ingredients, setIngredients] = useState<any[]>([]); const [name, setName] = useState(""); const [description, setDescription] = useState(""); const [productImage, setProductImage] = useState(""); const [type, setType] = useState("pizza"); const [variantName, setVariantName] = useState(""); const [price, setPrice] = useState(""); const [maxFlavors, setMaxFlavors] = useState("1"); const [half, setHalf] = useState(false); const [flavorNames, setFlavorNames] = useState("");
  const variants = data.flatMap((product) => (product.variants ?? []).map((variant: any) => ({ ...variant, product })));
  const [recipeVariantId, setRecipeVariantId] = useState<number | null>(null); const selectedVariant = variants.find((variant) => variant.id === recipeVariantId); const [recipeFlavorId, setRecipeFlavorId] = useState<number | null>(null); const [recipeName, setRecipeName] = useState(""); const [recipeIngredientId, setRecipeIngredientId] = useState<number | null>(null); const [recipeQuantity, setRecipeQuantity] = useState(""); const [component, setComponent] = useState("base"); const [recipeItems, setRecipeItems] = useState<{ingredient_id:number;name:string;quantity:number;component:string}[]>([]); const [recipeVariantSearch, setRecipeVariantSearch] = useState(""); const [recipeIngredientSearch, setRecipeIngredientSearch] = useState(""); const [editingProductId, setEditingProductId] = useState<number | null>(null); const [editDescription, setEditDescription] = useState(""); const [editImage, setEditImage] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const visibleRecipeVariants = variants.filter((variant) => `${variant.product.name} ${variant.name}`.toLocaleLowerCase().includes(recipeVariantSearch.trim().toLocaleLowerCase()));
  const visibleRecipeIngredients = ingredients.filter((ingredient) => ingredient.name.toLocaleLowerCase().includes(recipeIngredientSearch.trim().toLocaleLowerCase())).slice(0, 20);
  const componentLabels: Record<string, string> = { base: "Base", topping: "Ingrediente", sauce: "Salsa", packaging: "Empaque", other: "Otro" };
  useEffect(() => { api<any>("/ingredients?per_page=100", token).then((response) => { const next = response.data ?? response; setIngredients(next); setRecipeIngredientId(next[0]?.id ?? null); }).catch((error) => setMessage((error as Error).message)); }, [token]);
  useEffect(() => { if (!recipeVariantId && variants[0]) setRecipeVariantId(variants[0].id); }, [data]);
  async function saveProduct() { setBusy(true); setMessage(""); try { await api("/products", token, { method:"POST", body:JSON.stringify({ name:name.trim(), description:description.trim() || null, image_data_uri:productImage || null, type, variants:[{name:variantName.trim(),price:Number(price),max_flavors:Number(maxFlavors),allows_half_and_half:half}], flavors:flavorNames.split(",").map((flavor)=>flavor.trim()).filter(Boolean).map((flavor)=>({name:flavor})) }) }); setName("");setDescription("");setProductImage("");setVariantName("");setPrice("");setFlavorNames("");setMessage("Producto y variante registrados.");await onSaved(); } catch(error){setMessage((error as Error).message);}finally{setBusy(false);} }
  function editProduct(product:any){setEditingProductId(product.id);setEditDescription(product.description ?? "");setEditImage(product.image_data_uri ?? "");setMessage("");}
  async function saveProductPresentation(){if(!editingProductId)return;setBusy(true);setMessage("");try{await api(`/products/${editingProductId}`,token,{method:"PATCH",body:JSON.stringify({description:editDescription.trim() || null,image_data_uri:editImage || null})});setEditingProductId(null);setMessage("Imagen y descripción actualizadas.");await onSaved();}catch(error){setMessage((error as Error).message);}finally{setBusy(false);}}
  function addRecipeItem(){const ingredient=ingredients.find((item)=>item.id===recipeIngredientId);const parsed=Number(recipeQuantity);if(!ingredient||parsed<=0)return;setRecipeItems((current)=>[...current.filter((item)=>!(item.ingredient_id===ingredient.id&&item.component===component)),{ingredient_id:ingredient.id,name:ingredient.name,quantity:parsed,component}]);setRecipeQuantity("");}
  async function saveRecipe(){if(!recipeVariantId||!recipeItems.length)return;setBusy(true);setMessage("");try{await api("/recipes",token,{method:"POST",body:JSON.stringify({product_variant_id:recipeVariantId,product_flavor_id:recipeFlavorId,name:recipeName.trim(),items:recipeItems.map(({name:_name,...item})=>item)})});setRecipeName("");setRecipeItems([]);setMessage("Receta de venta registrada.");await onSaved();}catch(error){setMessage((error as Error).message);}finally{setBusy(false);}}
  return (
    <View>
      {canConfigure&&<View style={s.formCard}><Text style={s.sectionTitle}>Crear producto y variante</Text><TextInput style={s.input} placeholder="Nombre del producto" value={name} onChangeText={setName}/><TextInput style={[s.input,s.multilineInput]} multiline maxLength={500} placeholder="Descripción corta para mostrar en Caja" value={description} onChangeText={setDescription}/><LogoPicker value={productImage} onChange={setProductImage} onError={setMessage} emptyLabel="Seleccionar o arrastrar foto del producto" changeLabel="Cambiar foto del producto" />{!!productImage&&<Pressable onPress={()=>setProductImage("")} style={s.secondaryButton}><Text style={s.secondaryText}>Quitar imagen</Text></Pressable>}<View style={s.types}>{[["pizza","Pizza"],["wings","Alitas"],["fries","Papas"],["nuggets","Nuggets"],["cone","Cono"],["beverage","Bebida"],["extra","Extra"],["other","Otro"]].map(([key,label])=><Pressable key={key} onPress={()=>setType(key)} style={[s.type,type===key&&s.typeActive]}><Text>{label}</Text></Pressable>)}</View><View style={s.inlineFields}><TextInput style={[s.input,s.flexField]} placeholder="Variante/tamaño" value={variantName} onChangeText={setVariantName}/><TextInput style={[s.input,s.flexField]} placeholder="Precio" value={price} onChangeText={setPrice} keyboardType="decimal-pad"/><TextInput style={[s.input,s.flexField]} placeholder="Máx. sabores" value={maxFlavors} onChangeText={setMaxFlavors} keyboardType="number-pad"/></View><TextInput style={s.input} placeholder="Sabores separados por coma" value={flavorNames} onChangeText={setFlavorNames}/>{type==="pizza"&&<Pressable onPress={()=>setHalf((value)=>!value)} style={[s.type,half&&s.typeActive]}><Text>{half?"Mitad y mitad habilitada":"Habilitar mitad y mitad"}</Text></Pressable>}<Pressable disabled={busy||!name.trim()||!variantName.trim()||!price} style={[s.primary,(busy||!name.trim()||!variantName.trim()||!price)&&s.disabled]} onPress={saveProduct}><Text style={s.primaryText}>Guardar producto</Text></Pressable></View>}
      {canConfigure&&<View style={s.formCard}>
        <Text style={s.sectionTitle}>Crear receta de venta</Text>
        <Text style={s.formIntro}>Define qué insumos debe descontar el inventario cada vez que se venda esta presentación.</Text>
        <View style={s.formStep}>
          <View style={s.stepHeading}><Text style={s.stepBadge}>1</Text><Text style={s.stepTitle}>Producto y receta</Text></View>
          <TextInput style={s.input} placeholder="Buscar producto o tamaño" value={recipeVariantSearch} onChangeText={setRecipeVariantSearch}/>
          <View style={s.types}>{visibleRecipeVariants.map((variant)=><Pressable key={variant.id} onPress={()=>{setRecipeVariantId(variant.id);setRecipeFlavorId(null);}} style={[s.type,recipeVariantId===variant.id&&s.typeActive]}><Text>{variant.product.name} · {variant.name}</Text></Pressable>)}</View>
          {!visibleRecipeVariants.length&&<Text style={s.muted}>No hay variantes que coincidan con la búsqueda.</Text>}
          {!!selectedVariant&&<View style={s.selectedSummary}><Text style={s.label}>Seleccionado</Text><Text>{selectedVariant.product.name} · {selectedVariant.name}</Text></View>}
          {!!selectedVariant?.product.flavors?.length&&<><Text style={s.label}>Sabor específico (opcional)</Text><View style={s.types}><Pressable onPress={()=>setRecipeFlavorId(null)} style={[s.type,recipeFlavorId===null&&s.typeActive]}><Text>Todos los sabores</Text></Pressable>{selectedVariant.product.flavors.map((flavor:any)=><Pressable key={flavor.id} onPress={()=>setRecipeFlavorId(flavor.id)} style={[s.type,recipeFlavorId===flavor.id&&s.typeActive]}><Text>{flavor.name}</Text></Pressable>)}</View></>}
          <TextInput style={s.input} placeholder="Nombre de la receta, por ejemplo Pizza grande" value={recipeName} onChangeText={setRecipeName}/>
        </View>
        <View style={s.formStep}>
          <View style={s.stepHeading}><Text style={s.stepBadge}>2</Text><Text style={s.stepTitle}>Agregar insumos</Text></View>
          <TextInput style={s.input} placeholder="Buscar insumo" value={recipeIngredientSearch} onChangeText={setRecipeIngredientSearch}/>
          <View style={s.types}>{visibleRecipeIngredients.map((ingredient)=><Pressable key={ingredient.id} onPress={()=>setRecipeIngredientId(ingredient.id)} style={[s.type,recipeIngredientId===ingredient.id&&s.typeActive]}><Text>{ingredient.name}</Text></Pressable>)}</View>
          {!visibleRecipeIngredients.length&&<Text style={s.muted}>No hay insumos que coincidan con la búsqueda.</Text>}
          {ingredients.length>20&&!recipeIngredientSearch.trim()&&<Text style={s.muted}>Mostrando los primeros 20 insumos. Usa la búsqueda para encontrar otro.</Text>}
          <Text style={s.label}>Tipo de componente</Text>
          <View style={s.types}>{Object.entries(componentLabels).map(([key,label])=><Pressable key={key} onPress={()=>setComponent(key)} style={[s.type,component===key&&s.typeActive]}><Text>{label}</Text></Pressable>)}</View>
          <View style={s.inlineFields}><TextInput style={[s.input,s.flexField]} placeholder="Cantidad en unidad base" value={recipeQuantity} onChangeText={setRecipeQuantity} keyboardType="decimal-pad"/><Pressable disabled={!recipeIngredientId||Number(recipeQuantity)<=0} style={[s.secondaryButton,(!recipeIngredientId||Number(recipeQuantity)<=0)&&s.disabled]} onPress={addRecipeItem}><Text style={s.secondaryText}>Agregar insumo</Text></Pressable></View>
        </View>
        <View style={s.formStep}>
          <View style={s.stepHeading}><Text style={s.stepBadge}>3</Text><Text style={s.stepTitle}>Revisar receta</Text><Text style={s.recipeCount}>{recipeItems.length} insumo{recipeItems.length===1?"":"s"}</Text></View>
          {!recipeItems.length?<Text style={s.muted}>Agrega al menos un insumo para guardar la receta.</Text>:<View style={s.recipeList}>{recipeItems.map((item)=><View style={s.recipeRow} key={`${item.ingredient_id}-${item.component}`}><View style={s.recipeRowInfo}><Text style={s.label}>{item.name}</Text><Text style={s.muted}>{item.quantity} · {componentLabels[item.component]??item.component}</Text></View><Pressable accessibilityRole="button" onPress={()=>setRecipeItems((current)=>current.filter((row)=>row!==item))}><Text style={s.remove}>Quitar</Text></Pressable></View>)}</View>}
          <Pressable disabled={busy||!recipeVariantId||!recipeName.trim()||!recipeItems.length} style={[s.primary,(busy||!recipeVariantId||!recipeName.trim()||!recipeItems.length)&&s.disabled]} onPress={saveRecipe}><Text style={s.primaryText}>{busy?"Guardando...":`Guardar receta (${recipeItems.length})`}</Text></Pressable>
        </View>
      </View>}
      {!!message&&<Text style={s.notice}>{message}</Text>}
      <FlatList
      data={data}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => (
        <View style={s.row}>
          {item.image_data_uri?<Image source={{uri:item.image_data_uri}} resizeMode="cover" style={s.catalogImage}/>:<View style={s.catalogImagePlaceholder}><Text>🍕</Text></View>}
          <View style={s.rowText}>
            <Text style={s.productName}>{item.name}</Text>
            <Text style={s.muted}>{item.category?.name ?? "Sin categoría"} · {item.type}</Text>
            <Text numberOfLines={2} style={s.muted}>{item.description || "Sin descripción corta"}</Text>
            {canConfigure&&<Pressable onPress={()=>editProduct(item)}><Text style={s.editLink}>Editar imagen y descripción</Text></Pressable>}
            {editingProductId===item.id&&<View style={s.inlineEditor}><TextInput style={[s.input,s.multilineInput]} multiline maxLength={500} placeholder="Descripción corta" value={editDescription} onChangeText={setEditDescription}/><LogoPicker value={editImage} onChange={setEditImage} onError={setMessage} emptyLabel="Seleccionar o arrastrar foto" changeLabel="Cambiar foto" /><View style={s.reportActions}><Pressable disabled={busy} onPress={saveProductPresentation} style={s.smallButton}><Text style={s.primaryText}>Guardar cambios</Text></Pressable>{!!editImage&&<Pressable disabled={busy} onPress={()=>setEditImage("")} style={s.secondaryButton}><Text style={s.secondaryText}>Quitar imagen</Text></Pressable>}<Pressable disabled={busy} onPress={()=>setEditingProductId(null)} style={s.secondaryButton}><Text style={s.secondaryText}>Cancelar</Text></Pressable></View></View>}
          </View>
          <Text style={s.stock}>{item.variants?.length ?? 0}</Text>
        </View>
      )}
      ListEmptyComponent={<Empty />}
      />
    </View>
  );
}
function ReportData({ data }: { data: any }) {
  if (!data) return <Empty />;
  if (Array.isArray(data)) {
    return (
      <FlatList
        data={data}
        keyExtractor={(item, index) => String(item.id ?? item.name ?? index)}
        renderItem={({ item }) => <ReportRow item={item} />}
        ListEmptyComponent={<Empty />}
      />
    );
  }
  return (
    <View style={s.metrics}>
      {Object.entries(data).map(([key, value]) => {
        if (Array.isArray(value)) return <View style={s.reportList} key={key}><Text style={s.sectionTitle}>{key.replaceAll("_", " ")}</Text>{value.slice(0, 8).map((item, index) => <ReportRow key={`${key}-${index}`} item={item} />)}</View>;
        if (value && typeof value === "object") return <ReportRow key={key} item={{ [key]: value }} />;
        return <Metric key={key} label={key.replaceAll("_", " ")} value={String(value ?? "-")} />;
      })}
    </View>
  );
}
function ReportRow({ item }: { item: any }) {
  const entries = Object.entries(item).filter(([, value]) => typeof value !== "object").slice(0, 5);
  return (
    <View style={s.row}>
      <View>
        <Text style={s.productName}>{String(item.name ?? item.product ?? item.date ?? item.order_date ?? item.id ?? "Registro")}</Text>
        <Text style={s.muted}>{entries.map(([key, value]) => `${key.replaceAll("_", " ")}: ${String(value)}`).join(" · ")}</Text>
      </View>
    </View>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.metric}>
      <Text style={s.number}>{value}</Text>
      <Text style={s.muted}>{label}</Text>
    </View>
  );
}
function DocumentButton({ order, token, kind }: { order: Order; token: string; kind: "kitchen" | "delivery" }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [paperWidth, setPaperWidth] = useState<ThermalPaperWidth>(80);
  async function generate(action: "print" | "share") {
    setBusy(true);
    setMessage("");
    try {
      const doc = await api<{ content?: string; whatsapp_url?: string }>(`/orders/${order.id}/generate-document`, token, {
        method: "POST",
        body: JSON.stringify({ type: kind }),
      });
      if (action === "print") {
        if (!doc.content) throw new Error("El servidor no devolvió el contenido para imprimir.");
        await printThermalHtml(doc.content, paperWidth);
        setMessage(kind === "kitchen" ? "Comanda enviada al sistema de impresión." : "Nota de reparto enviada al sistema de impresión.");
      } else {
        if (!doc.whatsapp_url) throw new Error("El servidor no devolvió el enlace para compartir.");
        await Linking.openURL(doc.whatsapp_url);
        setMessage(kind === "kitchen" ? "Comanda lista para compartir." : "Nota de reparto lista para compartir.");
      }
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={s.documentActions}>
      <View style={s.types}>{([58, 80] as ThermalPaperWidth[]).map((width) => <Pressable key={width} onPress={() => setPaperWidth(width)} style={[s.type, paperWidth === width && s.typeActive]}><Text>{width} mm</Text></Pressable>)}</View>
      <View style={s.inlineFields}><Pressable style={s.secondaryButton} onPress={() => generate("print")} disabled={busy}><Text style={s.secondaryText}>{busy ? "Preparando..." : kind === "kitchen" ? "Imprimir comanda" : "Imprimir reparto"}</Text></Pressable><Pressable style={s.secondaryButton} onPress={() => generate("share")} disabled={busy}><Text style={s.secondaryText}>Compartir</Text></Pressable></View>
      {!!message && <Text style={s.notice}>{message}</Text>}
    </View>
  );
}
function createOrderIdempotencyKey(): string {
  return `pos-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;
}
function stockWarningDescription(warnings: ApiStockWarning[]): string {
  if (!warnings.length) return "La API reportó inventario insuficiente sin detalle de insumos.";
  return warnings.map((warning) => {
    const required = warning.required === undefined ? "sin dato" : String(warning.required);
    const available = warning.available === undefined ? "sin dato" : String(warning.available);
    return `${warning.name}: requerido ${required}, disponible ${available}, faltan ${warning.shortage}`;
  }).join("\n");
}
function Pos({ products, token }: { products: Product[]; token: string }) {
  type Cart = {
    variantId: number;
    name: string;
    price: number;
    quantity: number;
    flavorIds: number[];
    flavorNames: string[];
  };
  type PendingKitchenSend = { order: Order; warnings: ApiStockWarning[]; error: string };
  const [cart, setCart] = useState<Cart[]>([]),
    [type, setType] = useState("pickup"),
    [customers, setCustomers] = useState<any[]>([]),
    [customerId, setCustomerId] = useState<number | null>(null),
    [paymentMethod, setPaymentMethod] = useState("cash"),
    [cashAmount, setCashAmount] = useState(""),
    [recipient, setRecipient] = useState(""),
    [phone, setPhone] = useState(""),
    [address, setAddress] = useState(""),
    [references, setReferences] = useState(""),
    [scheduledAt, setScheduledAt] = useState(""),
    [notes, setNotes] = useState(""),
    [draftRevision, setDraftRevision] = useState(0),
    [idempotencyKey, setIdempotencyKey] = useState(createOrderIdempotencyKey),
    [pendingKitchenSend, setPendingKitchenSend] = useState<PendingKitchenSend | null>(null),
    [lastOrder, setLastOrder] = useState<Order | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const submissionInFlight = useRef(false);
  const total = cart.reduce((n, x) => n + x.price * x.quantity, 0);
  useEffect(() => {
    api<any>("/customers", token).then((response) => setCustomers(response.data ?? response)).catch(() => {});
  }, [token]);
  function selectCustomer(customer: any | null) {
    setCustomerId(customer?.id ?? null);
    const customerAddress = customer?.addresses?.find((item: any) => item.is_default) ?? customer?.addresses?.[0];
    setRecipient(customer?.name ?? "");
    setPhone(customer?.phone ?? "");
    setAddress(customerAddress?.address ?? "");
    setReferences(customerAddress?.references ?? "");
  }
  function resetOrderDraft() {
    setCart([]);
    setType("pickup");
    setCustomerId(null);
    setPaymentMethod("cash");
    setCashAmount("");
    setRecipient("");
    setPhone("");
    setAddress("");
    setReferences("");
    setScheduledAt("");
    setNotes("");
    setDraftRevision((revision) => revision + 1);
    setIdempotencyKey(createOrderIdempotencyKey());
  }
  function add(p: Product, v: Product["variants"][0], flavors: Product["flavors"]) {
    const flavorIds = flavors.map((x) => x.id).sort((a, b) => a - b);
    setCart((c) => {
      const found = c.find(
        (x) => x.variantId === v.id && x.flavorIds.join() === flavorIds.join(),
      );
      return found
        ? c.map((x) => (x === found ? { ...x, quantity: x.quantity + 1 } : x))
        : [
            ...c,
            {
              variantId: v.id,
              name: `${p.name} ${v.name}`,
              price: +v.price,
              quantity: 1,
              flavorIds,
              flavorNames: flavors.map((x) => x.name),
            },
          ];
    });
  }
  async function sendCreatedOrderToKitchen(order: Order, allowStockShortage = false): Promise<boolean> {
    try {
      const sent = await api<Order>(`/orders/${order.id}/send-to-kitchen`, token, {
        method: "POST",
        body: allowStockShortage ? JSON.stringify({ allow_stock_shortage: true }) : undefined,
      });
      setPendingKitchenSend(null);
      setLastOrder(sent);
      setMessage(
        `Orden #${sent.daily_number} enviada a cocina.${sent.stock_warnings?.length ? " Advertencias autorizadas: " + sent.stock_warnings.map((warning) => `${warning.name} (-${warning.shortage})`).join(", ") : ""}`,
      );
      return true;
    } catch (error) {
      if (error instanceof ApiError && error.code === "stock_shortage") {
        const warnings = error.stockWarnings;
        const detail = stockWarningDescription(warnings);
        setPendingKitchenSend({ order, warnings, error: error.message });
        setMessage(`La orden #${order.daily_number} fue creada, pero aún no se envió a cocina por inventario insuficiente.`);
        if (!allowStockShortage && await confirmOperation(`${detail}\n\n¿Deseas autorizar el faltante y enviar únicamente esta orden a cocina?`)) {
          return sendCreatedOrderToKitchen(order, true);
        }
        return false;
      }
      const errorMessage = (error as Error).message;
      setPendingKitchenSend({ order, warnings: [], error: errorMessage });
      setMessage(`La orden #${order.daily_number} fue creada, pero no se pudo enviar a cocina. Usa “Reintentar envío”; no vuelvas a crearla.`);
      return false;
    }
  }
  async function retryPendingKitchenSend() {
    if (!pendingKitchenSend || submissionInFlight.current) return;
    submissionInFlight.current = true;
    const authorizeShortage = pendingKitchenSend.warnings.length > 0;
    if (authorizeShortage && !(await confirmOperation(`${stockWarningDescription(pendingKitchenSend.warnings)}\n\n¿Autorizas el faltante y el envío a cocina?`))) {
      submissionInFlight.current = false;
      return;
    }
    setBusy(true);
    try {
      await sendCreatedOrderToKitchen(pendingKitchenSend.order, authorizeShortage);
    } finally {
      submissionInFlight.current = false;
      setBusy(false);
    }
  }
  async function submit(status: "draft" | "pending_payment" | "confirmed") {
    if (submissionInFlight.current) return;
    const scheduled = scheduledAt.trim();
    if (type === "delivery" && (!recipient.trim() || !phone.trim() || !address.trim())) {
      setMessage("Completa nombre, teléfono y dirección para el envío.");
      return;
    }
    const cash = Number(cashAmount);
    if (status === "confirmed" && paymentMethod === "mixed" && (!Number.isFinite(cash) || cash <= 0 || cash >= total)) {
      setMessage("En pago mixto, el efectivo debe ser mayor que $0 y menor que el total.");
      return;
    }
    submissionInFlight.current = true;
    if (status === "confirmed" && !(await confirmOperation(
        scheduled
          ? `¿Confirmas el cobro de $${total.toFixed(2)} y el pedido programado?`
          : `¿Confirmas el cobro de $${total.toFixed(2)} y el envío a cocina?`,
      ))) {
      submissionInFlight.current = false;
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const payments = status !== "confirmed" || paymentMethod === "courtesy"
        ? []
        : paymentMethod === "mixed"
          ? [{ method: "cash", amount: cash }, { method: "transfer", amount: total - cash }]
          : [{ method: paymentMethod, amount: total }];
      const order = await api<Order>("/orders", token, {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          status,
          type,
          customer_id: customerId,
          scheduled_at: scheduled || undefined,
          courtesy: paymentMethod === "courtesy",
          notes: notes.trim() || undefined,
          delivery: type === "delivery" ? {
            recipient: recipient.trim(),
            phone: phone.trim(),
            address: address.trim(),
            references: references.trim() || undefined,
          } : undefined,
          items: cart.map((x) => ({
            product_variant_id: x.variantId,
            quantity: x.quantity,
            flavor_ids: x.flavorIds,
          })),
          payments,
        }),
      });
      setLastOrder(order);
      if (status === "confirmed" && !scheduled) {
        setPendingKitchenSend({ order, warnings: [], error: "Envío a cocina pendiente." });
        resetOrderDraft();
        await sendCreatedOrderToKitchen(order);
      } else if (status === "confirmed") {
        setMessage(`Orden #${order.daily_number} programada y confirmada. Se enviará a cocina automáticamente cuando entre en su ventana de preparación.`);
        resetOrderDraft();
      } else {
        setMessage(`Orden #${order.daily_number} guardada como ${status === "draft" ? "borrador" : "pendiente de pago"}.`);
        resetOrderDraft();
      }
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      submissionInFlight.current = false;
      setBusy(false);
    }
  }
  return (
    <View style={s.posLayout}>
      <FlatList
        style={s.catalog}
        data={products}
        keyExtractor={(x) => String(x.id)}
        renderItem={({ item }) => (
          <ProductCard product={item} onAdd={add} resetKey={draftRevision} />
        )}
        ListEmptyComponent={<Empty />}
      />
      <View style={s.cart}>
        <Text style={s.cartTitle}>Pedido actual</Text>
        {cart.map((x, i) => (
          <View style={s.cartRow} key={`${x.variantId}-${i}`}>
            <View>
              <Text style={s.productName}>
                {x.quantity} × {x.name}
              </Text>
              <Text style={s.muted}>${(x.price * x.quantity).toFixed(2)}</Text>
              {!!x.flavorNames.length && <Text style={s.muted}>{x.flavorNames.join(" / ")}</Text>}
            </View>
            <Pressable onPress={() => setCart((c) => c.filter((y) => y !== x))}>
              <Text style={s.remove}>Quitar</Text>
            </Pressable>
          </View>
        ))}
        <Text style={s.label}>Cliente (opcional)</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.choiceScroll}>
          <Pressable onPress={() => selectCustomer(null)} style={[s.type, customerId === null && s.typeActive]}><Text>Sin cliente</Text></Pressable>
          {customers.map((customer) => <Pressable key={customer.id} onPress={() => selectCustomer(customer)} style={[s.type, customerId === customer.id && s.typeActive]}><Text>{customer.name}</Text></Pressable>)}
        </ScrollView>
        <View style={s.types}>
          {[
            ["pickup", "Recoger"],
            ["whatsapp", "WhatsApp"],
            ["delivery", "Domicilio"],
            ["dine_in", "Local"],
          ].map(([k, l]) => (
            <Pressable
              key={k}
              onPress={() => setType(k)}
              style={[s.type, type === k && s.typeActive]}
            >
              <Text>{l}</Text>
            </Pressable>
          ))}
        </View>
        {type === "delivery" && (
          <View>
            <TextInput style={s.input} placeholder="Nombre de quien recibe" value={recipient} onChangeText={setRecipient} />
            <TextInput style={s.input} placeholder="Teléfono" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            <TextInput style={s.input} placeholder="Dirección" value={address} onChangeText={setAddress} />
            <TextInput style={s.input} placeholder="Referencias (opcional)" value={references} onChangeText={setReferences} />
          </View>
        )}
        <TextInput style={s.input} placeholder="Fecha programada ISO (opcional)" value={scheduledAt} onChangeText={setScheduledAt} autoCapitalize="none" />
        <TextInput style={s.input} placeholder="Notas del pedido o preparación (opcional)" value={notes} onChangeText={setNotes} />
        <Text style={s.label}>Forma de pago</Text>
        <View style={s.types}>
          {[["cash", "Efectivo"], ["transfer", "Transferencia"], ["mixed", "Mixto"], ["courtesy", "Cortesía"]].map(([key, label]) => (
            <Pressable key={key} onPress={() => setPaymentMethod(key)} style={[s.type, paymentMethod === key && s.typeActive]}>
              <Text>{label}</Text>
            </Pressable>
          ))}
        </View>
        {paymentMethod === "mixed" && (
          <TextInput style={s.input} placeholder="Monto en efectivo" value={cashAmount} onChangeText={setCashAmount} keyboardType="decimal-pad" />
        )}
        <Text style={s.total}>Total ${total.toFixed(2)}</Text>
        {!!message && <Text style={s.notice}>{message}</Text>}
        {pendingKitchenSend && <View style={s.notice}>
          <Text style={s.productName}>Orden #{pendingKitchenSend.order.daily_number} pendiente de cocina</Text>
          {!!pendingKitchenSend.warnings.length && pendingKitchenSend.warnings.map((warning) => (
            <Text style={s.muted} key={`${pendingKitchenSend.order.id}-${warning.ingredient_id ?? warning.name}`}>
              {warning.name}: requerido {warning.required ?? "-"}, disponible {warning.available ?? "-"}, faltan {warning.shortage}
            </Text>
          ))}
          {!pendingKitchenSend.warnings.length && <Text style={s.muted}>{pendingKitchenSend.error}</Text>}
          <Pressable disabled={busy} style={[s.smallButton, busy && s.disabled]} onPress={retryPendingKitchenSend}>
            <Text style={s.primaryText}>{pendingKitchenSend.warnings.length ? "Autorizar faltante y enviar" : "Reintentar envío a cocina"}</Text>
          </Pressable>
        </View>}
        {lastOrder && <CustomerDocumentActions order={lastOrder} token={token} />}
        <Pressable
          disabled={!cart.length || busy || !!pendingKitchenSend}
          style={[s.primary, (!cart.length || busy || !!pendingKitchenSend) && s.disabled]}
          onPress={() => submit("confirmed")}
        >
          {busy ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={s.primaryText}>{scheduledAt.trim() ? "Confirmar pedido programado" : "Confirmar y enviar a cocina"}</Text>
          )}
        </Pressable>
        <View style={s.reportActions}>
          <Pressable disabled={!cart.length || busy} style={s.secondaryButton} onPress={() => submit("pending_payment")}>
            <Text style={s.secondaryText}>Pendiente de pago</Text>
          </Pressable>
          <Pressable disabled={!cart.length || busy} style={s.secondaryButton} onPress={() => submit("draft")}>
            <Text style={s.secondaryText}>Guardar borrador</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
function CustomerDocumentActions({ order, token }: { order: Order; token: string }) {
  const [busy, setBusy] = useState(""); const [message, setMessage] = useState("");
  async function generate(type: "customer_html" | "customer_pdf" | "customer_image") { setBusy(type); setMessage(""); try { const document = await api<any>(`/orders/${order.id}/generate-document`, token, { method:"POST", body:JSON.stringify({type}) }); setMessage("Nota generada. El enlace es válido durante 10 minutos."); if (document.download_url) await Linking.openURL(document.download_url); } catch(error){setMessage((error as Error).message);}finally{setBusy("");} }
  return <View style={s.documentActions}><Text style={s.label}>Nota de la última orden #{order.daily_number}</Text><View style={s.reportActions}><Pressable style={s.secondaryButton} disabled={!!busy} onPress={()=>generate("customer_html")}><Text style={s.secondaryText}>HTML / imprimir</Text></Pressable><Pressable style={s.secondaryButton} disabled={!!busy} onPress={()=>generate("customer_pdf")}><Text style={s.secondaryText}>PDF</Text></Pressable><Pressable style={s.secondaryButton} disabled={!!busy} onPress={()=>generate("customer_image")}><Text style={s.secondaryText}>Imagen</Text></Pressable></View>{!!busy&&<ActivityIndicator color="#cf4b32"/>}{!!message&&<Text style={s.notice}>{message}</Text>}</View>;
}
function ProductCard({ product, onAdd, resetKey }: { product: Product; onAdd: (product: Product, variant: Product["variants"][0], flavors: Product["flavors"]) => void; resetKey: number }) {
  const [selectedByVariant, setSelectedByVariant] = useState<Record<number, number[]>>({});
  useEffect(() => { setSelectedByVariant({}); }, [resetKey]);
  function toggle(variantId: number, flavorId: number, max: number) {
    setSelectedByVariant((allSelections) => {
      const current = allSelections[variantId] ?? [];
      const next = current.includes(flavorId)
        ? current.filter((id) => id !== flavorId)
        : max <= 1
          ? [flavorId]
          : [...current, flavorId].slice(-max);
      return { ...allSelections, [variantId]: next };
    });
  }
  return (
    <View style={s.product}>
      <Text style={s.productName}>{product.name}</Text>
      {product.variants.map((variant) => {
        const maxFlavors = Math.max(1, Number(variant.max_flavors) || 1);
        const selected = selectedByVariant[variant.id] ?? [];
        const flavors = product.flavors.filter((flavor) => selected.includes(flavor.id));
        const missingFlavor = product.flavors.length > 0 && flavors.length === 0;
        return (
          <View key={variant.id}>
            <Text style={s.label}>{variant.name}{product.flavors.length ? ` · hasta ${maxFlavors} sabor${maxFlavors === 1 ? "" : "es"}` : ""}</Text>
            {!!product.flavors.length && (
              <View style={s.types}>
                {product.flavors.map((flavor) => (
                  <Pressable key={flavor.id} onPress={() => toggle(variant.id, flavor.id, maxFlavors)} style={[s.type, selected.includes(flavor.id) && s.typeActive]}>
                    <Text>{flavor.name}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            <Pressable disabled={missingFlavor} style={[s.variantButton, missingFlavor && s.disabled]} onPress={() => onAdd(product, variant, flavors)}>
              <Text>Agregar {variant.name}</Text>
              <Text style={s.price}>${variant.price} ＋</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
function Empty() {
  return <Text style={s.empty}>Todavía no hay registros.</Text>;
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#f6f7f9" },
  layout: { flex: 1, flexDirection: Platform.OS === "web" ? "row" : "column" },
  layoutCompact: { flexDirection: "column" },
  nav: {
    width: Platform.OS === "web" ? 252 : "100%",
    padding: 16,
    backgroundColor: "#1f2329",
    gap: 8,
  },
  navCompact: {
    width: "100%",
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  brandBlock: { alignItems: "center", flexDirection: "row", gap: 11, marginBottom: 18, paddingHorizontal: 5, paddingVertical: 7 },
  brandMark: { alignItems: "center", backgroundColor: "#353a42", borderRadius: 12, height: 42, justifyContent: "center", width: 42 },
  brandMarkText: { fontSize: 21 },
  brand: { color: "white", fontSize: 19, fontWeight: "900" },
  brandCaption: { color: "#969da8", fontSize: 11, marginTop: 1 },
  brandCompact: { fontSize: 18, marginBottom: 0, marginRight: 6 },
  navList: { gap: 4, paddingBottom: 10 },
  navListCompact: { flexDirection: "row", alignItems: "center", gap: 6, paddingRight: 6 },
  choiceScroll: { gap: 6, paddingBottom: 12 },
  navItem: { alignItems: "center", flexDirection: "row", gap: 11, minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 11 },
  navIcon: { color: "#aab0b9", fontSize: 18, textAlign: "center", width: 22 },
  navItemCompact: { paddingVertical: 10, paddingHorizontal: 12, minWidth: 88, alignItems: "center" },
  navActive: { backgroundColor: "#d94f36" },
  navText: { color: "#c7cbd1", fontWeight: "700" },
  navActiveText: { color: "white", fontWeight: "800" },
  userCard: { alignItems: "center", borderTopColor: "#353a42", borderTopWidth: 1, flexDirection: "row", gap: 10, marginTop: "auto", paddingTop: 14 },
  avatar: { alignItems: "center", backgroundColor: "#d94f36", borderRadius: 18, height: 36, justifyContent: "center", width: 36 },
  avatarText: { color: "white", fontWeight: "900" },
  userInfo: { flex: 1, minWidth: 0 },
  userName: { color: "white", fontSize: 13, fontWeight: "800" },
  userRole: { color: "#969da8", fontSize: 11, marginTop: 2 },
  logout: { alignItems: "center", borderColor: "#454a52", borderRadius: 10, borderWidth: 1, padding: 10 },
  logoutText: { color: "#d5d8dd", fontWeight: "700" },
  logoutCompact: { marginTop: 0, paddingVertical: 10, paddingHorizontal: 12 },
  content: { flex: 1 },
  contentBody: { alignSelf: "center", maxWidth: 1480, padding: Platform.OS === "web" ? 32 : 18, paddingBottom: 48, width: "100%" },
  contentBodyCompact: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 108 },
  pageHeading: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between" },
  headingDate: { color: "#747b85", fontSize: 13, textTransform: "capitalize" },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 2,
    color: "#d94f36",
    fontWeight: "800",
    marginBottom: 7,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: "#29231f",
    marginBottom: 22,
  },
  titleCompact: { fontSize: 26, letterSpacing: -0.5, marginBottom: 18 },
  mobileHeader: { alignItems: "center", backgroundColor: "white", borderBottomColor: "#e6e8eb", borderBottomWidth: 1, flexDirection: "row", justifyContent: "space-between", minHeight: 66, paddingHorizontal: 16, paddingVertical: 10 },
  headerActions: { alignItems: "center", flexDirection: "row", gap: 9 },
  mobileBrand: { alignItems: "center", flexDirection: "row", gap: 10 },
  mobileBrandMark: { alignItems: "center", backgroundColor: "#fff0ec", borderRadius: 11, height: 40, justifyContent: "center", width: 40 },
  mobileBrandName: { color: "#20242a", fontSize: 17, fontWeight: "900" },
  mobileRole: { color: "#7b818a", fontSize: 11, marginTop: 1 },
  mobileAvatar: { alignItems: "center", backgroundColor: "#d94f36", borderRadius: 20, height: 40, justifyContent: "center", width: 40 },
  bottomNav: { alignItems: "center", backgroundColor: "white", borderTopColor: "#e4e6e9", borderTopWidth: 1, bottom: 0, flexDirection: "row", justifyContent: "space-around", left: 0, minHeight: 72, paddingBottom: Platform.OS === "ios" ? 8 : 4, paddingHorizontal: 6, paddingTop: 6, position: "absolute", right: 0 },
  bottomNavItem: { alignItems: "center", flex: 1, gap: 2, minWidth: 0 },
  bottomIconWrap: { alignItems: "center", borderRadius: 16, height: 32, justifyContent: "center", minWidth: 44, paddingHorizontal: 10 },
  bottomIconActive: { backgroundColor: "#fff0ec" },
  bottomIcon: { color: "#6f7680", fontSize: 19, fontWeight: "800" },
  bottomLabel: { color: "#6f7680", fontSize: 10, fontWeight: "700", maxWidth: "100%" },
  bottomTextActive: { color: "#d94f36" },
  modalBackdrop: { backgroundColor: "rgba(20,23,27,0.46)", flex: 1, justifyContent: "flex-end" },
  menuSheet: { backgroundColor: "#f8f9fa", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%", paddingBottom: Platform.OS === "ios" ? 28 : 18, paddingHorizontal: 16, paddingTop: 9 },
  sheetHandle: { alignSelf: "center", backgroundColor: "#ced2d7", borderRadius: 3, height: 5, marginBottom: 16, width: 42 },
  sheetHeading: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  sheetTitle: { color: "#20242a", fontSize: 21, fontWeight: "900" },
  closeButton: { alignItems: "center", backgroundColor: "#e9ebee", borderRadius: 18, height: 36, justifyContent: "center", width: 36 },
  closeButtonText: { color: "#515760", fontSize: 25, lineHeight: 27 },
  moduleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingBottom: 16 },
  moduleCard: { backgroundColor: "white", borderColor: "#e5e7ea", borderRadius: 14, borderWidth: 1, gap: 8, minHeight: 88, padding: 13, width: "48%" },
  moduleCardActive: { backgroundColor: "#d94f36", borderColor: "#d94f36" },
  moduleIcon: { color: "#d94f36", fontSize: 22, fontWeight: "900" },
  moduleLabel: { color: "#30353c", fontSize: 13, fontWeight: "800" },
  sheetLogout: { alignItems: "center", backgroundColor: "#fce8e5", borderRadius: 12, marginTop: 2, padding: 14 },
  sheetLogoutText: { color: "#b63829", fontWeight: "800" },
  loginPage: {
    flex: 1,
    flexDirection: Platform.OS === "web" ? "row" : "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 40,
    padding: 24,
    backgroundColor: "#f7f2e9",
  },
  loginPageCompact: {
    flexDirection: "column",
    alignItems: "stretch",
    justifyContent: "flex-start",
    gap: 22,
    padding: 18,
  },
  hero: { maxWidth: 450 },
  heroCompact: { maxWidth: "100%", alignItems: "flex-start", marginTop: 12 },
  pizza: { fontSize: 60 },
  heroTitle: {
    fontSize: 44,
    fontWeight: "900",
    color: "#29231f",
    lineHeight: 50,
    marginVertical: 18,
  },
  heroTitleCompact: { fontSize: 34, lineHeight: 39, marginVertical: 10 },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#fffdfa",
    padding: 30,
    borderRadius: 22,
  },
  cardCompact: { maxWidth: "100%", padding: 22, borderRadius: 16 },
  formCard: { backgroundColor: "#fffdfa", borderColor: "#e7e9ec", borderWidth: 1, gap: 14, padding: 20, borderRadius: 18, marginBottom: 18 },
  formIntro: { color: "#747b85", lineHeight: 20, marginTop: -6 },
  formStep: { backgroundColor: "white", borderColor: "#e7e9ec", borderRadius: 14, borderWidth: 1, gap: 10, padding: 14 },
  stepHeading: { alignItems: "center", flexDirection: "row", flexWrap: "wrap", gap: 9 },
  stepBadge: { backgroundColor: "#d94f36", borderRadius: 14, color: "white", fontWeight: "900", height: 28, lineHeight: 28, overflow: "hidden", textAlign: "center", width: 28 },
  stepTitle: { color: "#20242a", flex: 1, fontSize: 16, fontWeight: "900" },
  selectedSummary: { backgroundColor: "#fff0ec", borderRadius: 10, gap: 3, padding: 11 },
  recipeCount: { backgroundColor: "#eef0f3", borderRadius: 10, color: "#515861", fontSize: 12, fontWeight: "800", overflow: "hidden", paddingHorizontal: 9, paddingVertical: 5 },
  recipeList: { gap: 8 },
  recipeRow: { alignItems: "center", backgroundColor: "#f4f6f8", borderRadius: 10, flexDirection: "row", gap: 10, justifyContent: "space-between", padding: 11 },
  recipeRowInfo: { flex: 1, gap: 3 },
  inlineFields: { flexDirection: "row", gap: 10 },
  flexField: { flex: 1 },
  activeText: { color: "#287347", fontWeight: "800" },
  label: { fontWeight: "700", marginBottom: 6 },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: "#ddd1c5",
    borderRadius: 11,
    paddingHorizontal: 14,
    marginBottom: 15,
    backgroundColor: "white",
  },
  multilineInput: { height: 88, paddingTop: 13, textAlignVertical: "top" },
  primary: {
    height: 52,
    backgroundColor: "#cf4b32",
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: "white", fontWeight: "800" },
  error: { color: "#a82e20", padding: 10 },
  muted: { color: "#796b61" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  metricsCompact: { gap: 10 },
  metric: {
    backgroundColor: "white",
    borderColor: "#e9ebee",
    borderWidth: 1,
    gap: 16,
    padding: 20,
    borderRadius: 18,
    minWidth: 180,
    flexGrow: 1,
  },
  metricCompact: { flexBasis: "47%", gap: 11, minHeight: 138, minWidth: 0, padding: 14 },
  metricPressed: { opacity: 0.78, transform: [{ scale: 0.985 }] },
  metricLink: { color: "#d94f36", fontSize: 11, fontWeight: "800", marginTop: "auto" },
  metricIcon: { alignItems: "center", borderRadius: 11, height: 38, justifyContent: "center", width: 38 },
  metricPrimary: { backgroundColor: "#fff0ec" },
  metricGood: { backgroundColor: "#e7f6ed" },
  metricWarning: { backgroundColor: "#fff4dc" },
  metricDanger: { backgroundColor: "#fce8e5" },
  metricIconText: { color: "#444b54", fontSize: 17, fontWeight: "900" },
  metricLabel: { color: "#777e87", fontSize: 13, marginTop: 2 },
  number: { fontSize: 32, fontWeight: "900", color: "#20242a" },
  numberCompact: { fontSize: 27 },
  list: { gap: 12 },
  product: {
    backgroundColor: "#fffdfa",
    borderRadius: 15,
    padding: 18,
    margin: 6,
    flex: 1,
  },
  productName: { fontSize: 17, fontWeight: "800" },
  variant: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 12,
  },
  variantButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: "#eee4da",
  },
  price: { fontWeight: "800", color: "#cf4b32" },
  row: {
    backgroundColor: "#fffdfa",
    padding: 16,
    borderRadius: 13,
    marginBottom: 9,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  rowText: { flex: 1, minWidth: 0 },
  catalogImage: { backgroundColor: "#f2f3f5", borderRadius: 12, height: 76, width: 76 },
  catalogImagePlaceholder: { alignItems: "center", backgroundColor: "#fff1ec", borderRadius: 12, height: 76, justifyContent: "center", width: 76 },
  editLink: { color: "#cf4b32", fontWeight: "800", marginTop: 8 },
  inlineEditor: { gap: 10, marginTop: 14, width: "100%" },
  stock: { fontSize: 22, fontWeight: "900", color: "#cf4b32" },
  order: {
    backgroundColor: "#fffdfa",
    padding: 18,
    borderRadius: 15,
    marginBottom: 12,
    gap: 10,
  },
  orderContents: { gap: 5 },
  orderNo: { fontSize: 20, fontWeight: "900" },
  orderMeta: { color: "#4f453f", fontWeight: "700" },
  orderNotes: {
    backgroundColor: "#fff1cc",
    borderRadius: 8,
    color: "#5f4918",
    fontWeight: "700",
    padding: 9,
  },
  orderSummary: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
  },
  orderSummaryCompact: { alignItems: "flex-start", flexDirection: "column" },
  orderTotal: { color: "#29231f", fontSize: 22, fontWeight: "900" },
  orderItemDetail: {
    borderTopColor: "#eee4da",
    borderTopWidth: 1,
    gap: 4,
    marginTop: 5,
    paddingTop: 9,
  },
  itemOption: { color: "#514943", paddingLeft: 8 },
  itemNotes: { color: "#8a4b17", fontStyle: "italic", paddingLeft: 8 },
  comboComponent: {
    borderLeftColor: "#d8c7b7",
    borderLeftWidth: 2,
    gap: 3,
    marginLeft: 8,
    marginTop: 4,
    paddingLeft: 10,
  },
  componentName: { color: "#39312c", fontWeight: "700" },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: "#efe3d6",
    padding: 7,
    borderRadius: 8,
  },
  smallButton: {
    backgroundColor: "#cf4b32",
    padding: 12,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  kitchenActionCompact: { alignItems: "center", alignSelf: "stretch", justifyContent: "center", minHeight: 50 },
  empty: { color: "#796b61", padding: 30, textAlign: "center" },
  groupEmpty: { color: "#796b61", paddingVertical: 12 },
  posLayout: {
    flex: 1,
    flexDirection: Platform.OS === "web" ? "row" : "column",
    gap: 18,
  },
  catalog: { flex: 2 },
  cart: {
    flex: 1,
    backgroundColor: "#fffdfa",
    padding: 20,
    borderRadius: 18,
    minWidth: Platform.OS === "web" ? 320 : 0,
  },
  cartTitle: { fontSize: 22, fontWeight: "900", marginBottom: 15 },
  cartRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: "#eee4da",
  },
  remove: { color: "#b43526" },
  types: { flexDirection: "row", gap: 6, marginVertical: 15, flexWrap: "wrap" },
  type: { padding: 10, borderRadius: 8, backgroundColor: "#eee4da" },
  typeActive: { backgroundColor: "#f3b19f" },
  total: { fontSize: 24, fontWeight: "900", marginVertical: 14 },
  notice: {
    backgroundColor: "#fff1cc",
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
  },
  disabled: { opacity: 0.45 },
  warningBox: {
    backgroundColor: "#fff1cc",
    borderColor: "#e6c66d",
    borderRadius: 10,
    borderWidth: 1,
    gap: 7,
    marginBottom: 10,
    padding: 12,
  },
  ordersToolbar: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    justifyContent: "space-between",
    marginBottom: 18,
  },
  ordersToolbarCompact: { alignItems: "stretch", flexDirection: "column" },
  orderGroup: { marginBottom: 20 },
  cancelReasonInput: {
    backgroundColor: "white",
    borderColor: "#d6b1a9",
    borderRadius: 9,
    borderWidth: 1,
    minHeight: 64,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: "top",
  },
  reportLayout: { flex: 1, gap: 12 },
  board: { flexDirection: "row", flexWrap: "wrap", gap: 14, alignItems: "flex-start" },
  boardCompact: { flexDirection: "column", flexWrap: "nowrap" },
  boardColumn: { flex: 1, minWidth: 270, backgroundColor: "#eee4da", padding: 12, borderRadius: 16 },
  boardColumnCompact: { minWidth: 0, width: "100%" },
  boardTitle: { fontSize: 18, fontWeight: "900", marginBottom: 10, color: "#29231f" },
  timer: { color: "#9a5b19", fontWeight: "800" },
  scheduled: { color: "#7b3fad", fontWeight: "800" },
  paid: { color: "#287347", fontWeight: "900", paddingVertical: 8 },
  documentActions: { marginVertical: 12, gap: 8 },
  reportActions: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  reportList: { width: "100%", gap: 8 },
  sectionTitle: { fontSize: 18, fontWeight: "900", color: "#29231f", textTransform: "capitalize" },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#cf4b32",
    padding: 11,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  secondaryText: { color: "#cf4b32", fontWeight: "800" },
  dangerButton: {
    borderColor: "#a82e20",
    borderRadius: 10,
    borderWidth: 1,
    padding: 11,
  },
  dangerText: { color: "#a82e20", fontWeight: "800" },
});
