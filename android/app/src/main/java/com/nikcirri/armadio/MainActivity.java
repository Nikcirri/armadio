package com.nikcirri.armadio;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin dell'app (non da npm): scontorno AI, salvataggio in galleria, blocco con impronta o PIN,
        // riconoscimento del viso per l'armocromia, aggiornamento dall'app.
        registerPlugin(AppUpdaterPlugin.class);
        registerPlugin(CutoutPlugin.class);
        registerPlugin(FacePlugin.class);
        registerPlugin(GalleryPlugin.class);
        registerPlugin(AppLockPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
