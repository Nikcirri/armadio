package com.nikcirri.armadio;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.PointF;
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
import com.google.mlkit.vision.face.Face;
import com.google.mlkit.vision.face.FaceContour;
import com.google.mlkit.vision.face.FaceDetection;
import com.google.mlkit.vision.face.FaceDetector;
import com.google.mlkit.vision.face.FaceDetectorOptions;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * Armocromia: trova il viso nella foto con ML Kit Face Detection (modello incluso nell'app,
 * funziona senza internet) e restituisce i contorni (viso, occhi, sopracciglia, labbra, guance).
 * I colori li misura poi l'app in JavaScript. Il lavoro avviene in un thread separato.
 */
@CapacitorPlugin(name = "Face")
public class FacePlugin extends Plugin {

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private static final int[] CONTOURS = {
        FaceContour.FACE,
        FaceContour.LEFT_EYEBROW_TOP,
        FaceContour.LEFT_EYEBROW_BOTTOM,
        FaceContour.RIGHT_EYEBROW_TOP,
        FaceContour.RIGHT_EYEBROW_BOTTOM,
        FaceContour.LEFT_EYE,
        FaceContour.RIGHT_EYE,
        FaceContour.UPPER_LIP_TOP,
        FaceContour.UPPER_LIP_BOTTOM,
        FaceContour.LOWER_LIP_TOP,
        FaceContour.LOWER_LIP_BOTTOM,
        FaceContour.NOSE_BRIDGE,
        FaceContour.NOSE_BOTTOM,
        FaceContour.LEFT_CHEEK,
        FaceContour.RIGHT_CHEEK,
    };

    private static final String[] NAMES = {
        "face",
        "leftEyebrowTop",
        "leftEyebrowBottom",
        "rightEyebrowTop",
        "rightEyebrowBottom",
        "leftEye",
        "rightEye",
        "upperLipTop",
        "upperLipBottom",
        "lowerLipTop",
        "lowerLipBottom",
        "noseBridge",
        "noseBottom",
        "leftCheek",
        "rightCheek",
    };

    @PluginMethod
    public void detect(PluginCall call) {
        final String path = call.getString("path");
        final Integer requestedMax = call.getInt("maxSide", 1280);
        final int maxSide = requestedMax == null ? 1280 : requestedMax;
        if (path == null) {
            call.reject("Percorso dell'immagine mancante");
            return;
        }
        executor.execute(() -> run(call, path, maxSide));
    }

    private void run(PluginCall call, String path, int maxSide) {
        FaceDetector detector = null;
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

            FaceDetectorOptions options = new FaceDetectorOptions.Builder()
                .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_ACCURATE)
                .setContourMode(FaceDetectorOptions.CONTOUR_MODE_ALL)
                .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_NONE)
                .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_NONE)
                .setMinFaceSize(0.1f)
                .build();
            detector = FaceDetection.getClient(options);
            List<Face> faces = Tasks.await(detector.process(InputImage.fromBitmap(input, 0)), 60, TimeUnit.SECONDS);

            JSArray list = new JSArray();
            for (Face face : faces) {
                JSObject f = new JSObject();
                Rect b = face.getBoundingBox();
                JSObject bounds = new JSObject();
                bounds.put("x", b.left);
                bounds.put("y", b.top);
                bounds.put("width", b.width());
                bounds.put("height", b.height());
                f.put("bounds", bounds);

                JSObject angles = new JSObject();
                angles.put("x", face.getHeadEulerAngleX());
                angles.put("y", face.getHeadEulerAngleY());
                angles.put("z", face.getHeadEulerAngleZ());
                f.put("angles", angles);

                // Punti come [x0, y0, x1, y1, ...] per ogni contorno trovato.
                JSObject contours = new JSObject();
                for (int i = 0; i < CONTOURS.length; i++) {
                    FaceContour contour = face.getContour(CONTOURS[i]);
                    if (contour == null) continue;
                    JSArray pts = new JSArray();
                    for (PointF p : contour.getPoints()) {
                        pts.put((double) p.x);
                        pts.put((double) p.y);
                    }
                    contours.put(NAMES[i], pts);
                }
                f.put("contours", contours);
                list.put(f);
            }

            JSObject ret = new JSObject();
            ret.put("width", input.getWidth());
            ret.put("height", input.getHeight());
            ret.put("faces", list);
            call.resolve(ret);
        } catch (OutOfMemoryError e) {
            call.reject("Memoria insufficiente per analizzare la foto");
        } catch (Throwable e) {
            Throwable cause = e.getCause() != null ? e.getCause() : e;
            call.reject(cause.getClass().getSimpleName() + ": " + cause.getMessage());
        } finally {
            if (detector != null) {
                detector.close();
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
