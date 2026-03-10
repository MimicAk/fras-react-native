package com.fras

import android.content.res.AssetFileDescriptor
import android.content.res.AssetManager
import com.facebook.react.bridge.*
import org.tensorflow.lite.Interpreter
import java.io.FileInputStream
import java.io.IOException
import java.nio.MappedByteBuffer
import java.nio.channels.FileChannel

class TFLiteModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
    private var interpreter: Interpreter? = null

    init {
        try {
            interpreter = Interpreter(loadModelFile(reactContext.assets, "model.tflite"))
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    override fun getName(): String {
        return "TFLiteModule"
    }

    @ReactMethod
    fun runModel(inputArray: ReadableArray, promise: Promise) {
        val input = Array(1) { FloatArray(inputArray.size()) }
        for (i in 0 until inputArray.size()) {
            input[0][i] = inputArray.getDouble(i).toFloat()
        }

        val output = Array(1) { FloatArray(1) }

        try {
            interpreter?.run(input, output)
            promise.resolve(output[0][0].toDouble())
        } catch (e: Exception) {
            promise.reject("INFERENCE_ERROR", e.message)
        }
    }

    @Throws(IOException::class)
    private fun loadModelFile(assetManager: AssetManager, path: String): MappedByteBuffer {
        val fileDescriptor: AssetFileDescriptor = assetManager.openFd(path)
        val inputStream = FileInputStream(fileDescriptor.fileDescriptor)
        val fileChannel: FileChannel = inputStream.channel
        val startOffset: Long = fileDescriptor.startOffset
        val declaredLength: Long = fileDescriptor.declaredLength
        return fileChannel.map(FileChannel.MapMode.READ_ONLY, startOffset, declaredLength)
    }
}
