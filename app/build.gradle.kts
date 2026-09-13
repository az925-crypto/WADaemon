plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.zaaaam.wadaemon"
    compileSdk = 34
    ndkVersion = "26.3.11579264"

    defaultConfig {
        applicationId = "com.zaaaam.wadaemon"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"

        ndk {
            // PRD: hanya 2 ABI agar APK tidak bengkak.
            abiFilters += listOf("arm64-v8a", "armeabi-v7a")
        }

        externalNativeBuild {
            cmake {
                arguments += listOf("-DANDROID_STL=c++_shared")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }

    splits {
        abi {
            isEnable = true
            reset()
            include("arm64-v8a", "armeabi-v7a")
            isUniversalApk = false
        }
    }

    externalNativeBuild {
        cmake {
            path = file("CMakeLists.txt")
            version = "3.22.1"
        }
    }

    sourceSets {
        getByName("main") {
            // libnode.so prebuilt (diunduh di CI).
            jniLibs.srcDirs("libnode/bin")
            // nodejs-project hasil sync (generated, bukan di-commit).
            assets.srcDirs(
                "src/main/assets",
                layout.buildDirectory.dir("generated/nodejsAssets").get().asFile.path,
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

// Salin nodejs-project (sumber di root repo, sesudah npm ci di CI)
// ke assets generated. Sesi WA TIDAK ikut: ia tinggal di filesDir.
val nodejsAssetsDir = layout.buildDirectory.dir("generated/nodejsAssets/nodejs-project")
val syncNodejsAssets by tasks.registering(Copy::class) {
    from(rootDir.resolve("nodejs-project")) {
        // test hanya untuk CI ringan lokal, tidak perlu masuk APK.
        exclude("test/**")
    }
    into(nodejsAssetsDir)
}
tasks.matching { it.name.startsWith("merge") && it.name.contains("Assets") }.configureEach {
    dependsOn(syncNodejsAssets)
}
