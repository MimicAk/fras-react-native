package com.fras

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import com.fras.TFLiteFaceModule
import com.fras.TFLiteFacePackage
import com.fras.FaceSpoofDetectorPackage
import com.fras.LocationPackage
import android.database.CursorWindow
import java.lang.reflect.Field

class MainApplication : Application(), ReactApplication {
  init {
      try {
          val field: Field = CursorWindow::class.java.getDeclaredField("sCursorWindowSize")
          field.isAccessible = true
          field.set(null, 100 * 1024 * 1024) // 100MB
      } catch (e: Exception) {
          e.printStackTrace()
      }
  }
  override val reactNativeHost: ReactNativeHost =
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              // Packages that cannot be autolinked yet can be added manually here, for example:
              // add(MyReactNativePackage())
              add(TFLitePackage())
              add(TFLiteFacePackage())
              add(FaceSpoofDetectorPackage())
              add(LocationPackage())
            }

        override fun getJSMainModuleName(): String = "index"

        override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

        override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
        override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
      }

  override val reactHost: ReactHost
    get() = getDefaultReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    loadReactNative(this)
  }
}
