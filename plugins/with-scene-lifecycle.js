// The iOS 27 SDK refuses to launch apps that don't adopt the UIScene life cycle
// ("UIScene life cycle is required for apps built with this SDK").
// Expo SDK 54's AppDelegate template is window-based, so this plugin:
//   1. declares a single-window scene manifest in Info.plist
//   2. appends a SceneDelegate to AppDelegate.swift (same file → no pbxproj edits)
//
// AppDelegate still creates the window and starts React Native in didFinishLaunching,
// because expo-dev-launcher grabs `AppDelegate.window` there. The SceneDelegate only
// attaches that window to the connected scene and forwards URLs / user activities
// to the AppDelegate so Expo subscribers and RCTLinkingManager keep receiving them.
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const MARKER = '// [with-scene-lifecycle]';

const SCENE_DELEGATE = `
${MARKER}
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else { return }
    let appDelegate = UIApplication.shared.delegate as? AppDelegate

    let window = appDelegate?.window ?? UIWindow(windowScene: windowScene)
    window.windowScene = windowScene
    appDelegate?.window = window
    self.window = window
    window.makeKeyAndVisible()

    connectionOptions.urlContexts.forEach(forwardURL)
    connectionOptions.userActivities.forEach(forwardUserActivity)
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    URLContexts.forEach(forwardURL)
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    forwardUserActivity(userActivity)
  }

  private func forwardURL(_ context: UIOpenURLContext) {
    var options: [UIApplication.OpenURLOptionsKey: Any] = [:]
    options[.sourceApplication] = context.options.sourceApplication
    options[.annotation] = context.options.annotation
    options[.openInPlace] = context.options.openInPlace
    _ = UIApplication.shared.delegate?.application?(UIApplication.shared, open: context.url, options: options)
  }

  private func forwardUserActivity(_ userActivity: NSUserActivity) {
    _ = UIApplication.shared.delegate?.application?(
      UIApplication.shared,
      continue: userActivity,
      restorationHandler: { _ in }
    )
  }
}
`;

function withScenePlist(config) {
  return withInfoPlist(config, (plistConfig) => {
    plistConfig.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return plistConfig;
  });
}

function withSceneDelegate(config) {
  return withAppDelegate(config, (delegateConfig) => {
    const { language, contents } = delegateConfig.modResults;
    if (language !== 'swift') {
      throw new Error('[with-scene-lifecycle] Only Swift AppDelegate is supported');
    }
    if (contents.includes(MARKER)) return delegateConfig;

    delegateConfig.modResults.contents = `${contents.trimEnd()}\n${SCENE_DELEGATE}`;
    return delegateConfig;
  });
}

function withSceneLifecycle(config) {
  return withSceneDelegate(withScenePlist(config));
}

module.exports = withSceneLifecycle;
