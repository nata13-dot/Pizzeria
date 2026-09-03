package com.nata13dot.pizzeriapos;

import android.os.Bundle;
import android.os.Build;
import android.view.View;
import android.webkit.WebView;
import androidx.webkit.WebSettingsCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DevicePrintPlugin.class);
        super.onCreate(savedInstanceState);
        WebView webView = getBridge().getWebView();
        webView.setImportantForAutofill(View.IMPORTANT_FOR_AUTOFILL_YES);
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
}
