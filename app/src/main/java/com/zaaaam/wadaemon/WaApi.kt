package com.zaaaam.wadaemon

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

// Klien HTTP loopback ke bridge Node (127.0.0.1:3939, sesuai PRD).
// Timeout baca default 10 detik (PRD: UI retry + timeout jelas).
object WaApi {
    private const val BASE = "http://127.0.0.1:3939"

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

    private fun get(path: String, timeoutMs: Int = 10_000): JSONObject {
        val c = URL(BASE + path).openConnection() as HttpURLConnection
        try {
            c.connectTimeout = 10_000
            c.readTimeout = timeoutMs
            c.requestMethod = "GET"
            val body = c.inputStream.bufferedReader().readText()
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
            c.outputStream.bufferedWriter().use { it.write(body?.toString() ?: "{}") }
            val stream = if (c.responseCode in 200..299) c.inputStream else c.errorStream
            return JSONObject(stream.bufferedReader().readText())
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
        val arr = j.optJSONArray("modules") ?: return emptyList()
        return List(arr.length()) { i ->
            val m = arr.getJSONObject(i)
            val cmds = m.optJSONArray("commands")
            Module(
                m.optString("id"), m.optString("name"), m.optString("version"),
                List(cmds?.length() ?: 0) { k -> cmds.getString(k) },
                m.optBoolean("enabled", true),
                List(m.optJSONArray("warnings")?.length() ?: 0) { k ->
                    m.getJSONArray("warnings").getString(k)
                },
            )
        }
    }

    fun reloadModules(): Boolean {
        val j = post("/modules/reload", null)
        return j.optBoolean("ok", false)
    }
}
