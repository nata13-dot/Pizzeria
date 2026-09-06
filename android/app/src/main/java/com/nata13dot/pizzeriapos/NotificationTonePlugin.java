package com.nata13dot.pizzeriapos;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.security.MessageDigest;

@CapacitorPlugin(name = "NotificationTone")
public class NotificationTonePlugin extends Plugin {
    @PluginMethod
    public void install(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.unavailable("Los tonos descargados requieren Android 10 o posterior.");
            return;
        }
        String key = call.getString("key", "");
        String label = call.getString("label", "Tono personalizado");
        String dataUri = call.getString("dataUri", "");
        String mimeType = call.getString("mimeType", "audio/mpeg");
        if (!key.matches("custom_[a-z0-9_]+") || !dataUri.contains(",")) {
            call.reject("El archivo de sonido no es válido.");
            return;
        }
        try {
            byte[] audio = Base64.decode(dataUri.substring(dataUri.indexOf(',') + 1), Base64.DEFAULT);
            String hash = Base64.encodeToString(MessageDigest.getInstance("SHA-256").digest(audio), Base64.NO_WRAP);
            String savedHash = getContext().getSharedPreferences("notification_tones", 0).getString(key + "_hash", "");
            String savedUri = getContext().getSharedPreferences("notification_tones", 0).getString(key + "_uri", "");
            String extension = mimeType.contains("wav") ? ".wav" : ".mp3";
            String displayName = "pizzeria_" + key + extension;
            ContentResolver resolver = getContext().getContentResolver();
            Uri uri;
            if (hash.equals(savedHash) && !savedUri.isEmpty()) {
                uri = Uri.parse(savedUri);
            } else {
                if (!savedUri.isEmpty()) resolver.delete(Uri.parse(savedUri), null, null);
                ContentValues values = new ContentValues();
                values.put(MediaStore.Audio.Media.DISPLAY_NAME, displayName);
                values.put(MediaStore.Audio.Media.MIME_TYPE, mimeType);
                values.put(MediaStore.Audio.Media.RELATIVE_PATH, "Notifications/Pizzeria");
                values.put(MediaStore.Audio.Media.IS_NOTIFICATION, true);
                values.put(MediaStore.Audio.Media.IS_PENDING, true);
                uri = resolver.insert(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, values);
                if (uri == null) throw new IllegalStateException("No se pudo guardar el tono.");
                try (OutputStream stream = resolver.openOutputStream(uri)) {
                    if (stream == null) throw new IllegalStateException("No se pudo abrir el archivo de tono.");
                    stream.write(audio);
                }
                values.clear();
                values.put(MediaStore.Audio.Media.IS_PENDING, false);
                resolver.update(uri, values, null, null);
                getContext().getSharedPreferences("notification_tones", 0).edit().putString(key + "_hash", hash).putString(key + "_uri", uri.toString()).apply();
            }

            String channelId = "orders_arrival_custom_v1_" + key;
            NotificationManager manager = getContext().getSystemService(NotificationManager.class);
            manager.deleteNotificationChannel(channelId);
            NotificationChannel channel = new NotificationChannel(channelId, "Pedidos · " + label, NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Tono personalizado para avisos de pedidos.");
            channel.enableVibration(true);
            AudioAttributes attributes = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
            channel.setSound(uri, attributes);
            manager.createNotificationChannel(channel);
            JSObject result = new JSObject();
            result.put("channelId", channelId);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("No se pudo instalar el tono personalizado.", error);
        }
    }
}
