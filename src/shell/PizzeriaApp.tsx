import { ActionButton } from "../components/ActionButton";
import {ThemedText} from "../theme/ThemedText";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Component, type ErrorInfo, type ReactNode, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Platform, Pressable, SafeAreaView, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { API_URL, api, clearApiCache, setUnauthorizedHandler } from "../api";
import { clearSession, readSession, saveSession } from "../session";
import { registerPush, showOrderNotification } from "../push";
import { ordersChannel } from "../realtime";
import { ThemeToggle, useTheme } from "../theme/ThemeProvider";
import { useWork } from "../work/WorkProvider";
import { useNavigationSound } from "../sounds";
import { appModules, homeScreen, groupedModules, mobileModules, modulesForUser, type Screen } from "../navigation/modules";
import { NavigationScopeProvider } from "../navigation/NavigationContext";
import { clearNavigationScope, readLastModule, writeLastModule, type NavigationScope } from "../navigation/sessionState";
import { ModuleSheet } from "../navigation/ModuleSheet";
import { ScreenContent } from "../navigation/ScreenContent";
import { requestModuleNavigation, takeBackTarget } from "../navigation/controller";
import { useAppStyles } from "../styles/appStyles";
import { ScreenMotion } from "../motion/Motion";
import { IconBadge } from "../components/IconBadge";
import { NavBadge } from "../components/NavBadge";
import { badgeLabel, useNavigationBadges } from "../navigation/useNavigationBadges";
import {Login,type LoginSession as Session} from "./Login";
const labels=Object.fromEntries(appModules.map(module=>[module.id,module.label])) as Record<Screen,string>;
const brandLogo=require("../../assets/brand-mark.png");
function hasPermission(user: Session["user"], permission: string): boolean {
  return user.permissions?.includes("*") || user.permissions?.includes(permission);
}
function orderNotificationFor(user: Session["user"], event: { status: string; type: string; daily_number: number }) {
  if (event.status === "kitchen_pending" && hasPermission(user, "kitchen.use")) {
    return { title: "Nuevo pedido para cocina", body: `Pedido #${event.daily_number} listo para preparar.`, screen: "kitchen" };
  }
  if (event.status === "ready" && event.type === "delivery" && hasPermission(user, "delivery.use")) {
    return { title: "Pedido listo para repartir", body: `Pedido #${event.daily_number} está listo.`, screen: "delivery" };
  }
  if (event.status === "ready" && event.type !== "delivery" && hasPermission(user, "pos.use")) {
    return { title: "Pedido listo para entregar", body: `Pedido #${event.daily_number} está listo.`, screen: "orders" };
  }
  return null;
}
function screensForUser(user: Session["user"]): Screen[] { return modulesForUser(user).map(module=>module.id); }
export function PizzeriaApp() {
  const s=useAppStyles();
  const {theme,setFontSize:setSystemFontSize}=useTheme();
  const work = useWork();
  const playNavigationSound = useNavigationSound();
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    void work.open(session ? { api: API_URL, user: session.user.id, branch: session.user.branch_id } : null);
  }, [session?.user.id, session?.user.branch_id]);
  const [restoringSession, setRestoringSession] = useState(true);
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const screenHistory = useRef<Screen[]>([]);
  const screenRef = useRef<Screen>(screen);
  const allowedRef = useRef<Screen[]>([]);
  const requestNavigationRef = useRef<(target:Screen,options?:{history?:boolean})=>Promise<boolean>>(async()=>false);
  const mobileMenuOpenRef = useRef(false);
  const moreTriggerRef=useRef<any>(null);
  const { width } = useWindowDimensions();
  const mobile = width < 600;
  // Tablets keep every module one tap away in a narrow icon rail instead of the phone bar.
  const rail = !mobile && width < 1024;
  const compact = mobile;
  const [badgeSignal, setBadgeSignal] = useState(0);
  const badges = useNavigationBadges(session?.token ?? null, `${screen}:${badgeSignal}`);
  useEffect(() => {
    let active = true;
    readSession<Session>().then(async (stored) => {
      if (!stored) return;
      if (stored.expires_at && Date.parse(stored.expires_at) <= Date.now()) {
        await clearSession();
        return;
      }
      const user = await api<Session["user"]>("/me", stored.token);
      if (active) {
        const restored = { token: stored.token, user };
        const scope={api:API_URL,user:user.id,branch:user.branch_id};
        const allowed=screensForUser(user);const remembered=readLastModule(scope);
        const initial=allowed.includes(remembered as Screen)?remembered as Screen:homeScreen(user);
        setSession(restored);
        screenRef.current=initial;setScreen(initial);
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
    const listener = CapacitorApp.addListener("backButton", async () => {
      if (mobileMenuOpenRef.current) {
        mobileMenuOpenRef.current = false;
        setMobileMenuOpen(false);
        return;
      }
      const previousScreen = takeBackTarget(screenHistory.current,allowedRef.current,screenRef.current);
      if (previousScreen) {
        const changed=await requestNavigationRef.current(previousScreen,{history:false});
        if(!changed)screenHistory.current.push(previousScreen);
        return;
      }
      void CapacitorApp.minimizeApp();
    });
    return () => { void listener.then((handle) => handle.remove()); };
  }, []);
  useEffect(()=>{if(session)registerPush(session.token).catch(()=>{})},[session?.token]);
  useEffect(() => {
    if (!session) return;
    api<{ system_font_size: "small" | "medium" | "large" }>("/preferences", session.token)
      .then((preferences) => setSystemFontSize(preferences.system_font_size))
      .catch(() => {});
  }, [session?.token]);
  useEffect(() => {
    if (!session) return;
    return ordersChannel(session.token, session.user.branch_id, (event) => {
      setBadgeSignal((value) => value + 1);
      const notification = orderNotificationFor(session.user, event);
      if (notification && Platform.OS === "web" && !Capacitor.isNativePlatform()) {
        showOrderNotification(notification.title, notification.body, {
          order_id: event.id,
          screen: notification.screen,
        }).catch(() => {});
      }
    });
  }, [session?.token, session?.user.branch_id]);
  useEffect(() => {
    if (!session?.expires_at) return;
    const remaining = Date.parse(session.expires_at) - Date.now();
    if (remaining <= 0) { void clearSession(); setSession(null); return; }
    const timer = setTimeout(() => { void clearSession(); setSession(null); }, remaining);
    return () => clearTimeout(timer);
  }, [session?.expires_at]);
  if (restoringSession) return <SafeAreaView style={s.loginPage}><ActivityIndicator size="large" color={theme.colors.primary} /><ThemedText style={s.muted}>Restaurando sesión...</ThemedText></SafeAreaView>;
  if (!session) return <Login onLogin={(next, remember)=>{const scope={api:API_URL,user:next.user.id,branch:next.user.branch_id};const allowed=screensForUser(next.user);const stored=readLastModule(scope);const initial=allowed.includes(stored as Screen)?stored as Screen:homeScreen(next.user);screenHistory.current=[];screenRef.current=initial;setSession(next);setScreen(initial);if(remember)saveSession(next).catch(()=>{});else clearSession().catch(()=>{})}} />;
  if (!work.ready || work.scope?.user!==session.user.id || work.scope?.branch!==session.user.branch_id) return <SafeAreaView style={s.loginPage}><ThemedText>{work.notice || "Recuperando tu trabajo..."}</ThemedText>{!!work.notice && <Pressable accessibilityRole="button" onPress={() => void work.open({api: API_URL,user:session.user.id,branch:session.user.branch_id})}><ThemedText>Reintentar</ThemedText></Pressable>}</SafeAreaView>;
  const visibleModules=modulesForUser(session.user);
  const visibleScreens = visibleModules.map(module=>module.id);
  allowedRef.current=visibleScreens;
  const currentScreen = visibleScreens.includes(screen) ? screen : visibleScreens[0];
  const isAdministrator = hasPermission(session.user, "*");
  const quickModules=mobileModules(session.user,visibleModules);
  const quickScreens=quickModules.map(module=>module.id);
  const navigationGroups=groupedModules(visibleModules);
  const navigationScope:NavigationScope={api:API_URL,user:session.user.id,branch:session.user.branch_id};
  const requestNavigation = async (next: Screen,options:{history?:boolean}={}) => {
    return requestModuleNavigation({target:next,allowed:allowedRef.current,current:screenRef.current,history:screenHistory.current,leave:()=>work.leave(),recordHistory:options.history!==false,close:()=>setMobileMenuOpen(false),persist:target=>writeLastModule(navigationScope,target),commit:target=>{playNavigationSound();screenRef.current=target;setScreen(target);}});
  };
  requestNavigationRef.current=requestNavigation;
  const logout = async () => { if (!await work.leave(true)) return; try { await api("/logout", session.token, { method: "POST" }); } finally { screenHistory.current=[];clearNavigationScope(navigationScope);await clearApiCache(session.token);await clearSession();setSession(null); } };
  return (
    <NavigationScopeProvider scope={navigationScope}><SafeAreaView style={s.page}>
      <View style={[s.layout, compact && s.layoutCompact]}>
        {!compact && <View style={[s.nav, rail && s.navRail]}>
          <View style={s.brandBlock}><View style={s.brandMark}><Image accessibilityLabel="El Espinazo del Diablo" resizeMode="contain" source={brandLogo} style={s.brandLogo}/></View>{!rail && <View style={s.brandCopy}><ThemedText numberOfLines={1} style={s.brand}>El Espinazo</ThemedText><ThemedText numberOfLines={1} style={s.brandCaption}>Pizzas y Alitas</ThemedText></View>}</View>
          <ScrollView
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.navList}
          >
          {navigationGroups.map(group=><View key={group.id} style={s.navGroup}>{!rail && <ThemedText style={s.navGroupLabel}>{group.label}</ThemedText>}{group.modules.map(module => (
            <Pressable key={module.id}
              accessibilityRole="link"
              aria-current={(currentScreen===module.id) ? "page" : undefined}
              accessibilityLabel={`${module.label}${currentScreen===module.id?", módulo actual":""}${badgeLabel(badges[module.id])}`}
              onPress={() => requestNavigation(module.id)}
              style={[s.navItem, rail && s.navItemRail, currentScreen === module.id && s.navActive]}
            >
              <IconBadge glyph={module.icon} tone={module.tone} size="small" selected={currentScreen === module.id}/>
              <ThemedText numberOfLines={rail ? 2 : 1} style={[currentScreen === module.id ? s.navActiveText : s.navText, rail && s.navTextRail]}>
                {module.label}
              </ThemedText>
              <NavBadge count={badges[module.id]} style={rail ? s.navBadgeRail : s.navBadgeEnd}/>
            </Pressable>
          ))}</View>)}
          </ScrollView>
          <View style={s.userCard}><View style={s.avatar}><ThemedText style={s.avatarText}>{session.user.name.slice(0, 1).toUpperCase()}</ThemedText></View>{!rail && <View style={s.userInfo}><ThemedText numberOfLines={1} style={s.userName}>{session.user.name}</ThemedText><ThemedText numberOfLines={1} style={s.userRole}>{session.user.role.name}</ThemedText></View>}<ThemeToggle /></View>
          <ActionButton label={rail ? "Salir" : "Cerrar sesión"} accessibilityLabel="Cerrar sesión" variant="secondary" onPress={logout} />
        </View>}
        {compact && <View style={s.mobileHeader}><View style={s.mobileBrand}><View style={s.mobileBrandMark}><Image accessibilityLabel="El Espinazo del Diablo" resizeMode="contain" source={brandLogo} style={s.mobileBrandLogo}/></View><View style={s.mobileBrandCopy}><ThemedText numberOfLines={1} style={s.mobileBrandName}>El Espinazo</ThemedText><ThemedText numberOfLines={1} style={s.mobileRole}>Pizzas y Alitas · {session.user.role.name}</ThemedText></View></View><View style={s.headerActions}><ThemeToggle /><ActionButton label={session.user.name.slice(0, 1).toUpperCase()} variant="secondary" accessibilityLabel="Abrir todos los módulos" onPress={() => setMobileMenuOpen(true)} /></View></View>}
        <ScrollView style={s.content} contentContainerStyle={[s.contentBody, compact && s.contentBodyCompact]}>
          <ScreenMotion route={currentScreen} style={s.screenMotion}>
          <View style={s.pageHeading}><View><ThemedText style={s.eyebrow}>{session.user.role.name.toUpperCase()}</ThemedText>
          <ThemedText style={[s.title, compact && s.titleCompact]}>{currentScreen ? labels[currentScreen] : "Sin módulos asignados"}</ThemedText>
          </View>{!compact && <ThemedText style={s.headingDate}>{new Date().toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long" })}</ThemedText>}</View>
          {!currentScreen ? (
            <View style={s.warningBox}>
              <ThemedText style={s.sectionTitle}>Tu sesión está activa, pero no tiene acceso a ningún módulo.</ThemedText>
              <ThemedText style={s.muted}>Solicita a un administrador que asigne los permisos necesarios a tu rol y vuelve a iniciar sesión.</ThemedText>
            </View>
          ) : <ScreenContent screen={currentScreen} token={session.token} branchId={session.user.branch_id} userId={session.user.id} isAdministrator={isAdministrator} canOverrideStock={hasPermission(session.user, "stock.override")} onNavigate={requestNavigation}/>}
          </ScreenMotion>
        </ScrollView>
      </View>
      {compact && <View accessibilityRole="tablist" accessibilityLabel="Módulos principales" style={s.bottomNav}>{quickModules.map((module) => {const active=currentScreen===module.id;return <View key={module.id} style={s.bottomMotionItem}><Pressable accessibilityRole="tab" aria-selected={active} accessibilityLabel={`${module.label}${active?", módulo actual":""}${badgeLabel(badges[module.id])}`} onPress={() => requestNavigation(module.id)} style={[s.bottomNavItem,active&&s.bottomNavItemActive]}><IconBadge glyph={module.icon} tone={module.tone} size="small" selected={active}/><NavBadge count={badges[module.id]} style={s.navBadgeRail}/><ThemedText numberOfLines={1} style={[s.bottomLabel,active&&s.bottomTextActive]}>{module.label}</ThemedText></Pressable></View>})}<View style={s.bottomMotionItem}><Pressable ref={moreTriggerRef} accessibilityRole="button" accessibilityLabel="Abrir más módulos" aria-expanded={mobileMenuOpen} aria-current={(!quickScreens.includes(currentScreen)) ? "page" : undefined} onPress={() => setMobileMenuOpen(true)} style={[s.bottomNavItem,!quickScreens.includes(currentScreen)&&s.bottomNavItemActive]}><IconBadge glyph="•••" tone="neutral" size="small" selected={!quickScreens.includes(currentScreen)}/><ThemedText style={[s.bottomLabel,!quickScreens.includes(currentScreen)&&s.bottomTextActive]}>Más</ThemedText></Pressable></View></View>}
      <ModuleSheet open={compact&&mobileMenuOpen} badges={badges} groups={navigationGroups} current={currentScreen} userName={session.user.name} roleName={session.user.role.name} onNavigate={requestNavigation} onLogout={logout} onClose={()=>setMobileMenuOpen(false)}/>
    </SafeAreaView></NavigationScopeProvider>
  );
}
export class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error("Error de interfaz", error, info.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return <AppErrorFallback onRetry={() => this.setState({ error: null })}/>;
  }
}
function AppErrorFallback({onRetry}:{onRetry:()=>void}){const s=useAppStyles();return <SafeAreaView style={s.loginPage}><View style={s.card}><ThemedText style={s.title}>Algo salió mal</ThemedText><ThemedText style={s.error}>No pudimos mostrar esta pantalla. Intenta de nuevo; si continúa, vuelve a iniciar sesión.</ThemedText><ActionButton label="Intentar de nuevo" onPress={onRetry} /></View></SafeAreaView>;}
