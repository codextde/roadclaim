package expo.modules.drivedetect

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle

object DriveState {
  const val DEFAULT_TITLE = "Recording your drive"
  private const val PREFS = "roadclaim.drive-detect"

  var listener: ((String, Bundle) -> Unit)? = null

  private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun record(context: Context, driving: Boolean, t: Long) {
    prefs(context).edit().putBoolean("driving", driving).putLong("since", t).apply()
  }

  fun snapshot(context: Context): Map<String, Any?> {
    val p = prefs(context)
    val driving = p.getBoolean("driving", false)
    val since = p.getLong("since", 0L)
    return mapOf(
      "driving" to driving,
      "since" to if (since > 0) since.toDouble() else null,
      "activity" to if (driving) "automotive" else "unknown",
      "confidence" to "high"
    )
  }

  fun saveTexts(context: Context, title: String, body: String) {
    prefs(context).edit().putString("title", title).putString("body", body).apply()
  }

  fun title(context: Context) = prefs(context).getString("title", null) ?: DEFAULT_TITLE

  fun body(context: Context) = prefs(context).getString("body", null) ?: ""

  fun hasPermission(context: Context): Boolean {
    val permission = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      Manifest.permission.ACTIVITY_RECOGNITION
    } else {
      "com.google.android.gms.permission.ACTIVITY_RECOGNITION"
    }
    return context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
  }

  fun emit(name: String, body: Bundle) {
    listener?.invoke(name, body)
  }
}
