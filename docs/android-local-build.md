# Build Android locale

Lo script `scripts/build_android_local.sh` produce una APK debug installabile e ripetibile. Deve essere eseguito dalla root del repository e richiede Flutter 3.41.9, Python 3, `unzip`, `tar` e accesso al download dello SDK HERE.

Prima di eseguirlo, esporta le variabili solo nella shell locale (non committarle e non inserirle nell'APK CI):

```bash
export HERE_SDK_DOWNLOAD_URL='...'
export HERE_SDK_VERSION='4.27.2.0.309975'
export SUPABASE_URL='https://...'
export SUPABASE_ANON_KEY='...'
export HERE_ACCESS_KEY_ID='...'
export HERE_ACCESS_KEY_SECRET='...'
bash scripts/build_android_local.sh
```

L'output è `spike/flutter/build/app/outputs/flutter-apk/app-debug.apk`. I valori `dart-define` sono inclusi nel binario dell'app e quindi non sono segreti dopo la distribuzione: usa soltanto credenziali client destinate a essere pubbliche e proteggi le API server-side tramite Supabase/Edge Functions. La CI continua volutamente a produrre una build senza credenziali provider per evitare di pubblicarle nell'artefatto.
