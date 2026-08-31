package com.nata13dot.pizzeriapos;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DevicePrintPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
