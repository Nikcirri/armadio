package com.nikcirri.armadio;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import androidx.annotation.RequiresApi;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Salva un'immagine nella galleria del telefono, nella cartella Immagini/Armadio.
 * Da Android 10 usa MediaStore (nessun permesso); prima chiede il permesso di scrittura.
 */
@CapacitorPlugin(
    name = "Gallery",
    permissions = { @Permission(strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }, alias = "storage") }
)
public class GalleryPlugin extends Plugin {

    private static final String FOLDER = "Armadio";
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void saveImage(PluginCall call) {
        if (call.getString("data") == null || call.getString("fileName") == null) {
            call.reject("Immagine mancante");
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "storagePermissionCallback");
            return;
        }
        executor.execute(() -> save(call));
    }

    @PermissionCallback
    private void storagePermissionCallback(PluginCall call) {
        if (getPermissionState("storage") == PermissionState.GRANTED) {
            executor.execute(() -> save(call));
        } else {
            call.reject("Permesso per salvare le foto negato", "PERMISSION_DENIED");
        }
    }

    private void save(PluginCall call) {
        String data = call.getString("data");
        String fileName = call.getString("fileName");
        String mime = call.getString("mimeType", "image/jpeg");
        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            Uri uri;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                uri = saveWithMediaStore(bytes, fileName, mime);
            } else {
                uri = saveToPictures(bytes, fileName, mime);
            }
            JSObject ret = new JSObject();
            ret.put("uri", uri.toString());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Non riesco a salvare l'immagine in galleria: " + e.getMessage(), e);
        } catch (OutOfMemoryError e) {
            call.reject("Memoria insufficiente per salvare l'immagine");
        }
    }

    @RequiresApi(api = Build.VERSION_CODES.Q)
    private Uri saveWithMediaStore(byte[] bytes, String fileName, String mime) throws Exception {
        ContentResolver resolver = getContext().getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.Images.Media.DISPLAY_NAME, fileName);
        values.put(MediaStore.Images.Media.MIME_TYPE, mime);
        values.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/" + FOLDER);
        values.put(MediaStore.Images.Media.IS_PENDING, 1);
        Uri collection = MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
        Uri uri = resolver.insert(collection, values);
        if (uri == null) throw new Exception("galleria non disponibile");
        try (OutputStream out = resolver.openOutputStream(uri)) {
            if (out == null) throw new Exception("file non scrivibile");
            out.write(bytes);
        } catch (Exception e) {
            resolver.delete(uri, null, null);
            throw e;
        }
        ContentValues done = new ContentValues();
        done.put(MediaStore.Images.Media.IS_PENDING, 0);
        resolver.update(uri, done, null, null);
        return uri;
    }

    @SuppressWarnings("deprecation")
    private Uri saveToPictures(byte[] bytes, String fileName, String mime) throws Exception {
        File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), FOLDER);
        if (!dir.exists() && !dir.mkdirs()) throw new Exception("cartella non creata");
        File file = new File(dir, fileName);
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(bytes);
        }
        MediaScannerConnection.scanFile(getContext(), new String[] { file.getAbsolutePath() }, new String[] { mime }, null);
        return Uri.fromFile(file);
    }
}
