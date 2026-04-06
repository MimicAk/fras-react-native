// ------------------------
// ✅ UNIVERSAL Android (Kotlin) Module - FaceNet-512 Compatible with ALL Devices
// ------------------------
package com.fras

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.util.Log
import com.facebook.react.bridge.*
import org.tensorflow.lite.Interpreter
import org.tensorflow.lite.gpu.GpuDelegate
import java.io.FileInputStream
import java.nio.MappedByteBuffer
import java.nio.channels.FileChannel
import kotlin.math.sqrt

class TFLiteFaceModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private var interpreter: Interpreter? = null
    private var gpuDelegate: GpuDelegate? = null
    private var modelLoadAttempts = 0
    private var isModelWorking = false
    private var deviceCompatibilityInfo: DeviceCompatibilityInfo? = null

    companion object {
        private const val TAG = "TFLiteFaceModule"
        private const val MODEL_INPUT_SIZE = 112
        private const val EMBEDDING_SIZE = 512
        private const val MODEL_PATH = "model.tflite"
        private const val MAX_MODEL_LOAD_ATTEMPTS = 3

        // Known problematic devices and their workarounds
        private val NNAPI_BLACKLIST = setOf(
            "xiaomi", "redmi", "poco", "mi", "black shark",
            "realme", "oppo", "vivo", "oneplus", "iqoo",
            "huawei", "honor", "samsung galaxy a", "samsung galaxy m"
        )

        private val GPU_BLACKLIST = setOf(
            "emulator", "goldfish", "ranchu", "generic"
        )
    }

    init {
        initializeModel()
    }

    override fun getName(): String = "TFLiteFaceModule"

    // ────────────────────────────────────────────────
    //  MODEL INITIALIZATION (MULTI-STRATEGY)
    // ────────────────────────────────────────────────
    private fun initializeModel() {
        try {
            deviceCompatibilityInfo = analyzeDeviceCompatibility()

            val strategies = listOf(
                ::initializeWithCPUOnly,
                ::initializeWithNNAPI,
                ::initializeWithGPU,
                ::initializeWithMinimalOptions
            )

            for ((index, strategy) in strategies.withIndex()) {
                modelLoadAttempts = index + 1
                try {
                    strategy()

                    if (validateModel()) {
                        isModelWorking = true
                        return
                    } else {
                        cleanupCurrentInterpreter()
                    }
                } catch (e: Exception) {
                    cleanupCurrentInterpreter()

                    if (index == strategies.size - 1) {
                        throw e
                    }
                }
            }

            throw RuntimeException("All model initialization strategies failed")
        } catch (e: Exception) {
            // Silent fallback - module will reject promises if not working
        }
    }

    private fun initializeWithCPUOnly() {
        val options = Interpreter.Options().apply {
            setNumThreads(getOptimalThreadCount())
            setUseNNAPI(false)
            setUseXNNPACK(true)
        }

        interpreter = Interpreter(loadModelFile(reactApplicationContext.assets, MODEL_PATH), options)
    }

    private fun initializeWithNNAPI() {
        val compatibility = deviceCompatibilityInfo ?: throw RuntimeException("Device compatibility not analyzed")

        if (!compatibility.shouldUseNNAPI) {
            throw RuntimeException("NNAPI not recommended for this device")
        }

        val options = Interpreter.Options().apply {
            setNumThreads(getOptimalThreadCount())
            setUseNNAPI(true)
            setUseXNNPACK(false)
        }

        interpreter = Interpreter(loadModelFile(reactApplicationContext.assets, MODEL_PATH), options)
    }

    private fun initializeWithGPU() {
        val compatibility = deviceCompatibilityInfo ?: throw RuntimeException("Device compatibility not analyzed")

        if (!compatibility.shouldUseGPU) {
            throw RuntimeException("GPU not recommended for this device")
        }

        try {
            gpuDelegate = GpuDelegate()
            val options = Interpreter.Options().apply {
                setNumThreads(1) // GPU handles threading
                setUseNNAPI(false)
                addDelegate(gpuDelegate!!)
            }

            interpreter = Interpreter(loadModelFile(reactApplicationContext.assets, MODEL_PATH), options)
        } catch (e: Exception) {
            gpuDelegate?.close()
            gpuDelegate = null
            throw e
        }
    }

    private fun initializeWithMinimalOptions() {
        val options = Interpreter.Options().apply {
            setNumThreads(1)
            setUseNNAPI(false)
            setUseXNNPACK(false)
        }

        interpreter = Interpreter(loadModelFile(reactApplicationContext.assets, MODEL_PATH), options)
    }

    private fun analyzeDeviceCompatibility(): DeviceCompatibilityInfo {
        val manufacturer = android.os.Build.MANUFACTURER.lowercase()
        val model = android.os.Build.MODEL.lowercase()
        val device = android.os.Build.DEVICE.lowercase()
        val board = android.os.Build.BOARD.lowercase()
        val sdkInt = android.os.Build.VERSION.SDK_INT

        val deviceSignature = "$manufacturer $model $device $board"

        val shouldUseNNAPI = sdkInt >= 27 && !NNAPI_BLACKLIST.any { deviceSignature.contains(it) }

        val shouldUseGPU = !GPU_BLACKLIST.any { deviceSignature.contains(it) } && !deviceSignature.contains("emulator")

        return DeviceCompatibilityInfo(
            manufacturer = manufacturer,
            model = model,
            sdkInt = sdkInt,
            shouldUseNNAPI = shouldUseNNAPI,
            shouldUseGPU = shouldUseGPU,
            deviceSignature = deviceSignature
        )
    }

    private fun getOptimalThreadCount(): Int {
        val cores = Runtime.getRuntime().availableProcessors()
        return when {
            cores >= 8 -> 4
            cores >= 4 -> 3
            cores >= 2 -> 2
            else -> 1
        }
    }

    // ────────────────────────────────────────────────
    //  CLEANUP & VALIDATION
    // ────────────────────────────────────────────────
    private fun cleanupCurrentInterpreter() {
        try {
            interpreter?.close()
            gpuDelegate?.close()
        } catch (e: Exception) {
            // Silent cleanup failure
        } finally {
            interpreter = null
            gpuDelegate = null
        }
    }

    private fun validateModel(): Boolean {
        return try {
            val interpreter = this.interpreter ?: return false

            // Create test input (checkerboard pattern for validation)
            val testInput = Array(1) {
                Array(MODEL_INPUT_SIZE) {
                    Array(MODEL_INPUT_SIZE) {
                        FloatArray(3) { 0.0f }
                    }
                }
            }

            for (y in 0 until MODEL_INPUT_SIZE) {
                for (x in 0 until MODEL_INPUT_SIZE) {
                    val value = if ((x + y) % 2 == 0) 0.5f else -0.5f
                    testInput[0][y][x][0] = value
                    testInput[0][y][x][1] = value
                    testInput[0][y][x][2] = value
                }
            }

            val testOutput = Array(1) { FloatArray(EMBEDDING_SIZE) }
            interpreter.run(testInput, testOutput)

            val embedding = testOutput[0]

            // Validate: no zeros, no NaN/Infinite, reasonable magnitude
            val sumAbs = embedding.fold(0f) { acc, value -> acc + kotlin.math.abs(value) }
            val hasNonZero = embedding.any { it != 0f }
            val hasValidValues = embedding.none { it.isNaN() || it.isInfinite() }

            hasNonZero && hasValidValues && sumAbs > 0.01f
        } catch (e: Exception) {
            false
        }
    }

    // ────────────────────────────────────────────────
    //  MAIN EMBEDDING GENERATION (FROM IMAGE PATH)
    // ────────────────────────────────────────────────
    @ReactMethod
    fun getFaceEmbedding(imagePath: String, cameraType: String, promise: Promise) {
        getFaceEmbeddingWithCamera(imagePath, cameraType, promise)
    }

    @ReactMethod
    fun getFaceEmbeddingWithCamera(imagePath: String, cameraType: String, promise: Promise) {
        if (!isModelWorking) {
            promise.reject("MODEL_NOT_READY", "Face recognition model is not initialized")
            return
        }

        try {
            // Load bitmap directly from path (no base64 overhead)
            val bitmap = loadBitmapFromPath(imagePath)
                ?: return promise.reject("LOAD_ERROR", "Failed to load image from path")

            // Validate input
            if (!validateInputBitmap(bitmap)) {
                bitmap.recycle()
                return promise.reject("INPUT_ERROR", "Invalid input image")
            }

            // Generate embedding with retry
            val (embedding, confidence) = generateEmbeddingWithRetry(bitmap, cameraType)

            // Convert to React Native array
            val resultArray = WritableNativeArray()
            embedding.forEach { resultArray.pushDouble(it.toDouble()) }

            // Return embedding + metadata
            val result = WritableNativeMap().apply {
                putArray("embedding", resultArray)
                putDouble("confidence", confidence.toDouble())
                putString("cameraType", cameraType)
                putInt("inputDimensions", bitmap.width * bitmap.height)
            }

            promise.resolve(result)

            // Cleanup
            if (!bitmap.isRecycled) bitmap.recycle()

        } catch (e: Exception) {
            promise.reject("EMBEDDING_ERROR", "Failed to generate embedding: ${e.message}")
        }
    }

    private fun validateInputBitmap(bitmap: Bitmap): Boolean {
        if (bitmap.isRecycled) {
            return false
        }

        if (bitmap.width <= 0 || bitmap.height <= 0) {
            return false
        }

        // Optional: quick check for solid color / invalid image
        val sampleSize = 10
        val pixels = IntArray(sampleSize * sampleSize)
        bitmap.getPixels(pixels, 0, sampleSize, 0, 0, sampleSize, sampleSize)

        val firstPixel = pixels[0]
        var isSolid = true

        for (pixel in pixels) {
            if (pixel != firstPixel) {
                isSolid = false
                break
            }
        }

        return !isSolid  // return false if image is completely solid color
    }

    private fun loadBitmapFromPath(imagePath: String): Bitmap? {
        return try {
            val cleanPath = if (imagePath.startsWith("file://")) {
                imagePath.removePrefix("file://")
            } else {
                imagePath
            }

            BitmapFactory.decodeStream(FileInputStream(cleanPath))
        } catch (e: Exception) {
            null
        }
    }

    private fun generateEmbeddingWithRetry(bitmap: Bitmap, cameraType: String): Pair<FloatArray, Float> {
        val maxRetries = 3
        var lastException: Exception? = null

        for (attempt in 1..maxRetries) {
            try {
                return generateDualEmbeddings(bitmap, cameraType)
            } catch (e: Exception) {
                lastException = e

                if (attempt < maxRetries) {
                    Thread.sleep(50) // Brief pause
                }
            }
        }

        throw lastException ?: RuntimeException("All embedding attempts failed")
    }

    private fun generateDualEmbeddings(bitmap: Bitmap, cameraType: String): Pair<FloatArray, Float> {
        // Original embedding
        val embedding1 = generateSingleEmbedding(bitmap, cameraType, false)

        // Flipped for front camera (improves consistency)
        val embedding2 = if (cameraType.lowercase() in listOf("front", "user")) {
            try {
                generateSingleEmbedding(bitmap, cameraType, true)
            } catch (e: Exception) {
                embedding1 // Fallback to original
            }
        } else {
            embedding1
        }

        val norm1 = calculateNorm(embedding1)
        val norm2 = calculateNorm(embedding2)

        // Choose best (higher norm = better quality)
        return if (cameraType.lowercase() in listOf("front", "user")) {
            if (norm1 > norm2) Pair(embedding1, norm1) else Pair(embedding2, norm2)
        } else {
            Pair(embedding1, norm1)
        }
    }

    private fun generateSingleEmbedding(bitmap: Bitmap, cameraType: String, flipHorizontal: Boolean): FloatArray {
        val interpreter = this.interpreter ?: throw RuntimeException("Model not ready")

        // Flip if needed (front camera)
        val processedBitmap = if (flipHorizontal) {
            try {
                val matrix = Matrix().apply { preScale(-1f, 1f) }
                Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, false)
            } catch (e: Exception) {
                bitmap // Fallback
            }
        } else {
            bitmap
        }

        try {
            val input = preprocessBitmapRobust(processedBitmap)

            if (!validatePreprocessedInput(input)) {
                throw RuntimeException("Preprocessing failed validation")
            }

            val output = Array(1) { FloatArray(EMBEDDING_SIZE) }
            interpreter.run(input, output)

            val embedding = output[0]

            validateEmbeddingOutput(embedding)

            // L2 Normalize
            val norm = calculateNorm(embedding)
            if (norm > 0) {
                for (i in embedding.indices) {
                    embedding[i] /= norm
                }
            } else {
                throw RuntimeException("Zero norm embedding generated")
            }

            return embedding
        } finally {
            // Recycle flipped bitmap
            if (flipHorizontal && processedBitmap != bitmap && !processedBitmap.isRecycled) {
                try {
                    processedBitmap.recycle()
                } catch (e: Exception) {
                    // Silent
                }
            }
        }
    }

    private fun preprocessBitmapRobust(bitmap: Bitmap): Array<Array<Array<FloatArray>>> {
        var resized: Bitmap? = null
        var normalized: Bitmap? = null

        try {
            // High-quality resize
            resized = Bitmap.createScaledBitmap(bitmap, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, true)

            // Apply normalization if needed
            normalized = applyRobustNormalization(resized)

            // Convert to TFLite input (RGB, normalized to [-1, 1])
            val input = Array(1) {
                Array(MODEL_INPUT_SIZE) {
                    Array(MODEL_INPUT_SIZE) {
                        FloatArray(3)
                    }
                }
            }

            var pixelCount = 0
            var sumR = 0.0
            var sumG = 0.0
            var sumB = 0.0

            for (y in 0 until MODEL_INPUT_SIZE) {
                for (x in 0 until MODEL_INPUT_SIZE) {
                    val pixel = normalized.getPixel(x, y)

                    val r = (pixel shr 16 and 0xFF).toFloat()
                    val g = (pixel shr 8 and 0xFF).toFloat()
                    val b = (pixel and 0xFF).toFloat()

                    // FaceNet preprocessing: (pixel - 127.5) / 127.5
                    input[0][y][x][0] = (r - 127.5f) / 127.5f
                    input[0][y][x][1] = (g - 127.5f) / 127.5f
                    input[0][y][x][2] = (b - 127.5f) / 127.5f

                    sumR += r
                    sumG += g
                    sumB += b
                    pixelCount++
                }
            }

            return input
        } finally {
            // Cleanup
            if (normalized != null && normalized != resized && !normalized.isRecycled) {
                try { normalized.recycle() } catch (e: Exception) { }
            }
            if (resized != null && resized != bitmap && !resized.isRecycled) {
                try { resized.recycle() } catch (e: Exception) { }
            }
        }
    }

    private fun applyRobustNormalization(bitmap: Bitmap): Bitmap {
        val mutable = bitmap.copy(Bitmap.Config.ARGB_8888, true)
        val width = mutable.width
        val height = mutable.height
        val pixels = IntArray(width * height)

        mutable.getPixels(pixels, 0, width, 0, 0, width, height)

        // Calculate stats
        var sumR = 0L
        var sumG = 0L
        var sumB = 0L
        var minR = 255
        var maxR = 0
        var minG = 255
        var maxG = 0
        var minB = 255
        var maxB = 0

        for (pixel in pixels) {
            val r = (pixel shr 16 and 0xFF)
            val g = (pixel shr 8 and 0xFF)
            val b = (pixel and 0xFF)

            sumR += r
            sumG += g
            sumB += b

            minR = minOf(minR, r)
            maxR = maxOf(maxR, r)
            minG = minOf(minG, g)
            maxG = maxOf(maxG, g)
            minB = minOf(minB, b)
            maxB = maxOf(maxB, b)
        }

        val meanR = sumR.toFloat() / pixels.size
        val meanG = sumG.toFloat() / pixels.size
        val meanB = sumB.toFloat() / pixels.size

        // Apply gentle normalization if low contrast or poor brightness
        val rangeR = maxR - minR
        val rangeG = maxG - minG
        val rangeB = maxB - minB

        val needsNormalization = rangeR < 50 || rangeG < 50 || rangeB < 50 ||
                kotlin.math.abs(meanR - 127.5f) > 50 || kotlin.math.abs(meanG - 127.5f) > 50 || kotlin.math.abs(meanB - 127.5f) > 50

        if (needsNormalization) {
            val targetMean = 127.5f
            val adjustmentFactor = 0.2f // Gentle

            for (i in pixels.indices) {
                val pixel = pixels[i]
                val alpha = (pixel shr 24 and 0xFF)

                val r = (pixel shr 16 and 0xFF)
                val g = (pixel shr 8 and 0xFF)
                val b = (pixel and 0xFF)

                val newR = (r + (targetMean - meanR) * adjustmentFactor).toInt().coerceIn(0, 255)
                val newG = (g + (targetMean - meanG) * adjustmentFactor).toInt().coerceIn(0, 255)
                val newB = (b + (targetMean - meanB) * adjustmentFactor).toInt().coerceIn(0, 255)

                pixels[i] = (alpha shl 24) or (newR shl 16) or (newG shl 8) or newB
            }

            mutable.setPixels(pixels, 0, mutable.width, 0, 0, mutable.width, mutable.height)
        }

        return mutable
    }

    private fun validatePreprocessedInput(input: Array<Array<Array<FloatArray>>>): Boolean {
        var hasNonZero = false
        var hasValidRange = true
        var sumAbs = 0.0

        for (y in 0 until MODEL_INPUT_SIZE) {
            for (x in 0 until MODEL_INPUT_SIZE) {
                for (c in 0 until 3) {
                    val value = input[0][y][x][c]

                    if (value != 0f) hasNonZero = true
                    if (value < -2f || value > 2f) hasValidRange = false
                    if (value.isNaN() || value.isInfinite()) hasValidRange = false

                    sumAbs += kotlin.math.abs(value)
                }
            }
        }

        return hasNonZero && hasValidRange && sumAbs > 0.01
    }

    private fun validateEmbeddingOutput(embedding: FloatArray) {
        when {
            embedding.all { it == 0f } -> throw RuntimeException("Zero embedding generated")
            embedding.any { it.isNaN() || it.isInfinite() } -> throw RuntimeException("Invalid embedding values")
            embedding.fold(0f) { acc, value -> acc + kotlin.math.abs(value) } == 0f -> throw RuntimeException("Zero-sum embedding")
        }
    }

    private fun calculateNorm(embedding: FloatArray): Float {
        return sqrt(embedding.fold(0f) { acc, value -> acc + value * value })
    }

    private fun calculateSimilarity(embedding1: FloatArray, embedding2: FloatArray): Float {
        var dotProduct = 0f
        var norm1 = 0f
        var norm2 = 0f

        for (i in embedding1.indices) {
            dotProduct += embedding1[i] * embedding2[i]
            norm1 += embedding1[i] * embedding1[i]
            norm2 += embedding2[i] * embedding2[i]
        }

        val denominator = sqrt(norm1) * sqrt(norm2)
        return if (denominator > 0) dotProduct / denominator else 0f
    }

    // ────────────────────────────────────────────────
    //  DIAGNOSTICS & INFO
    // ────────────────────────────────────────────────
    @ReactMethod
    fun getModelInfo(promise: Promise) {
        try {
            val info = WritableNativeMap().apply {
                putString("modelPath", MODEL_PATH)
                putInt("inputSize", MODEL_INPUT_SIZE)
                putInt("embeddingSize", EMBEDDING_SIZE)
                putBoolean("isModelWorking", isModelWorking)
                putInt("modelLoadAttempts", modelLoadAttempts)

                deviceCompatibilityInfo?.let { comp ->
                    val deviceInfo = WritableNativeMap().apply {
                        putString("manufacturer", comp.manufacturer)
                        putString("model", comp.model)
                        putInt("sdkInt", comp.sdkInt)
                        putBoolean("shouldUseNNAPI", comp.shouldUseNNAPI)
                        putBoolean("shouldUseGPU", comp.shouldUseGPU)
                    }
                    putMap("deviceInfo", deviceInfo)
                }
            }

            interpreter?.let { interp ->
                val inputShape = interp.getInputTensor(0)?.shape()?.contentToString() ?: "Unknown"
                val outputShape = interp.getOutputTensor(0)?.shape()?.contentToString() ?: "Unknown"

                info.putString("inputShape", inputShape)
                info.putString("outputShape", outputShape)
            }

            promise.resolve(info)
        } catch (e: Exception) {
            promise.reject("INFO_ERROR", "Failed to get model info: ${e.message}")
        }
    }

    @ReactMethod
    fun runDiagnostics(promise: Promise) {
        try {
            val result = WritableNativeMap().apply {
                putString("manufacturer", android.os.Build.MANUFACTURER)
                putString("model", android.os.Build.MODEL)
                putInt("sdkVersion", android.os.Build.VERSION.SDK_INT)
                putInt("availableProcessors", Runtime.getRuntime().availableProcessors())

                val runtime = Runtime.getRuntime()
                putDouble("maxMemoryMB", runtime.maxMemory() / (1024.0 * 1024.0))
                putDouble("freeMemoryMB", runtime.freeMemory() / (1024.0 * 1024.0))

                putBoolean("modelLoaded", interpreter != null)
                putBoolean("modelWorking", isModelWorking)
                putInt("loadAttempts", modelLoadAttempts)
                putBoolean("gpuDelegateActive", gpuDelegate != null)

                deviceCompatibilityInfo?.let { comp ->
                    putBoolean("nnapiRecommended", comp.shouldUseNNAPI)
                    putBoolean("gpuRecommended", comp.shouldUseGPU)
                }

                // Quick inference test
                if (isModelWorking) {
                    val testPassed = validateModel()
                    putBoolean("testInferencePassed", testPassed)
                }
            }

            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("DIAGNOSTICS_ERROR", e.message)
        }
    }

    // ────────────────────────────────────────────────
    //  MODEL LOADING UTILITY
    // ────────────────────────────────────────────────
    private fun loadModelFile(assetManager: android.content.res.AssetManager, modelPath: String): MappedByteBuffer {
        val fileDescriptor = assetManager.openFd(modelPath)
        val inputStream = FileInputStream(fileDescriptor.fileDescriptor)
        val fileChannel = inputStream.channel
        val startOffset = fileDescriptor.startOffset
        val declaredLength = fileDescriptor.declaredLength

        return fileChannel.map(FileChannel.MapMode.READ_ONLY, startOffset, declaredLength)
    }

    // ────────────────────────────────────────────────
    //  LIFECYCLE CLEANUP
    // ────────────────────────────────────────────────
    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        cleanupCurrentInterpreter()
    }

    // ────────────────────────────────────────────────
    //  DATA CLASS FOR DEVICE INFO
    // ────────────────────────────────────────────────
    data class DeviceCompatibilityInfo(
        val manufacturer: String,
        val model: String,
        val sdkInt: Int,
        val shouldUseNNAPI: Boolean,
        val shouldUseGPU: Boolean,
        val deviceSignature: String
    )
}