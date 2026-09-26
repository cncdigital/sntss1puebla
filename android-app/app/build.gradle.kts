plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "mx.sntss1puebla.credenciales"
    compileSdk = 36

    defaultConfig {
        applicationId = "mx.sntss1puebla.credenciales"
        minSdk = 26
        targetSdk = 36
        versionCode = 12
        versionName = "0.10.2"
    }

    // Keep this block in every packaged version: an update must use the installed APK's signing key.
    // Signing secrets are supplied by the packaging environment, never committed to source.
    val radioStorePath = providers.environmentVariable("RADIO_SIGNING_STORE_FILE").orNull
    val radioStorePassword = providers.environmentVariable("RADIO_SIGNING_STORE_PASSWORD").orNull
    val radioKeyAlias = providers.environmentVariable("RADIO_SIGNING_KEY_ALIAS").orNull
    val radioKeyPassword = providers.environmentVariable("RADIO_SIGNING_KEY_PASSWORD").orNull
    val radioSigningReady = listOf(radioStorePath, radioStorePassword, radioKeyAlias, radioKeyPassword)
        .all { !it.isNullOrBlank() } && radioStorePath?.let { file(it).isFile } == true

    signingConfigs {
        create("radioRelease") {
            if (radioSigningReady) {
                storeFile = file(radioStorePath!!)
                storePassword = radioStorePassword
                keyAlias = radioKeyAlias
                keyPassword = radioKeyPassword
            }
        }
    }

    buildTypes {
        release {
            if (radioSigningReady) signingConfig = signingConfigs.getByName("radioRelease")
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
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

dependencies {
    implementation("androidx.activity:activity-ktx:1.12.3")
    implementation("androidx.core:core-ktx:1.18.0")
    implementation("androidx.media3:media3-exoplayer:1.11.0")
    implementation("androidx.media3:media3-session:1.11.0")
    implementation("com.google.guava:guava:33.4.8-android")
}
