import {useEffect, useRef, useState} from "react";
import {ActivityIndicator, Image, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, TextInput as NativeTextInput, useWindowDimensions, View} from "react-native";
import {api} from "../api";
import {FloatingTextInput as TextInput} from "../components/FloatingTextInput";
import {useAppStyles} from "../styles/appStyles";
import {ThemedText} from "../theme/ThemedText";
import {useTheme} from "../theme/ThemeProvider";

export type LoginSession = {
  token: string;
  expires_at?: string;
  user: { id: number; name: string; branch_id: number; permissions: string[]; role: { name: string; slug: string } };
};

const brandLogo=require("../../assets/brand-mark.png");

export function Login({onLogin}:{onLogin:(session:LoginSession,remember:boolean)=>void}) {
  const s=useAppStyles();
  const {theme}=useTheme();
  const {width}=useWindowDimensions();
  const compact=width<780;
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [remember,setRemember]=useState(true);
  const [showPassword,setShowPassword]=useState(false);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const passwordInput=useRef<NativeTextInput>(null);

  useEffect(()=>{
    if(Platform.OS!=="web"||typeof document==="undefined")return;
    let form=document.getElementById("pizzeria-login-form") as HTMLFormElement|null;
    if(!form){form=document.createElement("form");form.id="pizzeria-login-form";form.setAttribute("autocomplete","on");form.style.display="none";form.addEventListener("submit",event=>event.preventDefault());document.body.appendChild(form);}
    const username=document.getElementById("login-username") as HTMLInputElement|null;
    const passwordField=document.getElementById("login-password") as HTMLInputElement|null;
    if(username){username.name="username";username.autocomplete="username";username.setAttribute("form",form.id);}
    if(passwordField){passwordField.name="password";passwordField.autocomplete="current-password";passwordField.setAttribute("form",form.id);}
    return()=>form?.remove();
  },[]);

  async function go(){
    if(busy||!email.trim()||!password)return;
    setBusy(true);setError("");
    try{
      const authenticated=await api<LoginSession>("/login",undefined,{method:"POST",body:JSON.stringify({login:email.trim(),password,device_name:Platform.OS})});
      if(Platform.OS==="web"&&typeof document!=="undefined")(document.getElementById("pizzeria-login-form") as HTMLFormElement|null)?.requestSubmit();
      onLogin(authenticated,remember);
    }catch(reason){setError((reason as Error).message);}finally{setBusy(false);}
  }

  return <SafeAreaView style={s.loginSafeArea}>
    <KeyboardAvoidingView style={s.loginKeyboard} behavior={Platform.OS==="ios"?"padding":Platform.OS==="android"?"height":undefined}>
      <ScrollView automaticallyAdjustKeyboardInsets keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" contentContainerStyle={[s.loginPage,compact&&s.loginPageCompact]}>
        {!compact&&<><View style={s.loginBackdropGlow}/><View style={s.loginBackdropDot}/></>}
        <View style={[s.loginShell,compact&&s.loginShellCompact]}>
          <View style={[s.loginHero,compact&&s.loginHeroCompact]}>
            <View style={[s.loginHeroGlowLarge,!compact&&s.loginHeroGlowDesktop]}/><View style={[s.loginHeroGlowSmall,!compact&&s.loginHeroGlowSmallDesktop]}/>
            <View style={s.loginBrandRow}><View style={s.loginLogoFrame}><Image accessibilityLabel="El Espinazo del Diablo" resizeMode="contain" source={brandLogo} style={s.loginLogo}/></View><View><ThemedText style={s.loginBrandName}>El Espinazo</ThemedText><ThemedText style={s.loginBrandCaption}>Pizzas y Alitas</ThemedText></View></View>
            {!compact&&<View style={s.loginHeroCopy}><ThemedText style={s.loginHeroEyebrow}>GESTIÓN INTEGRAL</ThemedText><ThemedText style={s.heroTitle}>Todo tu negocio,{`\n`}en un solo lugar.</ThemedText><ThemedText style={s.loginHeroText}>Ventas, cocina, reparto e inventario conectados para trabajar con rapidez.</ThemedText></View>}
            {compact&&<ThemedText style={s.loginMobileTagline}>Tu negocio, siempre bajo control.</ThemedText>}
            {!compact&&<View style={s.loginOperations}><View style={s.loginOperationsHeading}><ThemedText style={s.loginOperationsTitle}>Operación conectada</ThemedText><View style={s.loginLive}><View style={s.loginLiveDot}/><ThemedText style={s.loginLiveText}>En línea</ThemedText></View></View><View style={s.loginModuleRow}>{["Punto de venta","Cocina","Reparto"].map((label,index)=><View key={label} style={s.loginModule}><View style={[s.loginModuleIcon,index===1&&s.loginModuleIconActive]}><ThemedText style={s.loginModuleGlyph}>{["▣","♨","➜"][index]}</ThemedText></View><ThemedText style={s.loginModuleText}>{label}</ThemedText></View>)}</View></View>}
          </View>
          <View style={[s.loginForm,compact&&s.loginFormCompact]}>
            {compact&&<View style={s.loginFormHandle}/>}
            <View style={s.loginHeading}><ThemedText style={s.eyebrow}>BIENVENIDO</ThemedText><ThemedText style={s.loginTitle}>Inicia sesión</ThemedText><ThemedText style={s.loginSubtitle}>Ingresa tus datos para continuar.</ThemedText></View>
            <View style={s.loginFields}>
              <TextInput nativeID="login-username" accessibilityLabel="Correo o usuario" placeholder="Correo o usuario" style={s.loginInput} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} autoComplete="username" textContentType="username" importantForAutofill="yes" returnKeyType="next" blurOnSubmit={false} onSubmitEditing={()=>passwordInput.current?.focus()}/>
              <TextInput nativeID="login-password" inputRef={passwordInput} accessibilityLabel="Contraseña" placeholder="Contraseña" style={s.loginInput} value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} autoComplete="current-password" textContentType="password" importantForAutofill="yes" returnKeyType="done" onSubmitEditing={()=>void go()}/>
            </View>
            <View style={s.loginOptions}>
              <Pressable accessibilityRole="checkbox" aria-checked={remember} onPress={()=>setRemember(value=>!value)} style={s.loginRemember}><View style={[s.loginCheckbox,remember&&s.loginCheckboxActive]}>{remember&&<ThemedText style={s.loginCheck}>✓</ThemedText>}</View><ThemedText style={s.loginOptionText}>Recordar sesión</ThemedText></Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={showPassword?"Ocultar contraseña":"Mostrar contraseña"} onPress={()=>setShowPassword(value=>!value)} style={s.loginPasswordToggle}><ThemedText style={s.loginPasswordToggleText}>{showPassword?"Ocultar":"Mostrar"}</ThemedText></Pressable>
            </View>
            {!!error&&<View style={s.loginError}><ThemedText accessibilityRole="alert" style={s.loginErrorText}>{error}</ThemedText></View>}
            <Pressable accessibilityRole="button" disabled={busy||!email.trim()||!password} style={({pressed})=>[s.loginPrimary,pressed&&s.loginPrimaryPressed,(busy||!email.trim()||!password)&&s.disabled]} onPress={()=>void go()}>{busy?<ActivityIndicator color={theme.colors.primaryText}/>:<ThemedText style={s.primaryText}>Entrar al sistema</ThemedText>}</Pressable>
            <View style={s.loginSecurity}><ThemedText style={s.loginSecurityIcon}>◆</ThemedText><ThemedText style={s.loginSecurityText}>Tus credenciales se protegen con el gestor de contraseñas de tu dispositivo.</ThemedText></View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
