package com.nikcirri.armadio;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.util.Base64;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.tasks.Tasks;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation;
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentationResult;
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenter;
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions;
import java.nio.FloatBuffer;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * Scontorno AI con ML Kit Subject Segmentation.
 * Restituisce la sagoma del capo come confidenza 0-255 per pixel (base64).
 * Tutto il lavoro avviene in un thread separato, così l'app non si blocca e non si chiude.
 */
@CapacitorPlugin(name = "Cutout")
public class CutoutPlugin extends Plugin {

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void segment(PluginCall call) {
        final String path = call.getString("path");
        final Integer requestedMax = call.getInt("maxSide", 1024);
        final int maxSide = requestedMax == null ? 1024 : requestedMax;
        if (path == null) {
            call.reject("Percorso dell'immagine mancante");
            return;
        }
        executor.execute(() -> run(call, path, maxSide));
    }

    private void run(PluginCall call, String path, int maxSide) {
        SubjectSegmenter segmenter = null;
        Bitmap source = null;
        Bitmap input = null;
        try {
            String filePath = path.startsWith("file://") ? Uri.parse(path).getPath() : path;
            source = BitmapFactory.decodeFile(filePath);
            if (source == null) {
                call.reject("Immagine non leggibile");
                return;
            }
            input = scaleDown(source, maxSide);
            int width = input.getWidth();
            int height = input.getHeight();

            SubjectSegmenterOptions options = new SubjectSegmenterOptions.Builder().enableForegroundConfidenceMask().build();
            segmenter = SubjectSegmentation.getClient(options);
            SubjectSegmentationResult result = Tasks.await(segmenter.process(InputImage.fromBitmap(input, 0)), 90, TimeUnit.SECONDS);

            FloatBuffer mask = result.getForegroundConfidenceMask();
            if (mask == null) {
                call.reject("Nessuna sagoma trovata");
                return;
            }
            mask.rewind();
            int n = width * height;
            if (mask.remaining() < n) {
                call.reject("Sagoma incompleta");
                return;
            }
            byte[] alpha = new byte[n];
            for (int i = 0; i < n; i++) {
                float c = mask.get();
                alpha[i] = (byte) Math.round(Math.max(0f, Math.min(1f, c)) * 255f);
            }

            JSObject ret = new JSObject();
            ret.put("width", width);
            ret.put("height", height);
            ret.put("mask", Base64.encodeToString(alpha, Base64.NO_WRAP));
            call.resolve(ret);
        } catch (OutOfMemoryError e) {
            call.reject("Memoria insufficiente per lo scontorno");
        } catch (Throwable e) {
            Throwable cause = e.getCause() != null ? e.getCause() : e;
            call.reject(cause.getClass().getSimpleName() + ": " + cause.getMessage());
        } finally {
            if (segmenter != null) {
                segmenter.close();
            }
            if (input != null && input != source) {
                input.recycle();
            }
            if (source != null) {
                source.recycle();
            }
        }
    }

    private static Bitmap scaleDown(Bitmap src, int maxSide) {
        int w = src.getWidth();
        int h = src.getHeight();
        int longSide = Math.max(w, h);
        if (longSide <= maxSide) {
            return src;
        }
        float ratio = (float) maxSide / longSide;
        return Bitmap.createScaledBitmap(src, Math.max(1, Math.round(w * ratio)), Math.max(1, Math.round(h * ratio)), true);
    }

    @Override
    protected void handleOnDestroy() {
        executor.shutdown();
    }
}
