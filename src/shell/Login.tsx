import {useEffect, useRef, useState} from "react";
import {ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, TextInput as NativeTextInput, useWindowDimensions, View} from "react-native";
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

export function Login({onLogin}:{onLogin:(session:LoginSession,remember:boolean)=>void}) {
  const s=useAppStyles();
  const {theme}=useTheme();
  const {width}=useWindowDimensions();
  const compact=width<780;
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [remember,setRemember]=useState(true);
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
        <View style={[s.hero,compact&&s.heroCompact]}><ThemedText style={s.pizza}>🍕</ThemedText><ThemedText style={[s.heroTitle,compact&&s.heroTitleCompact]}>Tu pizzería,{`\n`}bajo control.</ThemedText><ThemedText style={s.muted}>Ventas, cocina, reparto e inventario conectados.</ThemedText></View>
        <View style={[s.card,compact&&s.cardCompact]}>
          <ThemedText style={s.eyebrow}>BIENVENIDO</ThemedText><ThemedText style={s.title}>Inicia sesión</ThemedText>
          <ThemedText style={s.label}>Correo o usuario</ThemedText><TextInput nativeID="login-username" accessibilityLabel="Correo o usuario" placeholder="Correo o usuario" style={s.input} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} autoComplete="username" textContentType="username" importantForAutofill="yes" returnKeyType="next" blurOnSubmit={false} onSubmitEditing={()=>passwordInput.current?.focus()}/>
          <ThemedText style={s.label}>Contraseña</ThemedText><TextInput nativeID="login-password" inputRef={passwordInput} accessibilityLabel="Contraseña" placeholder="Contraseña" style={s.input} value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="current-password" textContentType="password" importantForAutofill="yes" returnKeyType="done" onSubmitEditing={()=>void go()}/>
          <Pressable accessibilityRole="checkbox" accessibilityState={{checked:remember}} onPress={()=>setRemember(value=>!value)} style={[s.type,remember&&s.typeActive]}><ThemedText>{remember?"✓ Recordar sesión":"Recordar sesión"}</ThemedText></Pressable>
          {!!error&&<ThemedText accessibilityRole="alert" style={s.error}>{error}</ThemedText>}
          <Pressable accessibilityRole="button" disabled={busy||!email.trim()||!password} style={[s.primary,(busy||!email.trim()||!password)&&s.disabled]} onPress={()=>void go()}>{busy?<ActivityIndicator color={theme.colors.primaryText}/>:<ThemedText style={s.primaryText}>Entrar</ThemedText>}</Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
