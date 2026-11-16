// Xcode 27 rejects pod targets whose IPHONEOS_DEPLOYMENT_TARGET is below 15.0.
// Some third-party pods (RNSVG, SDWebImage, RNCAsyncStorage, ...) still declare 9.0–13.4,
// so raise every pod target to at least MIN_IOS_VERSION in the Podfile's post_install hook.
const { withPodfile } = require('expo/config-plugins');

const MIN_IOS_VERSION = '15.1';
const MARKER = '# [with-min-pod-deployment-target]';

const SNIPPET = `
    ${MARKER}
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_config|
        current = build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if current.nil? || Gem::Version.new(current) < Gem::Version.new('${MIN_IOS_VERSION}')
          build_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${MIN_IOS_VERSION}'
        end
      end
    end
`;

function withMinPodDeploymentTarget(config) {
  return withPodfile(config, (podConfig) => {
    const contents = podConfig.modResults.contents;
    if (contents.includes(MARKER)) return podConfig;

    const hook = /post_install do \|installer\|\n/;
    if (!hook.test(contents)) {
      throw new Error('[with-min-pod-deployment-target] post_install hook not found in Podfile');
    }

    podConfig.modResults.contents = contents.replace(hook, (match) => match + SNIPPET);
    return podConfig;
  });
}

module.exports = withMinPodDeploymentTarget;
