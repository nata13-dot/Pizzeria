import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Linking,
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
import { api } from "./src/api";
import { ordersChannel } from "./src/realtime";
import { registerPush } from "./src/push";
type Session = {
  token: string;
  user: { name: string; branch_id: number; role: { name: string; slug: string } };
};
type Screen = "dashboard" | "pos" | "inventory" | "purchases" | "production" | "products" | "kitchen" | "delivery" | "customers" | "reports" | "settings";
type Product = {
  id: number;
  name: string;
  flavors: { id: number; name: string }[];
  variants: { id: number; name: string; price: string; max_flavors: number }[];
};
type Order = {
  id: number;
  daily_number: number;
  status: string;
  type: string;
  total: string;
  stock_warnings?: { name: string; shortage: number }[];
  items: { name: string; quantity: string }[];
};
const labels: Record<Screen, string> = {
  dashboard: "Resumen",
  pos: "Caja / POS",
  inventory: "Inventario",
  purchases: "Compras",
  production: "Masa",
  products: "Productos",
  kitchen: "Cocina",
  delivery: "Reparto",
  customers: "Clientes",
  reports: "Reportes",
  settings: "Ajustes",
};
export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [screen, setScreen] = useState<Screen>("dashboard");
  const { width } = useWindowDimensions();
  const compact = width < 780;
  useEffect(()=>{if(session)registerPush(session.token).catch(()=>{})},[session?.token]);
  const roleScreens:Record<string,Screen[]>={administrador:Object.keys(labels)as Screen[],cajero:['dashboard','pos','inventory','purchases','production','customers'],cocina:['kitchen'],repartidor:['delivery']};
  if (!session) return <Login onLogin={(next)=>{const screens=roleScreens[next.user.role.slug]??['dashboard'];setSession(next);setScreen(screens[0])}} />;
  const visibleScreens=roleScreens[session.user.role.slug]??['dashboard'];
  return (
    <SafeAreaView style={s.page}>
      <View style={[s.layout, compact && s.layoutCompact]}>
        <View style={[s.nav, compact && s.navCompact]}>
          <Text style={[s.brand, compact && s.brandCompact]}>🍕 Pizzería</Text>
          <ScrollView
            horizontal={compact}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={[s.navList, compact && s.navListCompact]}
          >
          {visibleScreens.map((x) => (
            <Pressable
              key={x}
              onPress={() => setScreen(x)}
              style={[s.navItem, compact && s.navItemCompact, screen === x && s.navActive]}
            >
              <Text style={screen === x ? s.navActiveText : s.navText}>
                {labels[x]}
              </Text>
            </Pressable>
          ))}
          </ScrollView>
          <Pressable onPress={() => setSession(null)} style={[s.logout, compact && s.logoutCompact]}>
            <Text>Cerrar sesión</Text>
          </Pressable>
        </View>
        <ScrollView style={s.content} contentContainerStyle={[s.contentBody, compact && s.contentBodyCompact]}>
          <Text style={s.eyebrow}>{session.user.role.name.toUpperCase()}</Text>
          <Text style={[s.title, compact && s.titleCompact]}>{labels[screen]}</Text>
          {screen === "dashboard" ? (
            <Dashboard token={session.token} />
          ) : (
            <DataScreen screen={screen} token={session.token} branchId={session.user.branch_id} />
          )}
        </ScrollView>
      </View>
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}
function Login({ onLogin }: { onLogin: (s: Session) => void }) {
  const { width } = useWindowDimensions();
  const compact = width < 780;
  const [email, setEmail] = useState("admin@pizzeria.local"),
    [password, setPassword] = useState("Pizzeria123!"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    setError("");
    try {
      onLogin(
        await api<Session>("/login", undefined, {
          method: "POST",
          body: JSON.stringify({ email, password, device_name: Platform.OS }),
        }),
      );
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
        <Text style={s.label}>Correo</Text>
        <TextInput
          style={s.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
        />
        <Text style={s.label}>Contraseña</Text>
        <TextInput
          style={s.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
        {!!error && <Text style={s.error}>{error}</Text>}
        <Pressable style={s.primary} onPress={go}>
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
function Dashboard({token}:{token:string}) {
  const [values,setValues]=useState([0,0,0,0]);
  useEffect(()=>{Promise.all([api<any>("/reports/cash-day",token),api<any>("/orders?status=kitchen_pending",token),api<any>("/inventory/alerts",token)]).then(([cash,orders,alerts])=>setValues([cash.gross_sales??0,orders.total??orders.data?.length??0,alerts.filter((x:any)=>x.type.includes('stock')).length,alerts.filter((x:any)=>['expiring','expired'].includes(x.type)).length])).catch(()=>{})},[token]);
  return (
    <View style={s.metrics}>
      {["Ventas de hoy", "Pedidos activos", "Stock bajo", "Por caducar"].map(
        (x,i) => (
          <View style={s.metric} key={x}>
            <Text style={s.number}>{i===0?'$':''}{values[i]}</Text>
            <Text style={s.muted}>{x}</Text>
          </View>
        ),
      )}
    </View>
  );
}
function DataScreen({ screen, token, branchId }: { screen: Screen; token: string; branchId: number }) {
  const [data, setData] = useState<any[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true);
  const endpoint =
    screen === "inventory"
      ? "/ingredients"
      : screen === "purchases"
        ? "/purchases"
        : screen === "production"
          ? "/production-batches"
          : screen === "products"
            ? "/products"
      : screen === "customers"
        ? "/customers"
        : screen === "reports"
          ? "/reports/cash-day"
          : screen === "settings"
            ? "/business-profile"
      : screen === "kitchen"
        ? "/kitchen/orders"
        : screen === "delivery"
          ? "/delivery/orders"
          : "/products";
  async function load() {
    setBusy(true);
    try {
      const x: any = await api(endpoint, token);
      setData(x.data ?? (Array.isArray(x)?x:[x]));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    load();
  }, [screen]);
  useEffect(() => {
    if (screen === "kitchen" || screen === "delivery") {
      return ordersChannel(token, branchId, load);
    }
  }, [screen, token, branchId]);
  async function action(order: Order, status: string) {
    await api(`/orders/${order.id}/status`, token, {
      method: "POST",
      body: JSON.stringify({ status }),
    });
    load();
  }
  if (busy) return <ActivityIndicator color="#cf4b32" style={{ margin: 40 }} />;
  if (error) return <Text style={s.error}>{error}</Text>;
  if (screen === "pos") return <Pos products={data} token={token} />;
  if (screen === "customers") return <FlatList data={data} keyExtractor={x=>String(x.id)} renderItem={({item})=><View style={s.row}><View><Text style={s.productName}>{item.name}</Text><Text style={s.muted}>{item.phone} · {item.email??'Sin correo'}</Text></View><Text style={s.stock}>{item.points_balance??0} pts</Text></View>} ListEmptyComponent={<Empty/>}/>;
  if (screen === "reports") return <Reports token={token} />;
  if (screen === "settings") {const profile=data[0]??{};return <View style={s.card}><Text style={s.productName}>{profile.name}</Text><Text style={s.muted}>{profile.address??'Dirección pendiente'}</Text><Text style={s.muted}>{profile.phone??'Teléfono pendiente'}</Text><Text style={s.notice}>Los valores se administran mediante la API de ajustes y se aplican a notas y comprobantes.</Text></View>}
  if (screen === "products") return <ProductsView data={data} />;
  if (screen === "purchases") return <PurchasesView data={data} />;
  if (screen === "production") return <ProductionView data={data} />;
  if (screen === "inventory")
    return (
      <FlatList
        data={data}
        keyExtractor={(x) => String(x.id)}
        renderItem={({ item }) => (
          <View style={s.row}>
            <View>
              <Text style={s.productName}>{item.name}</Text>
              <Text style={s.muted}>
                {item.base_unit?.symbol} · mínimo {item.minimum_stock}
              </Text>
            </View>
            <Text style={s.stock}>{item.current_stock}</Text>
          </View>
        )}
        ListEmptyComponent={<Empty />}
      />
    );
  return (
    <FlatList
      data={data as Order[]}
      keyExtractor={(x) => String(x.id)}
      renderItem={({ item }) => (
        <View style={s.order}>
          <Text style={s.orderNo}>Orden #{item.daily_number}</Text>
          <Text>
            {item.items.map((i) => `${i.quantity} × ${i.name}`).join("\n")}
          </Text>
          <Text style={s.badge}>{item.status}</Text>
          {screen === "kitchen" && (
            <Pressable
              style={s.smallButton}
              onPress={() =>
                action(
                  item,
                  item.status === "kitchen_pending" ? "preparing" : "prepared",
                )
              }
            >
              <Text style={s.primaryText}>
                {item.status === "kitchen_pending"
                  ? "Iniciar"
                  : "Marcar preparada"}
              </Text>
            </Pressable>
          )}
          {(screen === "kitchen" || screen === "delivery") && (
            <DocumentButton order={item} token={token} kind={screen} />
          )}
          {screen === "delivery" && (
            <Pressable
              style={s.smallButton}
              onPress={() =>
                action(item, item.status === "ready" ? "on_way" : "delivered")
              }
            >
              <Text style={s.primaryText}>
                {item.status === "ready" ? "En camino" : "Entregada"}
              </Text>
            </Pressable>
          )}
        </View>
      )}
      ListEmptyComponent={<Empty />}
    />
  );
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
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function load(next = report) {
    setBusy(true);
    setMessage("");
    try {
      setData(await api(`/reports/${next}`, token));
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
      {busy ? <ActivityIndicator color="#cf4b32" style={{ margin: 30 }} /> : <ReportData data={data} />}
      {!!message && <Text style={s.notice}>{message}</Text>}
    </View>
  );
}
function ProductsView({ data }: { data: any[] }) {
  return (
    <FlatList
      data={data}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => (
        <View style={s.row}>
          <View style={s.rowText}>
            <Text style={s.productName}>{item.name}</Text>
            <Text style={s.muted}>{item.category?.name ?? "Sin categoría"} · {item.type}</Text>
          </View>
          <Text style={s.stock}>{item.variants?.length ?? 0}</Text>
        </View>
      )}
      ListEmptyComponent={<Empty />}
    />
  );
}
function PurchasesView({ data }: { data: any[] }) {
  return (
    <FlatList
      data={data}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => (
        <View style={s.row}>
          <View style={s.rowText}>
            <Text style={s.productName}>{item.supplier?.name ?? "Compra sin proveedor"}</Text>
            <Text style={s.muted}>{item.purchased_at ?? item.created_at ?? "Sin fecha"} · {item.payment_source}</Text>
          </View>
          <Text style={s.stock}>${Number(item.total ?? 0).toFixed(2)}</Text>
        </View>
      )}
      ListEmptyComponent={<Empty />}
    />
  );
}
function ProductionView({ data }: { data: any[] }) {
  return (
    <FlatList
      data={data}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => (
        <View style={s.row}>
          <View style={s.rowText}>
            <Text style={s.productName}>{item.recipe?.name ?? `Producción #${item.id}`}</Text>
            <Text style={s.muted}>{item.produced_at ?? item.created_at ?? "Sin fecha"} · vence {item.expires_at ?? "sin dato"}</Text>
          </View>
          <Text style={s.stock}>×{item.multiplier ?? 1}</Text>
        </View>
      )}
      ListEmptyComponent={<Empty />}
    />
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
  async function generate() {
    setBusy(true);
    setMessage("");
    try {
      const doc = await api<any>(`/orders/${order.id}/generate-document`, token, {
        method: "POST",
        body: JSON.stringify({ type: kind }),
      });
      setMessage(kind === "kitchen" ? "Comanda lista." : "Nota de reparto lista.");
      if (doc.whatsapp_url) Linking.openURL(doc.whatsapp_url);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <View>
      <Pressable style={s.secondaryButton} onPress={generate} disabled={busy}>
        <Text style={s.secondaryText}>{busy ? "Generando..." : kind === "kitchen" ? "Comanda" : "Nota reparto"}</Text>
      </Pressable>
      {!!message && <Text style={s.notice}>{message}</Text>}
    </View>
  );
}
function Pos({ products, token }: { products: Product[]; token: string }) {
  type Cart = {
    variantId: number;
    name: string;
    price: number;
    quantity: number;
    flavorIds: number[];
  };
  const [cart, setCart] = useState<Cart[]>([]),
    [type, setType] = useState("pickup"),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const total = cart.reduce((n, x) => n + x.price * x.quantity, 0);
  function add(p: Product, v: Product["variants"][0]) {
    const flavors = p.flavors.slice(0, 1).map((x) => x.id);
    setCart((c) => {
      const found = c.find(
        (x) => x.variantId === v.id && x.flavorIds.join() === flavors.join(),
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
              flavorIds: flavors,
            },
          ];
    });
  }
  async function submit() {
    setBusy(true);
    setMessage("");
    try {
      const order = await api<Order>("/orders", token, {
        method: "POST",
        body: JSON.stringify({
          status: "confirmed",
          type,
          items: cart.map((x) => ({
            product_variant_id: x.variantId,
            quantity: x.quantity,
            flavor_ids: x.flavorIds,
          })),
          payments: [{ method: "cash", amount: total }],
        }),
      });
      const sent = await api<Order>(
        `/orders/${order.id}/send-to-kitchen`,
        token,
        { method: "POST" },
      );
      setMessage(
        `Orden #${sent.daily_number} enviada a cocina.${sent.stock_warnings?.length ? " Advertencias: " + sent.stock_warnings.map((x) => `${x.name} (-${x.shortage})`).join(", ") : ""}`,
      );
      setCart([]);
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
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
          <View style={s.product}>
            <Text style={s.productName}>{item.name}</Text>
            {item.variants.map((v) => (
              <Pressable
                key={v.id}
                style={s.variantButton}
                onPress={() => add(item, v)}
              >
                <Text>{v.name}</Text>
                <Text style={s.price}>${v.price} ＋</Text>
              </Pressable>
            ))}
          </View>
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
            </View>
            <Pressable onPress={() => setCart((c) => c.filter((y) => y !== x))}>
              <Text style={s.remove}>Quitar</Text>
            </Pressable>
          </View>
        ))}
        <View style={s.types}>
          {[
            ["pickup", "Recoger"],
            ["whatsapp", "WhatsApp"],
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
        <Text style={s.total}>Total ${total.toFixed(2)}</Text>
        {!!message && <Text style={s.notice}>{message}</Text>}
        <Pressable
          disabled={!cart.length || busy}
          style={[s.primary, (!cart.length || busy) && s.disabled]}
          onPress={submit}
        >
          {busy ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={s.primaryText}>Cobrar efectivo y enviar</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}
function Empty() {
  return <Text style={s.empty}>Todavía no hay registros.</Text>;
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#f7f2e9" },
  layout: { flex: 1, flexDirection: Platform.OS === "web" ? "row" : "column" },
  layoutCompact: { flexDirection: "column" },
  nav: {
    width: Platform.OS === "web" ? 220 : "100%",
    padding: 18,
    backgroundColor: "#28221e",
    gap: 6,
  },
  navCompact: {
    width: "100%",
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  brand: { color: "white", fontSize: 21, fontWeight: "800", marginBottom: 20 },
  brandCompact: { fontSize: 18, marginBottom: 0, marginRight: 6 },
  navList: { gap: 6 },
  navListCompact: { flexDirection: "row", alignItems: "center", gap: 6, paddingRight: 6 },
  navItem: { padding: 13, borderRadius: 10 },
  navItemCompact: { paddingVertical: 10, paddingHorizontal: 12, minWidth: 88, alignItems: "center" },
  navActive: { backgroundColor: "#cf4b32" },
  navText: { color: "#d9d0c8", fontWeight: "600" },
  navActiveText: { color: "white", fontWeight: "800" },
  logout: {
    marginTop: "auto",
    backgroundColor: "#eee4d9",
    padding: 12,
    borderRadius: 10,
  },
  logoutCompact: { marginTop: 0, paddingVertical: 10, paddingHorizontal: 12 },
  content: { flex: 1 },
  contentBody: { padding: Platform.OS === "web" ? 32 : 18, paddingBottom: 48 },
  contentBodyCompact: { padding: 14, paddingBottom: 32 },
  eyebrow: {
    fontSize: 11,
    letterSpacing: 2,
    color: "#cf4b32",
    fontWeight: "800",
    marginBottom: 7,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: "#29231f",
    marginBottom: 22,
  },
  titleCompact: { fontSize: 24, marginBottom: 14 },
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
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 15 },
  metric: {
    backgroundColor: "#fffdfa",
    padding: 22,
    borderRadius: 16,
    minWidth: 180,
    flexGrow: 1,
  },
  number: { fontSize: 32, fontWeight: "900", color: "#cf4b32" },
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
  stock: { fontSize: 22, fontWeight: "900", color: "#cf4b32" },
  order: {
    backgroundColor: "#fffdfa",
    padding: 18,
    borderRadius: 15,
    marginBottom: 12,
    gap: 10,
  },
  orderNo: { fontSize: 20, fontWeight: "900" },
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
  empty: { color: "#796b61", padding: 30, textAlign: "center" },
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
  reportLayout: { flex: 1, gap: 12 },
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
});
