package com.nikcirri.armadio;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin dell'app (non da npm): scontorno AI in un thread separato e salvataggio in galleria.
        registerPlugin(CutoutPlugin.class);
        registerPlugin(GalleryPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
