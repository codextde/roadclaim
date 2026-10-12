package expo.modules.drivedetect

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.util.Log

// Foreground service of type location that keeps the process in the foreground while a drive is
// recorded, so expo-location's background task gets unthrottled updates. JS refreshes the text with
// the live distance; without any refresh for a few minutes the service stops itself.
class DriveService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private val watchdog = object : Runnable {
    override fun run() {
      if (SystemClock.elapsedRealtime() - lastBeat > WATCHDOG_MS) {
        stopSelf()
      } else {
        handler.postDelayed(this, 60_000)
      }
    }
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val title = intent?.getStringExtra("title") ?: DriveState.title(this)
    val body = intent?.getStringExtra("body") ?: DriveState.body(this)
    try {
      val notification = build(this, title, body)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
      running = true
      lastBeat = SystemClock.elapsedRealtime()
      handler.removeCallbacks(watchdog)
      handler.postDelayed(watchdog, 60_000)
    } catch (e: Exception) {
      Log.w(TAG, "Cannot start recording service", e)
      stopSelf()
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    running = false
    handler.removeCallbacks(watchdog)
    super.onDestroy()
  }

  companion object {
    private const val TAG = "DriveDetect"
    private const val CHANNEL_ID = "roadclaim-recording"
    private const val NOTIFICATION_ID = 7341
    private const val WATCHDOG_MS = 4 * 60_000L

    @Volatile
    var running = false
      private set

    @Volatile
    private var lastBeat = 0L

    private fun canRecord(context: Context): Boolean {
      val granted = { p: String -> context.checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED }
      val location = granted(Manifest.permission.ACCESS_FINE_LOCATION) || granted(Manifest.permission.ACCESS_COARSE_LOCATION)
      val background = Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || granted(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
      return location && background
    }

    fun start(context: Context, title: String, body: String): Boolean {
      if (!canRecord(context)) return false
      lastBeat = SystemClock.elapsedRealtime()
      val intent = Intent(context, DriveService::class.java).putExtra("title", title).putExtra("body", body)
      return try {
        context.startForegroundService(intent)
        true
      } catch (e: Exception) {
        Log.w(TAG, "Foreground service start not allowed", e)
        false
      }
    }

    fun update(context: Context, title: String, body: String) {
      lastBeat = SystemClock.elapsedRealtime()
      if (!running) return
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      manager.notify(NOTIFICATION_ID, build(context, title, body))
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, DriveService::class.java))
    }

    private fun build(context: Context, title: String, body: String): Notification {
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (manager.getNotificationChannel(CHANNEL_ID) == null) {
        val channel = NotificationChannel(CHANNEL_ID, title, NotificationManager.IMPORTANCE_LOW)
        channel.setShowBadge(false)
        manager.createNotificationChannel(channel)
      }
      val icon = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)
        .takeIf { it != 0 } ?: context.applicationInfo.icon
      val builder = Notification.Builder(context, CHANNEL_ID)
        .setContentTitle(title)
        .setSmallIcon(icon)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setCategory(Notification.CATEGORY_NAVIGATION)
        .setColor(0xFF10B981.toInt())
      if (body.isNotEmpty()) builder.setContentText(body)
      context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
        it.flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_NEW_TASK
        builder.setContentIntent(PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
      }
      return builder.build()
    }
  }
}
