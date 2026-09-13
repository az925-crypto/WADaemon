package com.zaaaam.wadaemon

import android.content.Context
import android.system.Os
import java.io.File

// Menyalakan runtime Node SATU kali per proses di background thread.
// nodejs-mobile: 1 instance per proses, tidak bisa restart — crash Node
// berarti restart seluruh app (lihat PRD). Foreground service (M3) yang
// akan memanggil start() agar hidup di background.
object NodeRunner {
    @Volatile private var started = false

    external fun startNodeWithArguments(args: Array<String>): Int

    fun start(ctx: Context) {
        if (started) return
        synchronized(this) {
            if (started) return
            started = true
        }
        Thread({
            val filesDir = ctx.applicationContext.filesDir.absolutePath
            val nodeDir = File(filesDir, "nodejs-project")
            val sessionDir = File(filesDir, "wa-session")
            val modulesDir = File(filesDir, "modules")
            copyAssetsIfUpdated(ctx, nodeDir)
            sessionDir.mkdirs()
            modulesDir.mkdirs()
            Os.setenv("WA_SESSION_DIR", sessionDir.absolutePath, true)
            Os.setenv("WA_MODULES_DIR", modulesDir.absolutePath, true)
            Os.setenv("BRIDGE_PORT", "3939", true)
            startNodeWithArguments(arrayOf("node", File(nodeDir, "main.js").absolutePath))
        }, "node-runner").start()
    }

    private fun copyAssetsIfUpdated(ctx: Context, nodeDir: File) {
        val prefs = ctx.getSharedPreferences("wadaemon", Context.MODE_PRIVATE)
        val last = prefs.getLong("nodejs_assets_version", -1)
        val cur = ctx.packageManager.getPackageInfo(ctx.packageName, 0).longVersionCode
        if (last == cur && nodeDir.exists()) return
        if (nodeDir.exists()) nodeDir.deleteRecursively()
        copyAssetDir(ctx, "nodejs-project", nodeDir)
        prefs.edit().putLong("nodejs_assets_version", cur).apply()
    }

    private fun copyAssetDir(ctx: Context, assetPath: String, out: File) {
        val list = ctx.assets.list(assetPath)
        if (list == null || list.isEmpty()) {
            out.parentFile?.mkdirs()
            ctx.assets.open(assetPath).use { ins -> out.outputStream().use { ins.copyTo(it) } }
            return
        }
        out.mkdirs()
        for (name in list) copyAssetDir(ctx, "$assetPath/$name", File(out, name))
    }
}
