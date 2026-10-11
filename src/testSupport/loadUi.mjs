// Render the real hooks/screens in React DOM; only native host widgets and IO
// are replaced. Keep TypeScript compilation aligned with the existing tests.
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
const require = createRequire(import.meta.url);
const uri = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const react = pathToFileURL(require.resolve('react')).href;
const native = uri(`import React from ${JSON.stringify(react)};
const host = tag => ({children,onPress,onChangeText,onSubmitEditing,disabled,value,placeholder,placeholderTextColor,accessibilityRole,accessibilityLabel,testID,inputRef,ref,style,nativeID,accessibilityLiveRegion,accessibilityState,onFocus,onBlur,editable,...rest}) => {const candidate=typeof style==='function'?style({pressed:false}):style;const flat=Object.assign({},...[candidate].flat(Infinity).filter(Boolean));return React.createElement(tag==='button' && (accessibilityRole==='alert'||accessibilityLabel==='Cerrar confirmación')?'div':tag,{ref:inputRef??ref,id:nativeID,onFocus,onBlur,onKeyDown:onSubmitEditing?e=>{if(e.key==='Enter')onSubmitEditing(e);}:undefined,'aria-invalid':rest['aria-invalid'],'aria-describedby':rest['aria-describedby'],'aria-required':rest['aria-required'],'aria-live':accessibilityLiveRegion,'aria-busy':accessibilityState?.busy,'aria-selected':accessibilityState?.selected,'aria-expanded':accessibilityState?.expanded,'aria-disabled':accessibilityState?.disabled,readOnly:tag==='input'&&editable===false,style:flat,onClick:onPress,onChange:onChangeText ? e=>onChangeText(e.target.value):undefined,disabled,value,placeholder,role:accessibilityRole,'aria-label':accessibilityLabel,'data-testid':testID,tabIndex:['button','link','menuitem','tab'].includes(accessibilityRole)?0:undefined},children);};
export const View=host('div'),Text=host('span'),Pressable=host('button'),TextInput=host('input'),ActivityIndicator=host('i'),ScrollView=host('div'),KeyboardAvoidingView=host('div'),SafeAreaView=host('div'),Image=host('img'),Modal=({visible,children})=>visible?React.createElement('div',null,children):null;
export const FlatList=({data,renderItem,ListEmptyComponent})=>React.createElement('div',null,data.length?data.map((item,index)=>React.createElement(React.Fragment,{key:item.id??index},renderItem({item,index}))):ListEmptyComponent);
export const Platform={OS:'web'},Alert={alert:()=>{}},AppState={currentState:'active',addEventListener:(...args)=>globalThis.__appStateListener?.(...args)??({remove:()=>{}})},PanResponder={create:config=>{globalThis.__panResponderConfig=config;return{panHandlers:{}}}};
class AnimatedValue { constructor(value){this.value=value;} setValue(value){this.value=value;} stopAnimation(){} }
const animation=()=>({start:callback=>callback?.(),stop:()=>{}});
export const Animated={Value:AnimatedValue,View,parallel:()=>animation(),timing:()=>animation(),spring:()=>animation()};
export const Easing={cubic:x=>x,out:value=>value};
export const AccessibilityInfo={isReduceMotionEnabled:async()=>true,addEventListener:()=>({remove:()=>{}})};
export const StyleSheet={create:x=>x,flatten:x=>x},Linking={openURL:async()=>{}},useWindowDimensions=()=>({width:globalThis.__testWidth??1200,height:900});`);
const modules = new Map();
export async function loadUi(path) {
  const url = new URL(path, new URL('../', import.meta.url));
  if (modules.has(url.href)) return modules.get(url.href);
  const raw = await readFile(url, 'utf8');
  let source = ts.transpileModule(raw, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  for (const match of [...source.matchAll(/(?:from\s+|import\s*)["']([^"']+)["']/g)]) {
    const spec = match[1];
    let resolved;
    if (spec === 'react-native') resolved = native;
    else if(spec==='expo-image-picker') resolved=uri('export const launchImageLibraryAsync=async()=>({canceled:true,assets:[]});');
    else if (spec.endsWith('/api')) resolved = uri('export const api=(...args)=>globalThis.__p0Api(...args); export const API_URL="test"; export class ApiError extends Error { constructor(status,payload,message){super(message);this.status=status;this.code=payload?.code;this.payload=payload;this.errors=payload?.errors??{};this.stockWarnings=payload?.stock_warnings??[];} }');
    else if(spec==='expo-audio') resolved=uri('const player={seekTo:async()=>{},play:()=>{}};export const useAudioPlayer=()=>player;');
    else if(spec==='expo-secure-store') resolved=uri('export const getItemAsync=async()=>null,setItemAsync=async()=>{},deleteItemAsync=async()=>{};');
    else if (spec === '@react-native-async-storage/async-storage') resolved = uri('export default {getItem:async k=>globalThis.__workDisk?.get(k)??null,setItem:async(k,v)=>{globalThis.__workDisk?.set(k,v);},removeItem:async k=>{globalThis.__workDisk?.delete(k);}};');
    else if(spec.endsWith('/apiCache')) resolved=uri('export const cachedApi=(path,token)=>globalThis.__p0Api(path,token);');
    else if(spec.endsWith('/realtime')) resolved=uri('export const ordersChannel=(...args)=>globalThis.__ordersChannel?.(...args)??(()=>{});');
    else if(spec.endsWith('/push')) resolved=uri('export const registerPush=async()=>{},showOrderNotification=async()=>{};');
    else if(spec==='@capacitor/app') resolved=uri('export const App={addListener:async()=>({remove:async()=>{}})};');
    else if(spec==='@capacitor/core') resolved=uri('export const Capacitor={isNativePlatform:()=>false};');
    else if(spec.endsWith('/haptics')) resolved=uri('export const useCartAddedFeedback=()=>()=>{};');
    else if(spec.endsWith('/sounds')) resolved=uri('export const useKitchenSentSound=()=>()=>{};');
    else if(spec.endsWith('/printing')) resolved=uri('export const getConfiguredThermalPrinter=async()=>null,isNativeAndroid=()=>false,printThermalHtml=async()=>{},printThermalHtmlWithAndroid=async()=>{};');
    else if (spec.endsWith('/FloatingTextInput') && !globalThis.__realFields) resolved = uri(`export {TextInput as FloatingTextInput} from ${JSON.stringify(native)};`);
    else if (spec.endsWith('/ConfirmationDialog')) resolved = uri('export const confirmAction=async(...args)=>globalThis.__confirmWork?.(...args)??false;');
    else if (spec.startsWith('.')) {
      const base = new URL(spec, url);
      let child;
      for (const ext of ['', '.ts','.tsx']) { try { await readFile(base.pathname+ext); child=base.pathname+ext; break; } catch {} }
      if (!child) throw new Error(`Unresolved test import: ${spec}`);
      resolved = await loadUi(pathToFileURL(child).href);
    } else resolved = pathToFileURL(require.resolve(spec)).href;
    source = source.replaceAll(JSON.stringify(spec),JSON.stringify(resolved)).replaceAll("'"+spec+"'",JSON.stringify(resolved));
  }
  source=source.replace('require("../../assets/modal_open.mp3")', 'null');
  source=source.replace('require("../../assets/brand-mark.png")', 'null');
  const result = uri(source); modules.set(url.href,result); return result;
}
