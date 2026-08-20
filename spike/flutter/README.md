# Flutter HERE Explore bootstrap spike

Disposable integration shell for PR #15. It is not production code and must not be imported by
the Expo application.

## Local setup

1. Install Flutter 3.41.9, Dart 3.11.5, Android SDK 36/min SDK 24 and iOS 15.2.
2. Download the private HERE Explore Flutter archive
   `heresdk-explore-flutter-4.27.2.0.309975.zip`.
3. Extract its `here_sdk-*.release.tar.gz` plugin into `plugins/here_sdk`.
4. Run:

```bash
flutter pub get
flutter run \
  --dart-define=HERE_ACCESS_KEY_ID=<access-key-id> \
  --dart-define=HERE_ACCESS_KEY_SECRET=<access-key-secret>
```

Never put real credentials in this repository, an uploaded artifact, or a screenshot.

## CI

The workflow downloads the archive from `HERE_SDK_DOWNLOAD_URL`, verifies the optional
`HERE_SDK_SHA256` variable when present, and passes the two HERE SDK secrets as masked
Dart defines. The first successful run reports the archive SHA-256 in the job summary so it can
be saved as the repository variable before production work begins.
