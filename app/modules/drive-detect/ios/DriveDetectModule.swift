import CoreMotion
import ExpoModulesCore

public final class DriveDetectModule: Module {
  private var permissionManager: CMMotionActivityManager?

  private var taskManager: EXTaskManagerInterface? {
    return appContext?.legacyModule(implementing: EXTaskManagerInterface.self)
  }

  public func definition() -> ModuleDefinition {
    Name("DriveDetect")

    Events("onDriveStart", "onDriveStop", "onActivity")

    OnStartObserving {
      DriveDetector.shared.onEvent = { [weak self] name, body in
        self?.sendEvent(name, body)
      }
    }

    OnStopObserving {
      DriveDetector.shared.onEvent = nil
    }

    Function("isAvailable") {
      return CMMotionActivityManager.isActivityAvailable()
    }

    AsyncFunction("getPermissionStatus") {
      return Self.permissionResponse()
    }

    AsyncFunction("requestPermission") { (promise: Promise) in
      guard CMMotionActivityManager.isActivityAvailable(), DriveDetector.motionStatus == "undetermined" else {
        promise.resolve(Self.permissionResponse())
        return
      }
      let manager = CMMotionActivityManager()
      self.permissionManager = manager
      let now = Date()
      manager.queryActivityStarting(from: now.addingTimeInterval(-60), to: now, to: .main) { [weak self] _, _ in
        self?.permissionManager = nil
        promise.resolve(Self.permissionResponse())
      }
    }
    .runOnQueue(.main)

    AsyncFunction("start") { (taskName: String) in
      if let taskManager = self.taskManager {
        taskManager.registerTask(withName: taskName, consumer: DriveDetectTaskConsumer.self, options: [:])
      }
      DriveDetector.shared.start()
    }
    .runOnQueue(.main)

    AsyncFunction("stop") { (taskName: String) in
      if let taskManager = self.taskManager, taskManager.task(withName: taskName, hasConsumerOf: DriveDetectTaskConsumer.self) {
        taskManager.unregisterTask(withName: taskName, consumerClass: DriveDetectTaskConsumer.self)
      }
      DriveDetector.shared.stop()
    }
    .runOnQueue(.main)

    Function("getCurrentActivity") {
      return DriveDetector.shared.snapshot()
    }

    AsyncFunction("startRecordingService") { (_: String, _: String) -> Bool in
      return true
    }
    AsyncFunction("updateRecordingService") { (_: String, _: String) in }
    AsyncFunction("stopRecordingService") {}
  }

  private static func permissionResponse() -> [String: Any] {
    let status = CMMotionActivityManager.isActivityAvailable() ? DriveDetector.motionStatus : "denied"
    return ["status": status, "granted": status == "granted", "canAskAgain": status == "undetermined", "expires": "never"]
  }
}
