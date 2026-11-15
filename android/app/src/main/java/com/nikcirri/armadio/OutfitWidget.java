package com.nikcirri.armadio;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;
import java.io.File;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Widget "Armadio – Oggi" (SPEC.md, sezione 8.7): l'outfit di oggi con le miniature dei capi e tre
 * pulsanti (Cosa metto?, Aggiungi, Fine giornata). I dati li passa l'app con HomeWidgetPlugin; il
 * widget li legge anche ad app chiusa e dopo mezzanotte passa da solo al giorno nuovo.
 */
public class OutfitWidget extends AppWidgetProvider {

    static final String PREFS = "armadio_widget";
    static final String KEY_DAYS = "days";
    static final String IMAGE_DIR = "widget";
    private static final String ACTION_TICK = "com.nikcirri.armadio.WIDGET_TICK";

    // Gli stessi indirizzi di src/lib/logic/widget.ts (SHORTCUT_URLS) e di res/xml/shortcuts.xml.
    private static final String URL_COSA_METTO = "armadio://cosa-metto";
    private static final String URL_ADD_ITEM = "armadio://aggiungi-capo";
    private static final String URL_END_OF_DAY = "armadio://fine-giornata";
    private static final String URL_AGENDA = "armadio://agenda";

    private static final int[] THUMBS = { R.id.widget_thumb0, R.id.widget_thumb1, R.id.widget_thumb2, R.id.widget_thumb3 };
    /**
     * Lato massimo delle miniature: basta per il widget e resta leggero da passare al launcher
     * (le 4 immagini viaggiano insieme in un messaggio di Android con un limite di dimensione).
     */
    private static final int THUMB_SIDE = 150;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        RemoteViews views = build(context);
        for (int id : ids) manager.updateAppWidget(id, views);
        scheduleNextDay(context);
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String action = intent.getAction();
        if (
            ACTION_TICK.equals(action) || Intent.ACTION_TIME_CHANGED.equals(action) || Intent.ACTION_TIMEZONE_CHANGED.equals(action)
        ) {
            refreshAll(context);
        }
    }

    @Override
    public void onDisabled(Context context) {
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        if (alarms != null) alarms.cancel(tickIntent(context));
    }

    /** Ridisegna tutti i widget sulla schermata Home (dopo nuovi dati o a un giorno nuovo). */
    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, OutfitWidget.class));
        if (ids.length == 0) return;
        RemoteViews views = build(context);
        for (int id : ids) manager.updateAppWidget(id, views);
        scheduleNextDay(context);
    }

    /** Sveglia non precisa poco dopo mezzanotte, senza svegliare il telefono: nessun permesso. */
    private static void scheduleNextDay(Context context) {
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        if (alarms == null) return;
        long at = LocalDate.now().plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli() + 60_000L;
        alarms.set(AlarmManager.RTC, at, tickIntent(context));
    }

    private static PendingIntent tickIntent(Context context) {
        Intent intent = new Intent(context, OutfitWidget.class).setAction(ACTION_TICK);
        return PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static PendingIntent open(Context context, String url, int requestCode) {
        Intent intent = new Intent(context, MainActivity.class)
            .setAction(Intent.ACTION_VIEW)
            .setData(Uri.parse(url))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static RemoteViews build(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_outfit);
        LocalDate today = LocalDate.now();
        String date = today.format(DateTimeFormatter.ofPattern("EEEE d MMMM", Locale.ITALIAN));
        views.setTextViewText(R.id.widget_date, date);

        views.setOnClickPendingIntent(R.id.widget_header, open(context, URL_AGENDA, 1));
        views.setOnClickPendingIntent(R.id.widget_body, open(context, URL_AGENDA, 2));
        views.setOnClickPendingIntent(R.id.widget_btn_cosa_metto, open(context, URL_COSA_METTO, 3));
        views.setOnClickPendingIntent(R.id.widget_btn_add, open(context, URL_ADD_ITEM, 4));
        views.setOnClickPendingIntent(R.id.widget_btn_end_of_day, open(context, URL_END_OF_DAY, 5));

        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(KEY_DAYS, null);
        JSONObject day = raw == null ? null : dayFor(raw, today.toString());
        if (raw == null) {
            showEmpty(views, context.getString(R.string.widget_first_open), null);
        } else if (day == null) {
            showEmpty(views, context.getString(R.string.widget_nothing_today), context.getString(R.string.widget_nothing_hint));
        } else {
            showDay(context, views, day);
        }
        return views;
    }

    private static JSONObject dayFor(String raw, String date) {
        try {
            JSONArray days = new JSONArray(raw);
            for (int i = 0; i < days.length(); i++) {
                JSONObject d = days.getJSONObject(i);
                if (date.equals(d.optString("date"))) return d;
            }
        } catch (JSONException e) {
            return null;
        }
        return null;
    }

    private static void showEmpty(RemoteViews views, String label, String hint) {
        views.setTextViewText(R.id.widget_label, label);
        for (int id : THUMBS) views.setViewVisibility(id, View.GONE);
        views.setViewVisibility(R.id.widget_more, View.GONE);
        if (hint == null) {
            views.setViewVisibility(R.id.widget_hint, View.GONE);
        } else {
            views.setTextViewText(R.id.widget_hint, hint);
            views.setViewVisibility(R.id.widget_hint, View.VISIBLE);
        }
    }

    private static void showDay(Context context, RemoteViews views, JSONObject day) {
        views.setTextViewText(R.id.widget_label, day.optString("label"));
        JSONArray itemIds = day.optJSONArray("itemIds");
        JSONArray names = day.optJSONArray("names");
        int count = itemIds == null ? 0 : Math.min(itemIds.length(), THUMBS.length);
        File dir = new File(context.getFilesDir(), IMAGE_DIR);
        for (int i = 0; i < THUMBS.length; i++) {
            int viewId = THUMBS[i];
            if (i >= count) {
                views.setViewVisibility(viewId, View.GONE);
                continue;
            }
            views.setViewVisibility(viewId, View.VISIBLE);
            Bitmap bitmap = loadThumb(new File(dir, HomeWidgetPlugin.fileName(itemIds.optString(i))));
            if (bitmap != null) views.setImageViewBitmap(viewId, bitmap);
            else views.setImageViewResource(viewId, R.drawable.ic_widget_hanger);
            String name = names == null ? "" : names.optString(i);
            views.setContentDescription(viewId, name);
        }
        int more = day.optInt("more", 0);
        if (more > 0) {
            views.setTextViewText(R.id.widget_more, "+" + more);
            views.setViewVisibility(R.id.widget_more, View.VISIBLE);
        } else {
            views.setViewVisibility(R.id.widget_more, View.GONE);
        }
        if (count == 0) {
            views.setTextViewText(R.id.widget_hint, context.getString(R.string.widget_no_items));
            views.setViewVisibility(R.id.widget_hint, View.VISIBLE);
        } else {
            views.setViewVisibility(R.id.widget_hint, View.GONE);
        }
    }

    private static Bitmap loadThumb(File file) {
        if (!file.isFile()) return null;
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(file.getPath(), bounds);
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null;
        int sample = 1;
        while (Math.max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= THUMB_SIDE) sample *= 2;
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = sample;
        Bitmap decoded = BitmapFactory.decodeFile(file.getPath(), options);
        if (decoded == null) return null;
        int side = Math.max(decoded.getWidth(), decoded.getHeight());
        if (side <= THUMB_SIDE) return decoded;
        float scale = THUMB_SIDE / (float) side;
        int w = Math.max(1, Math.round(decoded.getWidth() * scale));
        int h = Math.max(1, Math.round(decoded.getHeight() * scale));
        Bitmap scaled = Bitmap.createScaledBitmap(decoded, w, h, true);
        if (scaled != decoded) decoded.recycle();
        return scaled;
    }
}
