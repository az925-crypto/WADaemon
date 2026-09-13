plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.zaaaam.wadaemon"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.zaaaam.wadaemon"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "0.0.0-ci"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
        debug {
        }
    }

    // PRD §9: batasi ke 2 ABI agar APK tidak bengkak.
    splits {
        abi {
            isEnable = true
            reset()
            include("arm64-v8a", "armeabi-v7a")
            isUniversalApk = false
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
