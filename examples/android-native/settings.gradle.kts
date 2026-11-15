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

rootProject.name = "testerswarm-android-example"
include(":app")

includeBuild("../../packages/sdk-android") {
    dependencySubstitution {
        substitute(module("dev.testerswarm:sdk")).using(project(":"))
    }
}
