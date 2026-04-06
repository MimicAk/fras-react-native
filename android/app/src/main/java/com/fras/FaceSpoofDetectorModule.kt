package com.fras

import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Rect
import com.facebook.react.bridge.*
import kotlinx.coroutines.*
import org.tensorflow.lite.Interpreter
import org.tensorflow.lite.support.common.FileUtil
import org.tensorflow.lite.support.image.ImageProcessor
import org.tensorflow.lite.support.common.ops.CastOp
import org.tensorflow.lite.support.image.TensorImage
import kotlin.math.exp
import java.io.File

class FaceSpoofDetectorModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "FaceSpoofDetector"

    private val scale1 = 2.7f
    private val scale2 = 4.0f
    private val inputImageDim = 80
    private val outputDim = 3

    private val firstInterpreter = Interpreter(
        FileUtil.loadMappedFile(reactContext, "spoof_model_scale_2_7.tflite")
    )
    private val secondInterpreter = Interpreter(
        FileUtil.loadMappedFile(reactContext, "spoof_model_scale_4_0.tflite")
    )

    // Keep it simple - just cast to float32
    private val imageProcessor = ImageProcessor.Builder()
        .add(CastOp(org.tensorflow.lite.DataType.FLOAT32))
        .build()

    @ReactMethod
    fun detectSpoof(imagePath: String, x: Int, y: Int, width: Int, height: Int, promise: Promise) {
        CoroutineScope(Dispatchers.Default).launch {
            try {
                val bitmap = BitmapFactory.decodeFile(File(imagePath).absolutePath)
                val faceRect = Rect(x, y, x + width, y + height)

                // Process images with minimal preprocessing
                val cropped1 = processImageMinimal(bitmap, faceRect, scale1)
                val cropped2 = processImageMinimal(bitmap, faceRect, scale2)

                val input1 = imageProcessor.process(TensorImage.fromBitmap(cropped1)).buffer
                val input2 = imageProcessor.process(TensorImage.fromBitmap(cropped2)).buffer
                val output1 = arrayOf(FloatArray(outputDim))
                val output2 = arrayOf(FloatArray(outputDim))

                firstInterpreter.run(input1, output1)
                secondInterpreter.run(input2, output2)

                val scores1 = softMax(output1[0])
                val scores2 = softMax(output2[0])
                
                // Simple average for now
                val scores = FloatArray(outputDim)
                for (i in 0 until outputDim) {
                    scores[i] = (scores1[i] + scores2[i]) / 2f
                }
                
                // Find max score index
                var maxIndex = 0
                var maxScore = scores[0]
                for (i in 1 until scores.size) {
                    if (scores[i] > maxScore) {
                        maxScore = scores[i]
                        maxIndex = i
                    }
                }

                // Ultra-conservative spoof detection
                val spoofDetectionResult = ultraConservativeSpoofDetection(scores, scores1, scores2, maxIndex, maxScore)

                val result = Arguments.createMap().apply {
                    putBoolean("isSpoof", spoofDetectionResult.isSpoof)
                    putDouble("score", maxScore.toDouble())
                    putDouble("confidence", spoofDetectionResult.confidence.toDouble())
                    putInt("predictedLabel", maxIndex)
                    putString("reason", spoofDetectionResult.reason)
                    putString("detailedAnalysis", spoofDetectionResult.detailedAnalysis)
                    
                    // Raw scores for debugging
                    val scoresArray = Arguments.createArray()
                    scores.forEach { scoresArray.pushDouble(it.toDouble()) }
                    putArray("allScores", scoresArray)
                    
                    val scores1Array = Arguments.createArray()
                    scores1.forEach { scores1Array.pushDouble(it.toDouble()) }
                    putArray("model1Scores", scores1Array)
                    
                    val scores2Array = Arguments.createArray()
                    scores2.forEach { scores2Array.pushDouble(it.toDouble()) }
                    putArray("model2Scores", scores2Array)
                    
                    // Score breakdown for analysis
                    putDouble("realScore", scores[1].toDouble())
                    putDouble("spoofScore0", scores[0].toDouble())
                    putDouble("spoofScore2", scores[2].toDouble())
                    
                    // Model agreement analysis
                    putBoolean("modelsAgree", spoofDetectionResult.modelsAgree)
                    putDouble("agreementLevel", spoofDetectionResult.agreementLevel.toDouble())
                }

                withContext(Dispatchers.Main) {
                    promise.resolve(result)
                }

            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    promise.reject("ERROR", e.message, e)
                }
            }
        }
    }

    private data class SpoofDetectionResult(
        val isSpoof: Boolean,
        val confidence: Float,
        val reason: String,
        val detailedAnalysis: String,
        val modelsAgree: Boolean,
        val agreementLevel: Float
    )

    private fun ultraConservativeSpoofDetection(
        avgScores: FloatArray, 
        scores1: FloatArray, 
        scores2: FloatArray, 
        maxIndex: Int, 
        maxScore: Float
    ): SpoofDetectionResult {
        
        val realScore = avgScores[1]
        val spoofScore0 = avgScores[0]
        val spoofScore2 = avgScores[2]
        
        // Check model agreement
        val model1MaxIndex = scores1.indices.maxByOrNull { scores1[it] } ?: 0
        val model2MaxIndex = scores2.indices.maxByOrNull { scores2[it] } ?: 0
        val modelsAgree = model1MaxIndex == model2MaxIndex
        
        // Calculate agreement level (how similar the score distributions are)
        var agreementLevel = 0f
        for (i in avgScores.indices) {
            agreementLevel += kotlin.math.min(scores1[i], scores2[i])
        }
        
        val detailedAnalysis = buildString {
            append("Avg scores: Real=${String.format("%.3f", realScore)}, ")
            append("Spoof0=${String.format("%.3f", spoofScore0)}, ")
            append("Spoof2=${String.format("%.3f", spoofScore2)} | ")
            append("Models agree: $modelsAgree | ")
            append("Agreement level: ${String.format("%.3f", agreementLevel)}")
        }
        
        // BALANCED RULES - Protect real faces but catch obvious spoofs
        
        // Rule 1: Strong protection for real faces - if real score is decent, treat as real
        if (realScore > 0.15f) {
            return SpoofDetectionResult(
                isSpoof = false,
                confidence = maxScore,
                reason = "Real score above 15% threshold (${String.format("%.1f", realScore * 100)}%)",
                detailedAnalysis = detailedAnalysis,
                modelsAgree = modelsAgree,
                agreementLevel = agreementLevel
            )
        }
        
        // Rule 2: If models disagree on class but real score is very low, check spoof confidence
        if (!modelsAgree && realScore < 0.10f) {
            val model1SpoofScore = maxOf(scores1[0], scores1[2])
            val model2SpoofScore = maxOf(scores2[0], scores2[2])
            if (model1SpoofScore > 0.80f && model2SpoofScore > 0.80f) {
                return SpoofDetectionResult(
                    isSpoof = true,
                    confidence = maxScore,
                    reason = "Models disagree on spoof type but both confident it's spoof (M1: ${String.format("%.3f", model1SpoofScore)}, M2: ${String.format("%.3f", model2SpoofScore)})",
                    detailedAnalysis = detailedAnalysis,
                    modelsAgree = modelsAgree,
                    agreementLevel = agreementLevel
                )
            } else {
                return SpoofDetectionResult(
                    isSpoof = false,
                    confidence = maxScore,
                    reason = "Models disagree and spoof confidence insufficient",
                    detailedAnalysis = detailedAnalysis,
                    modelsAgree = modelsAgree,
                    agreementLevel = agreementLevel
                )
            }
        }
        
        // Rule 3: If models completely disagree (one says real, one says spoof), treat as real
        if (!modelsAgree && realScore > 0.05f) {
            return SpoofDetectionResult(
                isSpoof = false,
                confidence = maxScore,
                reason = "Models disagree with decent real score - treating as real",
                detailedAnalysis = detailedAnalysis,
                modelsAgree = modelsAgree,
                agreementLevel = agreementLevel
            )
        }
        
        // Rule 4: For clear spoof cases - high spoof confidence with very low real score
        val maxSpoofScore = maxOf(spoofScore0, spoofScore2)
        if (realScore < 0.05f && maxSpoofScore > 0.85f && modelsAgree) {
            return SpoofDetectionResult(
                isSpoof = true,
                confidence = maxScore,
                reason = "Clear spoof signal: low real (${String.format("%.3f", realScore)}), high spoof (${String.format("%.3f", maxSpoofScore)}), models agree",
                detailedAnalysis = detailedAnalysis,
                modelsAgree = modelsAgree,
                agreementLevel = agreementLevel
            )
        }
        
        // Rule 5: Individual model check - both must be confident in spoof
        val model1SpoofScore = maxOf(scores1[0], scores1[2])
        val model2SpoofScore = maxOf(scores2[0], scores2[2])
        if (realScore < 0.03f && model1SpoofScore > 0.90f && model2SpoofScore > 0.90f) {
            return SpoofDetectionResult(
                isSpoof = true,
                confidence = maxScore,
                reason = "Both models very confident in spoof (M1: ${String.format("%.3f", model1SpoofScore)}, M2: ${String.format("%.3f", model2SpoofScore)})",
                detailedAnalysis = detailedAnalysis,
                modelsAgree = modelsAgree,
                agreementLevel = agreementLevel
            )
        }
        
        // Default to real for all other cases
        return SpoofDetectionResult(
            isSpoof = false,
            confidence = maxScore,
            reason = "Insufficient evidence for spoof - default to real",
            detailedAnalysis = detailedAnalysis,
            modelsAgree = modelsAgree,
            agreementLevel = agreementLevel
        )
    }

    private fun softMax(x: FloatArray): FloatArray {
        val exps = x.map { exp(it) }
        val sum = exps.sum()
        return exps.map { it / sum }.toFloatArray()
    }

    private fun processImageMinimal(bitmap: android.graphics.Bitmap, faceRect: Rect, scale: Float): android.graphics.Bitmap {
        val srcWidth = bitmap.width
        val srcHeight = bitmap.height
        val scaledBox = getScaledBox(srcWidth, srcHeight, faceRect, scale)
        
        val cropped = android.graphics.Bitmap.createBitmap(
            bitmap,
            scaledBox.left,
            scaledBox.top,
            scaledBox.width(),
            scaledBox.height()
        )
        
        // Just resize - absolutely no preprocessing
        val resized = android.graphics.Bitmap.createScaledBitmap(cropped, inputImageDim, inputImageDim, true)
        
        return resized
    }

    private fun getScaledBox(srcWidth: Int, srcHeight: Int, box: Rect, bboxScale: Float): Rect {
        val x = box.left
        val y = box.top
        val w = box.width()
        val h = box.height()
        val scale = floatArrayOf((srcHeight - 1f) / h, (srcWidth - 1f) / w, bboxScale).minOrNull()!!
        val newWidth = w * scale
        val newHeight = h * scale
        val centerX = w / 2f + x
        val centerY = h / 2f + y
        var left = centerX - newWidth / 2f
        var top = centerY - newHeight / 2f
        var right = centerX + newWidth / 2f
        var bottom = centerY + newHeight / 2f

        if (left < 0) {
            right -= left
            left = 0f
        }
        if (top < 0) {
            bottom -= top
            top = 0f
        }
        if (right > srcWidth - 1) {
            left -= (right - (srcWidth - 1))
            right = (srcWidth - 1).toFloat()
        }
        if (bottom > srcHeight - 1) {
            top -= (bottom - (srcHeight - 1))
            bottom = (srcHeight - 1).toFloat()
        }

        return Rect(left.toInt(), top.toInt(), right.toInt(), bottom.toInt())
    }
}