# libnode (nodejs-mobile)

Binary `libnode.so` + header di folder ini **tidak di-commit** (total 100MB+).
CI mengunduhnya dari rilis resmi:

https://github.com/nodejs-mobile/nodejs-mobile/releases/download/v18.20.4/nodejs-mobile-v18.20.4-android.zip

Struktur yang diharapkan saat build:

- `app/libnode/bin/arm64-v8a/libnode.so`
- `app/libnode/bin/armeabi-v7a/libnode.so`
- `app/libnode/include/node/node.h`
