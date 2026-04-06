// ------------------------
// ✅ iOS (Swift) Module
// ------------------------
import Foundation
import TensorFlowLite
import UIKit

extension Data {
  func toArray<T>(type: T.Type) -> [T] {
    let count = self.count / MemoryLayout<T>.stride
    return self.withUnsafeBytes {
      Array(UnsafeBufferPointer<T>(start: $0.baseAddress!.assumingMemoryBound(to: T.self), count: count))
    }
  }
}

@objc(TSFModuleIOS)
class TSFModuleIOS: NSObject {
  private var interpreter: Interpreter?

  override init() {
    super.init()
    loadModel()
  }

  private func loadModel() {
    guard let modelPath = Bundle.main.path(forResource: "facenet", ofType: "tflite") else {
      print("Model not found.")
      return
    }
    do {
      var options = Interpreter.Options()
      options.threadCount = 1
      interpreter = try Interpreter(modelPath: modelPath, options: options)
      try interpreter?.allocateTensors()
    } catch {
      print("Failed to load TFLite model: \(error)")
    }
  }

  @objc static func requiresMainQueueSetup() -> Bool { return false }

  @objc
  func isModelLoaded(_ resolver: RCTPromiseResolveBlock, rejecter: RCTPromiseRejectBlock) {
    resolver(interpreter != nil)
  }

  @objc
  func getFaceEmbedding(_ base64String: String,
                        resolver: @escaping RCTPromiseResolveBlock,
                        rejecter: @escaping RCTPromiseRejectBlock) {
    DispatchQueue.global().async {
      guard let imageData = Data(base64Encoded: base64String),
            let image = UIImage(data: imageData),
            let resized = self.resizeImage(image: image, targetSize: CGSize(width: 160, height: 160)),
            let inputData = self.imageToData(image: resized)
      else {
        rejecter("INVALID_INPUT", "Failed to decode or preprocess image", nil)
        return
      }

      do {
        try self.interpreter?.copy(inputData, toInputAt: 0)
        try self.interpreter?.invoke()
        guard let outputTensor = try self.interpreter?.output(at: 0) else {
          rejecter("TFLITE_ERROR", "Output tensor not found", nil)
          return
        }
        let outputArray = outputTensor.data.toArray(type: Float32.self)
        let norm = sqrt(outputArray.reduce(0) { $0 + $1 * $1 })
        let normalized = outputArray.map { Double($0) / Double(norm) }
        resolver(normalized)
      } catch {
        rejecter("TFLITE_ERROR", "Inference failed: \(error)", error)
      }
    }
  }

  private func resizeImage(image: UIImage, targetSize: CGSize) -> UIImage? {
    UIGraphicsBeginImageContextWithOptions(targetSize, false, 1.0)
    image.draw(in: CGRect(origin: .zero, size: targetSize))
    let resized = UIGraphicsGetImageFromCurrentImageContext()
    UIGraphicsEndImageContext()
    return resized
  }

  private func imageToData(image: UIImage) -> Data? {
    guard let cgImage = image.cgImage else { return nil }
    let width = cgImage.width
    let height = cgImage.height
    let bytesPerRow = width * 4
    var pixelBuffer = [UInt8](repeating: 0, count: Int(height * bytesPerRow))

    guard let context = CGContext(data: &pixelBuffer,
                                  width: width,
                                  height: height,
                                  bitsPerComponent: 8,
                                  bytesPerRow: bytesPerRow,
                                  space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue | CGBitmapInfo.byteOrder32Big.rawValue)
    else { return nil }

    context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
    var inputData = Data(capacity: width * height * 3 * MemoryLayout<Float32>.size)
    for y in 0..<height {
      for x in 0..<width {
        let offset = y * bytesPerRow + x * 4
        let r = Float32(pixelBuffer[offset])
        let g = Float32(pixelBuffer[offset + 1])
        let b = Float32(pixelBuffer[offset + 2])
        let normalized = [(r - 127.5) / 128.0, (g - 127.5) / 128.0, (b - 127.5) / 128.0]
        for val in normalized {
          var f = val
          withUnsafeBytes(of: &f) { inputData.append(contentsOf: $0) }
        }
      }
    }
    return inputData
  }
}
