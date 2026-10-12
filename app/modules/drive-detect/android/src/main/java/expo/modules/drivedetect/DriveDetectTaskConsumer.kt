package expo.modules.drivedetect

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionRequest
import com.google.android.gms.location.ActivityTransitionResult
import com.google.android.gms.location.DetectedActivity
import expo.modules.interfaces.taskManager.TaskConsumer
import expo.modules.interfaces.taskManager.TaskConsumerInterface
import expo.modules.interfaces.taskManager.TaskInterface
import expo.modules.interfaces.taskManager.TaskManagerUtilsInterface

// Activity transitions are delivered as broadcasts to expo-task-manager's manifest receiver,
// which restores this consumer even when the app process was dead and wakes the JS task headlessly.
// The same receiver handles BOOT_COMPLETED and MY_PACKAGE_REPLACED, so restoring the task after a
// reboot or update re-registers the transitions in didRegister.
class DriveDetectTaskConsumer(context: Context, taskManagerUtils: TaskManagerUtilsInterface?) :
  TaskConsumer(context, taskManagerUtils), TaskConsumerInterface {
  private var task: TaskInterface? = null
  private var pendingIntent: PendingIntent? = null

  override fun taskType(): String = "drive-detect"

  override fun didRegister(task: TaskInterface) {
    this.task = task
    requestTransitions()
  }

  override fun didUnregister() {
    val context = context
    pendingIntent?.let { intent ->
      if (context != null) {
        try {
          ActivityRecognition.getClient(context).removeActivityTransitionUpdates(intent)
        } catch (e: SecurityException) {
          Log.w(TAG, "Cannot remove activity transitions", e)
        }
      }
      intent.cancel()
    }
    pendingIntent = null
    task = null
  }

  override fun setOptions(options: Map<String, Any>) {
    super.setOptions(options)
    requestTransitions()
  }

  override fun didReceiveBroadcast(intent: Intent) {
    val context = context ?: return
    if (!ActivityTransitionResult.hasResult(intent)) return
    val result = ActivityTransitionResult.extractResult(intent) ?: return
    for (event in result.transitionEvents) {
      if (event.activityType != DetectedActivity.IN_VEHICLE) continue
      val enter = event.transitionType == ActivityTransition.ACTIVITY_TRANSITION_ENTER
      val ageMs = (SystemClock.elapsedRealtimeNanos() - event.elapsedRealTimeNanos) / 1_000_000
      val t = System.currentTimeMillis() - ageMs
      DriveState.record(context, enter, t)
      if (enter) {
        // Activity transition broadcasts are exempt from the background foreground-service start
        // restriction, so the location service starts here, before JS has loaded.
        DriveService.start(context, DriveState.title(context), DriveState.body(context))
      }
      val data = Bundle().apply {
        putString("type", if (enter) "start" else "stop")
        putDouble("t", t.toDouble())
        putString("activity", if (enter) "automotive" else "unknown")
        putString("confidence", "high")
      }
      task?.let { taskManagerUtils.executeTask(it, data, null) }
      DriveState.emit(if (enter) "onDriveStart" else "onDriveStop", data)
    }
  }

  private fun requestTransitions() {
    val context = context ?: return
    val task = task ?: return
    if (!DriveState.hasPermission(context)) return
    val transitions = listOf(
      ActivityTransition.Builder()
        .setActivityType(DetectedActivity.IN_VEHICLE)
        .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_ENTER)
        .build(),
      ActivityTransition.Builder()
        .setActivityType(DetectedActivity.IN_VEHICLE)
        .setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_EXIT)
        .build()
    )
    val intent = taskManagerUtils.createTaskIntent(context, task)
    pendingIntent = intent
    try {
      ActivityRecognition.getClient(context)
        .requestActivityTransitionUpdates(ActivityTransitionRequest(transitions), intent)
        .addOnFailureListener { Log.w(TAG, "Activity transitions rejected", it) }
    } catch (e: SecurityException) {
      Log.w(TAG, "Activity recognition permission missing", e)
    }
  }

  companion object {
    private const val TAG = "DriveDetect"
  }
}
