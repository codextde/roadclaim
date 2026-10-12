package expo.modules.drivedetect

import android.Manifest
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import expo.modules.interfaces.permissions.Permissions
import expo.modules.interfaces.taskManager.TaskManagerInterface
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class DriveDetectModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext).applicationContext

  private val taskManager: TaskManagerInterface?
    get() = appContext.legacyModule<TaskManagerInterface>()

  private val permission: String
    get() = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      Manifest.permission.ACTIVITY_RECOGNITION
    } else {
      "com.google.android.gms.permission.ACTIVITY_RECOGNITION"
    }

  override fun definition() = ModuleDefinition {
    Name("DriveDetect")

    Events("onDriveStart", "onDriveStop", "onActivity")

    OnStartObserving {
      DriveState.listener = { name: String, body: Bundle -> sendEvent(name, body) }
    }

    OnStopObserving {
      DriveState.listener = null
    }

    Function("isAvailable") {
      GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context) == ConnectionResult.SUCCESS
    }

    AsyncFunction("getPermissionStatus") { promise: Promise ->
      Permissions.getPermissionsWithPermissionsManager(appContext.permissions, promise, permission)
    }

    AsyncFunction("requestPermission") { promise: Promise ->
      Permissions.askForPermissionsWithPermissionsManager(appContext.permissions, promise, permission)
    }

    AsyncFunction("start") { taskName: String ->
      taskManager?.registerTask(taskName, DriveDetectTaskConsumer::class.java, mutableMapOf<String, Any>())
    }

    AsyncFunction("stop") { taskName: String ->
      val manager = taskManager ?: return@AsyncFunction
      if (manager.taskHasConsumerOfClass(taskName, DriveDetectTaskConsumer::class.java)) {
        manager.unregisterTask(taskName, DriveDetectTaskConsumer::class.java)
      }
      DriveState.record(context, false, System.currentTimeMillis())
    }

    Function("getCurrentActivity") {
      DriveState.snapshot(context)
    }

    AsyncFunction("startRecordingService") { title: String, body: String, promise: Promise ->
      DriveState.saveTexts(context, title, "")
      if (DriveService.running) {
        DriveService.update(context, title, body)
        promise.resolve(true)
        return@AsyncFunction
      }
      if (!DriveService.start(context, title, body)) {
        promise.resolve(false)
        return@AsyncFunction
      }
      val handler = Handler(Looper.getMainLooper())
      var waited = 0
      handler.post(object : Runnable {
        override fun run() {
          if (DriveService.running || waited >= 2000) {
            promise.resolve(DriveService.running)
          } else {
            waited += 100
            handler.postDelayed(this, 100)
          }
        }
      })
    }

    AsyncFunction("updateRecordingService") { title: String, body: String ->
      DriveService.update(context, title, body)
    }

    AsyncFunction("stopRecordingService") {
      DriveService.stop(context)
    }
  }
}
