pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "testerloop-android-example"
include(":app")

includeBuild("../../packages/sdk-android") {
    dependencySubstitution {
        substitute(module("io.testerloop:sdk")).using(project(":"))
    }
}
