[app]

# App metadata
title = ShimaTube NEO
package.name = shimatube
package.domain = org.shimatube
version = 18.0

# Source
source.dir = .
source.include_exts = py,png,jpg,kv,atlas,html,js,css,json

# Requirements
# hostpython3 and python3 are implicit
requirements = python3,kivy,pyjnius,android,yt-dlp,certifi,brotli,websockets,requests,urllib3

# Android settings
android.permissions = INTERNET,ACCESS_NETWORK_STATE
android.api = 33
android.minapi = 24
android.ndk = 25b
android.accept_sdk_license = True
android.archs = arm64-v8a, armeabi-v7a

# App icon
icon.filename = icon.png

# Orientation
orientation = portrait

# Fullscreen (hide system bars)
fullscreen = 0

# Android-specific
android.allow_backup = True

# Include these files in the APK
source.include_patterns = handlers/*,utils/*,js/*,css/*,index.html,icon.png,manifest.json,sw.js

# Log level
log_level = 2

# p4a
p4a.branch = develop

[buildozer]
log_level = 2
warn_on_root = 0

# Allow cleartext (HTTP) for localhost server
p4a.extra_args = --allow-cleartext-traffic
