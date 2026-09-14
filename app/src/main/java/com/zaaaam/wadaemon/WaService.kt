package com.zaaaam.wadaemon

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder

// Foreground service penjaga koneksi (M3 / PRD reliability).
// NodeRunner.start() dipanggil dari sini (bukan Activity) agar runtime Node
// tetap hidup saat app di-minimize. START_STICKY: sistem mencoba
// menghidupkan ulang service bila dibunuh (sesi WA lalu auto-reconnect
// lewat auth state di filesDir/wa-session, UC2).
class WaService : Service() {

    companion object {
        const val CH_ID = "wadaemon-status"
        const val NOTIF_ID = 1

        // Native lib dimuat di sini juga (bukan cuma MainActivity) karena
        // sistem bisa menghidupkan ulang service tanpa lewat Activity
        // (START_STICKY) — NodeRunner butuh simbol native siap di proses ini.
        init {
            System.loadLibrary("native-lib")
            System.loadLibrary("node")
        }

        fun start(ctx: Context) {
            val i = Intent(ctx, WaService::class.java)
            if (Build.VERSION.SDK_INT >= 26) {
                ctx.startForegroundService(i)
            } else {
                ctx.startService(i)
            }
        }
    }

    private var worker: HandlerThread? = null
    private var handler: Handler? = null
    private var lastNotifText: String? = null

    private val poll = object : Runnable {
        override fun run() {
            try {
                val s = WaApi.getStatus()
                updateNotif(statusText(s.status, s.phoneNumber))
            } catch (e: Exception) {
                updateNotif("Menyiapkan daemon...")
            }
            handler?.postDelayed(this, 15_000)
        }
    }

    override fun onCreate() {
        super.onCreate()
        WaApi.init(filesDir)
        createChannel()
        startFg("Menyiapkan daemon...")
        // Node hanya boleh start sekali per proses (lihat NodeRunner).
        NodeRunner.start(this)
        val t = HandlerThread("wa-status").apply { start() }
        worker = t
        handler = Handler(t.looper)
        handler?.post(poll)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        return START_STICKY
    }

    override fun onDestroy() {
        handler?.removeCallbacks(poll)
        worker?.quitSafely()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun statusText(status: String, phone: String?): String = when (status) {
        "connected" -> if (phone.isNullOrEmpty()) "Terhubung" else "Terhubung: $phone"
        "pairing" -> "Menunggu pairing di WhatsApp"
        "logged_out" -> "Sesi keluar, perlu pairing ulang"
        else -> "Terputus, mencoba sambung ulang..."
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT < 26) return
        val mgr = getSystemService(NotificationManager::class.java)
        if (mgr.getNotificationChannel(CH_ID) == null) {
            mgr.createNotificationChannel(
                NotificationChannel(CH_ID, "Status WADaemon", NotificationManager.IMPORTANCE_LOW)
            )
        }
    }

    private fun buildNotif(text: String): Notification {
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val b = if (Build.VERSION.SDK_INT >= 26) {
            Notification.Builder(this, CH_ID)
        } else {
            @Suppress("DEPRECATION")
            Notification.Builder(this)
        }
        b.setContentTitle("WADaemon")
            .setContentText(text.take(200))
            .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
            .setContentIntent(open)
            .setOngoing(true)
        return b.build()
    }

    private fun startFg(text: String) {
        val n = buildNotif(text)
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(
                NOTIF_ID, n,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
            )
        } else {
            startForeground(NOTIF_ID, n)
        }
    }

    private fun updateNotif(text: String) {
        // Skip bila teks sama: hemat wakeup + binder IPC tiap 15 dtk.
        if (text == lastNotifText) return
        lastNotifText = text
        val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        mgr.notify(NOTIF_ID, buildNotif(text))
    }
}
