package com.nikcirri.armadio;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Rect;
import android.net.Uri;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.label.ImageLabel;
import com.google.mlkit.vision.label.ImageLabeler;
import com.google.mlkit.vision.label.ImageLabeling;
import com.google.mlkit.vision.label.defaults.ImageLabelerOptions;
import com.google.mlkit.vision.text.Text;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.TextRecognizer;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * Foto dei capi (SPEC.md, sezioni 6 e 8.1), con i modelli di ML Kit inclusi nell'app (funzionano
 * senza internet):
 * - readText: le righe di testo dell'etichetta interna (alfabeto latino), con il loro rettangolo;
 * - labels: le etichette generiche della foto (es. "Jacket", "Shoe") per suggerire la categoria.
 * Il lavoro avviene in un thread separato; l'app interpreta i risultati in JavaScript.
 */
@CapacitorPlugin(name = "Vision")
public class VisionPlugin extends Plugin {

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void readText(PluginCall call) {
        final String path = call.getString("path");
        if (path == null) {
            call.reject("Percorso dell'immagine mancante");
            return;
        }
        executor.execute(() -> runText(call, path));
    }

    @PluginMethod
    public void labels(PluginCall call) {
        final String path = call.getString("path");
        if (path == null) {
            call.reject("Percorso dell'immagine mancante");
            return;
        }
        executor.execute(() -> runLabels(call, path));
    }

    private static Bitmap decode(String path) {
        String filePath = path.startsWith("file://") ? Uri.parse(path).getPath() : path;
        return BitmapFactory.decodeFile(filePath);
    }

    private void runText(PluginCall call, String path) {
        TextRecognizer recognizer = null;
        Bitmap bitmap = null;
        try {
            bitmap = decode(path);
            if (bitmap == null) {
                call.reject("Immagine non leggibile");
                return;
            }
            recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS);
            Text result = Tasks.await(recognizer.process(InputImage.fromBitmap(bitmap, 0)), 60, TimeUnit.SECONDS);
            JSArray lines = new JSArray();
            for (Text.TextBlock block : result.getTextBlocks()) {
                for (Text.Line line : block.getLines()) {
                    JSObject l = new JSObject();
                    l.put("text", line.getText());
                    Rect r = line.getBoundingBox();
                    if (r != null) {
                        JSArray box = new JSArray();
                        box.put(r.left);
                        box.put(r.top);
                        box.put(r.right);
                        box.put(r.bottom);
                        l.put("box", box);
                    }
                    lines.put(l);
                }
            }
            JSObject ret = new JSObject();
            ret.put("width", bitmap.getWidth());
            ret.put("height", bitmap.getHeight());
            ret.put("lines", lines);
            call.resolve(ret);
        } catch (OutOfMemoryError e) {
            call.reject("Memoria insufficiente per leggere la foto");
        } catch (Throwable e) {
            Throwable cause = e.getCause() != null ? e.getCause() : e;
            call.reject(cause.getClass().getSimpleName() + ": " + cause.getMessage());
        } finally {
            if (recognizer != null) recognizer.close();
            if (bitmap != null) bitmap.recycle();
        }
    }

    private void runLabels(PluginCall call, String path) {
        ImageLabeler labeler = null;
        Bitmap bitmap = null;
        try {
            bitmap = decode(path);
            if (bitmap == null) {
                call.reject("Immagine non leggibile");
                return;
            }
            labeler = ImageLabeling.getClient(new ImageLabelerOptions.Builder().setConfidenceThreshold(0.3f).build());
            List<ImageLabel> found = Tasks.await(labeler.process(InputImage.fromBitmap(bitmap, 0)), 30, TimeUnit.SECONDS);
            JSArray labels = new JSArray();
            for (ImageLabel label : found) {
                JSObject l = new JSObject();
                l.put("text", label.getText());
                l.put("confidence", (double) label.getConfidence());
                labels.put(l);
            }
            JSObject ret = new JSObject();
            ret.put("labels", labels);
            call.resolve(ret);
        } catch (OutOfMemoryError e) {
            call.reject("Memoria insufficiente per guardare la foto");
        } catch (Throwable e) {
            Throwable cause = e.getCause() != null ? e.getCause() : e;
            call.reject(cause.getClass().getSimpleName() + ": " + cause.getMessage());
        } finally {
            if (labeler != null) labeler.close();
            if (bitmap != null) bitmap.recycle();
        }
    }

    @Override
    protected void handleOnDestroy() {
        executor.shutdown();
    }
}
