package com.nata13dot.pizzeriapos;

import android.content.Context;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "DevicePrint")
public class DevicePrintPlugin extends Plugin {
    private WebView printWebView;

    @PluginMethod
    public void printHtml(PluginCall call) {
        String html = call.getString("html");
        String jobName = call.getString("jobName", "Ticket de pizzería");
        if (html == null || html.trim().isEmpty()) {
            call.reject("El ticket no contiene información para imprimir.");
            return;
        }

        getActivity().runOnUiThread(() -> {
            printWebView = new WebView(getContext());
            printWebView.getSettings().setJavaScriptEnabled(false);
            printWebView.setWebViewClient(new WebViewClient() {
                @Override
                public void onPageFinished(WebView view, String url) {
                    PrintManager manager = (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);
                    if (manager == null) {
                        printWebView = null;
                        call.reject("El servicio de impresión de Android no está disponible.");
                        return;
                    }
                    PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(jobName);
                    manager.print(jobName, adapter, null);
                    JSObject result = new JSObject();
                    result.put("opened", true);
                    call.resolve(result);
                }
            });
            printWebView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
        });
    }
}
