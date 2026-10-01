# The verification check reads Latin text only (on-device ML Kit, section 06). The plugin also
# references the Chinese, Devanagari, Japanese and Korean recognisers, which the app does not
# bundle; R8 must not fail on those optional classes.
-dontwarn com.google.mlkit.vision.text.chinese.**
-dontwarn com.google.mlkit.vision.text.devanagari.**
-dontwarn com.google.mlkit.vision.text.japanese.**
-dontwarn com.google.mlkit.vision.text.korean.**
