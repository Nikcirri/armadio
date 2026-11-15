package com.nikcirri.armadio;

import android.content.Context;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Riceve dall'app i dati del widget "Armadio – Oggi" (SPEC.md, sezione 8.7): oggi e i 7 giorni
 * seguenti con le miniature dei capi. Li conserva nella memoria privata dell'app (SharedPreferences
 * e cartella files/widget) e ridisegna i widget. Niente rete, niente permessi.
 */
@CapacitorPlugin(name = "HomeWidget")
public class HomeWidgetPlugin extends Plugin {

    /** Una miniatura non supera questa dimensione (le miniature dell'app sono di circa 20 KB). */
    private static final int MAX_IMAGE_BYTES = 2 * 1024 * 1024;
    private static final int MAX_DAYS = 8;
    private static final int MAX_ITEMS_PER_DAY = 4;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    /** Nome del file di una miniatura: solo lettere, numeri e trattini dell'id del capo. */
    static String fileName(String itemId) {
        return itemId.replaceAll("[^A-Za-z0-9-]", "_") + ".img";
    }

    @PluginMethod
    public void update(PluginCall call) {
        JSArray days = call.getArray("days");
        JSObject images = call.getObject("images");
        if (days == null || images == null) {
            call.reject("Dati del widget mancanti");
            return;
        }
        executor.execute(() -> {
            try {
                save(getContext(), days, images);
                OutfitWidget.refreshAll(getContext());
                call.resolve();
            } catch (Exception e) {
                call.reject("Non riesco ad aggiornare il widget", e);
            }
        });
    }

    private static void save(Context context, JSONArray days, JSONObject images) throws JSONException, IOException {
        // Si tengono solo i campi che il widget usa, con limiti prudenti.
        JSONArray clean = new JSONArray();
        Set<String> needed = new HashSet<>();
        for (int i = 0; i < Math.min(days.length(), MAX_DAYS); i++) {
            JSONObject d = days.getJSONObject(i);
            JSONObject out = new JSONObject();
            out.put("date", d.optString("date"));
            out.put("label", d.optString("label"));
            out.put("more", d.optInt("more", 0));
            JSONArray ids = d.optJSONArray("itemIds");
            JSONArray names = d.optJSONArray("names");
            JSONArray outIds = new JSONArray();
            JSONArray outNames = new JSONArray();
            for (int k = 0; ids != null && k < Math.min(ids.length(), MAX_ITEMS_PER_DAY); k++) {
                String id = ids.optString(k);
                outIds.put(id);
                outNames.put(names == null ? "" : names.optString(k));
                needed.add(fileName(id));
            }
            out.put("itemIds", outIds);
            out.put("names", outNames);
            clean.put(out);
        }

        File dir = new File(context.getFilesDir(), OutfitWidget.IMAGE_DIR);
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("Cartella del widget non creata");
        Iterator<String> keys = images.keys();
        while (keys.hasNext()) {
            String id = keys.next();
            String name = fileName(id);
            if (!needed.contains(name)) continue;
            byte[] bytes = Base64.decode(images.optString(id), Base64.DEFAULT);
            if (bytes.length == 0 || bytes.length > MAX_IMAGE_BYTES) continue;
            File tmp = new File(dir, name + ".tmp");
            try (FileOutputStream out = new FileOutputStream(tmp)) {
                out.write(bytes);
            }
            File target = new File(dir, name);
            if (!tmp.renameTo(target)) {
                if (!target.delete() || !tmp.renameTo(target)) throw new IOException("Miniatura non salvata");
            }
        }
        // Le miniature dei capi che non servono più si cancellano.
        File[] files = dir.listFiles();
        if (files != null) {
            for (File f : files) {
                if (!needed.contains(f.getName())) {
                    // Se non si cancella ora, ci si riprova al prossimo aggiornamento.
                    boolean ignored = f.delete();
                }
            }
        }
        context.getSharedPreferences(OutfitWidget.PREFS, Context.MODE_PRIVATE).edit().putString(OutfitWidget.KEY_DAYS, clean.toString()).apply();
    }
}
