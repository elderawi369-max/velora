import Capacitor
import Foundation
import UIKit

@objc(VeloraAchievementSharePlugin)
public final class VeloraAchievementSharePlugin: CAPPlugin, CAPBridgedPlugin, UIDocumentPickerDelegate {
    public let identifier = "VeloraAchievementSharePlugin"
    public let jsName = "VeloraAchievementShare"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "shareResults", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "exportCard", returnType: CAPPluginReturnPromise)
    ]
    private var busy = false
    private var pendingSave: CAPPluginCall?

    @objc public func shareResults(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { call.reject("Sharing is unavailable."); return }
            guard !self.busy, let host = self.bridge?.viewController, host.presentedViewController == nil else {
                call.reject("Please close the current window before sharing."); return
            }
            guard let text = call.getString("text"), text.count <= 1200,
                  text.contains("https://play.google.com/store/apps/details?id=com.velorachat.app"),
                  text.contains("https://apps.apple.com/app/id6826858824") else {
                call.reject("The result could not be prepared for sharing."); return
            }
            self.busy = true
            let activity = UIActivityViewController(activityItems: [text], applicationActivities: nil)
            activity.completionWithItemsHandler = { [weak self] _, completed, _, error in
                DispatchQueue.main.async {
                    self?.busy = false
                    if error != nil { call.reject("Sharing could not finish. Please try again.") }
                    else { call.resolve(["status": completed ? "presented" : "cancelled"]) }
                }
            }
            if let popover = activity.popoverPresentationController {
                popover.sourceView = host.view
                popover.sourceRect = CGRect(x: host.view.bounds.midX, y: host.view.bounds.midY, width: 1, height: 1)
                popover.permittedArrowDirections = []
            }
            host.present(activity, animated: true)
        }
    }

    @objc public func exportCard(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { call.reject("Sharing is unavailable."); return }
            guard !self.busy, let host = self.bridge?.viewController, host.presentedViewController == nil else {
                call.reject("Please close the current window before sharing."); return
            }
            guard let encoded = call.getString("pngBase64"), encoded.count <= 6_000_000,
                  let data = Data(base64Encoded: encoded), data.count <= 4_000_000,
                  data.starts(with: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
                  let image = UIImage(data: data), image.size.width > 0, image.size.width <= 4096,
                  image.size.height > 0, image.size.height <= 4096,
                  let name = call.getString("fileName"),
                  name.range(of: "^velora-(lighthouse|drowned-bell|blackwood)-master-detective\\.png$", options: .regularExpression) != nil,
                  let text = call.getString("text"), text.count <= 1200,
                  let action = call.getString("action"), ["share", "save"].contains(action) else {
                call.reject("The achievement card is invalid."); return
            }
            do {
                let root = FileManager.default.temporaryDirectory.appendingPathComponent("velora-achievements", isDirectory: true)
                try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
                // Keep handed-off files available; only prune our own old temporary folders.
                if let previous = try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: [.creationDateKey]) {
                    for folder in previous where UUID(uuidString: folder.lastPathComponent) != nil {
                        if let created = try? folder.resourceValues(forKeys: [.creationDateKey]).creationDate,
                           created < Date().addingTimeInterval(-86400) { try? FileManager.default.removeItem(at: folder) }
                    }
                }
                let folder = root.appendingPathComponent(UUID().uuidString, isDirectory: true)
                try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
                let file = folder.appendingPathComponent(name)
                try data.write(to: file, options: .atomic)
                self.busy = true
                if action == "save" {
                    let picker = UIDocumentPickerViewController(forExporting: [file], asCopy: true)
                    picker.delegate = self
                    self.pendingSave = call
                    host.present(picker, animated: true)
                } else {
                    // Keep the working photo-only handoff. The QR codes are in the PNG.
                    let activity = UIActivityViewController(activityItems: [file], applicationActivities: nil)
                    activity.completionWithItemsHandler = { [weak self] _, completed, _, error in
                        DispatchQueue.main.async {
                            self?.busy = false
                            if error != nil { call.reject("Sharing could not finish. Please try again.") }
                            else {
                                call.resolve(["status": completed ? "presented" : "cancelled"])
                            }
                        }
                    }
                    // An anchored popover is required on iPad.
                    if let popover = activity.popoverPresentationController {
                        popover.sourceView = host.view
                        popover.sourceRect = CGRect(x: host.view.bounds.midX, y: host.view.bounds.midY, width: 1, height: 1)
                        popover.permittedArrowDirections = []
                    }
                    host.present(activity, animated: true)
                }
            } catch { self.busy = false; call.reject("The achievement card could not be prepared for sharing.") }
        }
    }

    public func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
        pendingSave?.resolve(["status": "cancelled"])
        pendingSave = nil; busy = false
    }

    public func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        pendingSave?.resolve(["status": urls.isEmpty ? "cancelled" : "saved"])
        pendingSave = nil; busy = false
    }
}
