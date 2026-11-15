package com.nikcirri.armadio;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Scorciatoie e widget aprono l'app con un indirizzo armadio://… (SPEC.md, sezione 8.7).
        // Se Android ricrea l'app o la riapre dalle app recenti, lo stesso indirizzo tornerebbe:
        // lo si toglie, così l'azione non si ripete.
        Intent intent = getIntent();
        Uri data = intent == null ? null : intent.getData();
        boolean fromHistory = intent != null && (intent.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0;
        if (data != null && "armadio".equals(data.getScheme()) && (savedInstanceState != null || fromHistory)) {
            setIntent(new Intent(intent).setAction(Intent.ACTION_MAIN).setData(null));
        }
        // Plugin dell'app (non da npm): scontorno AI, salvataggio in galleria, blocco con impronta o PIN,
        // riconoscimento del viso per l'armocromia, aggiornamento dall'app, widget della schermata Home,
        // lettura dell'etichetta e categoria suggerita.
        registerPlugin(AppUpdaterPlugin.class);
        registerPlugin(CutoutPlugin.class);
        registerPlugin(FacePlugin.class);
        registerPlugin(GalleryPlugin.class);
        registerPlugin(AppLockPlugin.class);
        registerPlugin(HomeWidgetPlugin.class);
        registerPlugin(VisionPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
