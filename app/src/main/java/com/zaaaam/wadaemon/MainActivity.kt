package com.zaaaam.wadaemon

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.provider.Settings
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import org.json.JSONObject
import java.io.File

// UI asli mengikuti mockup yang di-ACC (4 tab, tanpa emoji).
// Kotlin <-> Node lewat HTTP loopback; Node dinyalakan sekali per proses.
class MainActivity : Activity() {

    companion object {
        init {
            System.loadLibrary("native-lib")
            System.loadLibrary("node")
        }
    }

    private val ui = Handler(Looper.getMainLooper())
    private val poll = object : Runnable {
        override fun run() {
            refreshStatus()
            ui.postDelayed(this, 3000)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        NodeRunner.start(this)

        findViewById<Button>(R.id.navDashboard).setOnClickListener { showTab(0) }
        findViewById<Button>(R.id.navModul).setOnClickListener { showTab(1); loadModules() }
        findViewById<Button>(R.id.navLog).setOnClickListener { showTab(2); loadLog() }
        findViewById<Button>(R.id.navPengaturan).setOnClickListener { showTab(3) }

        findViewById<Button>(R.id.btnRetryBridge).setOnClickListener { refreshStatus() }
        findViewById<Button>(R.id.btnPair).setOnClickListener { doPair() }
        findViewById<Button>(R.id.btnCopyCode).setOnClickListener { copyCode() }
        findViewById<Button>(R.id.btnCancelPair).setOnClickListener { refreshStatus() }
        findViewById<Button>(R.id.btnLogout).setOnClickListener { confirmLogout() }
        findViewById<Button>(R.id.btnRetryError).setOnClickListener { refreshStatus() }
        findViewById<Button>(R.id.btnAddModule).setOnClickListener { addModule() }
        findViewById<Button>(R.id.btnRefreshLog).setOnClickListener { loadLog() }
        findViewById<Button>(R.id.btnNotifPerm).setOnClickListener { requestNotifPerm() }
        findViewById<Button>(R.id.btnBatteryPerm).setOnClickListener { requestBatteryExemption() }

        showTab(0)
        ui.post(poll)
    }

    override fun onDestroy() {
        ui.removeCallbacks(poll)
        super.onDestroy()
    }

    private fun showTab(i: Int) {
        findViewById<View>(R.id.tabDashboard).visibility = if (i == 0) View.VISIBLE else View.GONE
        findViewById<View>(R.id.tabModul).visibility = if (i == 1) View.VISIBLE else View.GONE
        findViewById<View>(R.id.tabLog).visibility = if (i == 2) View.VISIBLE else View.GONE
        findViewById<View>(R.id.tabPengaturan).visibility = if (i == 3) View.VISIBLE else View.GONE
    }

    private fun bg(work: () -> Unit) {
        Thread {
            try { work() } catch (e: Exception) {
                runOnUiThread { toast("Bridge belum siap: ${(e.message ?: "").take(120)}") }
            }
        }.start()
    }

    private fun toast(m: String) {
        Toast.makeText(this, m.take(300), Toast.LENGTH_SHORT).show()
    }

    private fun refreshStatus() = bg {
        val s = WaApi.getStatus()
        runOnUiThread { renderStatus(s) }
    }

    private fun renderStatus(s: WaApi.Status) {
        findViewById<TextView>(R.id.chipText).text = when (s.status) {
            "connected" -> "Terhubung"
            "pairing" -> "Menunggu Pairing"
            "logged_out" -> "Keluar"
            else -> "Terputus"
        }
        findViewById<TextView>(R.id.notifTitle).text = "WADaemon"
        findViewById<TextView>(R.id.notifBody).text = when (s.status) {
            "connected" -> "${s.phoneNumber ?: ""} Aktif"
            "pairing" -> "Kode: ${s.code ?: "-"}"
            else -> "Tap untuk buka WADaemon"
        }
        setVisible(R.id.cardLoading, s.status == "unpaired" || s.status == "disconnected")
        setVisible(R.id.cardPair, s.status == "unpaired" || s.status == "disconnected")
        setVisible(R.id.cardCode, s.status == "pairing")
        setVisible(R.id.cardConnected, s.status == "connected")
        setVisible(R.id.cardError, s.status == "disconnected" || s.status == "logged_out")
        if (s.status == "pairing" && s.code != null) {
            findViewById<TextView>(R.id.pairCode).text =
                s.code.chunked(4).joinToString(" ")
        }
        if (s.status == "connected") {
            findViewById<TextView>(R.id.connInfo).text =
                "Nomor: ${s.phoneNumber ?: "-"}"
        }
        if (s.status == "disconnected" || s.status == "logged_out") {
            findViewById<TextView>(R.id.errorText).text =
                s.lastError ?: "Sesi WhatsApp kedaluwarsa. Silakan pairing ulang."
        }
        if (s.status == "unpaired" || s.status == "disconnected") {
            findViewById<TextView>(R.id.loadText).text =
                "Menghubungkan ke layanan daemon."
        }
    }

    private fun setVisible(id: Int, v: Boolean) {
        findViewById<View>(id).visibility = if (v) View.VISIBLE else View.GONE
    }

    private fun doPair() = bg {
        val phone = findViewById<EditText>(R.id.inputPhone).text.toString()
        if (phone.isBlank()) {
            runOnUiThread { toast("Isi nomor WhatsApp dulu.") }
            return@bg
        }
        runOnUiThread { toast("Meminta kode pairing...") }
        val r = WaApi.pair(phone)
        runOnUiThread {
            r.onSuccess {
                findViewById<TextView>(R.id.pairCode).text = it.chunked(4).joinToString(" ")
                findViewById<TextView>(R.id.pairInfo).text = "Kode untuk $phone"
                renderStatus(WaApi.Status("pairing", it, phone, null))
            }.onFailure { toast(it.message ?: "Pairing gagal.") }
        }
    }

    private fun copyCode() {
        val code = findViewById<TextView>(R.id.pairCode).text.toString().replace(" ", "")
        val cm = getSystemService(CLIPBOARD_SERVICE) as ClipboardManager
        cm.setPrimaryClip(ClipData.newPlainText("pairing", code))
        toast("Kode disalin")
    }

    private fun confirmLogout() {
        AlertDialog.Builder(this)
            .setTitle("Putuskan sesi WhatsApp?")
            .setMessage("Nomor akan keluar dari WADaemon dan perlu pairing ulang dengan kode baru. Tindakan ini tidak menghapus chat di WhatsApp.")
            .setNegativeButton("Batal", null)
            .setPositiveButton("Ya, Putuskan") { _, _ ->
                bg {
                    val ok = WaApi.logout()
                    runOnUiThread {
                        toast(if (ok) "Sesi diputus. Silakan pairing ulang." else "Logout gagal.")
                        refreshStatus()
                    }
                }
            }
            .show()
    }

    private fun loadModules() = bg {
        val mods = try { WaApi.getModules() } catch (e: Exception) { emptyList() }
        runOnUiThread { renderModules(mods) }
    }

    private fun renderModules(mods: List<WaApi.Module>) {
        val box = findViewById<LinearLayout>(R.id.moduleList)
        box.removeAllViews()
        if (mods.isEmpty()) {
            val t = TextView(this)
            t.text = "Belum ada modul. Tambahkan di bawah."
            box.addView(t)
            return
        }
        for (m in mods) {
            val title = TextView(this)
            title.text = "${m.name} ${m.version}"
            title.textSize = 16f
            box.addView(title)
            val cmds = TextView(this)
            cmds.text = if (m.commands.isEmpty()) "(tanpa perintah)" else m.commands.joinToString(" ")
            cmds.typeface = android.graphics.Typeface.MONOSPACE
            box.addView(cmds)
            for (w in m.warnings) {
                val wt = TextView(this)
                wt.text = "Peringatan: $w"
                wt.setBackgroundColor(0xFFFFF7E0.toInt())
                wt.setPadding(10, 10, 10, 10)
                box.addView(wt)
            }
            val row = LinearLayout(this)
            row.orientation = LinearLayout.HORIZONTAL
            val lbl = TextView(this)
            lbl.text = "Aktif"
            row.addView(lbl)
            val sw = Switch(this)
            sw.isChecked = m.enabled
            sw.setOnCheckedChangeListener { _, on -> toggleModule(m.id, on) }
            row.addView(sw)
            box.addView(row)
        }
    }

    // Manifest modul tinggal di filesDir (bisa ditulis Kotlin langsung),
    // lalu bridge di-reload agar daftar segar.
    private fun toggleModule(id: String, on: Boolean) = bg {
        try {
            val f = File(filesDir, "modules/$id/manifest.json")
            if (f.exists()) {
                val j = JSONObject(f.readText())
                j.put("enabled", on)
                f.writeText(j.toString())
            }
            WaApi.reloadModules()
            runOnUiThread { loadModules() }
        } catch (e: Exception) {
            runOnUiThread { toast("Gagal menyimpan: ${(e.message ?: "").take(120)}") }
        }
    }

    private fun addModule() = bg {
        val name = findViewById<EditText>(R.id.addName).text.toString().ifBlank { "Modul Baru" }
        val cmds = findViewById<EditText>(R.id.addCmds).text.toString()
            .split(Regex("\\s+")).filter { it.isNotBlank() }
        try {
            val id = "mod-" + System.currentTimeMillis()
            val dir = File(filesDir, "modules/$id")
            dir.mkdirs()
            val manifest = JSONObject()
                .put("name", name)
                .put("version", "0.1")
                .put("commands", org.json.JSONArray(cmds))
                .put("enabled", true)
            File(dir, "manifest.json").writeText(manifest.toString())
            File(dir, "index.js").writeText("// Modul $name (eksekusi penuh menyusul M4)\n")
            WaApi.reloadModules()
            runOnUiThread {
                toast("Modul dipasang.")
                findViewById<EditText>(R.id.addName).text.clear()
                findViewById<EditText>(R.id.addCmds).text.clear()
                loadModules()
            }
        } catch (e: Exception) {
            runOnUiThread { toast("Gagal memasang: ${(e.message ?: "").take(120)}") }
        }
    }

    private fun loadLog() = bg {
        val s = try { WaApi.getStatus() } catch (e: Exception) { null }
        runOnUiThread {
            findViewById<TextView>(R.id.logText).text = if (s == null) {
                "Bridge belum bisa diakses. Tunggu Node selesai start lalu tap Muat Ulang."
            } else {
                "status: ${s.status}\ncode: ${s.code ?: "-"}\nphone: ${s.phoneNumber ?: "-"}\nerror: ${s.lastError ?: "-"}"
            }
            findViewById<TextView>(R.id.statsText).text =
                "status=${s?.status ?: "?"} modul: lihat tab Modul"
        }
    }

    private fun requestNotifPerm() {
        if (Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        ) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        } else {
            toast("Izin notifikasi sudah diberikan.")
        }
    }

    private fun requestBatteryExemption() {
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        if (!pm.isIgnoringBatteryOptimizations(packageName)) {
            startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:$packageName")
            })
        } else {
            toast("Sudah bebas dari optimasi baterai.")
        }
    }
}
