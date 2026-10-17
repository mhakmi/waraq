package dev.mhakmi.scanner

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.IntentSender
import android.net.Uri
import androidx.core.content.IntentCompat
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.common.moduleinstall.InstallStatusListener
import com.google.android.gms.common.moduleinstall.ModuleInstall
import com.google.android.gms.common.moduleinstall.ModuleInstallRequest
import com.google.android.gms.common.moduleinstall.ModuleInstallStatusUpdate
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.types.Enumerable
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.util.UUID

class ScanCancelledException : CodedException("The scanner was closed without a scan")

class ScannerUnavailableException(cause: Throwable? = null) :
  CodedException("Google's document scanner is not available on this phone", cause)

class ScannerBusyException : CodedException("The scanner or the file picker is already open")

class ScanFailedException(message: String, cause: Throwable? = null) : CodedException(message, cause)

class PageMissingException(path: String) : CodedException("No page file at $path")

class OutOfSpaceException(cause: Throwable) : CodedException("The phone has no space left for the PDF", cause)

class DecodeFailedException(path: String) : CodedException("The page at $path could not be read as an image")

enum class ScanMode(val value: String) : Enumerable {
  FULL("full"),
  BASE("base"),
  FILTER("filter"),
}

class ScanOptions : Record {
  @Field
  var pageLimit: Int = 0

  @Field
  var galleryImport: Boolean = false

  @Field
  var mode: ScanMode = ScanMode.FULL

  @Field
  var directory: String = ""
}

class PdfPage : Record {
  @Field
  var uri: String = ""

  @Field
  var rotation: Int = 0
}

private const val scanRequest = 6301
private const val pickRequest = 6302

private class Waiting(val requestCode: Int, val promise: Promise, val directory: File)

fun fileOf(uri: String): File {
  return if (uri.startsWith("file:")) File(requireNotNull(Uri.parse(uri).path)) else File(uri)
}

fun sharedUris(intent: Intent): List<Uri> {
  val streams = when (intent.action) {
    Intent.ACTION_SEND -> listOfNotNull(IntentCompat.getParcelableExtra(intent, Intent.EXTRA_STREAM, Uri::class.java))
    Intent.ACTION_SEND_MULTIPLE ->
      IntentCompat.getParcelableArrayListExtra(intent, Intent.EXTRA_STREAM, Uri::class.java) ?: emptyList()
    else -> return emptyList()
  }
  val clips = intent.clipData?.let { clip -> (0 until clip.itemCount).mapNotNull { index -> clip.getItemAt(index).uri } }
  return (streams + (clips ?: emptyList())).distinct()
}

class ScannerModule : Module() {
  private var waiting: Waiting? = null
  private var sharedIntent: Intent? = null

  private val context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("Scanner")

    Events("onShare", "onPrepareProgress")

    AsyncFunction("isAvailable") {
      GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(context) == ConnectionResult.SUCCESS
    }

    AsyncFunction("prepare") { promise: Promise ->
      prepare(promise)
    }

    AsyncFunction("scan") { options: ScanOptions, promise: Promise ->
      val activity = appContext.currentActivity ?: throw ScannerUnavailableException()
      if (waiting != null) {
        throw ScannerBusyException()
      }
      waiting = Waiting(scanRequest, promise, fileOf(options.directory))
      GmsDocumentScanning.getClient(scannerOptions(options)).getStartScanIntent(activity)
        .addOnSuccessListener { sender ->
          try {
            activity.startIntentSenderForResult(sender, scanRequest, null, 0, 0, 0)
          } catch (error: IntentSender.SendIntentException) {
            failWaiting(ScannerUnavailableException(error))
          }
        }
        .addOnFailureListener { error -> failWaiting(ScannerUnavailableException(error)) }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("pickFiles") { directory: String, promise: Promise ->
      val activity = appContext.currentActivity ?: throw ScanFailedException("No screen is open to show the file picker")
      if (waiting != null) {
        throw ScannerBusyException()
      }
      waiting = Waiting(pickRequest, promise, fileOf(directory))
      val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
        addCategory(Intent.CATEGORY_OPENABLE)
        type = "*/*"
        putExtra(Intent.EXTRA_MIME_TYPES, arrayOf("application/pdf", "image/*"))
        putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
      }
      try {
        activity.startActivityForResult(intent, pickRequest)
      } catch (error: ActivityNotFoundException) {
        failWaiting(ScanFailedException("This phone has no file picker", error))
      }
    }.runOnQueue(Queues.MAIN)

    AsyncFunction("takeSharedFiles") Coroutine { directory: String ->
      val uris = withContext(Dispatchers.Main) { takeSharedUris() }
      withContext(Dispatchers.IO) { FileImporter(context).import(uris, fileOf(directory)) }
    }

    AsyncFunction("writePdf") { pages: List<PdfPage>, outputUri: String ->
      val summary = PdfWriter.write(pages.map { page -> PageSource(fileOf(page.uri), page.rotation) }, fileOf(outputUri))
      mapOf("pageCount" to summary.pageCount, "bytes" to summary.bytes)
    }

    OnNewIntent { intent ->
      if (sharedUris(intent).isNotEmpty()) {
        sharedIntent = intent
        sendEvent("onShare", mapOf<String, Any>())
      }
    }

    OnActivityResult { _, payload ->
      val current = waiting
      if (current == null || current.requestCode != payload.requestCode) {
        return@OnActivityResult
      }
      waiting = null
      if (payload.requestCode == scanRequest) {
        finishScan(current, payload.resultCode, payload.data)
      } else {
        finishPick(current, payload.resultCode, payload.data)
      }
    }
  }

  private fun scannerOptions(options: ScanOptions): GmsDocumentScannerOptions {
    val mode = when (options.mode) {
      ScanMode.FULL -> GmsDocumentScannerOptions.SCANNER_MODE_FULL
      ScanMode.BASE -> GmsDocumentScannerOptions.SCANNER_MODE_BASE
      ScanMode.FILTER -> GmsDocumentScannerOptions.SCANNER_MODE_BASE_WITH_FILTER
    }
    val builder = GmsDocumentScannerOptions.Builder()
      .setGalleryImportAllowed(options.galleryImport)
      .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
      .setScannerMode(mode)
    if (options.pageLimit > 0) {
      builder.setPageLimit(options.pageLimit)
    }
    return builder.build()
  }

  private fun failWaiting(error: CodedException) {
    waiting?.promise?.reject(error)
    waiting = null
  }

  private fun finishScan(current: Waiting, resultCode: Int, data: Intent?) {
    if (resultCode == Activity.RESULT_CANCELED) {
      current.promise.reject(ScanCancelledException())
      return
    }
    val pages = GmsDocumentScanningResult.fromActivityResultIntent(data)?.pages
    if (resultCode != Activity.RESULT_OK || pages == null) {
      current.promise.reject(ScanFailedException("The scanner returned no pages (result $resultCode)"))
      return
    }
    appContext.backgroundCoroutineScope.launch {
      val sources = pages.map { page -> File(requireNotNull(page.imageUri.path)) }
      val copies = mutableListOf<File>()
      try {
        current.directory.mkdirs()
        val saved = sources.map { source ->
          val copy = File(current.directory, "${UUID.randomUUID()}.jpg")
          copies.add(copy)
          source.copyTo(copy)
          val size = uprightSize(copy) ?: throw DecodeFailedException(copy.path)
          mapOf("uri" to Uri.fromFile(copy).toString(), "width" to size.first, "height" to size.second)
        }
        sources.forEach { source -> source.delete() }
        current.promise.resolve(saved)
      } catch (error: Exception) {
        copies.forEach { copy -> copy.delete() }
        current.promise.reject(ScanFailedException("The scanned pages could not be saved", error))
      }
    }
  }

  private fun finishPick(current: Waiting, resultCode: Int, data: Intent?) {
    if (resultCode != Activity.RESULT_OK || data == null) {
      current.promise.resolve(mapOf("files" to emptyList<Any>(), "skipped" to 0))
      return
    }
    val clips = data.clipData?.let { clip -> (0 until clip.itemCount).map { index -> clip.getItemAt(index).uri } }
    val uris = clips ?: listOfNotNull(data.data)
    appContext.backgroundCoroutineScope.launch {
      try {
        current.promise.resolve(FileImporter(context).import(uris, current.directory))
      } catch (error: Exception) {
        current.promise.reject(ScanFailedException("The picked files could not be read", error))
      }
    }
  }

  private fun takeSharedUris(): List<Uri> {
    val activity = appContext.currentActivity
    val intent = sharedIntent ?: activity?.intent ?: return emptyList()
    sharedIntent = null
    if (intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY != 0) {
      return emptyList()
    }
    val uris = sharedUris(intent)
    if (uris.isNotEmpty() && activity != null && activity.intent === intent) {
      activity.intent = Intent(Intent.ACTION_MAIN)
    }
    return uris
  }

  private fun prepare(promise: Promise) {
    val client = ModuleInstall.getClient(context)
    val scanner = GmsDocumentScanning.getClient(GmsDocumentScannerOptions.Builder().build())
    var settled = false
    lateinit var listener: InstallStatusListener

    fun settle(error: CodedException?) {
      if (settled) {
        return
      }
      settled = true
      client.unregisterListener(listener)
      if (error == null) promise.resolve(null) else promise.reject(error)
    }

    listener = InstallStatusListener { update ->
      val progress = update.progressInfo
      if (progress != null && progress.totalBytesToDownload > 0) {
        val fraction = progress.bytesDownloaded.toDouble() / progress.totalBytesToDownload
        sendEvent("onPrepareProgress", mapOf("fraction" to fraction))
      }
      when (update.installState) {
        ModuleInstallStatusUpdate.InstallState.STATE_COMPLETED -> settle(null)
        ModuleInstallStatusUpdate.InstallState.STATE_FAILED,
        ModuleInstallStatusUpdate.InstallState.STATE_CANCELED -> settle(ScannerUnavailableException())
      }
    }
    val request = ModuleInstallRequest.newBuilder().addApi(scanner).setListener(listener).build()
    client.installModules(request)
      .addOnSuccessListener { response ->
        if (response.areModulesAlreadyInstalled()) {
          settle(null)
        }
      }
      .addOnFailureListener { error -> settle(ScannerUnavailableException(error)) }
  }
}
