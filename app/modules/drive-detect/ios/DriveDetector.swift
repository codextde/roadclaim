import CoreLocation
import CoreMotion
import ExpoModulesCore

final class DriveDetector: NSObject, CLLocationManagerDelegate {
  static let shared = DriveDetector()

  private let motion = CMMotionActivityManager()
  private var location: CLLocationManager?
  private var motionRunning = false
  private let defaults = UserDefaults.standard

  weak var consumer: DriveDetectTaskConsumer?
  var onEvent: ((String, [String: Any]) -> Void)?

  private(set) var driving: Bool {
    get { defaults.bool(forKey: "driveDetect.driving") }
    set { defaults.set(newValue, forKey: "driveDetect.driving") }
  }
  private var since: Double {
    get { defaults.double(forKey: "driveDetect.since") }
    set { defaults.set(newValue, forKey: "driveDetect.since") }
  }
  private let lock = NSLock()
  private var activityValue = "unknown"
  private var confidenceValue = "low"
  private var activity: String {
    get { lock.withLock { activityValue } }
    set { lock.withLock { activityValue = newValue } }
  }
  private var confidence: String {
    get { lock.withLock { confidenceValue } }
    set { lock.withLock { confidenceValue = newValue } }
  }

  static var motionStatus: String {
    switch CMMotionActivityManager.authorizationStatus() {
    case .authorized: return "granted"
    case .denied, .restricted: return "denied"
    default: return "undetermined"
    }
  }

  func start() {
    let run = {
      self.startMotion()
      self.startSignificantChanges()
    }
    if Thread.isMainThread { run() } else { DispatchQueue.main.async(execute: run) }
  }

  func stop() {
    driving = false
    since = 0
    activity = "unknown"
    DispatchQueue.main.async {
      self.motion.stopActivityUpdates()
      self.motionRunning = false
      self.location?.stopMonitoringSignificantLocationChanges()
      self.location?.delegate = nil
      self.location = nil
    }
  }

  private func startMotion() {
    guard CMMotionActivityManager.isActivityAvailable(), DriveDetector.motionStatus == "granted", !motionRunning else { return }
    motionRunning = true
    motion.startActivityUpdates(to: .main) { [weak self] activity in
      if let activity { self?.handle(activity) }
    }
  }

  private func startSignificantChanges() {
    guard CLLocationManager.significantLocationChangeMonitoringAvailable() else { return }
    let manager = location ?? CLLocationManager()
    manager.delegate = self
    location = manager
    if manager.authorizationStatus == .authorizedAlways {
      manager.startMonitoringSignificantLocationChanges()
    }
  }

  func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
    if manager.authorizationStatus == .authorizedAlways {
      manager.startMonitoringSignificantLocationChanges()
    }
  }

  func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    guard let last = locations.last else { return }
    emit("wake", ["speed": last.speed, "t": last.timestamp.timeIntervalSince1970 * 1000])
    guard CMMotionActivityManager.isActivityAvailable(), DriveDetector.motionStatus == "granted" else { return }
    let now = Date()
    motion.queryActivityStarting(from: now.addingTimeInterval(-600), to: now, to: .main) { [weak self] activities, _ in
      if let latest = activities?.last { self?.handle(latest) }
    }
  }

  func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {}

  private func handle(_ a: CMMotionActivity) {
    activity = a.automotive ? "automotive" : a.cycling ? "cycling" : a.running ? "running" : a.walking ? "walking" : a.stationary ? "stationary" : "unknown"
    confidence = a.confidence == .high ? "high" : a.confidence == .medium ? "medium" : "low"
    let sure = a.confidence != .low
    let t = a.startDate.timeIntervalSince1970 * 1000
    if a.automotive && sure && !driving {
      driving = true
      since = t
      emit("start", ["t": t])
    } else if !a.automotive && sure && driving && (a.walking || a.running || a.cycling || a.stationary) {
      driving = false
      since = t
      emit("stop", ["t": t])
    }
    onEvent?("onActivity", snapshot())
  }

  private func emit(_ type: String, _ extra: [String: Any]) {
    var body = extra
    body["type"] = type
    body["activity"] = activity
    body["confidence"] = confidence
    consumer?.task?.execute(withData: body, withError: nil)
    if type == "start" { onEvent?("onDriveStart", body) }
    if type == "stop" { onEvent?("onDriveStop", body) }
  }

  func snapshot() -> [String: Any] {
    return [
      "driving": driving,
      "since": since > 0 ? since : NSNull(),
      "activity": activity,
      "confidence": confidence,
    ]
  }
}
