package com.wgytcdx.photoquickfilter;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PhotoLibraryPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
