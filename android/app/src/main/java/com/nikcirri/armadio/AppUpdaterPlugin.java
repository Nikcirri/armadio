package com.nikcirri.armadio;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import androidx.core.content.pm.PackageInfoCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Pattern;

/**
 * Aggiornamento dentro l'app (SPEC.md, sezione 11): scarica l'APK della nuova versione dalle Release
 * di GitHub nella cache dell'app e apre l'installazione di Android.
 *
 * Sicurezza: solo indirizzi delle Release di questo repository, reindirizzamenti solo https verso
 * github.com o *.githubusercontent.com (al massimo 5), file completo (dimensione e SHA-256 della
 * Release), pacchetto com.nikcirri.armadio con una versione più nuova di quella installata.
 * Android rifiuta comunque un APK firmato con una chiave diversa.
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    static final String ALLOWED_PREFIX = "https://github.com/Nikcirri/armadio/releases/download/";
    /** Dopo il prefisso: "v1.5.0/Armadio-v1.5.0.apk" (solo lettere, numeri, punto, trattino, trattino basso). */
    private static final Pattern ALLOWED_REST = Pattern.compile("[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*\\.apk");
    private static final Pattern VERSION = Pattern.compile("\\d{1,4}\\.\\d{1,4}\\.\\d{1,4}");
    private static final Pattern SHA256 = Pattern.compile("[0-9a-f]{64}");
    private static final long MIN_APK_BYTES = 1_000_000L;
    private static final long MAX_APK_BYTES = 300_000_000L;
    private static final int MAX_REDIRECTS = 5;
    private static final String DIR = "updates";
    private static final String TEMP_NAME = "download.tmp";

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean busy = new AtomicBoolean(false);

    /** Errore con un messaggio già comprensibile per l'utente. */
    private static final class UpdateException extends IOException {
        final String code;

        UpdateException(String message) {
            this(message, "UPDATE_FAILED");
        }

        UpdateException(String message, String code) {
            super(message);
            this.code = code;
        }
    }

    static boolean isAllowedUrl(String url) {
        if (url == null || !url.startsWith(ALLOWED_PREFIX) || !url.endsWith(".apk")) return false;
        String rest = url.substring(ALLOWED_PREFIX.length());
        return !rest.contains("..") && ALLOWED_REST.matcher(rest).matches();
    }

    static boolean isAllowedHop(URL url) {
        if (!"https".equals(url.getProtocol())) return false;
        String host = url.getHost() == null ? "" : url.getHost().toLowerCase(Locale.ROOT);
        return host.equals("github.com") || host.endsWith(".githubusercontent.com");
    }

    /** Android permette a questa app di installare aggiornamenti? ("Installa app sconosciute"). */
    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("allowed", installAllowed());
        call.resolve(ret);
    }

    /** Apre la schermata "Installa app sconosciute" di questa app. */
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Non riesco ad aprire le impostazioni di Android");
        }
    }

    /**
     * Scarica l'APK (evento "progress" con la percentuale), lo controlla e apre l'installazione.
     * Se il file della stessa versione è già nella cache ed è valido, non lo riscarica.
     * Parametri: url, version ("1.5.0"), size (byte dichiarati da GitHub), sha256 (facoltativo).
     */
    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        String version = call.getString("version");
        long size = call.getData().optLong("size", -1);
        String sha256 = call.getString("sha256");
        if (!isAllowedUrl(url)) {
            call.reject("Indirizzo dell'aggiornamento non valido", "BAD_URL");
            return;
        }
        if (version == null || !VERSION.matcher(version).matches()) {
            call.reject("Versione dell'aggiornamento non valida", "BAD_VERSION");
            return;
        }
        if (size < MIN_APK_BYTES || size > MAX_APK_BYTES) {
            call.reject("Dimensione dell'aggiornamento non valida", "BAD_SIZE");
            return;
        }
        final String expectedSha = sha256 == null || sha256.isEmpty() ? null : sha256.toLowerCase(Locale.ROOT);
        if (expectedSha != null && !SHA256.matcher(expectedSha).matches()) {
            call.reject("Impronta dell'aggiornamento non valida", "BAD_SHA256");
            return;
        }
        if (!installAllowed()) {
            call.reject("Serve il permesso «Installa app sconosciute»", "NO_PERMISSION");
            return;
        }
        if (!busy.compareAndSet(false, true)) {
            call.reject("Sto già scaricando l'aggiornamento", "BUSY");
            return;
        }
        executor.execute(() -> {
            try {
                File dir = updatesDir();
                File apk = new File(dir, "Armadio-v" + version + ".apk");
                boolean reused = false;
                if (apk.isFile()) {
                    try {
                        verifyFile(apk, size, expectedSha, version);
                        reused = true;
                    } catch (IOException e) {
                        // Copia vecchia o rovinata: si riscarica.
                        reused = false;
                    }
                }
                if (!reused) {
                    clearDir(dir);
                    File temp = new File(dir, TEMP_NAME);
                    try {
                        String sha = download(url, temp, size);
                        if (expectedSha != null && !expectedSha.equals(sha)) {
                            throw new UpdateException("Il file scaricato non corrisponde a quello della Release. Riprova.");
                        }
                        verifyPackage(temp, version);
                        if (!temp.renameTo(apk)) throw new UpdateException("Non riesco a salvare l'aggiornamento nella memoria dell'app");
                    } finally {
                        if (temp.exists()) temp.delete();
                    }
                }
                openInstaller(call, apk, reused);
            } catch (UpdateException e) {
                call.reject(e.getMessage(), e.code);
            } catch (IOException e) {
                call.reject("Scaricamento non riuscito. Controlla internet e riprova.", "NETWORK");
            } catch (Exception e) {
                call.reject("Aggiornamento non riuscito: " + e.getClass().getSimpleName(), "UPDATE_FAILED");
            } finally {
                busy.set(false);
            }
        });
    }

    /** Cancella l'APK scaricato (al primo avvio della versione nuova). */
    @PluginMethod
    public void cleanup(PluginCall call) {
        if (busy.get()) {
            JSObject ret = new JSObject();
            ret.put("removed", 0);
            call.resolve(ret);
            return;
        }
        executor.execute(() -> {
            File dir = new File(getContext().getCacheDir(), DIR);
            int removed = clearDir(dir);
            dir.delete();
            JSObject ret = new JSObject();
            ret.put("removed", removed);
            call.resolve(ret);
        });
    }

    private boolean installAllowed() {
        return getContext().getPackageManager().canRequestPackageInstalls();
    }

    private File updatesDir() throws UpdateException {
        File dir = new File(getContext().getCacheDir(), DIR);
        if (!dir.isDirectory() && !dir.mkdirs()) throw new UpdateException("Non riesco a usare la memoria dell'app");
        return dir;
    }

    private static int clearDir(File dir) {
        int removed = 0;
        File[] files = dir.listFiles();
        if (files != null) for (File f : files) if (f.delete()) removed++;
        return removed;
    }

    /** Scarica in `target` seguendo i reindirizzamenti consentiti; restituisce lo SHA-256 del file. */
    private String download(String address, File target, long expectedSize) throws IOException {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(address);
            for (int hop = 0; ; hop++) {
                if (!isAllowedHop(url)) throw new UpdateException("Indirizzo di scaricamento non consentito");
                conn = (HttpURLConnection) url.openConnection();
                conn.setInstanceFollowRedirects(false);
                conn.setConnectTimeout(15_000);
                conn.setReadTimeout(30_000);
                conn.setRequestProperty("User-Agent", "Armadio-Android");
                conn.setRequestProperty("Accept", "application/octet-stream");
                int code = conn.getResponseCode();
                if (code == 301 || code == 302 || code == 303 || code == 307 || code == 308) {
                    String location = conn.getHeaderField("Location");
                    conn.disconnect();
                    conn = null;
                    if (location == null) throw new UpdateException("GitHub non ha indicato dove scaricare il file");
                    if (hop + 1 > MAX_REDIRECTS) throw new UpdateException("Troppi reindirizzamenti da GitHub");
                    url = new URL(url, location);
                    continue;
                }
                if (code != HttpURLConnection.HTTP_OK) throw new UpdateException("GitHub ha risposto con l'errore " + code + ". Riprova più tardi.");
                break;
            }
            long total = conn.getContentLengthLong();
            if (total > 0 && total != expectedSize) {
                throw new UpdateException("Il file su GitHub non corrisponde a quello della Release. Riprova.");
            }
            MessageDigest digest = sha256();
            long done = 0;
            int lastPercent = -1;
            try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(target)) {
                byte[] buffer = new byte[64 * 1024];
                int n;
                while ((n = in.read(buffer)) != -1) {
                    done += n;
                    if (done > expectedSize) throw new UpdateException("Il file scaricato è più grande del previsto");
                    out.write(buffer, 0, n);
                    digest.update(buffer, 0, n);
                    int percent = (int) Math.min(100, (done * 100) / expectedSize);
                    if (percent != lastPercent) {
                        lastPercent = percent;
                        JSObject progress = new JSObject();
                        progress.put("percent", percent);
                        notifyListeners("progress", progress);
                    }
                }
            }
            if (done != expectedSize || target.length() != expectedSize || (total > 0 && done != total)) {
                throw new UpdateException("Il file scaricato non è completo. Riprova.");
            }
            return hex(digest.digest());
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /** Controlla una copia già scaricata: dimensione, impronta, pacchetto e versione. */
    private void verifyFile(File apk, long expectedSize, String expectedSha, String version) throws IOException {
        if (apk.length() != expectedSize) throw new UpdateException("Copia scaricata non valida");
        if (expectedSha != null && !expectedSha.equals(fileSha256(apk))) throw new UpdateException("Copia scaricata non valida");
        verifyPackage(apk, version);
    }

    /** Deve essere Armadio (stesso pacchetto), con la versione attesa e più nuova di quella installata. */
    @SuppressWarnings("deprecation")
    private void verifyPackage(File apk, String version) throws UpdateException {
        PackageManager pm = getContext().getPackageManager();
        String pkg = getContext().getPackageName();
        PackageInfo archive;
        PackageInfo installed;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                archive = pm.getPackageArchiveInfo(apk.getAbsolutePath(), PackageManager.PackageInfoFlags.of(0));
                installed = pm.getPackageInfo(pkg, PackageManager.PackageInfoFlags.of(0));
            } else {
                archive = pm.getPackageArchiveInfo(apk.getAbsolutePath(), 0);
                installed = pm.getPackageInfo(pkg, 0);
            }
        } catch (PackageManager.NameNotFoundException e) {
            throw new UpdateException("Non riesco a leggere la versione installata");
        }
        if (archive == null || !pkg.equals(archive.packageName)) {
            throw new UpdateException("Il file scaricato non è un aggiornamento di Armadio");
        }
        if (archive.versionName != null && !version.equals(archive.versionName)) {
            throw new UpdateException("Il file scaricato non è la versione " + version);
        }
        if (PackageInfoCompat.getLongVersionCode(archive) <= PackageInfoCompat.getLongVersionCode(installed)) {
            throw new UpdateException("Questa versione è già installata", "NOT_NEWER");
        }
    }

    private void openInstaller(PluginCall call, File apk, boolean reused) {
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().startActivity(intent);
                JSObject ret = new JSObject();
                ret.put("reused", reused);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Non riesco ad aprire l'installazione di Android", "NO_INSTALLER");
            }
        });
    }

    private static MessageDigest sha256() throws UpdateException {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new UpdateException("Controllo del file non disponibile");
        }
    }

    private static String fileSha256(File file) throws IOException {
        MessageDigest digest = sha256();
        try (InputStream in = new FileInputStream(file)) {
            byte[] buffer = new byte[64 * 1024];
            int n;
            while ((n = in.read(buffer)) != -1) digest.update(buffer, 0, n);
        }
        return hex(digest.digest());
    }

    private static String hex(byte[] bytes) {
        StringBuilder sb = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) sb.append(String.format(Locale.ROOT, "%02x", b));
        return sb.toString();
    }
}
