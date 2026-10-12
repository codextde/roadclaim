import Expo
import ExpoModulesCore
import React

// With the UIScene life cycle React Native only starts when a window scene connects, which never
// happens when iOS relaunches the app in the background for a location event. Start the React host
// without a surface so the JS task manager runs; the scene reuses the same host when the user opens the app.
public class DriveDetectAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    guard launchOptions?[.location] != nil else { return false }
    DispatchQueue.main.async {
      MainActor.assumeIsolated {
        Self.startHeadless()
      }
    }
    return false
  }

  @MainActor
  private static func startHeadless() {
    guard UIApplication.shared.applicationState == .background,
      let provider = UIApplication.shared.delegate as? ExpoReactNativeFactoryProvider,
      provider.window == nil,
      let factory = provider.reactNativeFactory else { return }
    factory.rootViewFactory.initializeReactHost(
      launchOptions: nil,
      bundleConfiguration: factory.bundleConfiguration,
      devMenuConfiguration: factory.devMenuConfiguration ?? RCTDevMenuConfiguration.default()
    )
  }
}
