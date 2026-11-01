import { Platform, type TextStyle, type ViewStyle } from "react-native";

export type ThemeMode = "light" | "dark";
export type SystemFontSize = "small" | "medium" | "large";
export type ThemeColors = {
  background:string;surface:string;surfaceRaised:string;surfaceMuted:string;surfaceInverse:string;
  text:string;textMuted:string;textSubtle:string;textInverse:string;textInverseMuted:string;border:string;borderStrong:string;borderInverse:string;
  primary:string;primaryHover:string;primaryPressed:string;primarySurface:string;primaryText:string;
  danger:string;dangerSurface:string;dangerText:string;warning:string;warningSurface:string;warningText:string;
  success:string;successSurface:string;successText:string;info:string;infoSurface:string;infoText:string;
  focus:string;overlay:string;shadow:string;
  /** Kitchen ticket paper. */
  paper:string;paperBorder:string;
  /** Single-series chart marks, validated against each mode's surface. */
  chartBar:string;
};
export type TypographyKey="display"|"title"|"heading"|"subheading"|"body"|"bodyStrong"|"label"|"caption"|"numeric";
export type Theme={mode:ThemeMode;fontScale:number;colors:ThemeColors;typography:Record<TypographyKey,TextStyle>;spacing:{xs:number;sm:number;md:number;lg:number;xl:number;xxl:number};radius:{control:number;card:number;section:number;modal:number;pill:number};control:{minTouch:number;disabledOpacity:number};shadows:{surface:ViewStyle;floating:ViewStyle}};

export const lightColors:ThemeColors={background:"#F7F7F5",surface:"#FFFFFF",surfaceRaised:"#FFFFFF",surfaceMuted:"#EFEDEB",surfaceInverse:"#171717",text:"#171717",textMuted:"#535353",textSubtle:"#686868",textInverse:"#FFFFFF",textInverseMuted:"#D0D0D0",border:"#D8D5D2",borderStrong:"#A7A29D",borderInverse:"#666666",primary:"#E3262E",primaryHover:"#CD1C25",primaryPressed:"#A9111A",primarySurface:"#FFE7E8",primaryText:"#FFFFFF",danger:"#B5121B",dangerSurface:"#FFE7E8",dangerText:"#8F1018",warning:"#8A4B00",warningSurface:"#FFF0D4",warningText:"#704000",success:"#246B3F",successSurface:"#E4F3E9",successText:"#1E6138",info:"#1E6091",infoSurface:"#E5F1FA",infoText:"#1D567F",focus:"#B45309",overlay:"rgba(9,9,9,0.48)",shadow:"#090909",paper:"#FFF8E5",paperBorder:"#E6D8B8",chartBar:"#E3262E"};
export const darkColors:ThemeColors={background:"#090909",surface:"#171717",surfaceRaised:"#202020",surfaceMuted:"#292929",surfaceInverse:"#050505",text:"#F7F7F5",textMuted:"#CCCCCC",textSubtle:"#B8B8B8",textInverse:"#FFFFFF",textInverseMuted:"#C9C9C9",border:"#383838",borderStrong:"#595959",borderInverse:"#707070",primary:"#FF5A4F",primaryHover:"#FF7066",primaryPressed:"#E33A35",primarySurface:"#481F21",primaryText:"#090909",danger:"#FF6B61",dangerSurface:"#481F21",dangerText:"#FFB9B4",warning:"#F59E0B",warningSurface:"#3C2B0F",warningText:"#FFD27A",success:"#58C77B",successSurface:"#173824",successText:"#8DE4A8",info:"#64B5F6",infoSurface:"#18344A",infoText:"#9DD4FF",focus:"#FFB11A",overlay:"rgba(0,0,0,0.72)",shadow:"#000000",paper:"#302C22",paperBorder:"#5B523D",chartBar:"#F5483F"};

export function statusBarStyle(mode:ThemeMode):"light"|"dark"{return mode==="dark"?"light":"dark";}
const sizeScale:Record<SystemFontSize,number>={small:.8,medium:1,large:1.2};
const typeBase:Record<TypographyKey,[number,number,TextStyle["fontWeight"]]>={display:[36,44,"900"],title:[28,36,"900"],heading:[22,29,"900"],subheading:[18,25,"800"],body:[14,21,"400"],bodyStrong:[14,21,"800"],label:[13,19,"800"],caption:[11,16,"700"],numeric:[24,31,"900"]};
export function createTheme(mode:ThemeMode,fontSize:SystemFontSize|number="medium"):Theme{
 const scale=typeof fontSize==="number"?fontSize:sizeScale[fontSize];const colors=mode==="dark"?darkColors:lightColors;
 const typography=Object.fromEntries(Object.entries(typeBase).map(([key,[size,line,fontWeight]])=>[key,{fontSize:size*scale,lineHeight:line*scale,fontWeight}])) as Theme["typography"];
 const shadowBase={shadowColor:colors.shadow,shadowOffset:{width:0,height:2},shadowOpacity:mode==="dark"?.3:.09,shadowRadius:8};
 return {mode,fontScale:scale,colors,typography,spacing:{xs:4,sm:8,md:12,lg:16,xl:20,xxl:24},radius:{control:14,card:20,section:24,modal:28,pill:999},control:{minTouch:48,disabledOpacity:.48},shadows:{surface:Platform.OS==="web"?shadowBase:{...shadowBase,elevation:2},floating:Platform.OS==="web"?{...shadowBase,shadowOffset:{width:0,height:10},shadowOpacity:mode==="dark"?.45:.16,shadowRadius:24}:{...shadowBase,shadowOffset:{width:0,height:10},shadowOpacity:mode==="dark"?.45:.16,shadowRadius:24,elevation:12}}};
}

export function contrastRatio(foreground:string,background:string):number{
 const luminance=(hex:string)=>{const value=hex.replace("#","");const parts=[0,2,4].map(index=>Number.parseInt(value.slice(index,index+2),16)/255).map(channel=>channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4);return .2126*parts[0]+.7152*parts[1]+.0722*parts[2];};
 const first=luminance(foreground),second=luminance(background);return (Math.max(first,second)+.05)/(Math.min(first,second)+.05);
}
