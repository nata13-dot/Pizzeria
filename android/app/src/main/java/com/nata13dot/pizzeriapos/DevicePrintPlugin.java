package com.nata13dot.pizzeriapos;

import android.Manifest;
import android.app.AlertDialog;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.text.Html;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.LinearLayout;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.Charset;
import java.util.ArrayList;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "DevicePrint", permissions = {
    @Permission(alias = "bluetooth", strings = { Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN })
})
public class DevicePrintPlugin extends Plugin {
    private static final String PREFS = "thermal_printer";
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private WebView printWebView;

    @PluginMethod public void getConfiguredPrinter(PluginCall call) { call.resolve(savedPrinter()); }

    @PluginMethod public void setPaperWidth(PluginCall call) {
        Integer width = call.getInt("paperWidth", 80);
        prefs().edit().putInt("paperWidth", width != null && width == 58 ? 58 : 80).apply();
        call.resolve(savedPrinter());
    }

    @PluginMethod public void configurePrinter(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && getPermissionState("bluetooth") != PermissionState.GRANTED) {
            requestPermissionForAlias("bluetooth", call, "bluetoothPermissionResult");
        } else showPrinterChooser(call);
    }

    @PermissionCallback private void bluetoothPermissionResult(PluginCall call) {
        if (getPermissionState("bluetooth") != PermissionState.GRANTED) {
            call.reject("Se necesita permiso para usar impresoras Bluetooth vinculadas.");
        } else showPrinterChooser(call);
    }

    private void showPrinterChooser(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            ArrayList<String> labels = new ArrayList<>();
            ArrayList<BluetoothDevice> devices = new ArrayList<>();
            try {
                BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
                if (adapter != null && adapter.isEnabled()) {
                    Set<BluetoothDevice> bonded = adapter.getBondedDevices();
                    devices.addAll(bonded);
                    for (BluetoothDevice device : devices) labels.add("Bluetooth · " + safeName(device) + "\n" + device.getAddress());
                }
            } catch (SecurityException error) { call.reject("Android no permitió consultar los dispositivos Bluetooth vinculados."); return; }
            labels.add("Wi-Fi / red local (TCP)");
            new AlertDialog.Builder(getActivity()).setTitle("Configurar impresora térmica")
                .setItems(labels.toArray(new String[0]), (dialog, index) -> {
                    if (index < devices.size()) saveBluetooth(call, devices.get(index)); else showTcpForm(call);
                })
                .setNegativeButton("Cancelar", (dialog, which) -> call.reject("No se modificó la impresora configurada."))
                .setOnCancelListener(dialog -> call.reject("No se modificó la impresora configurada."))
                .show();
        });
    }

    private void showTcpForm(PluginCall call) {
        LinearLayout form = new LinearLayout(getActivity());
        form.setOrientation(LinearLayout.VERTICAL);
        int padding = (int) (20 * getContext().getResources().getDisplayMetrics().density);
        form.setPadding(padding, 0, padding, 0);
        EditText host = new EditText(getActivity()); host.setHint("IP, ejemplo 192.168.1.50");
        EditText port = new EditText(getActivity()); port.setHint("Puerto"); port.setInputType(2); port.setText("9100");
        form.addView(host); form.addView(port);
        AlertDialog dialog = new AlertDialog.Builder(getActivity()).setTitle("Impresora Wi-Fi / TCP").setView(form)
            .setPositiveButton("Guardar", null)
            .setNegativeButton("Cancelar", (d, which) -> call.reject("No se modificó la impresora configurada."))
            .create();
        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
            String address = host.getText().toString().trim(); int tcpPort;
            try { tcpPort = Integer.parseInt(port.getText().toString().trim()); } catch (NumberFormatException error) { port.setError("Puerto inválido"); return; }
            if (address.isEmpty()) { host.setError("Escribe la dirección IP"); return; }
            if (tcpPort < 1 || tcpPort > 65535) { port.setError("Puerto inválido"); return; }
            prefs().edit().putString("type", "tcp").putString("name", "Impresora " + address).putString("address", address).putInt("port", tcpPort).apply();
            dialog.dismiss(); call.resolve(savedPrinter());
        }));
        dialog.setOnCancelListener(d -> call.reject("No se modificó la impresora configurada.")); dialog.show();
    }

    private void saveBluetooth(PluginCall call, BluetoothDevice device) {
        prefs().edit().putString("type", "bluetooth").putString("name", safeName(device)).putString("address", device.getAddress()).remove("port").apply();
        call.resolve(savedPrinter());
    }

    @PluginMethod public void printEscPos(PluginCall call) {
        String html = call.getString("html"); Integer width = call.getInt("paperWidth", 80);
        if (html == null || html.trim().isEmpty()) { call.reject("El ticket no contiene información para imprimir."); return; }
        String type = prefs().getString("type", "");
        if (type.isEmpty()) { call.reject("No hay una impresora térmica configurada. Pulsa ‘Configurar impresora’. "); return; }
        prefs().edit().putInt("paperWidth", width != null && width == 58 ? 58 : 80).apply();
        executor.execute(() -> {
            try {
                byte[] ticket = escPosTicket(html, width != null && width == 58 ? 58 : 80);
                if ("bluetooth".equals(type)) printBluetooth(ticket); else if ("tcp".equals(type)) printTcp(ticket); else throw new Exception("Tipo de impresora incompatible.");
                JSObject result = new JSObject(); result.put("printed", true); result.put("printer", prefs().getString("name", "Impresora térmica")); call.resolve(result);
            } catch (SecurityException error) { call.reject("Falta permiso de Bluetooth. Permite dispositivos cercanos en la configuración de Android.", error); }
            catch (Exception error) { call.reject(readablePrintError(type, error), error); }
        });
    }

    private void printBluetooth(byte[] ticket) throws Exception {
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) throw new Exception("Este dispositivo no dispone de Bluetooth.");
        if (!adapter.isEnabled()) throw new Exception("Bluetooth está desactivado.");
        BluetoothDevice device = adapter.getRemoteDevice(prefs().getString("address", "")); adapter.cancelDiscovery();
        try (BluetoothSocket socket = device.createRfcommSocketToServiceRecord(SPP_UUID)) {
            socket.connect(); OutputStream output = socket.getOutputStream(); output.write(ticket); output.flush();
        }
    }

    private void printTcp(byte[] ticket) throws Exception {
        try (Socket socket = new Socket()) {
            socket.connect(new InetSocketAddress(prefs().getString("address", ""), prefs().getInt("port", 9100)), 5000);
            socket.setSoTimeout(5000); OutputStream output = socket.getOutputStream(); output.write(ticket); output.flush();
        }
    }

    private byte[] escPosTicket(String html, int paperWidth) throws Exception {
        boolean smallFont = html.contains("data-print-font-size=\"small\"");
        boolean largeFont = html.contains("data-print-font-size=\"large\"");
        String prepared = html.replaceAll("(?is)<head.*?</head>", "").replaceAll("(?is)<script.*?</script>", "").replaceAll("(?is)<style.*?</style>", "")
            .replaceAll("(?is)<button.*?</button>", "").replaceAll("(?is)<img[^>]*>", "").replaceAll("(?i)<br\\s*/?>", "\n").replaceAll("(?i)</(p|div|h1|h2|h3|tr|table)>", "\n").replaceAll("(?i)</(td|th)>", "  ");
        String text = Html.fromHtml(prepared, Html.FROM_HTML_MODE_LEGACY).toString().replace('\u00a0', ' ')
            .replace("🍕", "*").replace("🔥", "*")
            .replaceAll("[ \\t]+", " ").replaceAll(" *\\n *", "\n").replaceAll("\\n{2,}", "\n").trim();
        int maxChars = paperWidth == 58 ? (smallFont ? 42 : 32) : (smallFont ? 64 : 48);
        String divider = new String(new char[maxChars]).replace('\0', '-');
        text = text.replace("Cliente\n", divider + "\nCLIENTE\n")
            .replace("Pedido\n", divider + "\nPEDIDO\n")
            .replace("Pago\n", divider + "\nPAGO\n")
            .replace("Productos y extras Importe", "PRODUCTOS / EXTRAS IMPORTE")
            .replaceAll("(?m)^Total ", "TOTAL ");
        StringBuilder wrapped = new StringBuilder();
        for (String line : text.split("\\n")) {
            String remaining = alignAmount(line.trim(), maxChars); if (remaining.isEmpty()) continue;
            if (remaining.equals("NOTA DE VENTA") || remaining.matches("#[0-9]+") || remaining.startsWith("¡GRACIAS")) remaining = centerLine(remaining, maxChars);
            while (remaining.length() > maxChars) { int split = remaining.lastIndexOf(' ', maxChars); if (split < 1) split = maxChars; wrapped.append(remaining, 0, split).append('\n'); remaining = remaining.substring(split).trim(); }
            wrapped.append(remaining).append('\n');
        }
        Charset charset = Charset.forName("CP850"); ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        bytes.write(new byte[] { 0x1B, 0x40 });
        bytes.write(new byte[] { 0x1B, 0x4D, (byte) (smallFont ? 0x01 : 0x00) });
        bytes.write(new byte[] { 0x1B, 0x21, (byte) (largeFont ? 0x10 : 0x00) });
        bytes.write(new byte[] { 0x1B, 0x33, (byte) (smallFont ? 0x12 : largeFont ? 0x24 : 0x18) });
        bytes.write(new byte[] { 0x1B, 0x74, 0x02 }); bytes.write(wrapped.toString().getBytes(charset));
        bytes.write(new byte[] { 0x0A, 0x0A }); bytes.write(new byte[] { 0x1D, 0x56, 0x41, 0x08 }); return bytes.toByteArray();
    }

    private String alignAmount(String line, int width) {
        if (!line.matches(".*-?\\$[0-9][0-9,.]*$")) return line;
        int amountStart = line.lastIndexOf('$');
        if (amountStart > 0 && line.charAt(amountStart - 1) == '-') amountStart--;
        String label = line.substring(0, amountStart).trim(); String amount = line.substring(amountStart).trim();
        int spaces = width - label.length() - amount.length();
        if (label.isEmpty() || spaces < 1) return line;
        return label + new String(new char[spaces]).replace('\0', ' ') + amount;
    }

    private String centerLine(String line, int width) {
        int spaces = Math.max(0, (width - line.length()) / 2);
        return new String(new char[spaces]).replace('\0', ' ') + line;
    }

    private String readablePrintError(String type, Exception error) {
        String detail = error.getMessage() == null ? "sin detalle" : error.getMessage();
        if (detail.contains("Bluetooth está desactivado") || detail.contains("no dispone de Bluetooth")) return detail;
        if ("tcp".equals(type)) return "No se pudo conectar por red. Verifica que la impresora esté encendida, en la misma Wi-Fi y que IP/puerto sean correctos. Detalle: " + detail;
        return "No se pudo conectar con la impresora Bluetooth. Verifica que esté encendida, vinculada y dentro de alcance. Detalle: " + detail;
    }

    private SharedPreferences prefs() { return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    private JSObject savedPrinter() {
        JSObject result = new JSObject(); String type = prefs().getString("type", ""); result.put("configured", !type.isEmpty()); result.put("type", type);
        result.put("name", prefs().getString("name", "")); result.put("address", prefs().getString("address", "")); result.put("port", prefs().getInt("port", 0)); result.put("paperWidth", prefs().getInt("paperWidth", 80)); return result;
    }
    private String safeName(BluetoothDevice device) { String name = device.getName(); return name == null || name.trim().isEmpty() ? "Impresora Bluetooth" : name; }

    @PluginMethod public void printHtml(PluginCall call) {
        String html = call.getString("html"); String jobName = call.getString("jobName", "Ticket de pizzería");
        if (html == null || html.trim().isEmpty()) { call.reject("El ticket no contiene información para imprimir."); return; }
        getActivity().runOnUiThread(() -> {
            printWebView = new WebView(getContext()); printWebView.getSettings().setJavaScriptEnabled(false);
            printWebView.setWebViewClient(new WebViewClient() { @Override public void onPageFinished(WebView view, String url) {
                PrintManager manager = (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);
                if (manager == null) { printWebView = null; call.reject("El servicio de impresión de Android no está disponible."); return; }
                PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(jobName); manager.print(jobName, adapter, null);
                JSObject result = new JSObject(); result.put("opened", true); call.resolve(result);
            }}); printWebView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
        });
    }

    @Override protected void handleOnDestroy() { executor.shutdownNow(); super.handleOnDestroy(); }
}
