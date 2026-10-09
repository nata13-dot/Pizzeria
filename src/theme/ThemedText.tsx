import {StyleSheet,Text,type TextProps,type TextStyle} from "react-native";
import {useTheme} from "./ThemeProvider";

export function ThemedText({style,...props}:TextProps){
 const {theme}=useTheme();
 const resolved=StyleSheet.flatten(style) as TextStyle|undefined;
 const body:TextStyle={...theme.typography.body,color:theme.colors.text};
 // A local display/icon size must use its natural line box unless it also
 // declares an intentional line height. Inheriting the body line height can
 // clip large glyphs on React Native.
 if(resolved?.fontSize!==undefined&&resolved.lineHeight===undefined)delete body.lineHeight;
 return <Text {...props} style={[body,style]}/>;
}
