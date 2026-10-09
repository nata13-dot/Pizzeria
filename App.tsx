import { ConfirmationDialogHost } from "./src/components/ConfirmationDialog";
import { AppErrorBoundary, PizzeriaApp } from "./src/shell/PizzeriaApp";
import { StatusBar } from "expo-status-bar";
import { ThemeProvider, useTheme } from "./src/theme/ThemeProvider";
import { statusBarStyle } from "./src/theme/tokens";
import { WorkProvider } from "./src/work/WorkProvider";

function AppStatusBar(){const {mode}=useTheme();return <StatusBar style={statusBarStyle(mode)}/>;}
export default function App(){
  return <ThemeProvider><AppStatusBar/><AppErrorBoundary><WorkProvider><PizzeriaApp/><ConfirmationDialogHost/></WorkProvider></AppErrorBoundary></ThemeProvider>;
}
