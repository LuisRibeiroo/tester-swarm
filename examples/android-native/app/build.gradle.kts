plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "dev.testerswarm.example"
    compileSdk = 35

    defaultConfig {
        applicationId = "dev.testerswarm.example"
        minSdk = 23
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
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
    implementation("dev.testerswarm:sdk:1.0.0")
    testImplementation("junit:junit:4.13.2")
}
