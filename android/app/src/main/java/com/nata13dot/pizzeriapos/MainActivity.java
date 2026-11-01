package com.nata13dot.pizzeriapos;

import android.content.res.Configuration;
import android.os.Bundle;
import android.os.Build;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DevicePrintPlugin.class);
        registerPlugin(NotificationTonePlugin.class);
        super.onCreate(savedInstanceState);
        WebView webView = getBridge().getWebView();
        webView.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_YES);
        // The app scales its own text from the system font size; a WebView text zoom on top would double it.
        webView.getSettings().setTextZoom(100);
        webView.addJavascriptInterface(new DeviceFontBridge(), "PizzeriaDevice");
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            webView.getSettings().setSaveFormData(true);
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_AUTHENTICATION)) {
            WebSettingsCompat.setWebAuthenticationSupport(
                webView.getSettings(),
                WebSettingsCompat.WEB_AUTHENTICATION_SUPPORT_FOR_APP
            );
        }
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        notifyFontScaleChanged();
    }

    @Override
    public void onResume() {
        super.onResume();
        notifyFontScaleChanged();
    }

    /** Lets the web app re-read the system font size without reloading. */
    private void notifyFontScaleChanged() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(
            "window.dispatchEvent(new Event('pizzeria:fontscale'))", null));
    }

    /** Exposes only the system font scale (Settings > Display > Font size) to the web app. */
    private class DeviceFontBridge {
        @JavascriptInterface
        public float getFontScale() {
            return getResources().getConfiguration().fontScale;
        }
    }
}
