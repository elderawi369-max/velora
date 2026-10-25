import Foundation
import Vision
import ImageIO

// Verify real simulator output before presenting it as an upload candidate.
let arguments = CommandLine.arguments
if arguments.count != 3 { fatalError("Expected screenshot path and visible text") }
let url = URL(fileURLWithPath: arguments[1])
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.recognitionLanguages = ["en-US"]
let handler = VNImageRequestHandler(url: url, options: [:])
do {
    try handler.perform([request])
    let text = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: " ")
    let normalize: (String) -> String = { value in
        value.lowercased().filter { $0.isLetter || $0.isNumber }
    }
    guard normalize(text).contains(normalize(arguments[2])) else {
        print("Screenshot did not show expected app content: \(arguments[2]). OCR: \(text.prefix(700))")
        exit(1)
    }
    let blocked = ["Tracking Permission", "Would Like to Send You Notifications", "Allow Tracking", "Simulator could not"]
    guard !blocked.contains(where: { text.localizedCaseInsensitiveContains($0) }) else {
        print("Screenshot contains a system prompt; review capture before using it.")
        exit(1)
    }
    print("Verified visible app content: \(arguments[2])")
} catch {
    print("Screenshot verification failed: \(error)")
    exit(1)
}
