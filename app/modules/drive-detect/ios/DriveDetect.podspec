Pod::Spec.new do |s|
  s.name           = 'DriveDetect'
  s.version        = '1.0.0'
  s.summary        = 'Automatic drive detection for Roadclaim'
  s.description    = 'Motion activity and significant location change based drive detection'
  s.license        = 'MIT'
  s.author         = 'Roadclaim'
  s.homepage       = 'https://roadclaim.codext.de'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'Expo'
  s.frameworks = 'CoreMotion', 'CoreLocation'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
