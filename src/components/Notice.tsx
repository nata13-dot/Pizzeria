import {ThemedText} from "../theme/ThemedText";
import {useState} from 'react';
import {StyleSheet,Text,View} from 'react-native';
import {useThemedStyles} from '../theme/ThemeProvider';
import type {Theme} from '../theme/tokens';
export type NoticeKind='success'|'error'|'warning'|'info';
export type SetFeedback=(message:string,kind?:NoticeKind)=>void;
export function useFeedback(defaultKind:NoticeKind="success"): [string,SetFeedback,NoticeKind] {
  const [state,setState]=useState<{message:string;kind:NoticeKind}>({message:'',kind:'info'});
  return [state.message,(message,kind=defaultKind)=>setState({message,kind}),state.kind];
}
const labels={success:'✓ Listo',error:'! No se completó',warning:'! Revisa antes de continuar',info:'ⓘ Información'};
export function Notice({kind='info',message}:{kind?:NoticeKind;message?:string}) {
  const styles=useThemedStyles(createStyles);
  if(!message)return null;
  const tone=kind==='success'?styles.successText:kind==='error'?styles.errorText:kind==='warning'?styles.warningText:styles.infoText;
  return <View accessibilityRole={kind==='error'?'alert':undefined} accessibilityLiveRegion={kind==='error'?'assertive':'polite'} style={[styles.box,styles[kind]]}>
    <ThemedText style={[styles.title,tone]}>{labels[kind]}</ThemedText><ThemedText style={[styles.text,tone]}>{message}</ThemedText>
  </View>;
}
const createStyles=(theme:Theme)=>StyleSheet.create({box:{borderLeftWidth:5,borderRadius:theme.radius.card,paddingHorizontal:theme.spacing.lg,paddingVertical:theme.spacing.md,gap:5,marginVertical:6},title:{...theme.typography.bodyStrong},text:{...theme.typography.body},success:{backgroundColor:theme.colors.successSurface,borderColor:theme.colors.success},successText:{color:theme.colors.successText},error:{backgroundColor:theme.colors.dangerSurface,borderColor:theme.colors.danger},errorText:{color:theme.colors.dangerText},warning:{backgroundColor:theme.colors.warningSurface,borderColor:theme.colors.warning},warningText:{color:theme.colors.warningText},info:{backgroundColor:theme.colors.infoSurface,borderColor:theme.colors.info},infoText:{color:theme.colors.infoText}});
