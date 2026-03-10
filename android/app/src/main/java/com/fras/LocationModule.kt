// LocationModule.kt
package com.fras

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import androidx.core.app.ActivityCompat
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule

class LocationModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val locationManager: LocationManager by lazy {
        reactApplicationContext.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    }

    override fun getName(): String {
        return "LocationModule"
    }

    @ReactMethod
    fun getCurrentLocation(promise: Promise) {
        try {
            if (!hasLocationPermission()) {
                promise.reject("PERMISSION_DENIED", "Location permission not granted")
                return
            }

            val provider = if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                LocationManager.GPS_PROVIDER
            } else if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                LocationManager.NETWORK_PROVIDER
            } else {
                promise.reject("NO_PROVIDER", "No location provider available")
                return
            }

            val location = locationManager.getLastKnownLocation(provider)
            
            if (location != null) {
                val locationData = createLocationObject(location)
                promise.resolve(locationData)
            } else {
                // Request a single location update
                requestSingleLocationUpdate(promise, provider)
            }
        } catch (e: Exception) {
            promise.reject("LOCATION_ERROR", e.message)
        }
    }

    @ReactMethod
    fun startLocationUpdates(intervalMs: Double) {
        try {
            if (!hasLocationPermission()) {
                sendLocationError("PERMISSION_DENIED", "Location permission not granted")
                return
            }

            val provider = if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                LocationManager.GPS_PROVIDER
            } else if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                LocationManager.NETWORK_PROVIDER
            } else {
                sendLocationError("NO_PROVIDER", "No location provider available")
                return
            }

            locationManager.requestLocationUpdates(
                provider,
                intervalMs.toLong(),
                0f,
                locationListener
            )
        } catch (e: Exception) {
            sendLocationError("LOCATION_ERROR", e.message ?: "Unknown error")
        }
    }

    @ReactMethod
    fun stopLocationUpdates() {
        try {
            locationManager.removeUpdates(locationListener)
        } catch (e: Exception) {
            // Handle error silently
        }
    }

    @ReactMethod
    fun isLocationEnabled(promise: Promise) {
        val isGpsEnabled = locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)
        val isNetworkEnabled = locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)
        promise.resolve(isGpsEnabled || isNetworkEnabled)
    }

    private fun hasLocationPermission(): Boolean {
        return ActivityCompat.checkSelfPermission(
            reactApplicationContext,
            Manifest.permission.ACCESS_FINE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED || 
        ActivityCompat.checkSelfPermission(
            reactApplicationContext,
            Manifest.permission.ACCESS_COARSE_LOCATION
        ) == PackageManager.PERMISSION_GRANTED
    }

    private fun requestSingleLocationUpdate(promise: Promise, provider: String) {
        val singleUpdateListener = object : LocationListener {
            override fun onLocationChanged(location: Location) {
                locationManager.removeUpdates(this)
                val locationData = createLocationObject(location)
                promise.resolve(locationData)
            }

            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
            override fun onProviderEnabled(provider: String) {}
            override fun onProviderDisabled(provider: String) {
                locationManager.removeUpdates(this)
                promise.reject("PROVIDER_DISABLED", "Location provider was disabled")
            }
        }

        try {
            locationManager.requestLocationUpdates(
                provider,
                0L,
                0f,
                singleUpdateListener
            )
        } catch (e: SecurityException) {
            promise.reject("PERMISSION_DENIED", "Location permission denied")
        }
    }

    private val locationListener = object : LocationListener {
        override fun onLocationChanged(location: Location) {
            val locationData = createLocationObject(location)
            sendLocationUpdate(locationData)
        }

        override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
        override fun onProviderEnabled(provider: String) {}
        override fun onProviderDisabled(provider: String) {
            sendLocationError("PROVIDER_DISABLED", "Location provider was disabled")
        }
    }

    private fun createLocationObject(location: Location): WritableMap {
        val coords = Arguments.createMap().apply {
            putDouble("latitude", location.latitude)
            putDouble("longitude", location.longitude)
            putDouble("altitude", location.altitude)
            putDouble("accuracy", location.accuracy.toDouble())
            if (location.hasSpeed()) {
                putDouble("speed", location.speed.toDouble())
            }
            if (location.hasBearing()) {
                putDouble("heading", location.bearing.toDouble())
            }
        }

        return Arguments.createMap().apply {
            putMap("coords", coords)
            putDouble("timestamp", location.time.toDouble())
        }
    }

    private fun sendLocationUpdate(location: WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("locationUpdate", location)
    }

    private fun sendLocationError(code: String, message: String) {
        val error = Arguments.createMap().apply {
            putString("code", code)
            putString("message", message)
        }
        
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("locationError", error)
    }
}
