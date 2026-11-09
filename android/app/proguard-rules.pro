# Regole R8 dell'APK release (SPEC.md, sezione 2): prudenti di proposito.
#
# Il codice dell'app, di Capacitor, dei plugin e delle librerie Ionic resta intatto: niente nomi
# cambiati e niente parti tolte, perché Capacitor trova plugin e metodi per nome e con le annotazioni,
# e la fotocamera usa Gson sui suoi oggetti. Si riducono solo le librerie grandi (AndroidX, Material,
# Kotlin, Google Play services, ML Kit), che portano con sé le loro regole ufficiali.
# Prima di ogni Release scripts/check_apk.py controlla che nell'APK ci sia tutto.

-keep class com.nikcirri.armadio.** { *; }
-keep class com.getcapacitor.** { *; }
-keep class com.capacitorjs.** { *; }
-keep class io.capawesome.** { *; }
-keep class io.ionic.libs.** { *; }
-keep class org.apache.cordova.** { *; }

# Annotazioni lette a runtime (@CapacitorPlugin, @PluginMethod, @JavascriptInterface)
# e firme generiche (servono a Gson per i TypeToken).
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod

# Ponte tra JavaScript e Android nella WebView.
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Gson 2.10 (usato da @capacitor/camera) non include le sue regole: queste sono quelle ufficiali.
-keep class com.google.gson.reflect.TypeToken { *; }
-keep class * extends com.google.gson.reflect.TypeToken
-keepclassmembers,allowobfuscation class * {
    @com.google.gson.annotations.SerializedName <fields>;
}

# Numeri di riga negli errori Java, utili se qualcosa si rompe.
-keepattributes SourceFile,LineNumberTable
