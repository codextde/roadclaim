import ExpoModulesCore

@objc(RCDriveDetectTaskConsumer)
final class DriveDetectTaskConsumer: NSObject, EXTaskConsumerInterface {
  var task: EXTaskInterface?

  func taskType() -> String {
    return "drive-detect"
  }

  func didRegisterTask(_ task: EXTaskInterface) {
    self.task = task
    DriveDetector.shared.consumer = self
    DriveDetector.shared.start()
  }

  func setOptions(_ options: [AnyHashable: Any]) {
    DriveDetector.shared.start()
  }

  func didUnregister() {
    if DriveDetector.shared.consumer === self {
      DriveDetector.shared.consumer = nil
      DriveDetector.shared.stop()
    }
    task = nil
  }
}
