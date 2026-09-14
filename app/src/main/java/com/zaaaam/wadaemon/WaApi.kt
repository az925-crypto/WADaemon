package com.zaaaam.wadaemon

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

// Klien HTTP loopback ke bridge Node (127.0.0.1:3939, sesuai PRD).
// Timeout baca default 10 detik (PRD: UI retry + timeout jelas).
// Auth: tiap request membawa X-Bridge-Token (acak per boot, file 0600 di
// filesDir/bridge.token ditulis Node; loopback dipakai bersama se-device
// jadi bind saja tidak cukup). Wajib panggil init(filesDir) dulu dari
// MainActivity + WaService (service bisa hidup tanpa Activity).
object WaApi {
    private const val BASE = "http://127.0.0.1:3939"
    private const val TOKEN_NAME = "X-Bridge-Token"

    @Volatile private var tokenFile: java.io.File? = null

    fun init(filesDir: java.io.File) {
        tokenFile = java.io.File(filesDir, "bridge.token")
    }

    private fun token(): String? = try {
        tokenFile?.takeIf { it.exists() }?.readText()?.trim()?.takeIf { it.isNotEmpty() }
    } catch (e: Exception) { null }

    data class Status(
        val status: String,
        val code: String?,
        val phoneNumber: String?,
        val lastError: String?,
    )

    data class Module(
        val id: String,
        val name: String,
        val version: String,
        val commands: List<String>,
        val enabled: Boolean,
        val warnings: List<String>,
    )

    data class Stats(
        val forwarded: Int,
        val modulesActive: Int,
        val uptimeSec: Long,
    )

    data class LogEntry(
        val t: Long,
        val src: String,
        val msg: String,
    )

    private fun get(path: String, timeoutMs: Int = 10_000): JSONObject {
        val c = URL(BASE + path).openConnection() as HttpURLConnection
        try {
            c.connectTimeout = 10_000
            c.readTimeout = timeoutMs
            c.requestMethod = "GET"
            token()?.let { c.setRequestProperty(TOKEN_NAME, it) }
            val stream = if (c.responseCode in 200..299) c.inputStream else c.errorStream
            val body = try { stream?.bufferedReader()?.readText() ?: "{}" } catch (e: Exception) { "{}" }
            return JSONObject(body)
        } finally {
            c.disconnect()
        }
    }

    private fun post(path: String, body: JSONObject?, timeoutMs: Int = 10_000): JSONObject {
        val c = URL(BASE + path).openConnection() as HttpURLConnection
        try {
            c.connectTimeout = 10_000
            c.readTimeout = timeoutMs
            c.requestMethod = "POST"
            c.doOutput = true
            c.setRequestProperty("Content-Type", "application/json")
            token()?.let { c.setRequestProperty(TOKEN_NAME, it) }
            c.outputStream.bufferedWriter().use { it.write(body?.toString() ?: "{}") }
            val stream = if (c.responseCode in 200..299) c.inputStream else c.errorStream
            val text = try { stream?.bufferedReader()?.readText() ?: "{}" } catch (e: Exception) { "{}" }
            return JSONObject(text)
        } finally {
            c.disconnect()
        }
    }

    fun getStatus(): Status {
        val j = get("/status")
        return Status(
            j.optString("status", "disconnected"),
            j.optString("code").ifEmpty { null },
            j.optString("phoneNumber").ifEmpty { null },
            j.optString("lastError").ifEmpty { null },
        )
    }

    // POST /pair menunggu kode sampai 20 dtk di sisi Node (lihat bridge).
    fun pair(phoneNumber: String): Result<String> {
        val j = post("/pair", JSONObject().put("phoneNumber", phoneNumber), timeoutMs = 25_000)
        val code = j.optString("code")
        if (code.isNotEmpty()) return Result.success(code)
        return Result.failure(IllegalStateException(j.optString("error", "Pairing gagal.")))
    }

    fun logout(): Boolean {
        val j = post("/logout", null)
        return j.optBoolean("ok", false)
    }

    fun getModules(): List<Module> {
        val j = get("/modules")
        // Bridge error (401 token dsb) -> lempar agar UI bedakan dari "kosong".
        if (j.has("error") && !j.has("modules")) {
            throw IllegalStateException(j.optString("error", "Bridge error."))
        }
        val arr = j.optJSONArray("modules") ?: return emptyList()
        return List(arr.length()) { i ->
            val m = arr.getJSONObject(i)
            val cmds = m.optJSONArray("commands")
            val warns = m.optJSONArray("warnings")
            Module(
                m.optString("id"), m.optString("name"), m.optString("version"),
                List(cmds?.length() ?: 0) { k -> cmds?.optString(k) ?: "" },
                m.optBoolean("enabled", true),
                List(warns?.length() ?: 0) { k -> warns?.optString(k) ?: "" },
            )
        }
    }

    fun reloadModules(): Boolean {
        val j = post("/modules/reload", null)
        return j.optBoolean("ok", false)
    }

    fun getStats(): Stats {
        val j = get("/stats")
        return Stats(
            j.optInt("forwarded", 0),
            j.optInt("modulesActive", 0),
            j.optLong("uptimeSec", 0),
        )
    }

    fun getLogs(limit: Int = 100): List<LogEntry> {
        val j = get("/logs?limit=$limit")
        val arr = j.optJSONArray("logs") ?: return emptyList()
        return List(arr.length()) { i ->
            val e = arr.getJSONObject(i)
            LogEntry(e.optLong("t", 0), e.optString("src", "bridge"), e.optString("msg", ""))
        }
    }
}
