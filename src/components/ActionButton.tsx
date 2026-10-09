import {ThemedText} from "../theme/ThemedText";
import {useRef,useState} from 'react';
import {ActivityIndicator,Animated,Pressable,StyleSheet,Text,View} from 'react-native';
import {Notice} from './Notice';
import {operationError} from '../forms/validation';
import {useTheme,useThemedStyles} from '../theme/ThemeProvider';
import type {Theme} from '../theme/tokens';
import {usePressMotion} from '../motion/Motion';
type Props={label:string;onPress:()=>void|Promise<void>;variant?:'primary'|'secondary'|'destructive';disabled?:boolean;loading?:boolean;loadingLabel?:string;disabledReason?:string;testID?:string};
export function ActionButton({label,onPress,variant='primary',disabled=false,loading=false,loadingLabel='Guardando…',disabledReason,testID}:Props) {
  const {theme}=useTheme();const styles=useThemedStyles(createStyles);
  const motion=usePressMotion();
  const lock=useRef(false);const [pending,setPending]=useState(false);const [error,setError]=useState('');const [focused,setFocused]=useState(false);
  const working=loading||pending,blocked=disabled||working;
  async function press(){if(blocked||lock.current)return;lock.current=true;setPending(true);setError('');try{await onPress();}catch(error){setError(operationError(error,'completar la acción',true));}finally{lock.current=false;setPending(false);}}
  return <View style={styles.wrap}><Animated.View style={motion.animatedStyle}><Pressable testID={testID} accessibilityRole="button" accessibilityState={{disabled:blocked,busy:working}} accessibilityLabel={working?loadingLabel:label} disabled={blocked} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} onPressIn={motion.pressIn} onPressOut={motion.pressOut} onPress={()=>void press()} style={[styles.button,styles[variant],blocked&&styles.disabled,focused&&(variant==='primary'?styles.focusPrimary:styles.focus)]}>
    {working&&<ActivityIndicator color={variant==='primary'?theme.colors.primaryText:theme.colors.text}/>}<ThemedText style={[styles.text,variant==='primary'?styles.primaryText:variant==='destructive'?styles.dangerText:styles.secondaryText]}>{working?loadingLabel:label}</ThemedText>
  </Pressable></Animated.View>{disabled&&!working&&disabledReason&&<ThemedText style={styles.reason}>{disabledReason}</ThemedText>}<Notice kind="error" message={error}/></View>;
}
const createStyles=(theme:Theme)=>StyleSheet.create({wrap:{minWidth:0},button:{minHeight:theme.control.minTouch,borderRadius:theme.radius.pill,paddingHorizontal:20,paddingVertical:12,flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'center',gap:9,borderWidth:1},primary:{...theme.shadows.surface,backgroundColor:theme.colors.primary,borderColor:theme.colors.primary},secondary:{backgroundColor:theme.colors.primarySurface,borderColor:theme.colors.primarySurface},destructive:{backgroundColor:theme.colors.dangerSurface,borderColor:theme.colors.dangerSurface},disabled:{opacity:theme.control.disabledOpacity},focus:{borderColor:theme.colors.focus,borderWidth:2},focusPrimary:{borderColor:theme.colors.primaryText,borderWidth:2},text:{...theme.typography.bodyStrong,flexShrink:1},primaryText:{color:theme.colors.primaryText},secondaryText:{color:theme.colors.primary},dangerText:{color:theme.colors.dangerText},reason:{...theme.typography.caption,color:theme.colors.textMuted,marginTop:6,paddingHorizontal:8}});
